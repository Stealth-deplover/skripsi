package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// Rujukan akademik DPA — dibuat berdasarkan kondisi real-time
// mahasiswa (burnout, happiness, warning aktif). Snapshot kondisi
// disimpan saat rujukan dibuat agar riwayat keadaan terjaga.
// ============================================================

var validReferralTypes = map[string]string{
	"konsultasi_akademik":   "Konsultasi Akademik",
	"unit_konseling":        "Unit Konseling",
	"pembimbingan_khusus":   "Pembimbingan Khusus",
	"kaprodi":               "Kaprodi",
}

var validReferralPriorities = map[string]bool{
	"normal":   true,
	"penting":  true,
	"mendesak": true,
}

func referralTypeLabel(t string) string {
	if label, ok := validReferralTypes[t]; ok {
		return label
	}
	return t
}

// buildStudentSnapshot merangkum kondisi real-time mahasiswa untuk
// lampiran rujukan.
func buildStudentSnapshot(student User, config SystemConfig) gin.H {
	snapshot := gin.H{
		"nim":       student.Nim,
		"prodi":     student.Prodi,
		"semester":  student.Semester,
		"ipk":       student.Ipk,
		"ips":       student.Ips,
		"sks":       student.Sks,
		"kehadiran": student.Kehadiran,
	}
	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		cat := burnoutCategoryLabel(burnout.BurnoutScore, config)
		snapshot["burnout_score"] = round2(burnout.BurnoutScore)
		snapshot["burnout_category"] = cat
		snapshot["burnout_risk"] = burnout.RiskLevel
		snapshot["burnout_timestamp"] = burnout.Timestamp
		snapshot["psychosomatic"] = round2(burnout.PsychosomaticScore)
	}
	if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
		snapshot["happiness_index"] = round2(happiness.HappinessIndex)
		snapshot["happiness_category"] = happiness.Category
		snapshot["happiness_timestamp"] = happiness.Timestamp
		dimensions := happinessDimensionScores(happiness)
		if len(dimensions) > 0 {
			weakest := happinessFactors(dimensions)[0]
			snapshot["weakest_dimension"] = weakest.Label
			snapshot["weakest_score"] = weakest.Score
		}
	}
	if burnout, hasBurnout := latestBurnoutFor(student.ID); hasBurnout {
		if happiness, hasHappiness := latestHappinessFor(student.ID); hasHappiness {
			snapshot["interpretation"] = wellBeingInterpretation(
				burnoutCategoryLabel(burnout.BurnoutScore, config), happiness.Category).Label
		}
	}
	return snapshot
}

func DpaCreateReferralHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}

	var input struct {
		ReferralType   string `json:"referral_type" binding:"required"`
		Destination    string `json:"destination"`
		Priority       string `json:"priority"`
		Reason         string `json:"reason" binding:"required"`
		Recommendation string `json:"recommendation"`
		FollowUpDate   string `json:"follow_up_date"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis rujukan dan alasan wajib diisi"})
		return
	}
	referralType := strings.ToLower(strings.TrimSpace(input.ReferralType))
	if _, valid := validReferralTypes[referralType]; !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis rujukan tidak dikenal"})
		return
	}
	priority := strings.ToLower(strings.TrimSpace(input.Priority))
	if priority == "" {
		priority = "sedang"
	}
	if !validReferralPriorities[priority] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prioritas harus normal, penting, atau mendesak"})
		return
	}

	var latestPrediction Prediction
	DB.Where("user_id = ?", student.ID).Order("timestamp desc").First(&latestPrediction)

	var followUp *time.Time
	if input.FollowUpDate != "" {
		if parsed, err := time.Parse("2006-01-02", input.FollowUpDate); err == nil {
			followUp = &parsed
		}
	}

	// Snapshot kondisi real-time saat rujukan dibuat.
	snapshot := buildStudentSnapshot(student, config)
	snapshotJSON, _ := json.Marshal(snapshot)

	referral := DpaReferral{
		DpaID:          dpa.ID,
		StudentID:      student.ID,
		PredictionID:   latestPrediction.ID,
		ReferralType:   referralType,
		Destination:    strings.TrimSpace(input.Destination),
		Priority:       priority,
		Reason:         truncateString(strings.TrimSpace(input.Reason), 2000),
		Recommendation: truncateString(strings.TrimSpace(input.Recommendation), 2000),
		Status:         "diproses",
		FollowUpDate:   followUp,
		BurnoutScore:   latestPrediction.BurnoutScore,
		HappinessIndex: snapshotHappiness(snapshot),
		Timestamp:      time.Now(),
	}
	if err := DB.Create(&referral).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan rujukan"})
		return
	}
	_ = snapshotJSON

	priorityLabel := map[string]string{"mendesak": "MENDESAK", "penting": "Penting", "sedang": "Sedang"}[priority]
	DB.Create(&Notification{
		UserID: student.ID,
		Type:   "dpa_referral",
		Message: fmt.Sprintf("[%s] Rujukan %s dari DPA %s. Alasan: %s",
			priorityLabel, referralTypeLabel(referralType), dpa.Nama, truncateString(referral.Reason, 120)),
	})

	c.JSON(http.StatusCreated, gin.H{
		"status": "success",
		"referral": gin.H{
			"id":              referral.ID,
			"referral_type":   referral.ReferralType,
			"type_label":      referralTypeLabel(referral.ReferralType),
			"destination":     referral.Destination,
			"priority":        referral.Priority,
			"reason":          referral.Reason,
			"recommendation":  referral.Recommendation,
			"status":          referral.Status,
			"follow_up_date":  referral.FollowUpDate,
			"burnout_score":   referral.BurnoutScore,
			"happiness_index": referral.HappinessIndex,
			"timestamp":       referral.Timestamp,
		},
		"snapshot": snapshot,
	})
}

func snapshotHappiness(snapshot gin.H) float64 {
	if value, ok := snapshot["happiness_index"].(float64); ok {
		return value
	}
	return 0
}

func DpaListReferralsHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}
	var referrals []DpaReferral
	DB.Where("dpa_id = ? AND student_id = ?", dpa.ID, student.ID).Order("created_at desc").Limit(50).Find(&referrals)
	items := make([]gin.H, 0, len(referrals))
	for _, referral := range referrals {
		items = append(items, gin.H{
			"id":              referral.ID,
			"referral_type":   referral.ReferralType,
			"type_label":      referralTypeLabel(referral.ReferralType),
			"destination":     referral.Destination,
			"priority":        referral.Priority,
			"reason":          referral.Reason,
			"recommendation":  referral.Recommendation,
			"status":          referral.Status,
			"follow_up_date":  referral.FollowUpDate,
			"burnout_score":   referral.BurnoutScore,
			"happiness_index": referral.HappinessIndex,
			"timestamp":       referral.Timestamp,
		})
	}
	c.JSON(http.StatusOK, gin.H{"referrals": items})
}

// StudentReferralsHandler: daftar rujukan milik mahasiswa sendiri.
func StudentReferralsHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	var referrals []DpaReferral
	DB.Where("student_id = ?", student.ID).Order("created_at desc").Limit(50).Find(&referrals)

	type ReferralItem struct {
		ID             uint      `json:"id"`
		ReferralType   string    `json:"referral_type"`
		TypeLabel      string    `json:"type_label"`
		Destination    string    `json:"destination"`
		Priority       string    `json:"priority"`
		Reason         string    `json:"reason"`
		Recommendation string    `json:"recommendation"`
		Status         string    `json:"status"`
		Timestamp      time.Time `json:"timestamp"`
	}
	items := make([]ReferralItem, 0, len(referrals))
	for _, referral := range referrals {
		items = append(items, ReferralItem{
			ID:             referral.ID,
			ReferralType:   referral.ReferralType,
			TypeLabel:      referralTypeLabel(referral.ReferralType),
			Destination:    referral.Destination,
			Priority:       referral.Priority,
			Reason:         referral.Reason,
			Recommendation: referral.Recommendation,
			Status:         referral.Status,
			Timestamp:      referral.Timestamp,
		})
	}
	c.JSON(http.StatusOK, gin.H{"referrals": items})
}

// StudentReferralStatusHandler: mahasiswa memperbarui status rujukan;
// perubahan diberitahukan ke DPA.
func StudentReferralStatusHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	referralID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rujukan tidak valid"})
		return
	}
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status wajib diisi"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	valid := map[string]bool{"diproses": true, "selesai": true}
	if !valid[status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus diproses atau selesai"})
		return
	}

	var referral DpaReferral
	if err := DB.Where("id = ? AND student_id = ?", referralID, student.ID).First(&referral).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rujukan tidak ditemukan"})
		return
	}
	referral.Status = status
	DB.Save(&referral)

	DB.Create(&Notification{
		UserID:  referral.DpaID,
		Type:    "dpa_referral",
		Message: fmt.Sprintf("Rujukan %s untuk %s kini berstatus %s.", referralTypeLabel(referral.ReferralType), student.Nama, status),
	})

	c.JSON(http.StatusOK, gin.H{"status": "success", "referral": gin.H{
		"id":        referral.ID,
		"status":    referral.Status,
		"timestamp": referral.Timestamp,
	}})
}
