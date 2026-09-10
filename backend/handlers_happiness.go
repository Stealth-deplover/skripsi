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
// Happiness Handlers — endpoint mahasiswa (role student).
// Pola mengikuti AssessmentGetHandler/AssessmentSubmitHandler.
// ============================================================

func HappinessQuestionsHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	type DimensionDTO struct {
		Key    string  `json:"key"`
		Label  string  `json:"label"`
		Weight float64 `json:"weight"`
	}
	dimensions := make([]DimensionDTO, 0, len(happinessDimensionMeta))
	for _, meta := range happinessDimensionMeta {
		dimensions = append(dimensions, DimensionDTO{
			Key:    meta.Key,
			Label:  meta.Label,
			Weight: happinessWeight(config, meta.Key),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"questions":   happinessQuestions,
		"dimensions":  dimensions,
		"likert":      []string{"Sangat Tidak Setuju", "Tidak Setuju", "Netral", "Setuju", "Sangat Setuju"},
		"model_status": happinessModelStatus(0),
	})
}

func HappinessSubmitHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	// Batas asesmen harian mengikuti konfigurasi yang sama dengan burnout.
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var todayCount int64
	DB.Model(&HappinessAssessment{}).
		Where("user_id = ? AND timestamp >= ?", user.ID, startOfDay).
		Count(&todayCount)
	if todayCount >= int64(config.MaxAssessmentPerDay) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Batas asesmen happiness harian sudah tercapai",
			"limit": config.MaxAssessmentPerDay,
		})
		return
	}

	var input struct {
		Responses []HappinessResponse `json:"responses"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validasi: semua 24 butir harus dijawab dengan nilai 1-5.
	validIDs := map[string]bool{}
	for _, q := range happinessQuestions {
		validIDs[q.ID] = true
	}
	seen := map[string]int{}
	for _, r := range input.Responses {
		if !validIDs[r.ID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Butir pertanyaan tidak dikenal: " + r.ID})
			return
		}
		if r.Value < 1 || r.Value > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nilai jawaban harus 1-5"})
			return
		}
		seen[r.ID] = r.Value
	}
	if len(seen) != len(happinessQuestions) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        "Semua pertanyaan harus dijawab",
			"answered":     len(seen),
			"total_needed": len(happinessQuestions),
		})
		return
	}

	// Ambil happiness terakhir untuk deteksi perubahan (early warning).
	var previous HappinessAssessment
	DB.Where("user_id = ?", user.ID).Order("timestamp desc").First(&previous)

	index, dimensions := calculateHappiness(input.Responses, config)
	category := classifyHappiness(index)

	responsesJSON, _ := json.Marshal(seen)
	assessment := HappinessAssessment{
		UserID:           user.ID,
		ResponsesJSON:    string(responsesJSON),
		HappinessIndex:   index,
		Category:         category,
		Timestamp:        now,
	}
	for _, dim := range dimensions {
		switch dim.Key {
		case HappinessDimAcademic:
			assessment.AcademicScore = dim.Score
		case HappinessDimMotivation:
			assessment.MotivationScore = dim.Score
		case HappinessDimSocial:
			assessment.SocialScore = dim.Score
		case HappinessDimLecturer:
			assessment.LecturerScore = dim.Score
		case HappinessDimEnvironment:
			assessment.EnvironmentScore = dim.Score
		case HappinessDimFacilities:
			assessment.FacilitiesScore = dim.Score
		}
	}
	if err := DB.Create(&assessment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan asesmen happiness"})
		return
	}

	var previousIndex float64
	if previous.ID != 0 {
		previousIndex = previous.HappinessIndex
	}
	warnings := detectWellbeingChange(0, 0, previousIndex, index, config)

	level := classifyHappinessLevel(category)
	notification := Notification{
		UserID:  user.ID,
		Type:    "happiness_assessment",
		Message: fmt.Sprintf("Hasil Happiness Index Anda: %.0f (%s). Level: %s.", index, category, level),
	}
	DB.Create(&notification)

	notifyDpaForStudentWellbeing(user, "Happiness", fmt.Sprintf(
		"Mahasiswa bimbingan %s mengisi asesmen happiness. Happiness Index: %.0f (%s).",
		user.Nama, index, category,
	), len(warnings) > 0)

	c.JSON(http.StatusOK, gin.H{
		"status":           "success",
		"assessment_id":    assessment.ID,
		"happiness_index":  index,
		"category":         category,
		"level":            level,
		"dimensions":       dimensions,
		"factors":          happinessFactors(dimensions),
		"warnings":         warnings,
		"previous_index":   previousIndex,
	})
}

// notifyDpaForStudentWellbeing membuat notifikasi ke DPA pembimbing mahasiswa
// bila ada perubahan penting atau prioritas monitoring.
func notifyDpaForStudentWellbeing(student User, domain string, message string, isPriority bool) {
	if student.DpaID == 0 {
		return
	}
	var dpa User
	if err := DB.First(&dpa, student.DpaID).Error; err != nil {
		return
	}
	notifType := "student_wellbeing"
	if isPriority {
		notifType = "student_wellbeing_priority"
		if domain != "" {
			notifType = "student_" + strings.ToLower(domain) + "_priority"
		}
		// Early warning prioritas juga dikirim sebagai WhatsApp (env-gated).
		notifyDpaWhatsApp(dpa, student.Nama, message)
	} else if domain != "" {
		notifType = "student_" + strings.ToLower(domain) + "_update"
	}
	DB.Create(&Notification{
		UserID:  dpa.ID,
		Type:    notifType,
		Message: message,
	})
}

func HappinessLatestHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var assessment HappinessAssessment
	err := DB.Where("user_id = ?", user.ID).Order("timestamp desc").First(&assessment).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"happiness": nil})
		return
	}

	dimensions := happinessDimensionScores(assessment)
	config := getSystemConfig()
	c.JSON(http.StatusOK, gin.H{
		"happiness": gin.H{
			"id":              assessment.ID,
			"happiness_index": assessment.HappinessIndex,
			"category":        assessment.Category,
			"level":           classifyHappinessLevel(assessment.Category),
			"timestamp":       assessment.Timestamp,
			"dimensions":      dimensions,
			"factors":         happinessFactors(dimensions),
			"weights": gin.H{
				"academic":    config.HiWeightAcademic,
				"motivation":  config.HiWeightMotivation,
				"social":      config.HiWeightSocial,
				"lecturer":    config.HiWeightLecturer,
				"environment": config.HiWeightEnvironment,
				"facilities":  config.HiWeightFacilities,
			},
		},
	})
}

func HappinessHistoryHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var assessments []HappinessAssessment
	DB.Where("user_id = ?", user.ID).Order("timestamp desc").Limit(60).Find(&assessments)

	type HistoryItem struct {
		ID             uint      `json:"id"`
		HappinessIndex float64   `json:"happiness_index"`
		Category       string    `json:"category"`
		Level          string    `json:"level"`
		Timestamp      time.Time `json:"timestamp"`
	}
	items := make([]HistoryItem, 0, len(assessments))
	for _, a := range assessments {
		items = append(items, HistoryItem{
			ID:             a.ID,
			HappinessIndex: a.HappinessIndex,
			Category:       a.Category,
			Level:          classifyHappinessLevel(a.Category),
			Timestamp:      a.Timestamp,
		})
	}
	c.JSON(http.StatusOK, gin.H{"history": items})
}

func HappinessTrendHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var assessments []HappinessAssessment
	DB.Where("user_id = ?", user.ID).Order("timestamp asc").Limit(120).Find(&assessments)

	type TrendPoint struct {
		Date           string  `json:"date"`
		HappinessIndex float64 `json:"happiness_index"`
		Academic       float64 `json:"academic"`
		Motivation     float64 `json:"motivation"`
		Social         float64 `json:"social"`
		Lecturer       float64 `json:"lecturer"`
		Environment    float64 `json:"environment"`
		Facilities     float64 `json:"facilities"`
	}
	points := make([]TrendPoint, 0, len(assessments))
	for _, a := range assessments {
		points = append(points, TrendPoint{
			Date:           a.Timestamp.Format("02 Jan"),
			HappinessIndex: a.HappinessIndex,
			Academic:       a.AcademicScore,
			Motivation:     a.MotivationScore,
			Social:         a.SocialScore,
			Lecturer:       a.LecturerScore,
			Environment:    a.EnvironmentScore,
			Facilities:     a.FacilitiesScore,
		})
	}
	c.JSON(http.StatusOK, gin.H{"trend": points})
}

// happinessDimensionScores membangun skor dimensi dari kolom assessment.
func happinessDimensionScores(a HappinessAssessment) []HappinessDimensionScore {
	return []HappinessDimensionScore{
		{Key: HappinessDimAcademic, Label: "Akademik", Score: a.AcademicScore},
		{Key: HappinessDimMotivation, Label: "Motivasi", Score: a.MotivationScore},
		{Key: HappinessDimSocial, Label: "Sosial", Score: a.SocialScore},
		{Key: HappinessDimLecturer, Label: "Dosen", Score: a.LecturerScore},
		{Key: HappinessDimEnvironment, Label: "Lingkungan", Score: a.EnvironmentScore},
		{Key: HappinessDimFacilities, Label: "Fasilitas", Score: a.FacilitiesScore},
	}
}
