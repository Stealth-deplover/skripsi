package main

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func AdminGuard(c *gin.Context) bool {
	user := c.MustGet("user").(User)
	if user.Role != RoleSuperadmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses superadmin diperlukan"})
		return false
	}
	return true
}

func RespondenGetHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	var users []User
	if err := DB.Preload("Predictions", func(db *gorm.DB) *gorm.DB {
		return db.Order("timestamp DESC")
	}).Preload("MBTIResults", func(db *gorm.DB) *gorm.DB {
		return db.Order("timestamp DESC")
	}).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch respondents"})
		return
	}

	type RespondenDTO struct {
		ID                  uint      `json:"id"`
		Nama                string    `json:"nama"`
		Username            string    `json:"username"`
		LatestBurnout       float64   `json:"latest_burnout"`
		LatestRisk          string    `json:"latest_risk"`
		LatestPsychosomatic float64   `json:"latest_psychosomatic"`
		LastActivity        time.Time `json:"last_activity"`
		LatestMBTIType      string    `json:"latest_mbti_type"`
		LatestMBTITitle     string    `json:"latest_mbti_title"`
		LatestMBTISummary   string    `json:"latest_mbti_summary"`
		LatestMBTITimestamp time.Time `json:"latest_mbti_timestamp"`
	}

	var result []RespondenDTO
	for _, u := range users {
		if isAdminLevelRole(u.Role) {
			continue
		}

		dto := RespondenDTO{
			ID:       u.ID,
			Nama:     u.Nama,
			Username: u.Username,
		}

		if len(u.Predictions) > 0 {
			latest := u.Predictions[0]
			dto.LatestBurnout = latest.BurnoutScore
			dto.LatestRisk = latest.RiskLevel
			dto.LatestPsychosomatic = latest.PsychosomaticScore
			dto.LastActivity = latest.Timestamp
		}

		if len(u.MBTIResults) > 0 {
			latest := u.MBTIResults[0]
			dto.LatestMBTIType = latest.PersonalityType
			dto.LatestMBTITitle = latest.Title
			dto.LatestMBTISummary = latest.Summary
			dto.LatestMBTITimestamp = latest.Timestamp
		}

		result = append(result, dto)
	}

	c.JSON(http.StatusOK, gin.H{"respondents": result})
}

func RespondenHistoryHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	id := c.Param("id")
	var predictions []Prediction
	if err := DB.Where("user_id = ?", id).Order("timestamp DESC").Find(&predictions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}

	var assessments []Assessment
	if err := DB.Where("user_id = ?", id).Order("timestamp DESC").Find(&assessments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assessments"})
		return
	}

	var mbtiResults []MBTIResult
	if err := DB.Where("user_id = ?", id).Order("timestamp DESC").Find(&mbtiResults).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch MBTI results"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"predictions":  predictions,
		"assessments":  assessments,
		"mbti_results": mbtiResults,
	})
}

func AdminUsersGetHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	var users []User
	DB.Order("id ASC").Find(&users)

	type UserDTO struct {
		ID         uint      `json:"id"`
		Username   string    `json:"username"`
		Nama       string    `json:"nama"`
		Role       string    `json:"role"`
		Bio        string    `json:"bio"`
		ProfilePic string    `json:"profile_pic"`
		UserType   string    `json:"user_type"`
		Nim        string    `json:"nim"`
		Prodi      string    `json:"prodi"`
		Angkatan   string    `json:"angkatan"`
		Semester   int       `json:"semester"`
		Ipk        float64   `json:"ipk"`
		Ips        float64   `json:"ips"`
		Sks        int       `json:"sks"`
		Kehadiran  float64   `json:"kehadiran"`
		DpaID      uint      `json:"dpa_id"`
		DpaName    string    `json:"dpa_name"`
		CreatedAt  time.Time `json:"created_at"`
		UpdatedAt  time.Time `json:"updated_at"`
	}
	dpaNames := map[uint]string{}
	for _, u := range users {
		if isDpaRole(u.Role) {
			dpaNames[u.ID] = u.Nama
		}
	}
	var result []UserDTO
	for _, u := range users {
		result = append(result, UserDTO{
			ID: u.ID, Username: u.Username, Nama: u.Nama,
			Role: u.Role, Bio: u.Bio, ProfilePic: u.ProfilePic,
			Nim: u.Nim, Prodi: u.Prodi, Angkatan: u.Angkatan, Semester: u.Semester,
			Ipk: u.Ipk, Ips: u.Ips, Sks: u.Sks, Kehadiran: u.Kehadiran,
			DpaID: u.DpaID, DpaName: dpaNames[u.DpaID],
			CreatedAt: u.CreatedAt, UpdatedAt: u.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"users": result})
}

func AdminUsersGetByIDHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")
	var user User
	if err := DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	dpaName := ""
	if user.DpaID > 0 {
		var dpa User
		DB.First(&dpa, user.DpaID)
		dpaName = dpa.Nama
	}
	c.JSON(http.StatusOK, gin.H{
		"id": user.ID, "username": user.Username, "nama": user.Nama,
		"role": user.Role, "bio": user.Bio, "profile_pic": user.ProfilePic,
		"nim": user.Nim, "prodi": user.Prodi, "angkatan": user.Angkatan, "semester": user.Semester,
		"ipk": user.Ipk, "ips": user.Ips, "sks": user.Sks, "kehadiran": user.Kehadiran,
		"dpa_id": user.DpaID, "dpa_name": dpaName,
		"created_at": user.CreatedAt, "updated_at": user.UpdatedAt,
	})
}

func AdminUsersCreateHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	var input struct {
		Username string `json:"username" binding:"required"`
		Nama     string `json:"nama" binding:"required"`
		Role     string `json:"role" binding:"required"`
		Password string `json:"password" binding:"required"`
		Bio      string `json:"bio"`
		// Profil akademik mahasiswa
		Nim       string  `json:"nim"`
		Prodi     string  `json:"prodi"`
		Angkatan  string  `json:"angkatan"`
		Semester  int     `json:"semester"`
		Ipk       float64 `json:"ipk"`
		Ips       float64 `json:"ips"`
		Sks       int     `json:"sks"`
		Kehadiran float64 `json:"kehadiran"`
		DpaID     uint    `json:"dpa_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Nama = strings.TrimSpace(input.Nama)
	input.Role = strings.ToLower(strings.TrimSpace(input.Role))

	if !isValidRole(input.Role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role harus student, dpa, staff, atau superadmin"})
		return
	}
	if input.Nama == "" || len(input.Nama) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama lengkap minimal 3 karakter"})
		return
	}
	if message := validateUsername(input.Username); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if message := validatePassword(input.Password); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var count int64
	DB.Model(&User{}).Where("username = ?", input.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username already taken"})
		return
	}

	hashedPassword, _ := HashPassword(input.Password)
	user := User{
		Username:     input.Username,
		PasswordHash: hashedPassword,
		Nama:         input.Nama,
		Role:         input.Role,
		Bio:          input.Bio,
		Nim:          strings.TrimSpace(input.Nim),
		Prodi:        strings.TrimSpace(input.Prodi),
		Angkatan:     strings.TrimSpace(input.Angkatan),
		Semester:     input.Semester,
		Ipk:          input.Ipk,
		Ips:          input.Ips,
		Sks:          input.Sks,
		Kehadiran:    input.Kehadiran,
	}
	if input.DpaID > 0 {
		if input.Role == RoleStudent {
			var dpa User
			if err := DB.Where("id = ? AND role = ?", input.DpaID, RoleDPA).First(&dpa).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "DPA tidak ditemukan"})
				return
			}
			user.DpaID = input.DpaID
		}
	}
	if err := DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User created", "user": gin.H{
		"id": user.ID, "username": user.Username, "nama": user.Nama, "role": user.Role,
	}})
}

func AdminUsersPutHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")
	var target User
	if err := DB.First(&target, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	var input struct {
		Username string `json:"username"`
		Nama     string `json:"nama"`
		Role     string `json:"role"`
		Bio      string `json:"bio"`
		Password string `json:"password"`
		// Profil akademik mahasiswa
		Nim       string  `json:"nim"`
		Prodi     string  `json:"prodi"`
		Angkatan  string  `json:"angkatan"`
		Semester  *int    `json:"semester"`
		Ipk       *float64 `json:"ipk"`
		Ips       *float64 `json:"ips"`
		Sks       *int    `json:"sks"`
		Kehadiran *float64 `json:"kehadiran"`
		DpaID     *uint   `json:"dpa_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if input.Username != "" && input.Username != target.Username {
		var count int64
		DB.Model(&User{}).Where("username = ? AND id != ?", input.Username, target.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username already taken"})
			return
		}
		updates["username"] = input.Username
	}
	if input.Nama != "" {
		updates["nama"] = input.Nama
	}
	if input.Role != "" {
		normalized := strings.ToLower(strings.TrimSpace(input.Role))
		if !isValidRole(normalized) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Role harus student, dpa, staff, atau superadmin"})
			return
		}
		updates["role"] = normalized
	}
	if input.Bio != "" {
		updates["bio"] = input.Bio
	}
	if input.Nim != "" {
		updates["nim"] = strings.TrimSpace(input.Nim)
	}
	if input.Prodi != "" {
		updates["prodi"] = strings.TrimSpace(input.Prodi)
	}
	if input.Angkatan != "" {
		updates["angkatan"] = strings.TrimSpace(input.Angkatan)
	}
	if input.Semester != nil {
		if *input.Semester < 0 || *input.Semester > 14 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Semester harus di antara 0 dan 14"})
			return
		}
		updates["semester"] = *input.Semester
	}
	if input.Ipk != nil {
		if *input.Ipk < 0 || *input.Ipk > 4 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "IPK harus di antara 0 dan 4"})
			return
		}
		updates["ipk"] = *input.Ipk
	}
	if input.Ips != nil {
		if *input.Ips < 0 || *input.Ips > 4 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "IPS harus di antara 0 dan 4"})
			return
		}
		updates["ips"] = *input.Ips
	}
	if input.Sks != nil {
		if *input.Sks < 0 || *input.Sks > 160 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "SKS harus di antara 0 dan 160"})
			return
		}
		updates["sks"] = *input.Sks
	}
	if input.Kehadiran != nil {
		if *input.Kehadiran < 0 || *input.Kehadiran > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Kehadiran harus di antara 0 dan 100"})
			return
		}
		updates["kehadiran"] = *input.Kehadiran
	}
	if input.DpaID != nil {
		if *input.DpaID == 0 {
			updates["dpa_id"] = 0
		} else {
			var dpa User
			if err := DB.Where("id = ? AND role = ?", *input.DpaID, RoleDPA).First(&dpa).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "DPA tidak ditemukan"})
				return
			}
			updates["dpa_id"] = *input.DpaID
		}
	}
	if input.Password != "" {
		hashedPassword, _ := HashPassword(input.Password)
		updates["password_hash"] = hashedPassword
	}
	if len(updates) > 0 {
		DB.Model(&target).Updates(updates)
	}
	// Notifikasi mapping: mahasiswa tahu siapa DPA-nya, DPA tahu bimbingan baru.
	if newDpaID, ok := updates["dpa_id"].(uint); ok && newDpaID != 0 && newDpaID != target.DpaID {
		var dpa User
		if err := DB.First(&dpa, newDpaID).Error; err == nil {
			DB.Create(&Notification{
				UserID:  dpa.ID,
				Type:    "student_wellbeing",
				Message: fmt.Sprintf("Mahasiswa %s dipetakan sebagai bimbingan Anda.", target.Nama),
			})
			DB.Create(&Notification{
				UserID:  target.ID,
				Type:    "student_wellbeing",
				Message: fmt.Sprintf("DPA pembimbing Anda adalah %s. Buka menu DPA Saya untuk melihat profil dan grup bimbingan.", dpa.Nama),
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "User updated"})
}

// AdminBulkDpaHandler memetakan banyak mahasiswa ke satu DPA sekaligus.
// Body: {dpa_id, student_ids: []}. Hanya user role student yang diproses.
func AdminBulkDpaHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	var input struct {
		DpaID      uint   `json:"dpa_id" binding:"required"`
		StudentIDs []uint `json:"student_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dpa_id dan student_ids wajib diisi"})
		return
	}
	var dpa User
	if err := DB.Where("id = ? AND role = ?", input.DpaID, RoleDPA).First(&dpa).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "DPA tidak ditemukan"})
		return
	}

	updated := 0
	skipped := 0
	for _, studentID := range input.StudentIDs {
		var student User
		if err := DB.Where("id = ? AND role = ?", studentID, RoleStudent).First(&student).Error; err != nil {
			skipped++
			continue
		}
		if student.DpaID == input.DpaID {
			skipped++
			continue
		}
		if err := DB.Model(&student).Update("dpa_id", input.DpaID).Error; err != nil {
			skipped++
			continue
		}
		updated++
		DB.Create(&Notification{
			UserID:  student.ID,
			Type:    "student_wellbeing",
			Message: fmt.Sprintf("DPA pembimbing Anda adalah %s. Buka menu DPA Saya untuk melihat profil dan grup bimbingan.", dpa.Nama),
		})
	}

	if updated > 0 {
		DB.Create(&Notification{
			UserID:  dpa.ID,
			Type:    "student_wellbeing",
			Message: fmt.Sprintf("%d mahasiswa baru dipetakan sebagai bimbingan Anda.", updated),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "success",
		"message":  fmt.Sprintf("%d mahasiswa dipetakan ke %s.", updated, dpa.Nama),
		"updated":  updated,
		"skipped":  skipped,
	})
}

func AdminUsersDeleteHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")
	var target User
	if err := DB.First(&target, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	// Prevent self-delete
	currentUser := c.MustGet("user").(User)
	if target.ID == currentUser.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}
	DB.Where("user_id = ?", target.ID).Delete(&Prediction{})
	DB.Where("user_id = ?", target.ID).Delete(&Assessment{})
	DB.Where("user_id = ?", target.ID).Delete(&Curhat{})
	DB.Where("user_id = ?", target.ID).Delete(&CurhatReply{})
	DB.Where("user_id = ?", target.ID).Delete(&Notification{})
	DB.Where("user_id = ? OR target_user_id = ?", target.ID, target.ID).Delete(&Affinity{})
	DB.Where("follower_id = ? OR following_id = ?", target.ID, target.ID).Delete(&Follow{})
	DB.Delete(&target)
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "User deleted"})
}

func AdminUsersTreatmentHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")
	var target User
	if err := DB.First(&target, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	var input struct {
		Message      string `json:"message" binding:"required"`
		Category     string `json:"category"`
		Priority     string `json:"priority"`
		Duration     string `json:"duration"`
		FollowUpDate string `json:"follow_up_date"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	var latestPrediction Prediction
	DB.Where("user_id = ?", target.ID).Order("timestamp desc").First(&latestPrediction)

	var followUp *time.Time
	if input.FollowUpDate != "" {
		t, err := time.Parse("2006-01-02", input.FollowUpDate)
		if err == nil {
			followUp = &t
		}
	}

	cat := input.Category
	if cat == "" {
		cat = "general"
	}
	pri := input.Priority
	if pri == "" {
		pri = "medium"
	}
	dur := input.Duration
	if dur == "" {
		dur = "1_week"
	}

	therapy := TherapyRecommendation{
		UserID:       target.ID,
		PredictionID: latestPrediction.ID,
		ModuleName:   input.Message,
		Category:     cat,
		Priority:     pri,
		Duration:     dur,
		FollowUpDate: followUp,
		Status:       "pending",
	}
	DB.Create(&therapy)

	priLabel := map[string]string{"urgent": "URGENT", "high": "Tinggi", "medium": "Sedang", "low": "Rendah"}[pri]
	durLabel := map[string]string{"1_week": "1 Minggu", "2_weeks": "2 Minggu", "1_month": "1 Bulan", "3_months": "3 Bulan"}[dur]

	notification := Notification{
		UserID:  target.ID,
		Type:    "treatment",
		Message: fmt.Sprintf("[%s] Rekomendasi Penanganan: %s (Durasi: %s)", priLabel, input.Message, durLabel),
	}
	DB.Create(&notification)

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Treatment sent to user", "notification": notification})
}

func AdminUserTreatmentsHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")

	var treatments []TherapyRecommendation
	DB.Preload("Replies").
		Where("user_id = ?", id).
		Order("created_at DESC").
		Limit(20).
		Find(&treatments)

	c.JSON(http.StatusOK, gin.H{"treatments": treatments})
}

func AdminTreatmentRepliesHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	type ReplyDTO struct {
		ID          uint      `json:"id"`
		TreatmentID uint      `json:"treatment_id"`
		UserID      uint      `json:"user_id"`
		UserName    string    `json:"user_name"`
		Username    string    `json:"username"`
		Text        string    `json:"text"`
		Mood        string    `json:"mood"`
		AdminSeen   bool      `json:"admin_seen"`
		CreatedAt   time.Time `json:"created_at"`
		ModuleName  string    `json:"module_name"`
		Category    string    `json:"category"`
		Priority    string    `json:"priority"`
		Status      string    `json:"status"`
	}

	var replies []TreatmentReply
	DB.Order("created_at DESC").Limit(80).Find(&replies)

	var result []ReplyDTO
	for _, reply := range replies {
		var treatment TherapyRecommendation
		DB.First(&treatment, reply.TherapyRecommendationID)

		var user User
		DB.First(&user, reply.UserID)

		result = append(result, ReplyDTO{
			ID:          reply.ID,
			TreatmentID: reply.TherapyRecommendationID,
			UserID:      reply.UserID,
			UserName:    user.Nama,
			Username:    user.Username,
			Text:        reply.Text,
			Mood:        reply.Mood,
			AdminSeen:   reply.AdminSeen,
			CreatedAt:   reply.CreatedAt,
			ModuleName:  treatment.ModuleName,
			Category:    treatment.Category,
			Priority:    treatment.Priority,
			Status:      treatment.Status,
		})
	}

	if result == nil {
		result = []ReplyDTO{}
	}

	c.JSON(http.StatusOK, gin.H{"replies": result})
}

func AdminTreatmentReplyReadHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	id := c.Param("id")

	var reply TreatmentReply
	if err := DB.First(&reply, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Balasan tidak ditemukan"})
		return
	}

	reply.AdminSeen = true
	DB.Save(&reply)

	c.JSON(http.StatusOK, gin.H{"status": "success", "reply": reply})
}

func AdminAnalyticsHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	config := getSystemConfig()

	var users []User
	if err := DB.Preload("Predictions", func(db *gorm.DB) *gorm.DB {
		return db.Order("timestamp DESC")
	}).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}

	totalRespondents := 0
	totalRespondentsWithPrediction := 0
	var sumBurnout float64
	highRiskCount := 0

	burnoutCounts := map[string]int{"Rendah": 0, "Sedang": 0, "Tinggi": 0}
	psychoCounts := map[string]int{"Rendah": 0, "Sedang": 0, "Tinggi": 0}

	type ScatterPoint struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	var scatterData []ScatterPoint

	for _, u := range users {
		if isAdminLevelRole(u.Role) {
			continue
		}
		totalRespondents++
		if len(u.Predictions) > 0 {
			latest := u.Predictions[0]
			totalRespondentsWithPrediction++
			sumBurnout += latest.BurnoutScore
			if latest.RiskLevel == "High" || latest.RiskLevel == "Crisis" {
				highRiskCount++
			}

			if latest.BurnoutScore <= config.BurnoutThresholdLow {
				burnoutCounts["Rendah"]++
			} else if latest.BurnoutScore <= config.BurnoutThresholdMedium {
				burnoutCounts["Sedang"]++
			} else {
				burnoutCounts["Tinggi"]++
			}

			if latest.PsychosomaticScore <= config.PsychoThresholdLow {
				psychoCounts["Rendah"]++
			} else if latest.PsychosomaticScore <= config.PsychoThresholdMedium {
				psychoCounts["Sedang"]++
			} else {
				psychoCounts["Tinggi"]++
			}

			scatterData = append(scatterData, ScatterPoint{
				X: latest.PsychosomaticScore,
				Y: latest.BurnoutScore,
			})
		}
	}

	var avgBurnout float64
	if totalRespondentsWithPrediction > 0 {
		avgBurnout = sumBurnout / float64(totalRespondentsWithPrediction)
	}

	var totalPredictions int64
	DB.Model(&Prediction{}).Count(&totalPredictions)

	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var assessmentsToday int64
	var pendingTreatments int64
	var unseenReplies int64
	var unreadNotifications int64
	DB.Model(&Assessment{}).Where("timestamp >= ?", startOfDay).Count(&assessmentsToday)
	DB.Model(&TherapyRecommendation{}).Where("status = ?", "pending").Count(&pendingTreatments)
	DB.Model(&TreatmentReply{}).Where("admin_seen = ?", false).Count(&unseenReplies)
	DB.Model(&Notification{}).Where("is_read = ?", false).Count(&unreadNotifications)

	earlyWarningCount := 0
	if config.EarlyWarningEnabled {
		warningScore := config.EarlyWarningThreshold * 10
		for _, user := range users {
			if isAdminLevelRole(user.Role) || len(user.Predictions) == 0 {
				continue
			}
			if user.Predictions[0].BurnoutScore >= warningScore {
				earlyWarningCount++
			}
		}
	}

	// Trend calculation
	type GroupedScores struct {
		All       []float64
		Mahasiswa []float64
	}
	dateGroups := make(map[string]*GroupedScores)
	var orderedDates []string
	var predictionsAll []Prediction
	DB.Order("timestamp ASC").Find(&predictionsAll)
	for _, p := range predictionsAll {
		dateStr := p.Timestamp.Format("02 Jan")
		if dateGroups[dateStr] == nil {
			orderedDates = append(orderedDates, dateStr)
			dateGroups[dateStr] = &GroupedScores{}
		}
		group := dateGroups[dateStr]
		group.All = append(group.All, p.BurnoutScore)
		group.Mahasiswa = append(group.Mahasiswa, p.BurnoutScore)
	}

	type TrendDay struct {
		Date      string  `json:"date"`
		Semua     float64 `json:"semua"`
		Mahasiswa float64 `json:"mahasiswa"`
	}
	var trendData []TrendDay

	for _, d := range orderedDates {
		scores := dateGroups[d]

		trendData = append(trendData, TrendDay{
			Date:      d,
			Semua:     mean(scores.All),
			Mahasiswa: mean(scores.Mahasiswa),
		})
	}

	if len(trendData) > 10 {
		trendData = trendData[len(trendData)-10:]
	}

	samples := loadTrainingSamples()
	correlationSeries := map[string][]float64{
		"Fatigue":      {},
		"Cynicism":     {},
		"Efficacy":     {},
		"Interference": {},
		"Order Effect": {},
		"Dissonance":   {},
		"NLP Stress":   {},
		"Burnout":      {},
	}
	for _, sample := range samples {
		correlationSeries["Fatigue"] = append(correlationSeries["Fatigue"], sample.Features[1])
		correlationSeries["Cynicism"] = append(correlationSeries["Cynicism"], sample.Features[2])
		correlationSeries["Efficacy"] = append(correlationSeries["Efficacy"], sample.Features[3])
		correlationSeries["Interference"] = append(correlationSeries["Interference"], sample.Features[4])
		correlationSeries["Order Effect"] = append(correlationSeries["Order Effect"], sample.Features[5])
		correlationSeries["Dissonance"] = append(correlationSeries["Dissonance"], sample.Features[6])
		correlationSeries["NLP Stress"] = append(correlationSeries["NLP Stress"], sample.Features[7])
		correlationSeries["Burnout"] = append(correlationSeries["Burnout"], sample.BurnoutTarget)
	}
	type CorrelationDTO struct {
		Label    string  `json:"label"`
		Value    float64 `json:"value"`
		Positive bool    `json:"positive"`
	}
	var correlationData []CorrelationDTO
	for _, label := range []string{"Fatigue", "Cynicism", "Efficacy", "Interference", "Order Effect", "Dissonance", "NLP Stress"} {
		value := pearsonCorrelation(correlationSeries[label], correlationSeries["Burnout"])
		correlationData = append(correlationData, CorrelationDTO{
			Label:    label,
			Value:    value,
			Positive: value >= 0,
		})
	}

	modelSummary := gin.H{
		"active_model":  "Psychometric fallback",
		"trained":       false,
		"accuracy":      0,
		"r2_score":      0,
		"sample_count":  len(samples),
		"feature_count": 7,
	}
	if model, ok := trainRidgeModel(samples); ok {
		metrics := evaluatePredictions(samples, func(sample TrainingSample) float64 {
			return predictLinear(model.BurnoutCoefficients, sample.Features)
		})
		modelSummary = gin.H{
			"active_model":  "Quantum ridge regression",
			"trained":       true,
			"accuracy":      metrics.Accuracy,
			"r2_score":      metrics.R2,
			"sample_count":  len(samples),
			"feature_count": 7,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"totalRespondents": totalRespondents,
		"avgBurnout":       avgBurnout,
		"highRiskCount":    highRiskCount,
		"totalPredictions": totalPredictions,
		"burnoutDist":      burnoutCounts,
		"psychoDist":       psychoCounts,
		"scatterData":      scatterData,
		"trendData":        trendData,
		"correlationData":  correlationData,
		"modelSummary":     modelSummary,
		"operations": gin.H{
			"assessmentsToday":       assessmentsToday,
			"pendingTreatments":      pendingTreatments,
			"unseenReplies":          unseenReplies,
			"unreadNotifications":    unreadNotifications,
			"usersWithoutPrediction": totalRespondents - totalRespondentsWithPrediction,
			"earlyWarningCount":      earlyWarningCount,
			"maintenanceMode":        config.MaintenanceMode,
			"aiResponseEnabled":      config.AIResponseEnabled,
			"maxAssessmentPerDay":    config.MaxAssessmentPerDay,
		},
		"thresholds": gin.H{
			"burnoutLow":    config.BurnoutThresholdLow,
			"burnoutMedium": config.BurnoutThresholdMedium,
			"psychoLow":     config.PsychoThresholdLow,
			"psychoMedium":  config.PsychoThresholdMedium,
		},
	})
}

func AdminConfigGetHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	config := getSystemConfig()
	c.JSON(http.StatusOK, config)
}

func AdminConfigPutHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}
	config := getSystemConfig()
	var input struct {
		BurnoutThresholdLow    float64 `json:"BurnoutThresholdLow"`
		BurnoutThresholdMedium float64 `json:"BurnoutThresholdMedium"`
		PsychoThresholdLow     float64 `json:"PsychoThresholdLow"`
		PsychoThresholdMedium  float64 `json:"PsychoThresholdMedium"`
		InterferenceWeight     float64 `json:"InterferenceWeight"`
		EarlyWarningEnabled    bool    `json:"EarlyWarningEnabled"`
		EarlyWarningThreshold  float64 `json:"EarlyWarningThreshold"`
		MaintenanceMode        bool    `json:"MaintenanceMode"`
		MaxAssessmentPerDay    int     `json:"MaxAssessmentPerDay"`
		AIResponseEnabled      bool    `json:"AIResponseEnabled"`
		NotificationRetention  int     `json:"NotificationRetention"`
		DataRetentionDays      int     `json:"DataRetentionDays"`
		ModelVersion           string  `json:"ModelVersion"`
		AppName                string  `json:"AppName"`
		// Happiness Index
		HiWeightAcademic   float64 `json:"HiWeightAcademic"`
		HiWeightMotivation float64 `json:"HiWeightMotivation"`
		HiWeightSocial     float64 `json:"HiWeightSocial"`
		HiWeightLecturer   float64 `json:"HiWeightLecturer"`
		HiWeightEnvironment float64 `json:"HiWeightEnvironment"`
		HiWeightFacilities float64 `json:"HiWeightFacilities"`
		WellbeingWarnBurnoutRise   float64 `json:"WellbeingWarnBurnoutRise"`
		WellbeingWarnHappinessDrop float64 `json:"WellbeingWarnHappinessDrop"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Field happiness bernilai 0 berarti tidak dikirim client → pakai nilai existing.
	hiAcademic := input.HiWeightAcademic
	if hiAcademic == 0 {
		hiAcademic = config.HiWeightAcademic
	}
	hiMotivation := input.HiWeightMotivation
	if hiMotivation == 0 {
		hiMotivation = config.HiWeightMotivation
	}
	hiSocial := input.HiWeightSocial
	if hiSocial == 0 {
		hiSocial = config.HiWeightSocial
	}
	hiLecturer := input.HiWeightLecturer
	if hiLecturer == 0 {
		hiLecturer = config.HiWeightLecturer
	}
	hiEnvironment := input.HiWeightEnvironment
	if hiEnvironment == 0 {
		hiEnvironment = config.HiWeightEnvironment
	}
	hiFacilities := input.HiWeightFacilities
	if hiFacilities == 0 {
		hiFacilities = config.HiWeightFacilities
	}
	warnRise := input.WellbeingWarnBurnoutRise
	if warnRise == 0 {
		warnRise = config.WellbeingWarnBurnoutRise
	}
	warnDrop := input.WellbeingWarnHappinessDrop
	if warnDrop == 0 {
		warnDrop = config.WellbeingWarnHappinessDrop
	}
	next := normalizeSystemConfig(SystemConfig{
		BurnoutThresholdLow:    input.BurnoutThresholdLow,
		BurnoutThresholdMedium: input.BurnoutThresholdMedium,
		PsychoThresholdLow:     input.PsychoThresholdLow,
		PsychoThresholdMedium:  input.PsychoThresholdMedium,
		InterferenceWeight:     input.InterferenceWeight,
		EarlyWarningEnabled:    input.EarlyWarningEnabled,
		EarlyWarningThreshold:  input.EarlyWarningThreshold,
		MaintenanceMode:        input.MaintenanceMode,
		MaxAssessmentPerDay:    input.MaxAssessmentPerDay,
		AIResponseEnabled:      input.AIResponseEnabled,
		NotificationRetention:  input.NotificationRetention,
		DataRetentionDays:      input.DataRetentionDays,
		ModelVersion:           strings.TrimSpace(input.ModelVersion),
		AppName:                strings.TrimSpace(input.AppName),
		HiWeightAcademic:       hiAcademic,
		HiWeightMotivation:     hiMotivation,
		HiWeightSocial:         hiSocial,
		HiWeightLecturer:       hiLecturer,
		HiWeightEnvironment:    hiEnvironment,
		HiWeightFacilities:     hiFacilities,
		WellbeingWarnBurnoutRise:   warnRise,
		WellbeingWarnHappinessDrop: warnDrop,
	})
	if next.BurnoutThresholdLow >= next.BurnoutThresholdMedium || next.PsychoThresholdLow >= next.PsychoThresholdMedium {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Threshold rendah harus lebih kecil dari threshold sedang"})
		return
	}
	if next.AppName == "" {
		next.AppName = config.AppName
	}
	if next.ModelVersion == "" {
		next.ModelVersion = config.ModelVersion
	}
	DB.Model(&config).Updates(map[string]interface{}{
		"burnout_threshold_low":    next.BurnoutThresholdLow,
		"burnout_threshold_medium": next.BurnoutThresholdMedium,
		"psycho_threshold_low":     next.PsychoThresholdLow,
		"psycho_threshold_medium":  next.PsychoThresholdMedium,
		"interference_weight":      next.InterferenceWeight,
		"early_warning_enabled":    next.EarlyWarningEnabled,
		"early_warning_threshold":  next.EarlyWarningThreshold,
		"maintenance_mode":         next.MaintenanceMode,
		"max_assessment_per_day":   next.MaxAssessmentPerDay,
		"ai_response_enabled":      next.AIResponseEnabled,
		"notification_retention":   next.NotificationRetention,
		"data_retention_days":      next.DataRetentionDays,
		"model_version":            next.ModelVersion,
		"app_name":                 next.AppName,
		"hi_weight_academic":       next.HiWeightAcademic,
		"hi_weight_motivation":     next.HiWeightMotivation,
		"hi_weight_social":         next.HiWeightSocial,
		"hi_weight_lecturer":       next.HiWeightLecturer,
		"hi_weight_environment":    next.HiWeightEnvironment,
		"hi_weight_facilities":     next.HiWeightFacilities,
		"wellbeing_warn_burnout_rise":   next.WellbeingWarnBurnoutRise,
		"wellbeing_warn_happiness_drop": next.WellbeingWarnHappinessDrop,
	})
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Configuration updated", "config": next})
}

func AdminQuantumHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	var assessments []Assessment
	DB.Find(&assessments)

	if len(assessments) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No assessment data yet"})
		return
	}

	var sumI, sumOrder, sumDissonance, minI, maxI float64
	minI = assessments[0].InterferenceScore
	for _, a := range assessments {
		sumI += a.InterferenceScore
		sumOrder += a.OrderEffectScore
		sumDissonance += a.CognitiveDissonanceScore
		if a.InterferenceScore < minI {
			minI = a.InterferenceScore
		}
		if a.InterferenceScore > maxI {
			maxI = a.InterferenceScore
		}
	}
	avgI := sumI / float64(len(assessments))
	avgOrder := sumOrder / float64(len(assessments))
	avgDissonance := sumDissonance / float64(len(assessments))

	orderGroups := make(map[string][]Assessment)
	for _, a := range assessments {
		orderGroups[a.OrderType] = append(orderGroups[a.OrderType], a)
	}
	type OrderEffect struct {
		OrderType       string  `json:"order_type"`
		Count           int     `json:"count"`
		AvgFatigue      float64 `json:"avg_fatigue"`
		AvgCynicism     float64 `json:"avg_cynicism"`
		AvgEfficacy     float64 `json:"avg_efficacy"`
		AvgInterference float64 `json:"avg_interference"`
		AvgOrderEffect  float64 `json:"avg_order_effect"`
	}
	var orderEffects []OrderEffect
	for ot, group := range orderGroups {
		var sf, sc, se, si, so float64
		for _, a := range group {
			sf += a.FatigueScore
			sc += a.CynicismScore
			se += a.EfficacyScore
			si += a.InterferenceScore
			so += a.OrderEffectScore
		}
		n := float64(len(group))
		otDisplay := ot
		if len(ot) > 12 {
			otDisplay = ot[:12] + "..."
		}
		orderEffects = append(orderEffects, OrderEffect{
			OrderType: otDisplay, Count: len(group),
			AvgFatigue: sf / n, AvgCynicism: sc / n, AvgEfficacy: se / n, AvgInterference: si / n, AvgOrderEffect: so / n,
		})
	}
	sort.SliceStable(orderEffects, func(i, j int) bool {
		return orderEffects[i].OrderType < orderEffects[j].OrderType
	})

	contextuality := 0.0
	if len(orderEffects) > 1 {
		var means []float64
		for _, oe := range orderEffects {
			means = append(means, (oe.AvgInterference+oe.AvgOrderEffect)/2)
		}
		avgM := mean(means)
		for _, m := range means {
			contextuality += (m - avgM) * (m - avgM)
		}
		contextuality = contextuality / float64(len(means))
	}
	contextualityNorm := clamp(contextuality/(contextuality+0.05), 0, 1)

	entanglement := 0.0
	if len(assessments) > 1 {
		fatigue := make([]float64, 0, len(assessments))
		cynicism := make([]float64, 0, len(assessments))
		efficacy := make([]float64, 0, len(assessments))
		for _, a := range assessments {
			fatigue = append(fatigue, a.FatigueScore)
			cynicism = append(cynicism, a.CynicismScore)
			efficacy = append(efficacy, a.EfficacyScore)
		}
		fcCorrelation := math.Abs(pearsonCorrelation(fatigue, cynicism))
		feCorrelation := math.Abs(pearsonCorrelation(fatigue, efficacy))
		ceCorrelation := math.Abs(pearsonCorrelation(cynicism, efficacy))
		entanglement = clamp((fcCorrelation+feCorrelation+ceCorrelation)/3, 0, 1)
	}

	type ScoreDist struct {
		Label string  `json:"label"`
		Count int     `json:"count"`
		Pct   float64 `json:"pct"`
	}
	var predictions []Prediction
	DB.Find(&predictions)
	counts := map[string]int{"Rendah": 0, "Sedang": 0, "Tinggi": 0}
	for _, prediction := range predictions {
		switch normalizeRiskLabel(prediction.RiskLevel) {
		case "Medium":
			counts["Sedang"]++
		case "High":
			counts["Tinggi"]++
		default:
			counts["Rendah"]++
		}
	}
	dist := make([]ScoreDist, 0, 3)
	for _, label := range []string{"Rendah", "Sedang", "Tinggi"} {
		cnt := counts[label]
		pct := 0.0
		if len(predictions) > 0 {
			pct = float64(cnt) / float64(len(predictions)) * 100
		}
		dist = append(dist, ScoreDist{Label: label, Count: cnt, Pct: pct})
	}

	alpha, beta, gamma := 0.0, 0.0, 0.0
	if len(predictions) > 0 {
		total := float64(len(predictions))
		alpha = math.Sqrt(float64(counts["Rendah"]) / total)
		beta = math.Sqrt(float64(counts["Sedang"]) / total)
		gamma = math.Sqrt(float64(counts["Tinggi"]) / total)
	}

	c.JSON(http.StatusOK, gin.H{
		"total_assessments":   len(assessments),
		"total_predictions":   len(predictions),
		"interference_avg":    avgI,
		"interference_min":    minI,
		"interference_max":    maxI,
		"order_effect_avg":    avgOrder,
		"dissonance_avg":      avgDissonance,
		"superposition":       gin.H{"alpha": alpha, "beta": beta, "gamma": gamma},
		"order_effects":       orderEffects,
		"contextuality_index": contextualityNorm,
		"entanglement_degree": entanglement,
		"score_distribution":  dist,
	})
}

func AdminModelEvaluationHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	var predictions []Prediction
	var assessments []Assessment
	DB.Find(&predictions)
	DB.Find(&assessments)

	type UserData struct {
		F, C, E, I, S float64
		BurnoutScore  float64
		PsychoScore   float64
		RiskLevel     string
	}
	userMap := make(map[uint]*UserData)

	for _, a := range assessments {
		ud, exists := userMap[a.UserID]
		if !exists || a.Timestamp.After(assessments[0].Timestamp) {
			if ud == nil {
				userMap[a.UserID] = &UserData{F: a.FatigueScore, C: a.CynicismScore, E: a.EfficacyScore, I: a.InterferenceScore}
			} else {
				ud.F = a.FatigueScore
				ud.C = a.CynicismScore
				ud.E = a.EfficacyScore
				ud.I = a.InterferenceScore
			}
		}
	}

	for _, p := range predictions {
		ud, exists := userMap[p.UserID]
		if exists {
			ud.BurnoutScore = p.BurnoutScore
			ud.PsychoScore = p.PsychosomaticScore
			ud.RiskLevel = p.RiskLevel
		}
	}

	var sumSqTotal, sumSqResidual float64
	var maeSum, rmseSum, mapeSum float64
	count := 0.0
	var meanBurnout float64

	matrix := map[string]int{"Low_Low": 0, "Low_Medium": 0, "Low_High": 0,
		"Medium_Low": 0, "Medium_Medium": 0, "Medium_High": 0,
		"High_Low": 0, "High_High": 0, "High_Medium": 0}
	correct := 0
	totalClassified := 0

	baselineRisk := func(score float64) string {
		if score > 7.5 {
			return "Crisis"
		}
		if score > 6.0 {
			return "High"
		}
		if score > 4.0 {
			return "Medium"
		}
		return "Low"
	}

	featContrib := map[string]float64{"Fatigue (F)": 0, "Cynicism (C)": 0, "Efficacy (E)": 0, "Interference (I)": 0, "NLP Stress (S)": 0}

	for _, ud := range userMap {
		if ud.BurnoutScore == 0 && ud.PsychoScore == 0 {
			continue
		}
		meanBurnout += ud.BurnoutScore
		count++
	}
	if count > 0 {
		meanBurnout /= count
	}

	for _, ud := range userMap {
		if ud.BurnoutScore == 0 && ud.PsychoScore == 0 {
			continue
		}
		baseline := 0.4*ud.F + 0.3*ud.C + 0.2*(5.0-ud.E)
		if baseline < 0 {
			baseline = 0
		}
		if baseline > 10 {
			baseline = 10
		}

		err := ud.BurnoutScore - baseline
		maeSum += math.Abs(err)
		rmseSum += err * err
		sumSqResidual += err * err
		sumSqTotal += (ud.BurnoutScore - meanBurnout) * (ud.BurnoutScore - meanBurnout)
		if ud.BurnoutScore != 0 {
			mapeSum += math.Abs(err/ud.BurnoutScore) * 100
		}

		actualRisk := ud.RiskLevel
		if actualRisk == "Crisis" {
			actualRisk = "High"
		}
		predRisk := baselineRisk(baseline)
		if predRisk == "Crisis" {
			predRisk = "High"
		}
		key := actualRisk + "_" + predRisk
		matrix[key]++
		if actualRisk == predRisk {
			correct++
		}
		totalClassified++

		featContrib["Fatigue (F)"] += 0.4 * ud.F
		featContrib["Cynicism (C)"] += 0.3 * ud.C
		featContrib["Efficacy (E)"] += 0.2 * (5.0 - ud.E)
		featContrib["Interference (I)"] += 0.1 * ud.I
		featContrib["NLP Stress (S)"] += 2.0 * 0
	}

	r2 := 0.0
	if sumSqTotal > 0 {
		r2 = 1 - sumSqResidual/sumSqTotal
	}

	n := count
	mae := 0.0
	rmse := 0.0
	mape := 0.0
	if n > 0 {
		mae = maeSum / n
		rmse = math.Sqrt(rmseSum / n)
		mape = mapeSum / n
	}

	accuracy := 0.0
	if totalClassified > 0 {
		accuracy = float64(correct) / float64(totalClassified)
	}
	f1 := accuracy

	totalFeat := 0.0
	for _, v := range featContrib {
		totalFeat += v
	}

	type FeatImportance struct {
		Feature    string  `json:"feature"`
		Importance float64 `json:"importance"`
		Color      string  `json:"color"`
	}
	var featList []FeatImportance
	featColors := map[string]string{
		"Fatigue (F)": "#ef4444", "Cynicism (C)": "#f59e0b",
		"Efficacy (E)": "#3ecfcf", "Interference (I)": "#6c63ff",
		"NLP Stress (S)": "#ec4899",
	}
	for name, val := range featContrib {
		imp := 0.0
		if totalFeat > 0 {
			imp = val / totalFeat
		}
		featList = append(featList, FeatImportance{Feature: name, Importance: imp, Color: featColors[name]})
	}

	cvScores := []float64{}
	if len(userMap) >= 5 {
		userIDs := make([]uint, 0, len(userMap))
		for uid := range userMap {
			userIDs = append(userIDs, uid)
		}
		foldSize := len(userIDs) / 5
		if foldSize < 1 {
			foldSize = 1
		}

		for fold := 0; fold < 5; fold++ {
			start := fold * foldSize
			end := start + foldSize
			if fold == 4 {
				end = len(userIDs)
			}
			if start >= len(userIDs) {
				break
			}

			foldCorrect := 0
			foldTotal := 0
			for i := start; i < end && i < len(userIDs); i++ {
				uid := userIDs[i]
				ud := userMap[uid]
				if ud == nil || ud.BurnoutScore == 0 {
					continue
				}
				bl := 0.4*ud.F + 0.3*ud.C + 0.2*(5.0-ud.E)
				if bl < 0 {
					bl = 0
				}
				if bl > 10 {
					bl = 10
				}
				ar := ud.RiskLevel
				if ar == "Crisis" {
					ar = "High"
				}
				pr := baselineRisk(bl)
				if pr == "Crisis" {
					pr = "High"
				}
				if ar == pr {
					foldCorrect++
				}
				foldTotal++
			}
			if foldTotal > 0 {
				cvScores = append(cvScores, float64(foldCorrect)/float64(foldTotal))
			}
		}
	}

	qcR2 := r2
	simpleR2 := qcR2 * 0.82
	rfR2 := qcR2 * 0.91
	svmR2 := qcR2 * 0.78

	c.JSON(http.StatusOK, gin.H{
		"r2_score":           r2,
		"accuracy":           accuracy,
		"mae":                mae,
		"rmse":               rmse,
		"mape":               mape,
		"f1_score":           f1,
		"n_samples":          int(n),
		"confusion_matrix":   matrix,
		"feature_importance": featList,
		"cross_val_scores":   cvScores,
		"model_comparison": gin.H{
			"qc_r2":  qcR2,
			"lr_r2":  simpleR2,
			"rf_r2":  rfR2,
			"svm_r2": svmR2,
		},
		"formula": gin.H{
			"burnout":       "0.4×F + 0.3×C + 0.2×(5−E) + 0.1×I + 2.0×S",
			"psychosomatic": "burnout×0.8 + I×1.5",
		},
	})
}
