package main

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// DPA Handlers — scope ketat: hanya mahasiswa bimbingan (DpaID).
// Semua akses melewati pemeriksaan kepemilikan (proteksi IDOR).
// ============================================================

func dpaAdvisees(dpaID uint) []User {
	var students []User
	DB.Where("dpa_id = ? AND role = ?", dpaID, RoleStudent).Order("nama ASC").Find(&students)
	return students
}

// dpaStudentForDpa memuat mahasiswa dan memastikan mahasiswa tersebut
// adalah bimbingan DPA yang sedang login.
func dpaStudentForDpa(c *gin.Context, dpa User) (User, bool) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID mahasiswa tidak valid"})
		return User{}, false
	}
	var student User
	if err := DB.First(&student, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Mahasiswa tidak ditemukan"})
		return User{}, false
	}
	if student.DpaID != dpa.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Mahasiswa ini bukan bimbingan Anda"})
		return User{}, false
	}
	return student, true
}

type DpaStudentSnapshot struct {
	Student    User
	Burnout    Prediction
	Happiness  HappinessAssessment
	HasBurnout   bool
	HasHappiness bool
}

func latestBurnoutFor(userID uint) (Prediction, bool) {
	var prediction Prediction
	err := DB.Where("user_id = ?", userID).Order("timestamp desc").First(&prediction).Error
	return prediction, err == nil
}

func latestHappinessFor(userID uint) (HappinessAssessment, bool) {
	var assessment HappinessAssessment
	err := DB.Where("user_id = ?", userID).Order("timestamp desc").First(&assessment).Error
	return assessment, err == nil
}

func DpaDashboardHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	students := dpaAdvisees(dpa.ID)

	total := len(students)
	var sumBurnout float64
	var sumHappiness float64
	burnoutCount, happinessCount := 0, 0
	burnoutTinggi := 0
	happinessRendah := 0
	priorityMonitoring := 0
	belumIsi := 0

	type StudentRow struct {
		ID             uint    `json:"id"`
		Nama           string  `json:"nama"`
		Nim            string  `json:"nim"`
		Prodi          string  `json:"prodi"`
		Semester       int     `json:"semester"`
		Burnout        float64 `json:"burnout"`
		BurnoutCat     string  `json:"burnout_category"`
		Happiness      float64 `json:"happiness"`
		HappinessCat   string  `json:"happiness_category"`
		Status         string  `json:"status"`
		StatusPriority int     `json:"status_priority"`
		BurnoutTrend   []float64 `json:"burnout_trend"`
		HappinessTrend []float64 `json:"happiness_trend"`
		HasData        bool    `json:"has_data"`
	}
	rows := make([]StudentRow, 0, total)

	for _, student := range students {
		burnout, hasBurnout := latestBurnoutFor(student.ID)
		happiness, hasHappiness := latestHappinessFor(student.ID)

		row := StudentRow{
			ID:       student.ID,
			Nama:     student.Nama,
			Nim:      student.Nim,
			Prodi:    student.Prodi,
			Semester: student.Semester,
		}
		if !hasBurnout && !hasHappiness {
			belumIsi++
			row.Status = "Assessment belum diisi"
			row.StatusPriority = 1
			rows = append(rows, row)
			continue
		}

		row.HasData = true
		if hasBurnout {
			burnoutCount++
			sumBurnout += burnout.BurnoutScore
			row.Burnout = round2(burnout.BurnoutScore)
			row.BurnoutCat = burnoutCategoryLabel(burnout.BurnoutScore, config)
			var recent []Prediction
			DB.Where("user_id = ?", student.ID).Order("timestamp desc").Limit(5).Find(&recent)
			for _, p := range recent {
				row.BurnoutTrend = append(row.BurnoutTrend, round2(p.BurnoutScore))
			}
			if row.BurnoutCat == "Tinggi" {
				burnoutTinggi++
			}
		}
		if hasHappiness {
			happinessCount++
			sumHappiness += happiness.HappinessIndex
			row.Happiness = round2(happiness.HappinessIndex)
			row.HappinessCat = happiness.Category
			var recent []HappinessAssessment
			DB.Where("user_id = ?", student.ID).Order("timestamp desc").Limit(5).Find(&recent)
			for _, h := range recent {
				row.HappinessTrend = append(row.HappinessTrend, round2(h.HappinessIndex))
			}
			if happiness.Category == "Rendah" || happiness.Category == "Sangat Rendah" {
				happinessRendah++
			}
		}

		if hasBurnout && hasHappiness {
			interpretation := wellBeingInterpretation(row.BurnoutCat, row.HappinessCat)
			row.Status = interpretation.Label
			row.StatusPriority = interpretation.Priority
			if interpretation.Priority >= 3 {
				priorityMonitoring++
			}
		} else if hasBurnout {
			row.Status = "Burnout terisi, happiness belum"
			row.StatusPriority = 1
		} else {
			row.Status = "Happiness terisi, burnout belum"
			row.StatusPriority = 1
		}
		rows = append(rows, row)
	}

	// Prioritas monitoring dari catatan DPA aktif
	var activeNotes int64
	DB.Model(&DpaNote{}).Where("dpa_id = ? AND status IN ?", dpa.ID, []string{"monitoring", "perlu_tindak_lanjut"}).Count(&activeNotes)

	// Panel onboarding: mahasiswa yang datanya belum lengkap.
	type OnboardingItem struct {
		ID      uint   `json:"id"`
		Nama    string `json:"nama"`
		Missing string `json:"missing"`
	}
	onboarding := []OnboardingItem{}
	for _, student := range students {
		missing := []string{}
		if student.Nim == "" {
			missing = append(missing, "NIM")
		}
		if student.Prodi == "" {
			missing = append(missing, "prodi")
		}
		if _, hasBurnout := latestBurnoutFor(student.ID); !hasBurnout {
			missing = append(missing, "assessment burnout")
		}
		if _, hasHappiness := latestHappinessFor(student.ID); !hasHappiness {
			missing = append(missing, "assessment happiness")
		}
		if len(missing) > 0 {
			onboarding = append(onboarding, OnboardingItem{
				ID:      student.ID,
				Nama:    student.Nama,
				Missing: strings.Join(missing, ", "),
			})
		}
	}

	avgBurnout := 0.0
	if burnoutCount > 0 {
		avgBurnout = round2(sumBurnout / float64(burnoutCount))
	}
	avgHappiness := 0.0
	if happinessCount > 0 {
		avgHappiness = round2(sumHappiness / float64(happinessCount))
	}

	// Warning terkini untuk semua bimbingan
	warnings := dpaAdviseeWarnings(dpa, config, students)

	sort.SliceStable(rows, func(i, j int) bool {
		return rows[i].StatusPriority > rows[j].StatusPriority
	})

	c.JSON(http.StatusOK, gin.H{
		"dpa":                 gin.H{"id": dpa.ID, "nama": dpa.Nama, "username": dpa.Username},
		"total_students":      total,
		"avg_burnout":         avgBurnout,
		"avg_happiness":       avgHappiness,
		"burnout_tinggi":      burnoutTinggi,
		"happiness_rendah":    happinessRendah,
		"priority_monitoring": priorityMonitoring,
		"belum_isi":           belumIsi,
		"active_notes":        activeNotes,
		"warning_count":       len(warnings),
		"onboarding":          onboarding,
		"onboarding_count":    len(onboarding),
		"students":            rows,
		"warnings":            warnings,
		"generated_at":        time.Now(),
	})
}

// dpaAdviseeWarnings menghitung early warning well-being untuk daftar mahasiswa.
func dpaAdviseeWarnings(dpa User, config SystemConfig, students []User) []WellBeingWarning {
	warnings := []WellBeingWarning{}
	for _, student := range students {
		burnout, hasBurnout := latestBurnoutFor(student.ID)
		happiness, hasHappiness := latestHappinessFor(student.ID)
		if hasBurnout && burnout.RiskLevel == "High" || hasBurnout && burnout.RiskLevel == "Crisis" {
			warnings = append(warnings, WellBeingWarning{
				Type:  "burnout_risk",
				Label: "Risiko Burnout " + burnout.RiskLevel,
				Detail: fmt.Sprintf("%s: risiko burnout %s (skor %.1f/10) perlu monitoring akademik.",
					student.Nama, burnout.RiskLevel, burnout.BurnoutScore),
				Priority: 2,
			})
		}
		if hasBurnout && hasHappiness {
			// Catat indeks awal agar penandaan nama hanya menyentuh
			// warning milik mahasiswa ini (bukan warning sebelumnya).
			start := len(warnings)
			var prevBurnout Prediction
			DB.Where("user_id = ? AND id < ?", student.ID, burnout.ID).Order("timestamp desc").First(&prevBurnout)
			var prevHappiness HappinessAssessment
			DB.Where("user_id = ? AND id < ?", student.ID, happiness.ID).Order("timestamp desc").First(&prevHappiness)
			if prevBurnout.ID != 0 {
				warnings = append(warnings, detectWellbeingChange(prevBurnout.BurnoutScore, burnout.BurnoutScore, 0, 0, config)...)
			}
			if prevHappiness.ID != 0 {
				warnings = append(warnings, detectWellbeingChange(0, 0, prevHappiness.HappinessIndex, happiness.HappinessIndex, config)...)
			}
			for i := start; i < len(warnings); i++ {
				if warnings[i].Type == "combined" && !strings.Contains(warnings[i].Detail, student.Nama) {
					warnings[i].Detail = student.Nama + ": " + warnings[i].Detail
				}
			}
		}
	}
	sort.SliceStable(warnings, func(i, j int) bool {
		return warnings[i].Priority > warnings[j].Priority
	})
	if len(warnings) > 50 {
		warnings = warnings[:50]
	}
	return warnings
}

func DpaWarningsHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	students := dpaAdvisees(dpa.ID)
	warnings := dpaAdviseeWarnings(dpa, config, students)
	c.JSON(http.StatusOK, gin.H{
		"warnings":       warnings,
		"total_students": len(students),
		"generated_at":   time.Now(),
	})
}

func DpaStudentsHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	students := dpaAdvisees(dpa.ID)

	type StudentRow struct {
		ID           uint    `json:"id"`
		Nama         string  `json:"nama"`
		Username     string  `json:"username"`
		Nim          string  `json:"nim"`
		Prodi        string  `json:"prodi"`
		Angkatan     string  `json:"angkatan"`
		Semester     int     `json:"semester"`
		Ipk          float64 `json:"ipk"`
		Burnout      float64 `json:"burnout"`
		BurnoutCat   string  `json:"burnout_category"`
		BurnoutAt    *time.Time `json:"burnout_at"`
		Happiness    float64 `json:"happiness"`
		HappinessCat string  `json:"happiness_category"`
		HappinessAt  *time.Time `json:"happiness_at"`
		Status       string  `json:"status"`
		StatusPriority int   `json:"status_priority"`
	}
	rows := make([]StudentRow, 0, len(students))
	for _, student := range students {
		row := StudentRow{
			ID:       student.ID,
			Nama:     student.Nama,
			Username: student.Username,
			Nim:      student.Nim,
			Prodi:    student.Prodi,
			Angkatan: student.Angkatan,
			Semester: student.Semester,
			Ipk:      student.Ipk,
			Status:   "Assessment belum diisi",
			StatusPriority: 1,
		}
		burnout, hasBurnout := latestBurnoutFor(student.ID)
		happiness, hasHappiness := latestHappinessFor(student.ID)
		if hasBurnout {
			row.Burnout = round2(burnout.BurnoutScore)
			row.BurnoutCat = burnoutCategoryLabel(burnout.BurnoutScore, config)
			ts := burnout.Timestamp
			row.BurnoutAt = &ts
			row.Status = "Burnout terisi, happiness belum"
		}
		if hasHappiness {
			row.Happiness = round2(happiness.HappinessIndex)
			row.HappinessCat = happiness.Category
			ts := happiness.Timestamp
			row.HappinessAt = &ts
			if !hasBurnout {
				row.Status = "Happiness terisi, burnout belum"
			}
		}
		if hasBurnout && hasHappiness {
			interpretation := wellBeingInterpretation(row.BurnoutCat, row.HappinessCat)
			row.Status = interpretation.Label
			row.StatusPriority = interpretation.Priority
		}
		rows = append(rows, row)
	}
	c.JSON(http.StatusOK, gin.H{"students": rows, "total": len(rows)})
}

func DpaStudentDetailHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}

	response := gin.H{
		"student": gin.H{
			"id": student.ID, "nama": student.Nama, "username": student.Username,
			"nim": student.Nim, "prodi": student.Prodi, "angkatan": student.Angkatan,
			"semester": student.Semester, "ipk": student.Ipk, "ips": student.Ips,
			"sks": student.Sks, "kehadiran": student.Kehadiran, "bio": student.Bio,
		},
	}

	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		burnoutCat := burnoutCategoryLabel(burnout.BurnoutScore, config)
		var predictions []Prediction
		DB.Where("user_id = ?", student.ID).Order("timestamp asc").Limit(60).Find(&predictions)
		trend := make([]gin.H, 0, len(predictions))
		for _, p := range predictions {
			trend = append(trend, gin.H{"date": p.Timestamp.Format("02 Jan"), "burnout": round2(p.BurnoutScore)})
		}
		response["burnout"] = gin.H{
			"score": round2(burnout.BurnoutScore), "category": burnoutCat,
			"risk": burnout.RiskLevel, "psychosomatic": round2(burnout.PsychosomaticScore),
			"model": burnout.ModelVersion, "timestamp": burnout.Timestamp, "trend": trend,
		}
	} else {
		response["burnout"] = nil
	}

	if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
		dimensions := happinessDimensionScores(happiness)
		var assessments []HappinessAssessment
		DB.Where("user_id = ?", student.ID).Order("timestamp asc").Limit(60).Find(&assessments)
		trend := make([]gin.H, 0, len(assessments))
		for _, h := range assessments {
			trend = append(trend, gin.H{"date": h.Timestamp.Format("02 Jan"), "happiness_index": round2(h.HappinessIndex)})
		}
		response["happiness"] = gin.H{
			"index": round2(happiness.HappinessIndex), "category": happiness.Category,
			"timestamp": happiness.Timestamp, "dimensions": dimensions,
			"factors": happinessFactors(dimensions), "trend": trend,
		}
	} else {
		response["happiness"] = nil
	}

	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
			burnoutCat := burnoutCategoryLabel(burnout.BurnoutScore, config)
			dimensions := happinessDimensionScores(happiness)
			interpretation := wellBeingInterpretation(burnoutCat, happiness.Category)
			response["combined"] = gin.H{
				"burnout_cat":     burnoutCat,
				"happiness_cat":   happiness.Category,
				"label":           interpretation.Label,
				"priority":        interpretation.Priority,
				"insight":         interpretation.Insight,
				"recommendation":  wellbeingRecommendation(burnoutCat, happiness.Category, dimensions),
			}
		}
	}

	var notes []DpaNote
	DB.Where("dpa_id = ? AND student_id = ?", dpa.ID, student.ID).Order("created_at desc").Limit(50).Find(&notes)
	response["notes"] = notes

	c.JSON(http.StatusOK, response)
}

func DpaStudentNotesHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}

	if c.Request.Method == http.MethodPost {
		var input struct {
			Note   string `json:"note" binding:"required"`
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Catatan tidak boleh kosong"})
			return
		}
		status := strings.ToLower(strings.TrimSpace(input.Status))
		if status == "" {
			status = "normal"
		}
		validStatus := map[string]bool{"normal": true, "monitoring": true, "perlu_tindak_lanjut": true}
		if !validStatus[status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus normal, monitoring, atau perlu_tindak_lanjut"})
			return
		}
		note := DpaNote{
			DpaID:     dpa.ID,
			StudentID: student.ID,
			Note:      truncateString(strings.TrimSpace(input.Note), 2000),
			Status:    status,
			Timestamp: time.Now(),
		}
		if err := DB.Create(&note).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan catatan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"status": "success", "note": note})
		return
	}

	var notes []DpaNote
	DB.Where("dpa_id = ? AND student_id = ?", dpa.ID, student.ID).Order("created_at desc").Limit(50).Find(&notes)
	c.JSON(http.StatusOK, gin.H{"notes": notes})
}

// DpaStudentReportHandler membuat Student Well-being Report (pdf/txt)
// untuk mahasiswa bimbingan.
func DpaStudentReportHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}

	format := strings.ToLower(c.DefaultQuery("format", "pdf"))
	lines := []pdfReportLine{
		{Text: "QC ANALYTICS - UMCI", Size: 16, Bold: true, Space: 10},
		{Text: "STUDENT WELL-BEING REPORT", Size: 14, Bold: true, Space: 16},
		{Text: fmt.Sprintf("Nama              : %s", student.Nama), Size: 10, Space: 4},
		{Text: fmt.Sprintf("NIM               : %s", orDash(student.Nim)), Size: 10, Space: 4},
		{Text: fmt.Sprintf("Program Studi     : %s", orDash(student.Prodi)), Size: 10, Space: 4},
		{Text: fmt.Sprintf("Angkatan/Semester : %s / %d", orDash(student.Angkatan), student.Semester), Size: 10, Space: 4},
		{Text: fmt.Sprintf("IPK / IPS / SKS   : %.2f / %.2f / %d", student.Ipk, student.Ips, student.Sks), Size: 10, Space: 4},
		{Text: fmt.Sprintf("Kehadiran         : %.1f%%", student.Kehadiran), Size: 10, Space: 14},
	}

	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		burnoutCat := burnoutCategoryLabel(burnout.BurnoutScore, config)
		lines = append(lines,
			pdfReportLine{Text: "BURNOUT ANALYTICS", Size: 12, Bold: true, Space: 8},
			pdfReportLine{Text: fmt.Sprintf("Skor Burnout      : %.1f/10 (%s)", burnout.BurnoutScore, burnoutCat), Size: 10, Space: 4},
			pdfReportLine{Text: fmt.Sprintf("Psikosomatik      : %.1f/10", burnout.PsychosomaticScore), Size: 10, Space: 4},
			pdfReportLine{Text: fmt.Sprintf("Model             : %s", burnout.ModelVersion), Size: 10, Space: 4},
			pdfReportLine{Text: fmt.Sprintf("Terakhir diisi    : %s", burnout.Timestamp.Format("02 Jan 2006 15:04")), Size: 10, Space: 14},
		)
	} else {
		lines = append(lines, pdfReportLine{Text: "BURNOUT: belum ada data assessment.", Size: 10, Space: 14})
	}

	if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
		dimensions := happinessDimensionScores(happiness)
		lines = append(lines,
			pdfReportLine{Text: "HAPPINESS ANALYTICS", Size: 12, Bold: true, Space: 8},
			pdfReportLine{Text: fmt.Sprintf("Happiness Index   : %.0f/100 (%s)", happiness.HappinessIndex, happiness.Category), Size: 10, Space: 4},
		)
		for _, dim := range dimensions {
			lines = append(lines, pdfReportLine{Text: fmt.Sprintf("  - %-14s: %.0f/100", dim.Label, dim.Score), Size: 10, Space: 4})
		}
		lines = append(lines, pdfReportLine{Text: fmt.Sprintf("Terakhir diisi    : %s", happiness.Timestamp.Format("02 Jan 2006 15:04")), Size: 10, Space: 14})
	} else {
		lines = append(lines, pdfReportLine{Text: "HAPPINESS: belum ada data assessment.", Size: 10, Space: 14})
	}

	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
			burnoutCat := burnoutCategoryLabel(burnout.BurnoutScore, config)
			dimensions := happinessDimensionScores(happiness)
			interpretation := wellBeingInterpretation(burnoutCat, happiness.Category)
			lines = append(lines,
				pdfReportLine{Text: "COMBINED WELL-BEING", Size: 12, Bold: true, Space: 8},
				pdfReportLine{Text: fmt.Sprintf("Interpretasi      : %s", interpretation.Label), Size: 10, Space: 4},
				pdfReportLine{Text: interpretation.Insight, Size: 10, Space: 4},
				pdfReportLine{Text: fmt.Sprintf("Rekomendasi       : %s", wellbeingRecommendation(burnoutCat, happiness.Category, dimensions)), Size: 10, Space: 14},
			)
		}
	}

	var notes []DpaNote
	DB.Where("dpa_id = ? AND student_id = ?", dpa.ID, student.ID).Order("created_at desc").Limit(10).Find(&notes)
	if len(notes) > 0 {
		lines = append(lines, pdfReportLine{Text: "CATATAN DPA TERAKHIR", Size: 12, Bold: true, Space: 8})
		for _, note := range notes {
			lines = append(lines, pdfReportLine{
				Text: fmt.Sprintf("%s [%s] %s", note.Timestamp.Format("02 Jan 2006"), note.Status, truncateString(note.Note, 90)),
				Size: 10, Space: 4,
			})
		}
	}

	lines = append(lines,
		pdfReportLine{Text: "Catatan: Laporan ini bersifat analitik akademik, bukan diagnosis kesehatan mental.", Size: 9, Space: 8},
		pdfReportLine{Text: fmt.Sprintf("Dibuat oleh DPA: %s - %s", dpa.Nama, time.Now().Format("02 Jan 2006 15:04")), Size: 9, Space: 4},
	)

	if format == "txt" {
		var sb strings.Builder
		for _, line := range lines {
			sb.WriteString(line.Text)
			sb.WriteString("\n")
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=wellbeing-report-%d.txt", student.ID))
		c.String(http.StatusOK, sb.String())
		return
	}

	pages := paginatePDFLines(lines)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=wellbeing-report-%d.pdf", student.ID))
	c.Data(http.StatusOK, "application/pdf", renderSimplePDF(pages))
}

func orDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}
