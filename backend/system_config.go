package main

import "time"

func getSystemConfig() SystemConfig {
	var config SystemConfig
	if err := DB.First(&config).Error; err != nil {
		config = SystemConfig{}
		DB.Create(&config)
	}

	normalized := normalizeSystemConfig(config)
	if normalized != config {
		DB.Model(&config).Updates(map[string]interface{}{
			"burnout_threshold_low":    normalized.BurnoutThresholdLow,
			"burnout_threshold_medium": normalized.BurnoutThresholdMedium,
			"psycho_threshold_low":     normalized.PsychoThresholdLow,
			"psycho_threshold_medium":  normalized.PsychoThresholdMedium,
			"interference_weight":      normalized.InterferenceWeight,
			"early_warning_threshold":  normalized.EarlyWarningThreshold,
			"max_assessment_per_day":   normalized.MaxAssessmentPerDay,
			"notification_retention":   normalized.NotificationRetention,
			"data_retention_days":      normalized.DataRetentionDays,
			"hi_weight_academic":       normalized.HiWeightAcademic,
			"hi_weight_motivation":     normalized.HiWeightMotivation,
			"hi_weight_social":         normalized.HiWeightSocial,
			"hi_weight_environment":    normalized.HiWeightEnvironment,
			"hi_weight_lecturer":       normalized.HiWeightLecturer,
			"hi_weight_facilities":     normalized.HiWeightFacilities,
			"wellbeing_warn_burnout_rise":   normalized.WellbeingWarnBurnoutRise,
			"wellbeing_warn_happiness_drop": normalized.WellbeingWarnHappinessDrop,
		})
		normalized.ID = config.ID
		normalized.CreatedAt = config.CreatedAt
		normalized.UpdatedAt = config.UpdatedAt
	}

	return normalized
}

func normalizeSystemConfig(config SystemConfig) SystemConfig {
	if config.BurnoutThresholdLow < 0 || config.BurnoutThresholdLow >= 10 {
		config.BurnoutThresholdLow = 4
	}
	if config.BurnoutThresholdMedium <= config.BurnoutThresholdLow || config.BurnoutThresholdMedium > 10 {
		config.BurnoutThresholdMedium = 6
	}
	if config.PsychoThresholdLow < 0 || config.PsychoThresholdLow >= 10 {
		config.PsychoThresholdLow = 4
	}
	if config.PsychoThresholdMedium <= config.PsychoThresholdLow || config.PsychoThresholdMedium > 10 {
		config.PsychoThresholdMedium = 6
	}
	if config.InterferenceWeight < 0 || config.InterferenceWeight > 3 {
		config.InterferenceWeight = 1
	}
	if config.EarlyWarningThreshold < 0.3 || config.EarlyWarningThreshold > 0.95 {
		config.EarlyWarningThreshold = 0.7
	}
	if config.MaxAssessmentPerDay < 1 || config.MaxAssessmentPerDay > 20 {
		config.MaxAssessmentPerDay = 3
	}
	if config.NotificationRetention < 1 || config.NotificationRetention > 365 {
		config.NotificationRetention = 30
	}
	if config.DataRetentionDays < 30 || config.DataRetentionDays > 1825 {
		config.DataRetentionDays = 365
	}

	config = normalizeHappinessWeights(config)

	if config.WellbeingWarnBurnoutRise <= 0 || config.WellbeingWarnBurnoutRise > 5 {
		config.WellbeingWarnBurnoutRise = 1.0
	}
	if config.WellbeingWarnHappinessDrop <= 0 || config.WellbeingWarnHappinessDrop > 50 {
		config.WellbeingWarnHappinessDrop = 10
	}
	return config
}

// normalizeHappinessWeights memastikan bobot HI berada di rentang wajar dan
// totalnya 1.0 (fallback proporsional bila jumlah bobot tidak valid).
func normalizeHappinessWeights(config SystemConfig) SystemConfig {
	weights := []float64{
		config.HiWeightAcademic,
		config.HiWeightMotivation,
		config.HiWeightSocial,
		config.HiWeightEnvironment,
		config.HiWeightLecturer,
		config.HiWeightFacilities,
	}
	defaults := []float64{0.25, 0.20, 0.20, 0.15, 0.10, 0.10}
	clamped := make([]float64, len(weights))
	total := 0.0
	invalid := false
	for i, w := range weights {
		if w < 0 || w > 1 {
			invalid = true
			clamped[i] = defaults[i]
		} else {
			clamped[i] = w
		}
		total += clamped[i]
	}
	if invalid || total <= 0.5 || total > 1.5 {
		clamped = defaults
		total = 1.0
	}
	if total != 1.0 {
		scale := 1.0 / total
		for i := range clamped {
			clamped[i] = clamped[i] * scale
		}
	}
	config.HiWeightAcademic = clamped[0]
	config.HiWeightMotivation = clamped[1]
	config.HiWeightSocial = clamped[2]
	config.HiWeightEnvironment = clamped[3]
	config.HiWeightLecturer = clamped[4]
	config.HiWeightFacilities = clamped[5]
	return config
}

func retentionCutoff(days int) time.Time {
	return time.Now().AddDate(0, 0, -days)
}

func pruneExpiredNotifications(config SystemConfig) {
	DB.Where("created_at < ?", retentionCutoff(config.NotificationRetention)).Delete(&Notification{})
}

func userActionBlockedByMaintenance(user User, config SystemConfig) bool {
	return config.MaintenanceMode && !isAdminLevelRole(user.Role)
}
