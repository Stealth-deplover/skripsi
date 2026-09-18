package main

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
)

func AdminModelEvaluationV2Handler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	actor := c.MustGet("user").(User)
	samples := loadTrainingSamplesForProgram(adminProgramScope(actor))
	if len(samples) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"r2_score":           0,
			"accuracy":           0,
			"mae":                0,
			"rmse":               0,
			"mape":               0,
			"f1_score":           0,
			"n_samples":          0,
			"confusion_matrix":   map[string]int{},
			"feature_importance": []map[string]interface{}{},
			"cross_val_scores":   []float64{},
			"model_comparison":   []ModelComparison{},
			"formula": gin.H{
				"burnout":       "Belum ada model terlatih",
				"psychosomatic": "Belum ada model terlatih",
			},
			"validation": buildModelValidationReport(samples, adminProgramScope(actor)),
			"metadata": gin.H{
				"active_model":        "Belum tersedia",
				"trained":             false,
				"training_samples":    0,
				"minimum_samples":     minTrainingSamples,
				"label_source":        "prediction-history",
				"model_version":       activeModelVersion,
				"quantum_features":    0,
				"comparison_models":   0,
				"validation_strategy": "Belum cukup data",
			},
		})
		return
	}

	psychometricMetrics := evaluatePredictions(samples, psychometricPredictionForSample)
	activeMetrics := psychometricMetrics
	activeFormula := "0.45xF + 0.30xC + 0.25xE + 1.15xI + 0.70xO + 0.60xD + 1.40xS"
	psychosomaticFormula := "0.65xburnout + 1.35xI + 0.85xO + 0.55xD"
	activeModelName := "Psychometric fallback"
	cvScores := []float64{}
	featureList := []map[string]interface{}{}
	comparisons := []ModelComparison{
		{
			Model:    "Psychometric fallback",
			Short:    "PSY",
			R2:       psychometricMetrics.R2,
			Accuracy: psychometricMetrics.Accuracy,
			MAE:      psychometricMetrics.MAE,
			Color:    "#f59e0b",
		},
	}

	quantumModel, quantumOK := trainRidgeModel(samples)
	if quantumOK {
		activeMetrics = evaluatePredictions(samples, func(sample TrainingSample) float64 {
			return predictLinear(quantumModel.BurnoutCoefficients, sample.Features)
		})
		activeFormula = formatModelFormula(quantumModel.BurnoutCoefficients)
		psychosomaticFormula = formatModelFormula(quantumModel.PsychosomaticCoefficients)
		activeModelName = "Quantum ridge regression"
		cvScores = crossValidatedAccuracy(samples, true)
		featureList = featureImportance(samples, quantumModel.BurnoutCoefficients)
		comparisons = append(comparisons, ModelComparison{
			Model:    "Quantum ridge regression",
			Short:    "Q-Ridge",
			R2:       activeMetrics.R2,
			Accuracy: activeMetrics.Accuracy,
			MAE:      activeMetrics.MAE,
			Color:    "#8b5cf6",
		})
	}

	classicalFeatures := make([][]float64, 0, len(samples))
	classicalTargets := make([]float64, 0, len(samples))
	for _, sample := range samples {
		classicalFeatures = append(classicalFeatures, sample.ClassicalFeatures)
		classicalTargets = append(classicalTargets, sample.BurnoutTarget)
	}
	if coefficients, ok := fitRidge(classicalFeatures, classicalTargets); ok {
		classicalMetrics := evaluatePredictions(samples, func(sample TrainingSample) float64 {
			return predictLinear(coefficients, sample.ClassicalFeatures)
		})
		comparisons = append(comparisons, ModelComparison{
			Model:    "Classical ridge regression",
			Short:    "C-Ridge",
			R2:       classicalMetrics.R2,
			Accuracy: classicalMetrics.Accuracy,
			MAE:      classicalMetrics.MAE,
			Color:    "#2dd4bf",
		})
	}
	sort.SliceStable(comparisons, func(i, j int) bool {
		return comparisons[i].R2 > comparisons[j].R2
	})

	c.JSON(http.StatusOK, gin.H{
		"r2_score":           activeMetrics.R2,
		"accuracy":           activeMetrics.Accuracy,
		"mae":                activeMetrics.MAE,
		"rmse":               activeMetrics.RMSE,
		"mape":               activeMetrics.MAPE,
		"f1_score":           activeMetrics.F1,
		"n_samples":          len(samples),
		"confusion_matrix":   activeMetrics.ConfusionMatrix,
		"feature_importance": featureList,
		"cross_val_scores":   cvScores,
		"model_comparison":   comparisons,
		"formula": gin.H{
			"burnout":       activeFormula,
			"psychosomatic": psychosomaticFormula,
		},
		"validation": buildModelValidationReport(samples, adminProgramScope(actor)),
		"metadata": gin.H{
			"active_model":        activeModelName,
			"trained":             quantumOK,
			"training_samples":    len(samples),
			"minimum_samples":     minTrainingSamples,
			"label_source":        "prediction-history",
			"model_version":       activeModelVersion,
			"quantum_features":    4,
			"comparison_models":   len(comparisons),
			"validation_strategy": "5-fold chronological cross-validation",
		},
	})
}

func buildModelValidationReport(samples []TrainingSample, programID uint) gin.H {
	total := len(samples)
	profile := buildValidationDatasetProfile(samples, programID)
	if total == 0 {
		return gin.H{
			"status":       "Belum tervalidasi",
			"status_level": "blocked",
			"summary":      "Belum ada pasangan data asesmen dan prediksi di database.",
			"dataset":      profile,
			"holdout":      gin.H{"strategy": "Belum tersedia", "train_samples": 0, "test_samples": 0, "models": []gin.H{}},
			"thesis_notes": []string{
				"Kumpulkan data asesmen dari responden sungguhan sebelum mengklaim performa model.",
				"Gunakan hasil halaman ini sebagai lampiran setelah jumlah sampel memadai.",
			},
			"limitations": []string{
				"Belum ada data untuk validasi.",
			},
		}
	}

	sortedSamples := append([]TrainingSample{}, samples...)
	sort.SliceStable(sortedSamples, func(i, j int) bool {
		return sortedSamples[i].Timestamp.Before(sortedSamples[j].Timestamp)
	})

	splitIndex := total * 8 / 10
	if splitIndex < minTrainingSamples && total >= minTrainingSamples {
		splitIndex = minTrainingSamples
	}
	if splitIndex >= total {
		splitIndex = total - 1
	}
	if splitIndex < 1 {
		splitIndex = 1
	}

	train := sortedSamples[:splitIndex]
	test := sortedSamples[splitIndex:]
	holdoutModels := []gin.H{
		buildPsychometricHoldout(test),
		buildRidgeHoldout(train, test, true),
		buildRidgeHoldout(train, test, false),
	}

	status := "Internal validation siap"
	statusLevel := "ready"
	summary := "Model sudah diuji pada dataset operasional nyata dari database sistem dengan chronological holdout."
	if total < minTrainingSamples {
		status = "Data belum cukup"
		statusLevel = "warning"
		summary = "Dataset nyata sudah ada, tetapi jumlah sampel belum cukup untuk melatih ridge regression secara stabil."
	} else if len(test) < 3 {
		status = "Validasi awal"
		statusLevel = "warning"
		summary = "Model sudah bisa dihitung, tetapi test set masih kecil. Tambahkan responden agar argumen sidang lebih kuat."
	} else if total >= 30 {
		status = "Layak dipresentasikan"
		statusLevel = "strong"
		summary = "Jumlah sampel sudah cukup untuk menunjukkan validasi internal dengan pembanding model dan holdout berbasis waktu."
	}

	return gin.H{
		"status":       status,
		"status_level": statusLevel,
		"summary":      summary,
		"dataset":      profile,
		"holdout": gin.H{
			"strategy":      "Chronological holdout 80:20",
			"train_samples": len(train),
			"test_samples":  len(test),
			"models":        holdoutModels,
		},
		"thesis_notes": []string{
			"Gunakan istilah dataset operasional nyata karena data berasal dari asesmen responden yang masuk ke database.",
			"Jelaskan bahwa target validasi adalah skor risiko sistem, bukan diagnosis klinis dokter.",
			"Tampilkan perbandingan Quantum Ridge, Classical Ridge, dan Psychometric Fallback untuk membuktikan kontribusi fitur quantum cognition.",
			"Tambahkan lampiran JSON export dari halaman model sebagai bukti metrik saat sidang.",
		},
		"limitations": []string{
			"Label ground truth berasal dari prediction-history sistem, belum dari diagnosis klinis independen.",
			"Validasi internal membuktikan konsistensi model terhadap data sistem, bukan validasi medis.",
			"Metrik akan makin kuat jika jumlah responden dan variasi risiko bertambah.",
		},
	}
}

func buildValidationDatasetProfile(samples []TrainingSample, programID uint) gin.H {
	userIDs := map[uint]bool{}
	riskCounts := map[string]int{"Low": 0, "Medium": 0, "High": 0, "Crisis": 0}
	start := ""
	end := ""

	if len(samples) > 0 {
		sortedSamples := append([]TrainingSample{}, samples...)
		sort.SliceStable(sortedSamples, func(i, j int) bool {
			return sortedSamples[i].Timestamp.Before(sortedSamples[j].Timestamp)
		})
		start = sortedSamples[0].Timestamp.Format("2006-01-02")
		end = sortedSamples[len(sortedSamples)-1].Timestamp.Format("2006-01-02")
		for _, sample := range sortedSamples {
			userIDs[sample.UserID] = true
			risk := firstNonEmpty(sample.RiskLevel, classifyRisk(sample.BurnoutTarget))
			if _, ok := riskCounts[risk]; !ok {
				riskCounts[risk] = 0
			}
			riskCounts[risk]++
		}
	}

	var assessmentCount int64
	var predictionCount int64
	studentScope := studentSubqueryForProgram(programID)
	DB.Model(&Assessment{}).Where("user_id IN (?)", studentScope).Count(&assessmentCount)
	DB.Model(&Prediction{}).Where("user_id IN (?)", studentScope).Count(&predictionCount)

	return gin.H{
		"source":               "MySQL operational database",
		"dataset_type":         "Real internal respondent dataset",
		"paired_samples":       len(samples),
		"unique_users":         len(userIDs),
		"assessment_records":   assessmentCount,
		"prediction_records":   predictionCount,
		"period_start":         start,
		"period_end":           end,
		"risk_distribution":    riskCounts,
		"target_definition":    "BurnoutScore, PsychosomaticScore, dan RiskLevel dari prediction-history sistem.",
		"ground_truth_status":  "Internal operational label, bukan diagnosis klinis independen.",
		"feature_definition":   "Classical features: F, C, E. Quantum features: Interference, Order Effect, Cognitive Dissonance, NLP Stress.",
		"minimum_for_training": minTrainingSamples,
	}
}

func buildPsychometricHoldout(test []TrainingSample) gin.H {
	metrics := evaluatePredictions(test, psychometricPredictionForSample)
	return validationMetricPayload("Psychometric fallback", "PSY", metrics, len(test), true)
}

func buildRidgeHoldout(train []TrainingSample, test []TrainingSample, quantum bool) gin.H {
	label := "Classical ridge regression"
	short := "C-Ridge"
	if quantum {
		label = "Quantum ridge regression"
		short = "Q-Ridge"
	}
	if len(train) < minTrainingSamples || len(test) == 0 {
		return gin.H{
			"model":    label,
			"short":    short,
			"trained":  false,
			"samples":  len(test),
			"note":     "Train/test belum cukup untuk holdout ridge.",
			"r2":       0,
			"accuracy": 0,
			"mae":      0,
			"rmse":     0,
			"f1":       0,
		}
	}

	features := make([][]float64, 0, len(train))
	targets := make([]float64, 0, len(train))
	for _, sample := range train {
		if quantum {
			features = append(features, sample.Features)
		} else {
			features = append(features, sample.ClassicalFeatures)
		}
		targets = append(targets, sample.BurnoutTarget)
	}
	coefficients, ok := fitRidge(features, targets)
	if !ok {
		return gin.H{
			"model":    label,
			"short":    short,
			"trained":  false,
			"samples":  len(test),
			"note":     "Ridge solver belum stabil pada data training saat ini.",
			"r2":       0,
			"accuracy": 0,
			"mae":      0,
			"rmse":     0,
			"f1":       0,
		}
	}

	metrics := evaluatePredictions(test, func(sample TrainingSample) float64 {
		if quantum {
			return predictLinear(coefficients, sample.Features)
		}
		return predictLinear(coefficients, sample.ClassicalFeatures)
	})
	return validationMetricPayload(label, short, metrics, len(test), true)
}

func validationMetricPayload(label string, short string, metrics EvaluationMetrics, samples int, trained bool) gin.H {
	return gin.H{
		"model":    label,
		"short":    short,
		"trained":  trained,
		"samples":  samples,
		"r2":       metrics.R2,
		"accuracy": metrics.Accuracy,
		"mae":      metrics.MAE,
		"rmse":     metrics.RMSE,
		"f1":       metrics.F1,
	}
}
