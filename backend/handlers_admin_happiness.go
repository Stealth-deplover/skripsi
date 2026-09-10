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
// Happiness & Well-Being Analytics tingkat prodi (Kaprodi).
// Endpoint terpisah agar analytics burnout existing tidak berubah.
// ============================================================

func AdminHappinessAnalyticsHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	config := getSystemConfig()

	// Filter opsional: prodi, angkatan, semester, periode (hari).
	prodi := strings.TrimSpace(c.Query("prodi"))
	angkatan := strings.TrimSpace(c.Query("angkatan"))
	semester := strings.TrimSpace(c.Query("semester"))
	days := parsePositiveInt(c.DefaultQuery("days", "90"), 90)
	if days > 365 {
		days = 365
	}
	since := time.Now().AddDate(0, 0, -days)

	query := DB.Where("role = ?", RoleStudent)
	if prodi != "" {
		query = query.Where("prodi = ?", prodi)
	}
	if angkatan != "" {
		query = query.Where("angkatan = ?", angkatan)
	}
	if semester != "" {
		var semesterInt int
		if _, err := fmt.Sscanf(semester, "%d", &semesterInt); err == nil {
			query = query.Where("semester = ?", semesterInt)
		}
	}
	var students []User
	if err := query.Find(&students).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat data mahasiswa"})
		return
	}

	// Muat prediksi & happiness dalam periode secara efisien.
	type StudentRow struct {
		ID       uint
		Prodi    string
		Semester int
	}
	rows := make([]StudentRow, 0, len(students))
	studentIDs := make([]uint, 0, len(students))
	for _, s := range students {
		rows = append(rows, StudentRow{ID: s.ID, Prodi: s.Prodi, Semester: s.Semester})
		studentIDs = append(studentIDs, s.ID)
	}

	var predictions []Prediction
	if len(studentIDs) > 0 {
		DB.Where("user_id IN ? AND timestamp >= ?", studentIDs, since).Order("timestamp ASC").Find(&predictions)
	}
	var happiness []HappinessAssessment
	if len(studentIDs) > 0 {
		DB.Where("user_id IN ? AND timestamp >= ?", studentIDs, since).Order("timestamp ASC").Find(&happiness)
	}

	// Overview
	latestBurnoutByUser := map[uint]float64{}
	latestBurnoutAt := map[uint]time.Time{}
	for _, p := range predictions {
		if at, ok := latestBurnoutAt[p.UserID]; !ok || p.Timestamp.After(at) {
			latestBurnoutAt[p.UserID] = p.Timestamp
			latestBurnoutByUser[p.UserID] = p.BurnoutScore
		}
	}
	latestHIByUser := map[uint]float64{}
	latestHIAt := map[uint]time.Time{}
	for _, h := range happiness {
		if at, ok := latestHIAt[h.UserID]; !ok || h.Timestamp.After(at) {
			latestHIAt[h.UserID] = h.Timestamp
			latestHIByUser[h.UserID] = h.HappinessIndex
		}
	}

	avgBurnout, avgHappiness := 0.0, 0.0
	burnoutTinggi, happinessRendah, priorityMonitoring := 0, 0, 0
	burnoutSum, happinessSum := 0.0, 0.0
	burnoutN, happinessN := 0, 0
	for _, row := range rows {
		burnout, hasBurnout := latestBurnoutByUser[row.ID]
		hi, hasHappiness := latestHIByUser[row.ID]
		if hasBurnout {
			burnoutN++
			burnoutSum += burnout
			cat := burnoutCategoryLabel(burnout, config)
			if cat == "Tinggi" {
				burnoutTinggi++
			}
		}
		if hasHappiness {
			happinessN++
			happinessSum += hi
			cat := classifyHappiness(hi)
			if cat == "Rendah" || cat == "Sangat Rendah" {
				happinessRendah++
			}
		}
		if hasBurnout && hasHappiness {
			interpretation := wellBeingInterpretation(burnoutCategoryLabel(burnout, config), classifyHappiness(hi))
			if interpretation.Priority >= 3 {
				priorityMonitoring++
			}
		}
	}
	if burnoutN > 0 {
		avgBurnout = round2(burnoutSum / float64(burnoutN))
	}
	if happinessN > 0 {
		avgHappiness = round2(happinessSum / float64(happinessN))
	}

	// Distribusi
	burnoutDist := map[string]int{"Rendah": 0, "Sedang": 0, "Tinggi": 0}
	happinessDist := map[string]int{"Sangat Rendah": 0, "Rendah": 0, "Sedang": 0, "Tinggi": 0, "Sangat Tinggi": 0}
	for _, row := range rows {
		if burnout, ok := latestBurnoutByUser[row.ID]; ok {
			burnoutDist[burnoutCategoryLabel(burnout, config)]++
		}
		if hi, ok := latestHIByUser[row.ID]; ok {
			happinessDist[classifyHappiness(hi)]++
		}
	}

	// Trend harian
	type TrendDay struct {
		Date      string  `json:"date"`
		Burnout   float64 `json:"burnout"`
		Happiness float64 `json:"happiness"`
	}
	dayBurnout := map[string][]float64{}
	dayHappiness := map[string][]float64{}
	var dayOrder []string
	seenDay := map[string]bool{}
	for _, p := range predictions {
		day := p.Timestamp.Format("02 Jan")
		if !seenDay[day] {
			seenDay[day] = true
			dayOrder = append(dayOrder, day)
		}
		dayBurnout[day] = append(dayBurnout[day], p.BurnoutScore)
	}
	for _, h := range happiness {
		day := h.Timestamp.Format("02 Jan")
		if !seenDay[day] {
			seenDay[day] = true
			dayOrder = append(dayOrder, day)
		}
		dayHappiness[day] = append(dayHappiness[day], h.HappinessIndex)
	}
	trend := make([]TrendDay, 0, len(dayOrder))
	for _, day := range dayOrder {
		trend = append(trend, TrendDay{
			Date:      day,
			Burnout:   round2(mean(dayBurnout[day])),
			Happiness: round2(mean(dayHappiness[day])),
		})
	}
	if len(trend) > 30 {
		trend = trend[len(trend)-30:]
	}

	// By semester
	type SemesterBucket struct {
		Semester  int     `json:"semester"`
		Burnout   float64 `json:"burnout"`
		Happiness float64 `json:"happiness"`
		Count     int     `json:"count"`
	}
	semBurnout := map[int][]float64{}
	semHappiness := map[int][]float64{}
	semOrder := []int{}
	seenSem := map[int]bool{}
	for _, row := range rows {
		if !seenSem[row.Semester] {
			seenSem[row.Semester] = true
			semOrder = append(semOrder, row.Semester)
		}
		if b, ok := latestBurnoutByUser[row.ID]; ok {
			semBurnout[row.Semester] = append(semBurnout[row.Semester], b)
		}
		if h, ok := latestHIByUser[row.ID]; ok {
			semHappiness[row.Semester] = append(semHappiness[row.Semester], h)
		}
	}
	sort.Ints(semOrder)
	bySemester := make([]SemesterBucket, 0, len(semOrder))
	for _, sem := range semOrder {
		bySemester = append(bySemester, SemesterBucket{
			Semester:  sem,
			Burnout:   round2(mean(semBurnout[sem])),
			Happiness: round2(mean(semHappiness[sem])),
			Count:     len(semBurnout[sem]) + len(semHappiness[sem]),
		})
	}

	// Happiness factors: rata-rata tiap dimensi (assessment terakhir per user)
	factorSums := map[string][]float64{}
	seenHIUser := map[uint]bool{}
	for i := len(happiness) - 1; i >= 0; i-- {
		h := happiness[i]
		if seenHIUser[h.UserID] {
			continue
		}
		seenHIUser[h.UserID] = true
		factorSums[HappinessDimAcademic] = append(factorSums[HappinessDimAcademic], h.AcademicScore)
		factorSums[HappinessDimMotivation] = append(factorSums[HappinessDimMotivation], h.MotivationScore)
		factorSums[HappinessDimSocial] = append(factorSums[HappinessDimSocial], h.SocialScore)
		factorSums[HappinessDimLecturer] = append(factorSums[HappinessDimLecturer], h.LecturerScore)
		factorSums[HappinessDimEnvironment] = append(factorSums[HappinessDimEnvironment], h.EnvironmentScore)
		factorSums[HappinessDimFacilities] = append(factorSums[HappinessDimFacilities], h.FacilitiesScore)
	}
	type FactorAvg struct {
		Key   string  `json:"key"`
		Label string  `json:"label"`
		Score float64 `json:"score"`
	}
	happinessFactorsAvg := make([]FactorAvg, 0, 6)
	for _, meta := range happinessDimensionMeta {
		happinessFactorsAvg = append(happinessFactorsAvg, FactorAvg{
			Key:   meta.Key,
			Label: meta.Label,
			Score: round2(mean(factorSums[meta.Key])),
		})
	}

	// Burnout factors: rata-rata metrik assessment terakhir per user
	var assessments []Assessment
	if len(studentIDs) > 0 {
		DB.Where("user_id IN ? AND timestamp >= ?", studentIDs, since).Order("timestamp ASC").Find(&assessments)
	}
	seenAssessUser := map[uint]bool{}
	fatigueSums, cynicismSums, efficacySums, interferenceSums := []float64{}, []float64{}, []float64{}, []float64{}
	orderSums, dissonanceSums, nlpSums := []float64{}, []float64{}, []float64{}
	for i := len(assessments) - 1; i >= 0; i-- {
		a := assessments[i]
		if seenAssessUser[a.UserID] {
			continue
		}
		seenAssessUser[a.UserID] = true
		fatigueSums = append(fatigueSums, a.FatigueScore)
		cynicismSums = append(cynicismSums, a.CynicismScore)
		efficacySums = append(efficacySums, a.EfficacyScore)
		interferenceSums = append(interferenceSums, a.InterferenceScore)
		orderSums = append(orderSums, a.OrderEffectScore)
		dissonanceSums = append(dissonanceSums, a.CognitiveDissonanceScore)
		nlpSums = append(nlpSums, a.NLPStressScore)
	}
	burnoutFactorsAvg := []FactorAvg{
		{Key: "fatigue", Label: "Academic Load / Kelelahan", Score: round2(mean(fatigueSums))},
		{Key: "cynicism", Label: "Study Pressure / Sinisme", Score: round2(mean(cynicismSums))},
		{Key: "efficacy", Label: "Motivation / Efikasi", Score: round2(mean(efficacySums))},
		{Key: "interference", Label: "Emotional Exhaustion / Interference", Score: round2(mean(interferenceSums))},
		{Key: "order_effect", Label: "Order Effect", Score: round2(mean(orderSums))},
		{Key: "dissonance", Label: "Cognitive Dissonance", Score: round2(mean(dissonanceSums))},
		{Key: "nlp_stress", Label: "NLP Stress (Curhat)", Score: round2(mean(nlpSums))},
	}

	// Matrix burnout x happiness
	type MatrixCell struct {
		BurnoutCat   string `json:"burnout"`
		HappinessCat string `json:"happiness"`
		Count        int    `json:"count"`
	}
	matrixCount := map[string]int{}
	for _, row := range rows {
		b, hasB := latestBurnoutByUser[row.ID]
		h, hasH := latestHIByUser[row.ID]
		if !hasB || !hasH {
			continue
		}
		key := burnoutCategoryLabel(b, config) + "|" + classifyHappiness(h)
		matrixCount[key]++
	}
	matrix := make([]MatrixCell, 0, len(matrixCount))
	for burnoutCat, counts := range map[string][]string{
		"Rendah": {"Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"},
		"Sedang": {"Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"},
		"Tinggi": {"Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"},
	} {
		_ = counts
		for _, hCat := range []string{"Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"} {
			matrix = append(matrix, MatrixCell{BurnoutCat: burnoutCat, HappinessCat: hCat, Count: matrixCount[burnoutCat+"|"+hCat]})
		}
	}

	// Daftar prodi untuk filter
	var prodiList []string
	DB.Model(&User{}).Where("role = ? AND prodi <> ''", RoleStudent).Distinct().Pluck("prodi", &prodiList)

	c.JSON(http.StatusOK, gin.H{
		"overview": gin.H{
			"total_students":       len(rows),
			"avg_burnout":          avgBurnout,
			"avg_happiness":        avgHappiness,
			"burnout_tinggi":       burnoutTinggi,
			"happiness_rendah":     happinessRendah,
			"priority_monitoring":  priorityMonitoring,
			"students_with_burnout": burnoutN,
			"students_with_happiness": happinessN,
		},
		"filters": gin.H{
			"prodi":    prodi,
			"angkatan": angkatan,
			"semester": semester,
			"days":     days,
		},
		"prodi_options":     prodiList,
		"burnout_dist":      burnoutDist,
		"happiness_dist":    happinessDist,
		"trend":             trend,
		"by_semester":       bySemester,
		"happiness_factors": happinessFactorsAvg,
		"burnout_factors":   burnoutFactorsAvg,
		"matrix":            matrix,
		"model_status":      happinessModelStatus(len(happiness)),
		"weights": gin.H{
			"academic":    config.HiWeightAcademic,
			"motivation":  config.HiWeightMotivation,
			"social":      config.HiWeightSocial,
			"lecturer":    config.HiWeightLecturer,
			"environment": config.HiWeightEnvironment,
			"facilities":  config.HiWeightFacilities,
		},
		"generated_at": time.Now(),
	})
}
