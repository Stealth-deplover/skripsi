package main

import (
	"fmt"
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
)

// ============================================================
// Direktori DPA + Rating Bintang (privasi: rating tidak pernah
// dikembalikan ke role dpa; hanya mahasiswa & superadmin).
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
	myRatings := map[uint]int{}
	if role == RoleStudent {
		var ratings []DpaRating
		DB.Where("student_id = ?", user.ID).Find(&ratings)
		for _, rating := range ratings {
			myRatings[rating.DpaID] = rating.Stars
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
	}
	cards := make([]DpaCard, 0, len(dpas))
	for _, dpa := range dpas {
		card := DpaCard{
			ID:         dpa.ID,
			Nama:       dpa.Nama,
			Username:   dpa.Username,
			Bio:        dpa.Bio,
			ProfilePic: dpa.ProfilePic,
			Nip:        dpa.Nip,
			Phone:      dpa.Phone,
			IsMyDpa:    role == RoleStudent && user.DpaID == dpa.ID,
			MyStars:    myRatings[dpa.ID],
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

// DpaRateHandler menyimpan/mengubah rating bintang (1-5) mahasiswa
// untuk DPA pembimbingnya sendiri.
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
		Stars int `json:"stars" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jumlah bintang wajib diisi"})
		return
	}
	if input.Stars < 1 || input.Stars > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Penilaian harus 1 sampai 5 bintang"})
		return
	}

	var rating DpaRating
	if err := DB.Where("dpa_id = ? AND student_id = ?", dpaID, student.ID).First(&rating).Error; err == nil {
		DB.Model(&rating).Update("stars", input.Stars)
	} else {
		rating = DpaRating{DpaID: dpaID, StudentID: student.ID, Stars: input.Stars}
		DB.Create(&rating)
	}

	// Respons hanya menyatakan status penilaian mahasiswa itu sendiri.
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"rating": gin.H{"dpa_id": dpaID, "stars": input.Stars},
	})
}

// DpaMyRatingHandler mengembalikan rating milik mahasiswa sendiri.
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
	c.JSON(http.StatusOK, gin.H{"rating": gin.H{"dpa_id": rating.DpaID, "stars": rating.Stars}})
}

// SuperadminDpaRatingsHandler: rekap agregat untuk evaluasi Kaprodi.
// Tanpa identitas penilai.
func SuperadminDpaRatingsHandler(c *gin.Context) {
	type DpaRatingRow struct {
		DpaID       uint    `json:"dpa_id"`
		Nama        string  `json:"nama"`
		Username    string  `json:"username"`
		Advisees    int64   `json:"advisees"`
		RatedBy     int64   `json:"rated_by"`
		AverageStar float64 `json:"average_stars"`
	}
	var dpas []User
	DB.Where("role = ?", RoleDPA).Order("nama ASC").Find(&dpas)

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

	rows := make([]DpaRatingRow, 0, len(dpas))
	for _, dpa := range dpas {
		var adviseeCount int64
		DB.Model(&User{}).Where("dpa_id = ? AND role = ?", dpa.ID, RoleStudent).Count(&adviseeCount)
		row := DpaRatingRow{
			DpaID:    dpa.ID,
			Nama:     dpa.Nama,
			Username: dpa.Username,
			Advisees: adviseeCount,
		}
		if agg, ok := aggByDpa[dpa.ID]; ok {
			row.RatedBy = agg.RatedBy
			row.AverageStar = round2(agg.Avg)
		}
		rows = append(rows, row)
	}

	var totalRatings int64
	DB.Model(&DpaRating{}).Count(&totalRatings)

	c.JSON(http.StatusOK, gin.H{
		"ratings":       rows,
		"total_ratings": totalRatings,
		"privacy_note":  "Rekap bersifat agregat dan anonim — identitas penilai tidak tersimpan untuk ditampilkan.",
	})
}
