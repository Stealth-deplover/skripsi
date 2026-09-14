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
// Direktori DPA + Rating Bintang + Ulasan (privasi: rating tidak
// pernah dikembalikan ke role dpa; hanya mahasiswa & superadmin).
// Gaya Gojek: bintang 1-5 + komentar anonim, rekap Kaprodi lengkap.
// ============================================================

func DpaDirectoryHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	role := normalizeRole(user.Role)
	if role == RoleSuperadmin {
		// Kaprodi memakai /superadmin/dpa-ratings untuk evaluasi.
		c.JSON(http.StatusForbidden, gin.H{"error": "Gunakan endpoint superadmin untuk rekap penilaian DPA"})
		return
	}

	var dpas []User
	DB.Where("role = ?", RoleDPA).Order("nama ASC").Find(&dpas)

	type AdviseeInfo struct {
		Count int
		Prodi map[string]bool
	}
	advisees := map[uint]*AdviseeInfo{}
	var students []User
	DB.Where("role = ? AND dpa_id > 0", RoleStudent).Find(&students)
	for _, student := range students {
		info, ok := advisees[student.DpaID]
		if !ok {
			info = &AdviseeInfo{Prodi: map[string]bool{}}
			advisees[student.DpaID] = info
		}
		info.Count++
		if student.Prodi != "" {
			info.Prodi[student.Prodi] = true
		}
	}

	// Rating milik mahasiswa sendiri (hanya untuk role student).
	myRatings := map[uint]DpaRating{}
	if role == RoleStudent {
		var ratings []DpaRating
		DB.Where("student_id = ?", user.ID).Find(&ratings)
		for _, rating := range ratings {
			myRatings[rating.DpaID] = rating
		}
	}

	type DpaCard struct {
		ID           uint     `json:"id"`
		Nama         string   `json:"nama"`
		Username     string   `json:"username"`
		Bio          string   `json:"bio"`
		ProfilePic   string   `json:"profile_pic"`
		Nip          string   `json:"nip"`
		Phone        string   `json:"phone"`
		AdviseeCount int      `json:"advisee_count"`
		ProdiList    []string `json:"prodi_list"`
		IsMyDpa      bool     `json:"is_my_dpa"`
		MyStars      int      `json:"my_stars"`
		MyComment    string   `json:"my_comment"`
	}
	cards := make([]DpaCard, 0, len(dpas))
	for _, dpa := range dpas {
		r := myRatings[dpa.ID]
		card := DpaCard{
			ID:         dpa.ID,
			Nama:       dpa.Nama,
			Username:   dpa.Username,
			Bio:        dpa.Bio,
			ProfilePic: dpa.ProfilePic,
			Nip:        dpa.Nip,
			Phone:      dpa.Phone,
			IsMyDpa:    role == RoleStudent && user.DpaID == dpa.ID,
			MyStars:    r.Stars,
			MyComment:  r.Comment,
		}
		if info, ok := advisees[dpa.ID]; ok {
			card.AdviseeCount = info.Count
			for prodi := range info.Prodi {
				card.ProdiList = append(card.ProdiList, prodi)
			}
			sort.Strings(card.ProdiList)
		}
		cards = append(cards, card)
	}

	c.JSON(http.StatusOK, gin.H{"dpa_list": cards})
}

// StudentJoinDpaHandler memetakan mahasiswa ke DPA pilihannya sehingga
// langsung bergabung ke grup chat bimbingan DPA tersebut.
func StudentJoinDpaHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	if !isStudentRole(student.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya mahasiswa yang dapat bergabung ke grup bimbingan"})
		return
	}

	dpaID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID DPA tidak valid"})
		return
	}
	var dpa User
	if err := DB.Where("id = ? AND role = ?", dpaID, RoleDPA).First(&dpa).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "DPA tidak ditemukan"})
		return
	}

	previousDpaID := student.DpaID
	if previousDpaID == dpaID {
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"message": "Anda sudah tergabung di grup bimbingan ini",
			"dpa":     gin.H{"id": dpa.ID, "nama": dpa.Nama},
		})
		return
	}

	if err := DB.Model(&student).Update("dpa_id", dpaID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal bergabung ke grup bimbingan"})
		return
	}

	// Notifikasi: DPA baru menerima mahasiswa; DPA lama (jika pindah) ikut tahu.
	DB.Create(&Notification{
		UserID:  dpa.ID,
		Type:    "dpa_chat",
		Message: fmt.Sprintf("Mahasiswa %s bergabung ke grup bimbingan Anda.", student.Nama),
	})
	if previousDpaID != 0 {
		DB.Create(&Notification{
			UserID:  previousDpaID,
			Type:    "student_wellbeing",
			Message: fmt.Sprintf("Mahasiswa %s berpindah ke grup bimbingan lain.", student.Nama),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": fmt.Sprintf("Anda kini tergabung di grup bimbingan %s.", dpa.Nama),
		"dpa":     gin.H{"id": dpa.ID, "nama": dpa.Nama},
	})
}

// DpaRateHandler menyimpan/mengubah rating bintang (1-5) + ulasan
// mahasiswa untuk DPA pembimbingnya sendiri. Gaya Gojek: bintang + komentar.
func DpaRateHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	if !isStudentRole(student.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya mahasiswa yang dapat memberi penilaian"})
		return
	}
	if student.DpaID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Gabung ke grup bimbingan terlebih dahulu sebelum memberi penilaian"})
		return
	}

	dpaID, ok := parseUintParam(c, "dpaId")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID DPA tidak valid"})
		return
	}
	if dpaID != student.DpaID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Anda hanya dapat menilai DPA pembimbing Anda"})
		return
	}

	var input struct {
		Stars   int    `json:"stars" binding:"required"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jumlah bintang wajib diisi"})
		return
	}
	if input.Stars < 1 || input.Stars > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Penilaian harus 1 sampai 5 bintang"})
		return
	}
	comment := strings.TrimSpace(input.Comment)
	if len(comment) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ulasan maksimal 500 karakter"})
		return
	}

	semester := currentSemesterLabel()

	var rating DpaRating
	if err := DB.Where("dpa_id = ? AND student_id = ?", dpaID, student.ID).First(&rating).Error; err == nil {
		DB.Model(&rating).Updates(map[string]interface{}{"stars": input.Stars, "comment": comment, "semester": semester})
		rating.Stars = input.Stars
		rating.Comment = comment
	} else {
		rating = DpaRating{DpaID: dpaID, StudentID: student.ID, Stars: input.Stars, Comment: comment, Semester: semester}
		DB.Create(&rating)
	}

	// Notifikasi anonim ke DPA (tanpa nama mahasiswa)
	DB.Create(&Notification{
		UserID:  dpaID,
		Type:    "dpa_rating",
		Message: fmt.Sprintf("Anda menerima penilaian baru: %d bintang dari mahasiswa bimbingan Anda.", input.Stars),
	})

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"rating": gin.H{"dpa_id": dpaID, "stars": input.Stars, "comment": comment, "semester": semester},
	})
}

// DpaMyRatingHandler mengembalikan rating milik mahasiswa sendiri (termasuk ulasan).
func DpaMyRatingHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	if !isStudentRole(student.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Endpoint khusus mahasiswa"})
		return
	}
	var rating DpaRating
	DB.Where("student_id = ? AND dpa_id = ?", student.ID, student.DpaID).First(&rating)
	if rating.ID == 0 {
		c.JSON(http.StatusOK, gin.H{"rating": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rating": gin.H{"dpa_id": rating.DpaID, "stars": rating.Stars, "comment": rating.Comment, "semester": rating.Semester}})
}

// SuperadminDpaRatingsHandler: rekap Gojek-style untuk Kaprodi.
// Tanpa identitas penilai: distribusi, response_rate, rekomendasi otomatis, ulasan anonim, tindak lanjut.
func SuperadminDpaRatingsHandler(c *gin.Context) {
	type Review struct {
		Stars     int       `json:"stars"`
		Comment   string    `json:"comment"`
		CreatedAt time.Time `json:"created_at"`
		Label     string    `json:"label"`
	}
	type DpaRatingRow struct {
		DpaID         uint            `json:"dpa_id"`
		Nama          string          `json:"nama"`
		Username      string          `json:"username"`
		Advisees      int64           `json:"advisees"`
		RatedBy       int64           `json:"rated_by"`
		AverageStar   float64         `json:"average_stars"`
		ResponseRate  float64         `json:"response_rate"`
		Distribution  map[string]int64 `json:"distribution"`
		Recommendation gin.H           `json:"recommendation"`
		RecentReviews []Review        `json:"recent_reviews"`
		FollowUp      *gin.H          `json:"follow_up"`
	}

	var dpas []User
	DB.Where("role = ?", RoleDPA).Order("nama ASC").Find(&dpas)

	// Aggregate avg + count
	type Agg struct {
		DpaID   uint
		RatedBy int64
		Avg     float64
	}
	var aggs []Agg
	DB.Model(&DpaRating{}).
		Select("dpa_id, COUNT(*) as rated_by, AVG(stars) as avg").
		Group("dpa_id").
		Scan(&aggs)
	aggByDpa := map[uint]Agg{}
	for _, agg := range aggs {
		aggByDpa[agg.DpaID] = agg
	}

	// Distribution per DPA
	type DistRow struct {
		DpaID uint
		Stars int
		Cnt   int64
	}
	var distRows []DistRow
	DB.Model(&DpaRating{}).Select("dpa_id, stars, COUNT(*) as cnt").Group("dpa_id, stars").Scan(&distRows)
	distByDpa := map[uint]map[string]int64{}
	for _, r := range distRows {
		if _, ok := distByDpa[r.DpaID]; !ok {
			distByDpa[r.DpaID] = map[string]int64{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
		}
		distByDpa[r.DpaID][fmt.Sprintf("%d", r.Stars)] = r.Cnt
	}

	// Follow up terbaru per DPA
	type Follow struct {
		DpaID uint
		Note  string
		Status string
		CreatedAt time.Time
		UpdatedAt time.Time
		ID uint
	}
	followByDpa := map[uint]Follow{}
	var follows []DpaFollowUp
	DB.Order("updated_at DESC").Find(&follows)
	for _, f := range follows {
		if _, ok := followByDpa[f.DpaID]; !ok {
			followByDpa[f.DpaID] = Follow{DpaID: f.DpaID, Note: f.Note, Status: f.Status, CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, ID: f.ID}
		}
	}

	rows := make([]DpaRatingRow, 0, len(dpas))
	var totalAdvisees int64
	var totalRated int64
	var sumAvg float64
	var countedAvg int

	for idx, dpa := range dpas {
		var adviseeCount int64
		DB.Model(&User{}).Where("dpa_id = ? AND role = ?", dpa.ID, RoleStudent).Count(&adviseeCount)
		totalAdvisees += adviseeCount

		row := DpaRatingRow{
			DpaID:    dpa.ID,
			Nama:     dpa.Nama,
			Username: dpa.Username,
			Advisees: adviseeCount,
			Distribution: map[string]int64{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
		}
		if agg, ok := aggByDpa[dpa.ID]; ok {
			row.RatedBy = agg.RatedBy
			row.AverageStar = round2(agg.Avg)
			totalRated += agg.RatedBy
			sumAvg += agg.Avg
			countedAvg++
		}
		if dist, ok := distByDpa[dpa.ID]; ok {
			row.Distribution = dist
		}
		if adviseeCount > 0 {
			row.ResponseRate = round2(float64(row.RatedBy) / float64(adviseeCount))
		}
		row.Recommendation = buildDpaRecommendation(row.AverageStar, row.RatedBy, row.Advisees, row.ResponseRate, row.Distribution)

		// recent reviews anonim (max 10 terbaru)
		var ratings []DpaRating
		DB.Where("dpa_id = ?", dpa.ID).Order("updated_at DESC").Limit(10).Find(&ratings)
		reviews := make([]Review, 0, len(ratings))
		for i, r := range ratings {
			label := fmt.Sprintf("Mahasiswa %d", i+1)
			// urutan stabil per DPA agar label konsisten per request
			_ = idx
			reviews = append(reviews, Review{Stars: r.Stars, Comment: r.Comment, CreatedAt: r.UpdatedAt, Label: label})
		}
		row.RecentReviews = reviews

		if fw, ok := followByDpa[dpa.ID]; ok {
			fh := gin.H{"id": fw.ID, "note": fw.Note, "status": fw.Status, "updated_at": fw.UpdatedAt}
			row.FollowUp = &fh
		}

		rows = append(rows, row)
	}

	var totalRatings int64
	DB.Model(&DpaRating{}).Count(&totalRatings)

	overallAvg := 0.0
	if countedAvg > 0 {
		overallAvg = round2(sumAvg / float64(countedAvg))
	}

	// Tren per semester (global)
	type SemesterAgg struct {
		Semester string
		Avg      float64
		Cnt      int64
	}
	var semAggs []SemesterAgg
	DB.Model(&DpaRating{}).Select("semester as semester, AVG(stars) as avg, COUNT(*) as cnt").Where("semester <> ''").Group("semester").Order("semester ASC").Scan(&semAggs)
	semesterTrend := make([]gin.H, 0, len(semAggs))
	for _, s := range semAggs {
		semesterTrend = append(semesterTrend, gin.H{"semester": s.Semester, "average_stars": round2(s.Avg), "count": s.Cnt})
	}

	c.JSON(http.StatusOK, gin.H{
		"ratings":        rows,
		"total_ratings":  totalRatings,
		"semester_trend": semesterTrend,
		"summary": gin.H{
			"total_dpa":      len(dpas),
			"total_advisees": totalAdvisees,
			"total_rated":    totalRated,
			"overall_avg":    overallAvg,
		},
		"privacy_note": "Rekap bersifat agregat dan anonim — identitas penilai tidak ditampilkan. Ulasan ditampilkan sebagai Mahasiswa 1..n.",
	})
}

func currentSemesterLabel() string {
	now := time.Now()
	year := now.Year()
	month := now.Month()
	if month >= 8 {
		// Agustus–Desember = Ganjil
		return fmt.Sprintf("Ganjil %d/%d", year, year+1)
	}
	if month >= 2 {
		// Februari–Juli = Genap
		return fmt.Sprintf("Genap %d/%d", year-1, year)
	}
	// Januari = Genap tahun sebelumnya
	return fmt.Sprintf("Genap %d/%d", year-1, year)
}

func buildDpaRecommendation(avg float64, ratedBy, advisees int64, responseRate float64, dist map[string]int64) gin.H {
	if ratedBy == 0 {
		return gin.H{"label": "Belum ada penilaian", "detail": "Belum ada mahasiswa bimbingan yang memberi penilaian. Dorong partisipasi.", "priority": "low", "tone": "slate"}
	}
	if responseRate > 0 && responseRate < 0.3 && advisees >= 5 {
		return gin.H{"label": "Partisipasi rendah", "detail": fmt.Sprintf("Hanya %d/%d mahasiswa (%.0f%%) yang menilai. Tingkatkan sosialisasi.", ratedBy, advisees, responseRate*100), "priority": "medium", "tone": "amber"}
	}
	if avg >= 4.5 {
		return gin.H{"label": "Pertahankan & jadikan mentor", "detail": fmt.Sprintf("Rata-rata %.2f sangat baik. Jadikan role model / mentor DPA lain.", avg), "priority": "low", "tone": "emerald"}
	}
	if avg >= 4.0 {
		return gin.H{"label": "Baik — pertahankan", "detail": fmt.Sprintf("Rata-rata %.2f baik. Tindak lanjuti ulasan bintang terendah bila ada.", avg), "priority": "low", "tone": "emerald"}
	}
	if avg >= 3.0 {
		low := dist["1"] + dist["2"]
		detail := fmt.Sprintf("Rata-rata %.2f cukup. Perlu pembinaan ringan & cek ulasan.", avg)
		if low > 0 {
			detail = fmt.Sprintf("Rata-rata %.2f cukup, ada %d ulasan 1-2 bintang. Jadwalkan pembinaan.", avg, low)
		}
		return gin.H{"label": "Perlu pembinaan", "detail": detail, "priority": "medium", "tone": "amber"}
	}
	return gin.H{"label": "Pembinaan prioritas", "detail": fmt.Sprintf("Rata-rata %.2f rendah. Segera lakukan pembinaan & evaluasi bimbingan.", avg), "priority": "high", "tone": "rose"}
}

// SuperadminDpaRatingFollowUpHandler mencatat tindak lanjut Kaprodi per DPA.
func SuperadminDpaRatingFollowUpHandler(c *gin.Context) {
	actor := c.MustGet("user").(User)
	dpaID, ok := parseUintParam(c, "dpaId")
	if !ok {
		return
	}
	var dpa User
	if err := DB.Where("id = ? AND role = ?", dpaID, RoleDPA).First(&dpa).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "DPA tidak ditemukan"})
		return
	}
	var input struct {
		Note   string `json:"note" binding:"required"`
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Catatan tindak lanjut wajib diisi"})
		return
	}
	note := strings.TrimSpace(input.Note)
	if len(note) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Catatan maksimal 2000 karakter"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status == "" {
		status = "diproses"
	}
	if status != "diproses" && status != "selesai" && status != "ditunda" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus diproses / selesai / ditunda"})
		return
	}
	f := DpaFollowUp{DpaID: dpaID, Note: note, Status: status, CreatedBy: actor.ID}
	DB.Create(&f)
	c.JSON(http.StatusOK, gin.H{"status": "success", "follow_up": f})
}

// SuperadminDpaRatingFollowUpListHandler daftar tindak lanjut per DPA (Kaprodi).
func SuperadminDpaRatingFollowUpListHandler(c *gin.Context) {
	dpaID, ok := parseUintParam(c, "dpaId")
	if !ok {
		return
	}
	var list []DpaFollowUp
	DB.Where("dpa_id = ?", dpaID).Order("updated_at DESC").Find(&list)
	c.JSON(http.StatusOK, gin.H{"follow_ups": list})
}

// SuperadminDpaRatingFollowUpPatchHandler ubah status/catatan tindak lanjut.
func SuperadminDpaRatingFollowUpPatchHandler(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var fu DpaFollowUp
	if err := DB.First(&fu, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tindak lanjut tidak ditemukan"})
		return
	}
	var input struct {
		Note   *string `json:"note"`
		Status *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload tidak valid"})
		return
	}
	updates := map[string]interface{}{}
	if input.Note != nil {
		note := strings.TrimSpace(*input.Note)
		if len(note) > 2000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Catatan maksimal 2000 karakter"})
			return
		}
		updates["note"] = note
	}
	if input.Status != nil {
		st := strings.ToLower(strings.TrimSpace(*input.Status))
		if st != "diproses" && st != "selesai" && st != "ditunda" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus diproses / selesai / ditunda"})
			return
		}
		updates["status"] = st
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak ada perubahan"})
		return
	}
	DB.Model(&fu).Updates(updates)
	DB.First(&fu, id)
	c.JSON(http.StatusOK, gin.H{"status": "success", "follow_up": fu})
}
