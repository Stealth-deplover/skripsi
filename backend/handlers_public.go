package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func HealthHandler(c *gin.Context) {
	status := "ok"
	database := "ok"

	sqlDB, err := DB.DB()
	if err != nil || sqlDB.Ping() != nil {
		status = "degraded"
		database = "unavailable"
	}

	code := http.StatusOK
	if status != "ok" {
		code = http.StatusServiceUnavailable
	}

	c.JSON(code, gin.H{
		"status":   status,
		"database": database,
		"service":  "nexusmind-api",
	})
}

func PublicOverviewHandler(c *gin.Context) {
	var totalUsers int64
	var totalAssessments int64
	var totalPredictions int64
	var totalPosts int64
	var totalCurhats int64

	DB.Model(&User{}).Where("role = ?", RoleStudent).Count(&totalUsers)
	DB.Model(&Assessment{}).Count(&totalAssessments)
	DB.Model(&Prediction{}).Count(&totalPredictions)
	DB.Model(&Post{}).Count(&totalPosts)
	DB.Model(&Curhat{}).Count(&totalCurhats)

	samples := loadTrainingSamples()
	modelAccuracy := 0.0
	activeModel := "Psychometric fallback"
	if model, ok := trainRidgeModel(samples); ok {
		metrics := evaluatePredictions(samples, func(sample TrainingSample) float64 {
			return predictLinear(model.BurnoutCoefficients, sample.Features)
		})
		modelAccuracy = metrics.Accuracy
		activeModel = "Quantum ridge regression"
	} else if len(samples) > 0 {
		modelAccuracy = evaluatePredictions(samples, psychometricPredictionForSample).Accuracy
	}

	c.JSON(http.StatusOK, gin.H{
		"total_users":       totalUsers,
		"total_assessments": totalAssessments,
		"total_predictions": totalPredictions,
		"total_posts":       totalPosts,
		"total_curhats":     totalCurhats,
		"model_accuracy":    modelAccuracy,
		"active_model":      activeModel,
	})
}
