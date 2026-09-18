package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

const (
	activeModelVersion = "ridge-qc-v2"
	minTrainingSamples = 12
	ridgeLambda        = 0.15
)

type QuantumMetrics struct {
	FatigueScore             float64
	CynicismScore            float64
	EfficacyScore            float64
	InterferenceScore        float64
	OrderEffectScore         float64
	CognitiveDissonanceScore float64
}

type TrainingSample struct {
	AssessmentID        uint
	UserID              uint
	Timestamp           time.Time
	Features            []float64
	ClassicalFeatures   []float64
	BurnoutTarget       float64
	PsychosomaticTarget float64
	RiskLevel           string
}

type RidgeModel struct {
	BurnoutCoefficients       []float64
	PsychosomaticCoefficients []float64
	TrainingSamples           int
}

type EvaluationMetrics struct {
	R2              float64
	Accuracy        float64
	MAE             float64
	RMSE            float64
	MAPE            float64
	F1              float64
	ConfusionMatrix map[string]int
}

type ModelComparison struct {
	Model    string  `json:"model"`
	Short    string  `json:"short"`
	R2       float64 `json:"r2"`
	Accuracy float64 `json:"accuracy"`
	MAE      float64 `json:"mae"`
	Color    string  `json:"color"`
}

func clamp(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func mean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func stddev(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	avg := mean(values)
	total := 0.0
	for _, value := range values {
		delta := value - avg
		total += delta * delta
	}
	return math.Sqrt(total / float64(len(values)))
}

func classifyRisk(score float64) string {
	config := getSystemConfig()
	return classifyRiskWithThresholds(score, config.BurnoutThresholdLow, config.BurnoutThresholdMedium)
}

func classifyRiskWithThresholds(score, lowThreshold, mediumThreshold float64) string {
	crisisThreshold := clamp(mediumThreshold+1.5, mediumThreshold, 10)
	switch {
	case score > crisisThreshold:
		return "Crisis"
	case score > mediumThreshold:
		return "High"
	case score > lowThreshold:
		return "Medium"
	default:
		return "Low"
	}
}

func normalizeRiskLabel(label string) string {
	if label == "Crisis" {
		return "High"
	}
	return label
}

func buildFeatureVector(assessment Assessment) []float64 {
	return []float64{
		1,
		assessment.FatigueScore,
		assessment.CynicismScore,
		assessment.EfficacyScore,
		assessment.InterferenceScore,
		assessment.OrderEffectScore,
		assessment.CognitiveDissonanceScore,
		assessment.NLPStressScore,
	}
}

func buildClassicalFeatureVector(assessment Assessment) []float64 {
	return []float64{
		1,
		assessment.FatigueScore,
		assessment.CynicismScore,
		assessment.EfficacyScore,
	}
}

func psychometricBurnout(metrics QuantumMetrics, nlpStress float64) float64 {
	config := getSystemConfig()
	score := 0.45*metrics.FatigueScore +
		0.30*metrics.CynicismScore +
		0.25*metrics.EfficacyScore +
		(1.15*config.InterferenceWeight)*metrics.InterferenceScore +
		0.70*metrics.OrderEffectScore +
		0.60*metrics.CognitiveDissonanceScore +
		1.40*nlpStress
	return clamp(score, 0, 10)
}

func psychometricPsychosomatic(metrics QuantumMetrics, burnoutScore float64) float64 {
	config := getSystemConfig()
	score := 0.65*burnoutScore +
		(1.35*config.InterferenceWeight)*metrics.InterferenceScore +
		0.85*metrics.OrderEffectScore +
		0.55*metrics.CognitiveDissonanceScore
	return clamp(score, 0, 10)
}

func calculateQuantumMetrics(responses []Response) QuantumMetrics {
	if len(responses) == 0 {
		return QuantumMetrics{}
	}

	var fatigueValues, cynicismValues, efficacyValues []float64
	var alignedValues, reactionTimes []float64

	for _, response := range responses {
		value := clamp(float64(response.Value), 1, 5)
		alignedValue := value

		switch response.ConstructType {
		case "fatigue":
			fatigueValues = append(fatigueValues, value)
		case "cynicism":
			cynicismValues = append(cynicismValues, value)
		case "efficacy":
			alignedValue = 6 - value
			efficacyValues = append(efficacyValues, alignedValue)
		}

		alignedValues = append(alignedValues, alignedValue)
		reactionTime := float64(response.ReactionTimeMs)
		if reactionTime <= 0 {
			reactionTime = 1000
		}
		reactionTimes = append(reactionTimes, reactionTime)
	}

	fatigue := mean(fatigueValues)
	cynicism := mean(cynicismValues)
	efficacy := mean(efficacyValues)

	rtMean := mean(reactionTimes)
	rtCV := 0.0
	if rtMean > 0 {
		rtCV = clamp(stddev(reactionTimes)/rtMean, 0, 1)
	}

	orderEffect := 0.0
	if len(alignedValues) >= 2 {
		mid := len(alignedValues) / 2
		orderEffect = clamp(math.Abs(mean(alignedValues[:mid])-mean(alignedValues[mid:]))/4, 0, 1)
	}

	constructMeans := []float64{}
	for _, value := range []float64{fatigue, cynicism, efficacy} {
		if value > 0 {
			constructMeans = append(constructMeans, value)
		}
	}
	dissonance := clamp(stddev(constructMeans)/2, 0, 1)
	interference := clamp(0.50*rtCV+0.30*orderEffect+0.20*dissonance, 0, 1)

	return QuantumMetrics{
		FatigueScore:             fatigue,
		CynicismScore:            cynicism,
		EfficacyScore:            efficacy,
		InterferenceScore:        interference,
		OrderEffectScore:         orderEffect,
		CognitiveDissonanceScore: dissonance,
	}
}

func backfillLegacyQuantumMetrics() {
	var assessments []Assessment
	DB.Find(&assessments)

	for _, assessment := range assessments {
		if assessment.ResponsesJSON == "" {
			continue
		}
		if assessment.InterferenceScore >= 0 &&
			assessment.InterferenceScore <= 1 &&
			assessment.OrderEffectScore > 0 &&
			assessment.CognitiveDissonanceScore > 0 {
			continue
		}

		var responses []Response
		if err := json.Unmarshal([]byte(assessment.ResponsesJSON), &responses); err != nil || len(responses) == 0 {
			continue
		}
		metrics := calculateQuantumMetrics(responses)
		DB.Model(&assessment).Updates(map[string]interface{}{
			"fatigue_score":              metrics.FatigueScore,
			"cynicism_score":             metrics.CynicismScore,
			"efficacy_score":             metrics.EfficacyScore,
			"interference_score":         metrics.InterferenceScore,
			"order_effect_score":         metrics.OrderEffectScore,
			"cognitive_dissonance_score": metrics.CognitiveDissonanceScore,
		})
	}
}

func loadTrainingSamples() []TrainingSample {
	return loadTrainingSamplesForProgram(0)
}

func loadTrainingSamplesForProgram(programID uint) []TrainingSample {
	var assessments []Assessment
	var predictions []Prediction
	studentScope := studentSubqueryForProgram(programID)
	DB.Where("user_id IN (?)", studentScope).Order("timestamp ASC").Find(&assessments)
	DB.Where("user_id IN (?)", studentScope).Order("timestamp ASC").Find(&predictions)

	predictionByAssessment := make(map[uint]Prediction)
	predictionsByUser := make(map[uint][]Prediction)
	for _, prediction := range predictions {
		if prediction.AssessmentID > 0 {
			predictionByAssessment[prediction.AssessmentID] = prediction
		}
		predictionsByUser[prediction.UserID] = append(predictionsByUser[prediction.UserID], prediction)
	}

	usedPredictions := make(map[uint]bool)
	samples := make([]TrainingSample, 0, len(assessments))

	for _, assessment := range assessments {
		prediction, ok := predictionByAssessment[assessment.ID]
		if !ok {
			bestDelta := 10 * time.Minute
			for _, candidate := range predictionsByUser[assessment.UserID] {
				if usedPredictions[candidate.ID] {
					continue
				}
				delta := candidate.Timestamp.Sub(assessment.Timestamp)
				if delta < 0 {
					delta = -delta
				}
				if delta <= bestDelta {
					bestDelta = delta
					prediction = candidate
					ok = true
				}
			}
		}
		if !ok {
			continue
		}

		usedPredictions[prediction.ID] = true
		samples = append(samples, TrainingSample{
			AssessmentID:        assessment.ID,
			UserID:              assessment.UserID,
			Timestamp:           assessment.Timestamp,
			Features:            buildFeatureVector(assessment),
			ClassicalFeatures:   buildClassicalFeatureVector(assessment),
			BurnoutTarget:       prediction.BurnoutScore,
			PsychosomaticTarget: prediction.PsychosomaticScore,
			RiskLevel:           prediction.RiskLevel,
		})
	}

	return samples
}

func fitRidge(features [][]float64, targets []float64) ([]float64, bool) {
	if len(features) == 0 || len(features) != len(targets) {
		return nil, false
	}
	width := len(features[0])
	if width == 0 {
		return nil, false
	}

	xtx := make([][]float64, width)
	for row := range xtx {
		xtx[row] = make([]float64, width)
	}
	xty := make([]float64, width)

	for row, featureRow := range features {
		if len(featureRow) != width {
			return nil, false
		}
		for i := 0; i < width; i++ {
			xty[i] += featureRow[i] * targets[row]
			for j := 0; j < width; j++ {
				xtx[i][j] += featureRow[i] * featureRow[j]
			}
		}
	}

	for i := 1; i < width; i++ {
		xtx[i][i] += ridgeLambda
	}

	return solveLinearSystem(xtx, xty)
}

func solveLinearSystem(matrix [][]float64, vector []float64) ([]float64, bool) {
	n := len(vector)
	if len(matrix) != n {
		return nil, false
	}

	augmented := make([][]float64, n)
	for i := range augmented {
		if len(matrix[i]) != n {
			return nil, false
		}
		augmented[i] = append(append([]float64{}, matrix[i]...), vector[i])
	}

	for col := 0; col < n; col++ {
		pivot := col
		for row := col + 1; row < n; row++ {
			if math.Abs(augmented[row][col]) > math.Abs(augmented[pivot][col]) {
				pivot = row
			}
		}
		if math.Abs(augmented[pivot][col]) < 1e-9 {
			return nil, false
		}
		augmented[col], augmented[pivot] = augmented[pivot], augmented[col]

		divisor := augmented[col][col]
		for j := col; j <= n; j++ {
			augmented[col][j] /= divisor
		}

		for row := 0; row < n; row++ {
			if row == col {
				continue
			}
			factor := augmented[row][col]
			for j := col; j <= n; j++ {
				augmented[row][j] -= factor * augmented[col][j]
			}
		}
	}

	result := make([]float64, n)
	for i := range result {
		result[i] = augmented[i][n]
	}
	return result, true
}

func predictLinear(coefficients, features []float64) float64 {
	if len(coefficients) != len(features) {
		return 0
	}
	total := 0.0
	for index := range coefficients {
		total += coefficients[index] * features[index]
	}
	return clamp(total, 0, 10)
}

func trainRidgeModel(samples []TrainingSample) (RidgeModel, bool) {
	if len(samples) < minTrainingSamples {
		return RidgeModel{}, false
	}

	features := make([][]float64, 0, len(samples))
	burnoutTargets := make([]float64, 0, len(samples))
	psychoTargets := make([]float64, 0, len(samples))
	for _, sample := range samples {
		features = append(features, sample.Features)
		burnoutTargets = append(burnoutTargets, sample.BurnoutTarget)
		psychoTargets = append(psychoTargets, sample.PsychosomaticTarget)
	}

	burnoutCoefficients, burnoutOK := fitRidge(features, burnoutTargets)
	psychoCoefficients, psychoOK := fitRidge(features, psychoTargets)
	if !burnoutOK || !psychoOK {
		return RidgeModel{}, false
	}

	return RidgeModel{
		BurnoutCoefficients:       burnoutCoefficients,
		PsychosomaticCoefficients: psychoCoefficients,
		TrainingSamples:           len(samples),
	}, true
}

func predictWithBestAvailableModel(metrics QuantumMetrics, nlpStress float64) (float64, float64, string, string) {
	burnout := psychometricBurnout(metrics, nlpStress)
	psychosomatic := psychometricPsychosomatic(metrics, burnout)
	source := "psychometric-fallback"
	version := "psychometric-v2"

	samples := loadTrainingSamples()
	if model, ok := trainRidgeModel(samples); ok {
		assessment := Assessment{
			FatigueScore:             metrics.FatigueScore,
			CynicismScore:            metrics.CynicismScore,
			EfficacyScore:            metrics.EfficacyScore,
			InterferenceScore:        metrics.InterferenceScore,
			OrderEffectScore:         metrics.OrderEffectScore,
			CognitiveDissonanceScore: metrics.CognitiveDissonanceScore,
			NLPStressScore:           nlpStress,
		}
		features := buildFeatureVector(assessment)
		burnout = predictLinear(model.BurnoutCoefficients, features)
		psychosomatic = predictLinear(model.PsychosomaticCoefficients, features)
		source = "ridge-regression"
		version = activeModelVersion
	}

	return burnout, psychosomatic, classifyRisk(burnout), version + ":" + source
}

func evaluatePredictions(samples []TrainingSample, predictor func(TrainingSample) float64) EvaluationMetrics {
	matrix := map[string]int{
		"Low_Low":       0,
		"Low_Medium":    0,
		"Low_High":      0,
		"Medium_Low":    0,
		"Medium_Medium": 0,
		"Medium_High":   0,
		"High_Low":      0,
		"High_Medium":   0,
		"High_High":     0,
	}
	if len(samples) == 0 {
		return EvaluationMetrics{ConfusionMatrix: matrix}
	}

	actuals := make([]float64, 0, len(samples))
	predicted := make([]float64, 0, len(samples))
	for _, sample := range samples {
		actuals = append(actuals, sample.BurnoutTarget)
		predicted = append(predicted, predictor(sample))
	}

	actualMean := mean(actuals)
	sumSqTotal := 0.0
	sumSqResidual := 0.0
	maeSum := 0.0
	rmseSum := 0.0
	mapeSum := 0.0
	actualCounts := map[string]int{"Low": 0, "Medium": 0, "High": 0}
	truePositive := map[string]int{"Low": 0, "Medium": 0, "High": 0}
	falsePositive := map[string]int{"Low": 0, "Medium": 0, "High": 0}
	falseNegative := map[string]int{"Low": 0, "Medium": 0, "High": 0}
	correct := 0

	for index, actual := range actuals {
		prediction := predicted[index]
		err := actual - prediction
		maeSum += math.Abs(err)
		rmseSum += err * err
		sumSqResidual += err * err
		sumSqTotal += (actual - actualMean) * (actual - actualMean)
		if actual != 0 {
			mapeSum += math.Abs(err/actual) * 100
		}

		actualRisk := normalizeRiskLabel(samples[index].RiskLevel)
		if actualRisk == "" {
			actualRisk = normalizeRiskLabel(classifyRisk(actual))
		}
		predictedRisk := normalizeRiskLabel(classifyRisk(prediction))
		actualCounts[actualRisk]++
		matrix[actualRisk+"_"+predictedRisk]++
		if actualRisk == predictedRisk {
			correct++
			truePositive[actualRisk]++
		} else {
			falsePositive[predictedRisk]++
			falseNegative[actualRisk]++
		}
	}

	r2 := 0.0
	if sumSqTotal > 0 {
		r2 = 1 - sumSqResidual/sumSqTotal
	}
	accuracy := float64(correct) / float64(len(samples))
	f1Sum := 0.0
	classCount := 0.0
	for _, label := range []string{"Low", "Medium", "High"} {
		if actualCounts[label] == 0 && truePositive[label] == 0 && falsePositive[label] == 0 {
			continue
		}
		precision := 0.0
		if truePositive[label]+falsePositive[label] > 0 {
			precision = float64(truePositive[label]) / float64(truePositive[label]+falsePositive[label])
		}
		recall := 0.0
		if truePositive[label]+falseNegative[label] > 0 {
			recall = float64(truePositive[label]) / float64(truePositive[label]+falseNegative[label])
		}
		if precision+recall > 0 {
			f1Sum += 2 * precision * recall / (precision + recall)
		}
		classCount++
	}

	f1 := 0.0
	if classCount > 0 {
		f1 = f1Sum / classCount
	}

	return EvaluationMetrics{
		R2:              r2,
		Accuracy:        accuracy,
		MAE:             maeSum / float64(len(samples)),
		RMSE:            math.Sqrt(rmseSum / float64(len(samples))),
		MAPE:            mapeSum / float64(len(samples)),
		F1:              f1,
		ConfusionMatrix: matrix,
	}
}

func crossValidatedAccuracy(samples []TrainingSample, quantum bool) []float64 {
	if len(samples) < 5 {
		return nil
	}
	folds := 5
	if len(samples) < folds {
		folds = len(samples)
	}

	sortedSamples := append([]TrainingSample{}, samples...)
	sort.SliceStable(sortedSamples, func(i, j int) bool {
		return sortedSamples[i].Timestamp.Before(sortedSamples[j].Timestamp)
	})

	scores := make([]float64, 0, folds)
	for fold := 0; fold < folds; fold++ {
		train := make([]TrainingSample, 0, len(sortedSamples))
		test := make([]TrainingSample, 0, len(sortedSamples)/folds+1)
		for index, sample := range sortedSamples {
			if index%folds == fold {
				test = append(test, sample)
			} else {
				train = append(train, sample)
			}
		}
		if len(train) == 0 || len(test) == 0 {
			continue
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
			continue
		}

		metrics := evaluatePredictions(test, func(sample TrainingSample) float64 {
			if quantum {
				return predictLinear(coefficients, sample.Features)
			}
			return predictLinear(coefficients, sample.ClassicalFeatures)
		})
		scores = append(scores, metrics.Accuracy)
	}
	return scores
}

func featureImportance(samples []TrainingSample, coefficients []float64) []map[string]interface{} {
	featureNames := []string{
		"Fatigue (F)",
		"Cynicism (C)",
		"Efficacy deficit (E)",
		"Interference (I)",
		"Order effect (O)",
		"Dissonance (D)",
		"NLP stress (S)",
	}
	featureColors := []string{"#ef4444", "#f59e0b", "#3ecfcf", "#6c63ff", "#38bdf8", "#f472b6", "#ec4899"}
	if len(coefficients) < len(featureNames)+1 || len(samples) == 0 {
		return nil
	}

	values := make([]float64, len(featureNames))
	for featureIndex := range featureNames {
		series := make([]float64, 0, len(samples))
		for _, sample := range samples {
			series = append(series, sample.Features[featureIndex+1])
		}
		values[featureIndex] = math.Abs(coefficients[featureIndex+1]) * stddev(series)
	}

	total := 0.0
	for _, value := range values {
		total += value
	}

	result := make([]map[string]interface{}, 0, len(featureNames))
	for index, name := range featureNames {
		importance := 0.0
		if total > 0 {
			importance = values[index] / total
		}
		result = append(result, map[string]interface{}{
			"feature":    name,
			"importance": importance,
			"color":      featureColors[index],
		})
	}
	return result
}

func psychometricPredictionForSample(sample TrainingSample) float64 {
	return psychometricBurnout(QuantumMetrics{
		FatigueScore:             sample.Features[1],
		CynicismScore:            sample.Features[2],
		EfficacyScore:            sample.Features[3],
		InterferenceScore:        sample.Features[4],
		OrderEffectScore:         sample.Features[5],
		CognitiveDissonanceScore: sample.Features[6],
	}, sample.Features[7])
}

func pearsonCorrelation(left, right []float64) float64 {
	if len(left) == 0 || len(left) != len(right) {
		return 0
	}
	leftMean := mean(left)
	rightMean := mean(right)
	numerator := 0.0
	leftDenominator := 0.0
	rightDenominator := 0.0
	for index := range left {
		leftDelta := left[index] - leftMean
		rightDelta := right[index] - rightMean
		numerator += leftDelta * rightDelta
		leftDenominator += leftDelta * leftDelta
		rightDenominator += rightDelta * rightDelta
	}
	if leftDenominator == 0 || rightDenominator == 0 {
		return 0
	}
	return numerator / math.Sqrt(leftDenominator*rightDenominator)
}

func formatModelFormula(coefficients []float64) string {
	if len(coefficients) < 8 {
		return "Model belum lengkap"
	}
	return fmt.Sprintf(
		"%.3f + %.3fxF + %.3fxC + %.3fxE + %.3fxI + %.3fxO + %.3fxD + %.3fxS",
		coefficients[0],
		coefficients[1],
		coefficients[2],
		coefficients[3],
		coefficients[4],
		coefficients[5],
		coefficients[6],
		coefficients[7],
	)
}
