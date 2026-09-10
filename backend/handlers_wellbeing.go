package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ============================================================
// Combined Well-Being Handler — burnout vs happiness (mahasiswa).
// ============================================================

func WellBeingHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()

	var latestPrediction Prediction
	DB.Where("user_id = ?", user.ID).Order("timestamp desc").First(&latestPrediction)

	var latestHappiness HappinessAssessment
	DB.Where("user_id = ?", user.ID).Order("timestamp desc").First(&latestHappiness)

	hasBurnout := latestPrediction.ID != 0
	hasHappiness := latestHappiness.ID != 0

	response := gin.H{
		"has_burnout":    hasBurnout,
		"has_happiness":  hasHappiness,
		"privacy_note":   "Analitik ini memberikan gambaran dua indikator kesejahteraan akademik, bukan diagnosis kesehatan mental.",
	}

	// Trend gabungan terakhir (maks 20 titik).
	var predictions []Prediction
	DB.Where("user_id = ?", user.ID).Order("timestamp asc").Limit(120).Find(&predictions)
	var happinessAssessments []HappinessAssessment
	DB.Where("user_id = ?", user.ID).Order("timestamp asc").Limit(120).Find(&happinessAssessments)

	type CombinedPoint struct {
		Date           string   `json:"date"`
		Burnout        *float64 `json:"burnout"`
		HappinessIndex *float64 `json:"happiness_index"`
	}
	pointsByDate := map[string]*CombinedPoint{}
	var orderedDates []string
	addPoint := func(date string, fill func(*CombinedPoint)) {
		point, ok := pointsByDate[date]
		if !ok {
			point = &CombinedPoint{Date: date}
			pointsByDate[date] = point
			orderedDates = append(orderedDates, date)
		}
		fill(point)
	}
	for _, p := range predictions {
		score := p.BurnoutScore
		addPoint(p.Timestamp.Format("02 Jan"), func(cp *CombinedPoint) { cp.Burnout = &score })
	}
	for _, h := range happinessAssessments {
		index := h.HappinessIndex
		addPoint(h.Timestamp.Format("02 Jan"), func(cp *CombinedPoint) { cp.HappinessIndex = &index })
	}

	combined := make([]CombinedPoint, 0, len(orderedDates))
	if len(orderedDates) > 20 {
		orderedDates = orderedDates[len(orderedDates)-20:]
	}
	for _, date := range orderedDates {
		combined = append(combined, *pointsByDate[date])
	}
	response["combined_trend"] = combined

	// Warning antar-dua asesmen terakhir.
	var previousHappiness HappinessAssessment
	DB.Where("user_id = ? AND id < ?", user.ID, latestHappiness.ID).Order("timestamp desc").First(&previousHappiness)
	warnings := []WellBeingWarning{}
	if hasHappiness && previousHappiness.ID != 0 {
		warnings = detectWellbeingChange(0, 0, previousHappiness.HappinessIndex, latestHappiness.HappinessIndex, config)
	}
	var previousPrediction Prediction
	DB.Where("user_id = ? AND id < ?", user.ID, latestPrediction.ID).Order("timestamp desc").First(&previousPrediction)
	if hasBurnout && previousPrediction.ID != 0 {
		burnoutWarnings := detectWellbeingChange(previousPrediction.BurnoutScore, latestPrediction.BurnoutScore, 0, 0, config)
		warnings = append(warnings, burnoutWarnings...)
	}
	response["warnings"] = warnings

	if !hasBurnout && !hasHappiness {
		response["status"] = "empty"
		response["message"] = "Isi assessment burnout dan happiness terlebih dahulu untuk melihat analitik well-being."
		c.JSON(http.StatusOK, response)
		return
	}

	burnoutCat := ""
	happinessCat := ""
	if hasBurnout {
		burnoutCat = burnoutCategoryLabel(latestPrediction.BurnoutScore, config)
		response["burnout"] = gin.H{
			"score":    latestPrediction.BurnoutScore,
			"category": burnoutCat,
			"risk":     latestPrediction.RiskLevel,
			"timestamp": latestPrediction.Timestamp,
		}
	}
	if hasHappiness {
		happinessCat = latestHappiness.Category
		dimensions := happinessDimensionScores(latestHappiness)
		response["happiness"] = gin.H{
			"index":     latestHappiness.HappinessIndex,
			"category":  happinessCat,
			"timestamp": latestHappiness.Timestamp,
			"dimensions": dimensions,
			"factors":   happinessFactors(dimensions),
		}
	}

	// Interpretasi matrix + rekomendasi.
	if hasBurnout && hasHappiness {
		interpretation := wellBeingInterpretation(burnoutCat, happinessCat)
		dimensions := happinessDimensionScores(latestHappiness)
		recommendation := wellbeingRecommendation(burnoutCat, happinessCat, dimensions)
		response["status"] = "ok"
		response["matrix"] = gin.H{
			"burnout":   burnoutCat,
			"happiness": happinessCat,
			"label":     interpretation.Label,
			"priority":  interpretation.Priority,
		}
		response["insight"] = interpretation.Insight
		response["recommendation"] = recommendation
	} else if hasBurnout {
		response["status"] = "partial"
		response["insight"] = "Assessment happiness belum tersedia. Isi assessment happiness untuk melihat perbandingan burnout vs happiness."
	} else {
		response["status"] = "partial"
		response["insight"] = "Assessment burnout belum tersedia. Isi kuisioner burnout untuk melihat perbandingan burnout vs happiness."
	}

	c.JSON(http.StatusOK, response)
}
