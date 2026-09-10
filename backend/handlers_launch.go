package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func UserDailyBriefHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var latestPrediction Prediction
	hasPrediction := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestPrediction).Error == nil
	var latestAssessment Assessment
	hasAssessment := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestAssessment).Error == nil
	var latestCurhat Curhat
	hasCurhat := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestCurhat).Error == nil
	var checkins []DailyCheckIn
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").Limit(7).Find(&checkins)

	var pendingTreatments int64
	var unreadNotifications int64
	var unreadReplies int64
	DB.Model(&TherapyRecommendation{}).Where("user_id = ? AND status = ?", user.ID, "pending").Count(&pendingTreatments)
	DB.Model(&Notification{}).Where("user_id = ? AND is_read = ?", user.ID, false).Count(&unreadNotifications)
	DB.Model(&TreatmentReply{}).Where("user_id = ? AND admin_seen = ?", user.ID, false).Count(&unreadReplies)

	risk := "Low"
	if hasPrediction {
		risk = strongestRisk(risk, latestPrediction.RiskLevel)
	}
	if hasCurhat {
		risk = strongestRisk(risk, latestCurhat.RiskLevel)
	}
	if len(checkins) > 0 {
		latest := checkins[0]
		if latest.StressScore >= 4 || latest.MoodScore <= 2 || latest.EnergyScore <= 2 || latest.SleepHours < 5 {
			risk = strongestRisk(risk, "Medium")
		}
	}

	evidence := []string{}
	if hasPrediction {
		evidence = append(evidence, fmt.Sprintf("Prediksi terbaru: risiko %s, burnout %.0f%%, psikosomatis %.0f%%.", firstNonEmpty(latestPrediction.RiskLevel, "Low"), normalizePercentScore(latestPrediction.BurnoutScore), normalizePercentScore(latestPrediction.PsychosomaticScore)))
	}
	if hasAssessment {
		evidence = append(evidence, fmt.Sprintf("Asesmen terbaru membaca fatigue %.0f, cynicism %.0f, efficacy %.0f, NLP stress %.0f.", latestAssessment.FatigueScore, latestAssessment.CynicismScore, latestAssessment.EfficacyScore, latestAssessment.NLPStressScore))
	}
	if len(checkins) > 0 {
		latest := checkins[0]
		evidence = append(evidence, fmt.Sprintf("Check-in terakhir: mood %d/5, energi %d/5, tidur %.1f jam, stres %d/5.", latest.MoodScore, latest.EnergyScore, latest.SleepHours, latest.StressScore))
	}
	if hasCurhat && latestCurhat.AdminSummary != "" {
		evidence = append(evidence, truncateString(latestCurhat.AdminSummary, 180))
	}

	actions := []gin.H{}
	addDailyAction := func(title string, body string, path string, priority string) {
		actions = append(actions, gin.H{"title": title, "body": body, "path": path, "priority": priority})
	}
	if !hasAssessment || time.Since(latestAssessment.Timestamp) > 24*time.Hour {
		addDailyAction("Isi asesmen harian", "Data terbaru membuat prediksi dan rekomendasi lebih presisi.", "/user/kuisioner", "high")
	}
	if pendingTreatments > 0 {
		addDailyAction("Tindak lanjuti saran admin", fmt.Sprintf("%d rekomendasi masih aktif dan perlu progres.", pendingTreatments), "/user/curhat", "high")
	}
	if len(checkins) == 0 || time.Since(checkins[0].Timestamp) > 24*time.Hour {
		addDailyAction("Check-in recovery", "Catat mood, energi, tidur, dan stres hari ini.", "/user/recovery", "medium")
	}
	if hasCurhat && (latestCurhat.RiskLevel == "High" || latestCurhat.RiskLevel == "Crisis" || latestCurhat.CrisisFlag) {
		addDailyAction("Gunakan ruang curhat", "Risiko curhat terakhir perlu dipantau dengan lebih dekat.", "/user/curhat", "urgent")
	}
	if len(actions) == 0 {
		addDailyAction("Pertahankan ritme", "Kondisi hari ini relatif terkendali. Lanjutkan kebiasaan yang membantu.", "/user/dashboard", "low")
	}

	c.JSON(http.StatusOK, gin.H{
		"generated_at":          time.Now(),
		"risk_level":            risk,
		"headline":              dailyBriefHeadline(risk, pendingTreatments, unreadNotifications+unreadReplies),
		"summary":               dailyBriefSummary(risk, hasPrediction, len(checkins) > 0),
		"evidence":              sanitizeStringSlice(evidence, 6),
		"next_actions":          actions,
		"pending_treatments":    pendingTreatments,
		"unread_items":          unreadNotifications + unreadReplies,
		"data_quality":          dailyBriefDataQuality(hasAssessment, hasPrediction, len(checkins) > 0),
		"monitoring_disclaimer": "Brief ini alat monitoring dan pemulihan harian, bukan diagnosis medis.",
	})
}

func AdminLaunchReadinessHandler(c *gin.Context) {
	if !AdminGuard(c) {
		return
	}

	now := time.Now()
	since24h := now.Add(-24 * time.Hour)
	since7d := now.AddDate(0, 0, -7)
	samples := loadTrainingSamples()

	var users int64
	var admins int64
	var assessments int64
	var predictions int64
	var curhats int64
	var highCurhats int64
	var treatmentsPending int64
	var unreadReplies int64
	var logs24h int64
	var activity7d int64
	DB.Model(&User{}).Count(&users)
	DB.Model(&User{}).Where("role = ?", RoleSuperadmin).Count(&admins)
	DB.Model(&Assessment{}).Count(&assessments)
	DB.Model(&Prediction{}).Count(&predictions)
	DB.Model(&Curhat{}).Count(&curhats)
	DB.Model(&Curhat{}).Where("risk_level IN ? OR crisis_flag = ?", []string{"High", "Crisis"}, true).Count(&highCurhats)
	DB.Model(&TherapyRecommendation{}).Where("status = ?", "pending").Count(&treatmentsPending)
	DB.Model(&TreatmentReply{}).Where("admin_seen = ?", false).Count(&unreadReplies)
	DB.Model(&ActivityLog{}).Where("created_at >= ?", since24h).Count(&logs24h)
	DB.Model(&ActivityLog{}).Where("created_at >= ?", since7d).Count(&activity7d)

	config := getSystemConfig()
	openRouterConfigured := getEnv("OPENROUTER_API_KEY", "") != ""
	checks := []gin.H{
		readinessCheck("Backend API", true, "Endpoint utama aktif dan health check tersedia.", "/settings", "critical"),
		readinessCheck("Database", users >= 1, fmt.Sprintf("%d user, %d asesmen, %d prediksi tersimpan.", users, assessments, predictions), "/settings", "critical"),
		readinessCheck("Admin aktif", admins >= 1, fmt.Sprintf("%d akun admin tersedia.", admins), "/users", "critical"),
		readinessCheck("Audit log", activity7d > 0, fmt.Sprintf("%d aktivitas tercatat dalam 7 hari.", activity7d), "/settings", "high"),
		readinessCheck("AI response", config.AIResponseEnabled && openRouterConfigured, aiReadinessDetail(config.AIResponseEnabled, openRouterConfigured), "/settings", "high"),
		readinessCheck("Model validation", len(samples) >= minTrainingSamples, fmt.Sprintf("%d sampel training dari data operasional nyata.", len(samples)), "/model", "high"),
		readinessCheck("Monitoring risiko", curhats > 0 || predictions > 0, fmt.Sprintf("%d curhat, %d sinyal risiko tinggi, %d terapi pending.", curhats, highCurhats, treatmentsPending), "/risk-center", "high"),
		readinessCheck("Follow-up admin", unreadReplies == 0, fmt.Sprintf("%d balasan terapi belum dibaca.", unreadReplies), "/responden", "medium"),
		readinessCheck("Laporan", predictions > 0 || assessments > 0, "Export PDF dan laporan operasional siap dipakai ketika data tersedia.", "/laporan", "medium"),
	}

	pass, warning, blocked := 0, 0, 0
	for _, item := range checks {
		status := fmt.Sprint(item["status"])
		switch status {
		case "pass":
			pass++
		case "warning":
			warning++
		default:
			blocked++
		}
	}
	score := 0
	if len(checks) > 0 {
		score = int(float64(pass)*100/float64(len(checks)) + float64(warning)*45/float64(len(checks)))
		if score > 100 {
			score = 100
		}
	}

	launchStatus := "Siap internal"
	if blocked > 0 {
		launchStatus = "Belum siap launch"
	} else if warning > 0 {
		launchStatus = "Siap terbatas"
	}

	c.JSON(http.StatusOK, gin.H{
		"generated_at":        now,
		"score":               score,
		"status":              launchStatus,
		"pass":                pass,
		"warning":             warning,
		"blocked":             blocked,
		"checks":              checks,
		"model_validation":    buildModelValidationReport(samples),
		"operational_metrics": gin.H{"users": users, "assessments": assessments, "predictions": predictions, "curhats": curhats, "high_curhats": highCurhats, "pending_treatments": treatmentsPending, "unread_replies": unreadReplies, "activity_24h": logs24h},
		"next_moves":          launchNextMoves(checks),
	})
}

func readinessCheck(label string, ok bool, detail string, path string, severity string) gin.H {
	status := "pass"
	if !ok {
		status = "warning"
		if severity == "critical" || severity == "high" {
			status = "blocked"
		}
	}
	return gin.H{"label": label, "status": status, "detail": detail, "path": path, "severity": severity}
}

func launchNextMoves(checks []gin.H) []gin.H {
	moves := []gin.H{}
	for _, check := range checks {
		status := fmt.Sprint(check["status"])
		if status == "pass" {
			continue
		}
		moves = append(moves, gin.H{
			"title":    fmt.Sprintf("Beresi %s", strings.ToLower(fmt.Sprint(check["label"]))),
			"body":     check["detail"],
			"path":     check["path"],
			"priority": check["severity"],
		})
		if len(moves) >= 5 {
			break
		}
	}
	if len(moves) == 0 {
		moves = append(moves, gin.H{"title": "Lakukan rehearsal demo", "body": "Jalankan skenario login, asesmen, curhat, risk center, model, dan export laporan.", "path": "/command-center", "priority": "low"})
	}
	return moves
}

func normalizePercentScore(value float64) float64 {
	if value <= 1 {
		return value * 100
	}
	return value * 10
}

func dailyBriefHeadline(risk string, pending int64, unread int64) string {
	if risk == "Crisis" || risk == "High" {
		return "Hari ini perlu dipantau lebih dekat."
	}
	if pending > 0 || unread > 0 {
		return "Ada tindak lanjut yang sebaiknya diselesaikan."
	}
	if risk == "Medium" {
		return "Kondisi cukup stabil, tapi tetap perlu ritme yang aman."
	}
	return "Kondisi hari ini relatif terkendali."
}

func dailyBriefSummary(risk string, hasPrediction bool, hasCheckin bool) string {
	parts := []string{}
	if hasPrediction {
		parts = append(parts, "prediksi terbaru")
	}
	if hasCheckin {
		parts = append(parts, "check-in recovery")
	}
	if len(parts) == 0 {
		return "Sistem belum punya cukup data hari ini. Isi asesmen dan check-in agar brief berikutnya lebih presisi."
	}
	return fmt.Sprintf("Brief disusun dari %s dengan status risiko %s.", strings.Join(parts, ", "), strings.ToLower(risk))
}

func dailyBriefDataQuality(hasAssessment bool, hasPrediction bool, hasCheckin bool) string {
	score := 0
	if hasAssessment {
		score++
	}
	if hasPrediction {
		score++
	}
	if hasCheckin {
		score++
	}
	if score >= 3 {
		return "tinggi"
	}
	if score == 2 {
		return "cukup"
	}
	return "rendah"
}

func aiReadinessDetail(enabled bool, configured bool) string {
	if enabled && configured {
		return "AI aktif dan API key tersedia."
	}
	if enabled {
		return "AI aktif, tetapi API key belum tersedia di environment."
	}
	return "Respons AI dimatikan dari pengaturan sistem."
}
