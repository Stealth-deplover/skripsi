package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// StudentTherapyOutcomeHandler mahasiswa beri skor efektivitas 1-5 setelah rekomendasi
func StudentTherapyOutcomeHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	if !isStudentRole(student.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya mahasiswa"})
		return
	}
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var tr TherapyRecommendation
	if err := DB.First(&tr, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekomendasi tidak ditemukan"})
		return
	}
	if tr.UserID != student.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bukan rekomendasi Anda"})
		return
	}
	var input struct {
		OutcomeScore int `json:"outcome_score" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "outcome_score 1-5 wajib"})
		return
	}
	if input.OutcomeScore < 1 || input.OutcomeScore > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Skor 1-5"})
		return
	}
	now := time.Now()
	DB.Model(&tr).Updates(map[string]interface{}{"outcome_score": input.OutcomeScore, "completed_at": now, "status": "selesai"})
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Feedback terkirim", "therapy": tr})
}

// TherapyEffectivenessHandler Kaprodi lihat agregat efektivitas terapi
func TherapyEffectivenessHandler(c *gin.Context) {
	type Agg struct {
		Category string
		AvgScore float64
		Count    int64
	}
	var aggs []Agg
	DB.Model(&TherapyRecommendation{}).Select("category, AVG(outcome_score) as avg_score, COUNT(*) as count").Where("outcome_score IS NOT NULL").Group("category").Scan(&aggs)
	total := 0.0
	cnt := int64(0)
	for _, a := range aggs {
		total += a.AvgScore * float64(a.Count)
		cnt += a.Count
	}
	overall := 0.0
	if cnt > 0 {
		overall = total / float64(cnt)
	}
	var pending int64
	DB.Model(&TherapyRecommendation{}).Where("status = ?", "pending").Count(&pending)
	var done int64
	DB.Model(&TherapyRecommendation{}).Where("outcome_score IS NOT NULL").Count(&done)
	c.JSON(http.StatusOK, gin.H{
		"by_category": aggs,
		"overall_avg": round2(overall),
		"pending":     pending,
		"completed":   done,
	})
}
