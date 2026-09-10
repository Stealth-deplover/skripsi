package main

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func UserDashboardHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var prediction Prediction
	err := DB.Where("user_id = ?", user.ID).Order("timestamp desc").First(&prediction).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"prediction": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"prediction": prediction})
}

func AssessmentGetHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	profile := c.DefaultQuery("profile", "balanced")
	variant := c.Query("variant")
	refresh := c.Query("refresh") == "1" || c.Query("refresh") == "true" || variant != ""
	questions, dateKey, source := getDailyQuestions(profile, variant, refresh)
	hash := md5.Sum([]byte(dateKey))
	c.JSON(http.StatusOK, gin.H{
		"questions":  questions,
		"order_type": hex.EncodeToString(hash[:]),
		"date_key":   dateKey,
		"profile":    normalizeQuestionProfile(profile),
		"source":     source,
	})
}

func AssessmentSubmitHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var todayCount int64
	DB.Model(&Assessment{}).
		Where("user_id = ? AND timestamp >= ?", user.ID, startOfDay).
		Count(&todayCount)
	if todayCount >= int64(config.MaxAssessmentPerDay) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Batas asesmen harian sudah tercapai",
			"limit": config.MaxAssessmentPerDay,
		})
		return
	}

	var input struct {
		OrderType string     `json:"order_type"`
		Responses []Response `json:"responses"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	metrics := calculateQuantumMetrics(input.Responses)

	responsesJSON, _ := json.Marshal(input.Responses)
	assessment := Assessment{
		UserID:                   user.ID,
		OrderType:                input.OrderType,
		ResponsesJSON:            string(responsesJSON),
		InterferenceScore:        metrics.InterferenceScore,
		OrderEffectScore:         metrics.OrderEffectScore,
		CognitiveDissonanceScore: metrics.CognitiveDissonanceScore,
		FatigueScore:             metrics.FatigueScore,
		CynicismScore:            metrics.CynicismScore,
		EfficacyScore:            metrics.EfficacyScore,
	}
	DB.Create(&assessment)

	var recentCurhats []Curhat
	DB.Where("user_id = ?", user.ID).Order("timestamp desc").Limit(5).Find(&recentCurhats)

	avgStress := 0.0
	if len(recentCurhats) > 0 {
		for _, curhat := range recentCurhats {
			avgStress += curhat.StressScore
		}
		avgStress /= float64(len(recentCurhats))
	}
	assessment.NLPStressScore = avgStress
	DB.Model(&assessment).Update("nlp_stress_score", avgStress)

	bScore, pScore, risk, modelVersion := predictWithBestAvailableModel(metrics, avgStress)

	prediction := Prediction{
		AssessmentID:       assessment.ID,
		UserID:             user.ID,
		BurnoutScore:       bScore,
		PsychosomaticScore: pScore,
		RiskLevel:          risk,
		ModelVersion:       modelVersion,
	}
	DB.Create(&prediction)

	// Create notification for user
	var riskMsg string
	switch risk {
	case "High", "Crisis":
		riskMsg = "tinggi — segera lakukan tindakan pencegahan"
	case "Medium":
		riskMsg = "sedang — pantau kondisi Anda secara berkala"
	default:
		riskMsg = "rendah — kondisi Anda baik"
	}
	notification := Notification{
		UserID:  user.ID,
		Type:    "assessment",
		Message: fmt.Sprintf("Hasil kuisioner Anda telah dianalisis. Risiko burnout: %s. Skor: %.1f/10.", riskMsg, bScore),
	}
	DB.Create(&notification)

	// Create therapy recommendation if high risk
	if risk == "High" || risk == "Crisis" {
		therapy := TherapyRecommendation{
			UserID:       user.ID,
			PredictionID: prediction.ID,
			ModuleName:   "Modul Relaksasi & Manajemen Stres",
			Status:       "pending",
		}
		DB.Create(&therapy)
		// Early warning prioritas ke DPA (termasuk WhatsApp bila aktif)
		notifyDpaForStudentWellbeing(user, "Burnout", fmt.Sprintf(
			"Mahasiswa bimbingan %s memiliki risiko burnout %s (skor %.1f/10) dan perlu monitoring akademik.",
			user.Nama, risk, bScore), true)
	} else {
		// Deteksi kenaikan burnout signifikan antar-dua prediksi terakhir
		var prevPrediction Prediction
		DB.Where("user_id = ? AND id < ?", user.ID, prediction.ID).Order("timestamp desc").First(&prevPrediction)
		if prevPrediction.ID != 0 {
			warnings := detectWellbeingChange(prevPrediction.BurnoutScore, bScore, 0, 0, config)
			if len(warnings) > 0 {
				notifyDpaForStudentWellbeing(user, "Burnout", fmt.Sprintf(
					"Mahasiswa bimbingan %s: indikator burnout meningkat dari %.1f ke %.1f. Perlu monitoring akademik.",
					user.Nama, prevPrediction.BurnoutScore, bScore), true)
			}
		}
	}

	// Hasil tes burnout selalu diteruskan ke DPA pembimbing.
	if user.DpaID != 0 {
		cat := burnoutCategoryLabel(bScore, config)
		DB.Create(&Notification{
			UserID:  user.DpaID,
			Type:    "student_burnout_update",
			Message: fmt.Sprintf("Hasil tes burnout %s: skor %.1f/10 (%s), risiko %s.", user.Nama, bScore, cat, risk),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":              "success",
		"prediction_id":       prediction.ID,
		"risk_level":          risk,
		"burnout_score":       bScore,
		"psychosomatic_score": pScore,
	})
}

func NotificationsUnreadHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	pruneExpiredNotifications(config)
	var notifications []Notification
	DB.Where("user_id = ? AND is_read = ?", user.ID, false).Order("created_at desc").Find(&notifications)
	c.JSON(http.StatusOK, gin.H{"notifications": notifications})
}

func NotificationsReadHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	notifID := c.Param("id")

	var notification Notification
	if err := DB.Where("id = ? AND user_id = ?", notifID, user.ID).First(&notification).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notification not found"})
		return
	}

	notification.IsRead = true
	DB.Save(&notification)

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func UserNotificationsHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	var recommendations []TherapyRecommendation
	DB.Where("user_id = ? AND created_at >= ?", user.ID, retentionCutoff(config.DataRetentionDays)).
		Order("created_at desc").
		Limit(30).
		Find(&recommendations)
	if recommendations == nil {
		recommendations = []TherapyRecommendation{}
	}
	c.JSON(http.StatusOK, gin.H{"notifications": recommendations})
}

func UserTreatmentStatusHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	id := c.Param("id")

	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status is required"})
		return
	}

	var treatment TherapyRecommendation
	if err := DB.Where("id = ? AND user_id = ?", id, user.ID).First(&treatment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Treatment tidak ditemukan"})
		return
	}

	if input.Status != "completed" && input.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status tidak valid"})
		return
	}

	treatment.Status = input.Status
	DB.Save(&treatment)

	c.JSON(http.StatusOK, gin.H{"status": "success", "treatment": treatment})
}

func UserTreatmentRepliesHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	id := c.Param("id")

	var treatment TherapyRecommendation
	if err := DB.Where("id = ? AND user_id = ?", id, user.ID).First(&treatment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Treatment tidak ditemukan"})
		return
	}

	var replies []TreatmentReply
	DB.Where("therapy_recommendation_id = ? AND user_id = ?", treatment.ID, user.ID).
		Order("created_at ASC").
		Find(&replies)
	if replies == nil {
		replies = []TreatmentReply{}
	}

	c.JSON(http.StatusOK, gin.H{"replies": replies})
}

func UserTreatmentReplyCreateHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	id := c.Param("id")

	var input struct {
		Text string `json:"text" binding:"required"`
		Mood string `json:"mood"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Balasan tidak boleh kosong"})
		return
	}

	var treatment TherapyRecommendation
	if err := DB.Where("id = ? AND user_id = ?", id, user.ID).First(&treatment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Treatment tidak ditemukan"})
		return
	}

	reply := TreatmentReply{
		TherapyRecommendationID: treatment.ID,
		UserID:                  user.ID,
		Text:                    input.Text,
		Mood:                    input.Mood,
	}
	DB.Create(&reply)

	c.JSON(http.StatusCreated, gin.H{"status": "success", "reply": reply})
}
