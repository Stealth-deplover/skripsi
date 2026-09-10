package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type RiskTimelineItem struct {
	ID          uint                   `json:"id"`
	Type        string                 `json:"type"`
	Title       string                 `json:"title"`
	Summary     string                 `json:"summary"`
	RiskLevel   string                 `json:"risk_level"`
	Score       float64                `json:"score"`
	CreatedAt   time.Time              `json:"created_at"`
	Meta        map[string]interface{} `json:"meta"`
	Recommended string                 `json:"recommended_action"`
}

type EarlyWarningItem struct {
	ID          string    `json:"id"`
	UserID      uint      `json:"user_id"`
	UserName    string    `json:"user_name"`
	Username    string    `json:"username"`
	Signal      string    `json:"signal"`
	Severity    string    `json:"severity"`
	Score       float64   `json:"score"`
	Summary     string    `json:"summary"`
	Action      string    `json:"action"`
	CreatedAt   time.Time `json:"created_at"`
	SourceID    uint      `json:"source_id"`
	SourceType  string    `json:"source_type"`
	Status      string    `json:"status"`
	Explanation []string  `json:"explanation"`
}

type RecoveryPlanDay struct {
	Day       string `json:"day"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Category  string `json:"category"`
	Intensity string `json:"intensity"`
}

type RecoveryMicroAction struct {
	Title    string `json:"title"`
	Duration string `json:"duration"`
	Reason   string `json:"reason"`
}

type RecoveryScheduleBlock struct {
	Time     string `json:"time"`
	Title    string `json:"title"`
	Duration string `json:"duration"`
	Reason   string `json:"reason"`
}

type RecoverySuggestedCheckIn struct {
	MoodScore   int     `json:"mood_score"`
	EnergyScore int     `json:"energy_score"`
	SleepHours  float64 `json:"sleep_hours"`
	StressScore int     `json:"stress_score"`
	Notes       string  `json:"notes"`
	Confidence  float64 `json:"confidence"`
	Reason      string  `json:"reason"`
}

type RecoveryPlanAI struct {
	AISummary        string                   `json:"ai_summary"`
	AISource         string                   `json:"ai_source"`
	Focus            []string                 `json:"focus"`
	Plan             []RecoveryPlanDay        `json:"plan"`
	MicroActions     []RecoveryMicroAction    `json:"micro_actions"`
	Schedule         []RecoveryScheduleBlock  `json:"schedule"`
	SuggestedCheckIn RecoverySuggestedCheckIn `json:"suggested_checkin"`
	SafetyFlags      []string                 `json:"safety_flags"`
	CapacityLabel    string                   `json:"capacity_label"`
}

func UserCheckInsHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var checkins []DailyCheckIn
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").Limit(30).Find(&checkins)
	c.JSON(http.StatusOK, gin.H{"checkins": checkins})
}

func UserCheckInCreateHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var input struct {
		MoodScore   int     `json:"mood_score"`
		EnergyScore int     `json:"energy_score"`
		SleepHours  float64 `json:"sleep_hours"`
		StressScore int     `json:"stress_score"`
		Notes       string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Check-in tidak valid"})
		return
	}

	checkin := DailyCheckIn{
		UserID:      user.ID,
		MoodScore:   clampInt(input.MoodScore, 1, 5),
		EnergyScore: clampInt(input.EnergyScore, 1, 5),
		SleepHours:  clampFloat(input.SleepHours, 0, 16),
		StressScore: clampInt(input.StressScore, 1, 5),
		Notes:       truncateString(strings.TrimSpace(input.Notes), 800),
	}
	DB.Create(&checkin)

	if checkin.StressScore >= 4 || checkin.MoodScore <= 2 || checkin.EnergyScore <= 2 || checkin.SleepHours < 4 {
		var admins []User
		DB.Where("role = ?", RoleSuperadmin).Find(&admins)
		for _, admin := range admins {
			DB.Create(&Notification{
				UserID:  admin.ID,
				Type:    "checkin_warning",
				Message: fmt.Sprintf("Check-in harian %s perlu dipantau: mood %d/5, energi %d/5, stres %d/5.", user.Nama, checkin.MoodScore, checkin.EnergyScore, checkin.StressScore),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "checkin": checkin})
}

func UserRiskTimelineHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	c.JSON(http.StatusOK, gin.H{"timeline": buildRiskTimeline(user.ID, 80)})
}

func UserRecoveryPlanHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}
	timeline := buildRiskTimeline(user.ID, 40)
	var checkins []DailyCheckIn
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").Limit(7).Find(&checkins)
	var latestPrediction Prediction
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestPrediction)
	var latestCurhat Curhat
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestCurhat)

	risk := strongestRisk(latestPrediction.RiskLevel, latestCurhat.RiskLevel)
	if risk == "" {
		risk = "Low"
	}
	recovery := generateRecoveryPlan(user, risk, latestPrediction, latestCurhat, checkins, timeline, config.AIResponseEnabled)

	c.JSON(http.StatusOK, gin.H{
		"risk_level":        risk,
		"focus":             recovery.Focus,
		"plan":              recovery.Plan,
		"ai_summary":        recovery.AISummary,
		"ai_source":         recovery.AISource,
		"micro_actions":     recovery.MicroActions,
		"schedule":          recovery.Schedule,
		"suggested_checkin": recovery.SuggestedCheckIn,
		"safety_flags":      recovery.SafetyFlags,
		"capacity_label":    recovery.CapacityLabel,
		"timeline_preview":  timeline,
		"privacy_note":      "Data dipakai untuk monitoring kesehatan mental di sistem. Admin melihat sinyal risiko dan ringkasan tindakan, bukan untuk diagnosis medis.",
		"generated_at":      time.Now(),
	})
}

func AdminCommandCenterHandler(c *gin.Context) {
	warnings := buildEarlyWarnings(120)
	now := time.Now()
	since24h := now.Add(-24 * time.Hour)
	since7d := now.AddDate(0, 0, -7)

	var totalUsers int64
	var admins int64
	var mahasiswa int64
	var pendingTreatments int64
	var unreadReplies int64
	var unreadNotifications int64
	var crisisCurhats int64
	var assessments7d int64
	var predictions7d int64
	var checkins24h int64
	var activity24h int64

	DB.Model(&User{}).Count(&totalUsers)
	DB.Model(&User{}).Where("role = ?", RoleSuperadmin).Count(&admins)
	DB.Model(&User{}).Where("role = ?", RoleStudent).Count(&mahasiswa)
	DB.Model(&TherapyRecommendation{}).Where("status = ?", "pending").Count(&pendingTreatments)
	DB.Model(&TreatmentReply{}).Where("admin_seen = ?", false).Count(&unreadReplies)
	DB.Model(&Notification{}).Where("is_read = ?", false).Count(&unreadNotifications)
	DB.Model(&Curhat{}).Where("crisis_flag = ? OR risk_level = ?", true, "Crisis").Count(&crisisCurhats)
	DB.Model(&Assessment{}).Where("timestamp >= ?", since7d).Count(&assessments7d)
	DB.Model(&Prediction{}).Where("timestamp >= ?", since7d).Count(&predictions7d)
	DB.Model(&DailyCheckIn{}).Where("timestamp >= ?", since24h).Count(&checkins24h)
	DB.Model(&ActivityLog{}).Where("created_at >= ?", since24h).Count(&activity24h)

	var logs []ActivityLog
	DB.Order("created_at DESC").Limit(8).Find(&logs)
	var latestUsers []User
	DB.Order("created_at DESC").Limit(6).Find(&latestUsers)

	c.JSON(http.StatusOK, gin.H{
		"generated_at": now,
		"headline": gin.H{
			"risk_load":            len(warnings),
			"urgent":               countWarningsBySeverity(warnings, "urgent"),
			"high":                 countWarningsBySeverity(warnings, "high"),
			"pending_treatments":   pendingTreatments,
			"unread_replies":       unreadReplies,
			"unread_notifications": unreadNotifications,
			"crisis_curhats":       crisisCurhats,
		},
		"cohorts": gin.H{
			"total_users": totalUsers,
			"admins":      admins,
			"mahasiswa":   mahasiswa,
		},
		"throughput": gin.H{
			"assessments_7d": assessments7d,
			"predictions_7d": predictions7d,
			"checkins_24h":   checkins24h,
			"activity_24h":   activity24h,
		},
		"case_queue":        buildCommandCaseQueue(warnings, 12),
		"recommended_moves": buildCommandRecommendedMoves(warnings, pendingTreatments, unreadReplies, crisisCurhats),
		"recent_activity":   buildCommandActivity(logs),
		"latest_users":      buildCommandUsers(latestUsers),
		"readiness": gin.H{
			"api":              "online",
			"database":         "connected",
			"pdf_export":       "ready",
			"audit_trail":      "active",
			"offline_assets":   "local-first",
			"clinical_notice":  "monitoring_only",
			"last_health_time": now,
		},
	})
}

func AdminRiskCenterHandler(c *gin.Context) {
	warnings := buildEarlyWarnings(80)
	stats := gin.H{
		"total":      len(warnings),
		"urgent":     countWarningsBySeverity(warnings, "urgent"),
		"high":       countWarningsBySeverity(warnings, "high"),
		"medium":     countWarningsBySeverity(warnings, "medium"),
		"generated":  time.Now(),
		"board_name": "Early Warning Center",
	}
	c.JSON(http.StatusOK, gin.H{"stats": stats, "warnings": warnings})
}

func buildCommandCaseQueue(warnings []EarlyWarningItem, limit int) []gin.H {
	queue := []gin.H{}
	for _, warning := range warnings {
		queue = append(queue, gin.H{
			"id":          warning.ID,
			"user_id":     warning.UserID,
			"user_name":   warning.UserName,
			"username":    warning.Username,
			"signal":      warning.Signal,
			"severity":    warning.Severity,
			"score":       warning.Score,
			"summary":     warning.Summary,
			"action":      warning.Action,
			"source_type": warning.SourceType,
			"source_id":   warning.SourceID,
			"created_at":  warning.CreatedAt,
			"sla":         commandSLA(warning.Severity),
		})
		if len(queue) >= limit {
			break
		}
	}
	return queue
}

func buildCommandRecommendedMoves(warnings []EarlyWarningItem, pendingTreatments int64, unreadReplies int64, crisisCurhats int64) []gin.H {
	moves := []gin.H{}
	urgent := countWarningsBySeverity(warnings, "urgent")
	high := countWarningsBySeverity(warnings, "high")
	if urgent > 0 || crisisCurhats > 0 {
		moves = append(moves, gin.H{"title": "Tutup kasus krisis terlebih dahulu", "body": fmt.Sprintf("%d sinyal urgent dan %d curhat krisis perlu triage cepat.", urgent, crisisCurhats), "path": "/risk-center", "priority": "urgent"})
	}
	if unreadReplies > 0 {
		moves = append(moves, gin.H{"title": "Baca balasan terapi user", "body": fmt.Sprintf("%d balasan belum dibaca dapat mengubah rekomendasi recovery.", unreadReplies), "path": "/responden", "priority": "high"})
	}
	if pendingTreatments > 0 {
		moves = append(moves, gin.H{"title": "Review terapi pending", "body": fmt.Sprintf("%d rekomendasi masih menunggu follow-up admin.", pendingTreatments), "path": "/responden", "priority": "medium"})
	}
	if high > 0 {
		moves = append(moves, gin.H{"title": "Audit risiko tinggi", "body": fmt.Sprintf("%d sinyal risiko tinggi perlu dilihat bersama timeline user.", high), "path": "/risk-center", "priority": "high"})
	}
	if len(moves) == 0 {
		moves = append(moves, gin.H{"title": "Operasi stabil", "body": "Tidak ada sinyal besar. Lanjutkan monitoring, audit log, dan review laporan mingguan.", "path": "/laporan", "priority": "low"})
	}
	return moves
}

func buildCommandActivity(logs []ActivityLog) []gin.H {
	items := []gin.H{}
	for _, log := range logs {
		items = append(items, gin.H{
			"id":          log.ID,
			"username":    log.Username,
			"role":        log.Role,
			"action":      log.Action,
			"method":      log.Method,
			"path":        log.Path,
			"status_code": log.StatusCode,
			"created_at":  log.CreatedAt,
		})
	}
	return items
}

func buildCommandUsers(users []User) []gin.H {
	items := []gin.H{}
	for _, user := range users {
		items = append(items, gin.H{
			"id":         user.ID,
			"nama":       user.Nama,
			"username":   user.Username,
			"role":       user.Role,
			"created_at": user.CreatedAt,
		})
	}
	return items
}

func commandSLA(severity string) string {
	switch strings.ToLower(severity) {
	case "urgent":
		return "Hari ini"
	case "high":
		return "24 jam"
	default:
		return "72 jam"
	}
}

func AdminUserTimelineHandler(c *gin.Context) {
	userID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"timeline": buildRiskTimeline(userID, 120)})
}

func AdminUserCaseSummaryHandler(c *gin.Context) {
	userID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var user User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	c.JSON(http.StatusOK, buildCaseSummary(user))
}

func AdminUserReportExportHandler(c *gin.Context) {
	userID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var user User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	summary := buildCaseSummary(user)
	timeline := buildRiskTimeline(user.ID, 30)
	report := buildPDFReport(summary, timeline)
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=nexusmind-case-report-%d.pdf", user.ID))
	c.Data(http.StatusOK, "application/pdf", report)
}

func AdminTriageStatusHandler(c *gin.Context) {
	sourceType := strings.ToLower(strings.TrimSpace(c.Param("type")))
	id := c.Param("id")
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status wajib diisi"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	switch sourceType {
	case "curhat":
		if status != "new" && status != "reviewing" && status != "actioned" && status != "resolved" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status curhat tidak valid"})
			return
		}
		var curhat Curhat
		if err := DB.First(&curhat, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Curhat tidak ditemukan"})
			return
		}
		curhat.AdminStatus = status
		DB.Save(&curhat)
		recordRiskTriageActivity(c, sourceType, id, status, curhat.UserID)
	case "treatment":
		if status != "pending" && status != "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status terapi tidak valid"})
			return
		}
		var treatment TherapyRecommendation
		if err := DB.First(&treatment, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Terapi tidak ditemukan"})
			return
		}
		treatment.Status = status
		DB.Save(&treatment)
		recordRiskTriageActivity(c, sourceType, id, status, treatment.UserID)
	case "reply":
		if !isCompletedTriageStatus(status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status balasan tidak valid"})
			return
		}
		var reply TreatmentReply
		if err := DB.First(&reply, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Balasan tidak ditemukan"})
			return
		}
		reply.AdminSeen = true
		DB.Save(&reply)
		recordRiskTriageActivity(c, sourceType, id, status, reply.UserID)
	case "prediction":
		if !isCompletedTriageStatus(status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status prediksi tidak valid"})
			return
		}
		var prediction Prediction
		if err := DB.First(&prediction, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Prediksi tidak ditemukan"})
			return
		}
		recordRiskTriageActivity(c, sourceType, id, status, prediction.UserID)
	case "checkin":
		if !isCompletedTriageStatus(status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status check-in tidak valid"})
			return
		}
		var checkin DailyCheckIn
		if err := DB.First(&checkin, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Check-in tidak ditemukan"})
			return
		}
		recordRiskTriageActivity(c, sourceType, id, status, checkin.UserID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe triage tidak valid"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "success", "triage_status": status, "source_type": sourceType, "source_id": id})
}

func isCompletedTriageStatus(status string) bool {
	return status == "resolved" || status == "completed" || status == "actioned"
}

func recordRiskTriageActivity(c *gin.Context, sourceType string, id string, status string, userID uint) {
	admin, _ := c.Get("user")
	var currentUser *User
	if typed, ok := admin.(User); ok {
		currentUser = &typed
	}
	recordActivity(c, currentUser, "risk_triage_resolved", riskTriageTarget(sourceType), id, gin.H{
		"source_type": sourceType,
		"source_id":   id,
		"status":      status,
		"user_id":     userID,
	})
}

func riskTriageTarget(sourceType string) string {
	return "risk_center_" + strings.ToLower(strings.TrimSpace(sourceType))
}

func isRiskItemResolved(sourceType string, id uint) bool {
	var count int64
	DB.Model(&ActivityLog{}).Where(
		"action = ? AND target_type = ? AND target_id = ?",
		"risk_triage_resolved",
		riskTriageTarget(sourceType),
		fmt.Sprintf("%d", id),
	).Count(&count)
	return count > 0
}

func buildRiskTimeline(userID uint, limit int) []RiskTimelineItem {
	items := []RiskTimelineItem{}
	var predictions []Prediction
	DB.Where("user_id = ?", userID).Order("timestamp DESC").Limit(limit).Find(&predictions)
	for _, p := range predictions {
		items = append(items, RiskTimelineItem{
			ID: p.ID, Type: "prediction", Title: "Prediksi burnout",
			Summary:   fmt.Sprintf("Burnout %.1f/10, psikosomatis %.1f/10, model %s.", p.BurnoutScore, p.PsychosomaticScore, p.ModelVersion),
			RiskLevel: p.RiskLevel, Score: normalizeRiskScore(p.RiskLevel, p.BurnoutScore/10, p.PsychosomaticScore/10), CreatedAt: p.Timestamp,
			Meta:        gin.H{"burnout": p.BurnoutScore, "psychosomatic": p.PsychosomaticScore, "model_version": p.ModelVersion},
			Recommended: recommendationForRisk(p.RiskLevel),
		})
	}
	var curhats []Curhat
	DB.Where("user_id = ?", userID).Order("timestamp DESC").Limit(limit).Find(&curhats)
	for _, ch := range curhats {
		items = append(items, RiskTimelineItem{
			ID: ch.ID, Type: "curhat", Title: "Curhat AI",
			Summary:   firstNonEmpty(ch.AdminSummary, truncateString(ch.Text, 160)),
			RiskLevel: ch.RiskLevel, Score: normalizeRiskScore(ch.RiskLevel, ch.StressScore, ch.BurnoutScore, ch.PsychosomaticScore), CreatedAt: ch.Timestamp,
			Meta:        gin.H{"stress": ch.StressScore, "burnout": ch.BurnoutScore, "psychosomatic": ch.PsychosomaticScore, "status": ch.AdminStatus, "ai_mode": ch.AIMode},
			Recommended: recommendationForRisk(ch.RiskLevel),
		})
	}
	var checkins []DailyCheckIn
	DB.Where("user_id = ?", userID).Order("timestamp DESC").Limit(limit).Find(&checkins)
	for _, ci := range checkins {
		score := checkInRiskScore(ci)
		items = append(items, RiskTimelineItem{
			ID: ci.ID, Type: "checkin", Title: "Check-in harian",
			Summary:   fmt.Sprintf("Mood %d/5, energi %d/5, tidur %.1f jam, stres %d/5.", ci.MoodScore, ci.EnergyScore, ci.SleepHours, ci.StressScore),
			RiskLevel: riskFromNormalized(score), Score: score, CreatedAt: ci.Timestamp,
			Meta:        gin.H{"mood": ci.MoodScore, "energy": ci.EnergyScore, "sleep": ci.SleepHours, "stress": ci.StressScore, "notes": ci.Notes},
			Recommended: "Pantau pola harian dan sesuaikan recovery plan.",
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	if len(items) > limit {
		return items[:limit]
	}
	return items
}

func buildEarlyWarnings(limit int) []EarlyWarningItem {
	warnings := []EarlyWarningItem{}
	userMap := map[uint]User{}
	lookupUser := func(id uint) User {
		if u, ok := userMap[id]; ok {
			return u
		}
		var u User
		DB.First(&u, id)
		userMap[id] = u
		return u
	}

	var predictions []Prediction
	DB.Where("id IN (?)", DB.Model(&Prediction{}).Select("MAX(id)").Group("user_id")).Order("timestamp DESC").Find(&predictions)
	for _, p := range predictions {
		score := normalizeRiskScore(p.RiskLevel, p.BurnoutScore/10, p.PsychosomaticScore/10)
		if p.RiskLevel == "High" || p.RiskLevel == "Crisis" || score >= 0.68 {
			if isRiskItemResolved("prediction", p.ID) {
				continue
			}
			u := lookupUser(p.UserID)
			warnings = append(warnings, EarlyWarningItem{
				ID: fmt.Sprintf("prediction-%d", p.ID), UserID: u.ID, UserName: u.Nama, Username: u.Username,
				Signal: "Prediksi risiko tinggi", Severity: severityFromRisk(p.RiskLevel, score), Score: score,
				Summary: fmt.Sprintf("Prediksi terakhir menunjukkan burnout %.1f dan psikosomatis %.1f.", p.BurnoutScore, p.PsychosomaticScore),
				Action:  "Buka case summary dan kirim rencana penanganan.", CreatedAt: p.Timestamp, SourceID: p.ID, SourceType: "prediction",
				Status: "open", Explanation: []string{"Model prediksi terbaru masuk zona risiko", "Perlu dilihat bersama curhat dan check-in"},
			})
		}
	}

	var curhats []Curhat
	DB.Where("risk_level IN ? OR crisis_flag = ?", []string{"High", "Crisis"}, true).Order("timestamp DESC").Limit(80).Find(&curhats)
	for _, ch := range curhats {
		if ch.AdminStatus == "resolved" || ch.AdminStatus == "completed" || isRiskItemResolved("curhat", ch.ID) {
			continue
		}
		u := lookupUser(ch.UserID)
		score := normalizeRiskScore(ch.RiskLevel, ch.StressScore, ch.BurnoutScore, ch.PsychosomaticScore)
		flags := []string{}
		_ = json.Unmarshal([]byte(ch.RedFlagsJSON), &flags)
		warnings = append(warnings, EarlyWarningItem{
			ID: fmt.Sprintf("curhat-%d", ch.ID), UserID: u.ID, UserName: u.Nama, Username: u.Username,
			Signal: "Curhat AI perlu monitoring", Severity: severityFromRisk(ch.RiskLevel, score), Score: score,
			Summary: firstNonEmpty(ch.AdminSummary, truncateString(ch.Text, 150)),
			Action:  "Triage curhat dan kirim tindak lanjut.", CreatedAt: ch.Timestamp, SourceID: ch.ID, SourceType: "curhat",
			Status: ch.AdminStatus, Explanation: flags,
		})
	}

	var replies []TreatmentReply
	DB.Where("admin_seen = ?", false).Order("created_at DESC").Limit(60).Find(&replies)
	for _, reply := range replies {
		u := lookupUser(reply.UserID)
		warnings = append(warnings, EarlyWarningItem{
			ID: fmt.Sprintf("reply-%d", reply.ID), UserID: u.ID, UserName: u.Nama, Username: u.Username,
			Signal: "Balasan terapi belum dibaca", Severity: moodSeverity(reply.Mood), Score: moodScore(reply.Mood),
			Summary: truncateString(reply.Text, 150), Action: "Baca balasan user dan update rekomendasi.",
			CreatedAt: reply.CreatedAt, SourceID: reply.ID, SourceType: "reply", Status: "unread",
			Explanation: []string{"User memberi respons pada rekomendasi terapi", "Mood balasan: " + firstNonEmpty(reply.Mood, "same")},
		})
	}

	var checkins []DailyCheckIn
	DB.Where("id IN (?)", DB.Model(&DailyCheckIn{}).Select("MAX(id)").Group("user_id")).Order("timestamp DESC").Limit(80).Find(&checkins)
	for _, checkin := range checkins {
		score := checkInRiskScore(checkin)
		if score < 0.55 && checkin.StressScore < 4 && checkin.MoodScore > 2 && checkin.EnergyScore > 2 && checkin.SleepHours >= 5 {
			continue
		}
		if isRiskItemResolved("checkin", checkin.ID) {
			continue
		}
		u := lookupUser(checkin.UserID)
		warnings = append(warnings, EarlyWarningItem{
			ID:         fmt.Sprintf("checkin-%d", checkin.ID),
			UserID:     u.ID,
			UserName:   u.Nama,
			Username:   u.Username,
			Signal:     "Check-in harian butuh perhatian",
			Severity:   severityFromRisk(riskFromNormalized(score), score),
			Score:      score,
			Summary:    fmt.Sprintf("Mood %d/5, energi %d/5, tidur %.1f jam, stres %d/5.", checkin.MoodScore, checkin.EnergyScore, checkin.SleepHours, checkin.StressScore),
			Action:     "Buka timeline user dan cek apakah perlu follow-up terapi.",
			CreatedAt:  checkin.Timestamp,
			SourceID:   checkin.ID,
			SourceType: "checkin",
			Status:     "open",
			Explanation: []string{
				"Check-in user tersambung dari Recovery Plan",
				"Skor risiko check-in: " + fmt.Sprintf("%.0f%%", score*100),
			},
		})
	}

	sort.SliceStable(warnings, func(i, j int) bool {
		if severityRank(warnings[i].Severity) == severityRank(warnings[j].Severity) {
			return warnings[i].CreatedAt.After(warnings[j].CreatedAt)
		}
		return severityRank(warnings[i].Severity) > severityRank(warnings[j].Severity)
	})
	if len(warnings) > limit {
		return warnings[:limit]
	}
	return warnings
}

func buildCaseSummary(user User) gin.H {
	timeline := buildRiskTimeline(user.ID, 40)
	var latestPrediction Prediction
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestPrediction)
	var latestCurhat Curhat
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestCurhat)
	var pendingTreatments int64
	var unreadReplies int64
	DB.Model(&TherapyRecommendation{}).Where("user_id = ? AND status = ?", user.ID, "pending").Count(&pendingTreatments)
	DB.Model(&TreatmentReply{}).Where("user_id = ? AND admin_seen = ?", user.ID, false).Count(&unreadReplies)
	risk := strongestRisk(latestPrediction.RiskLevel, latestCurhat.RiskLevel)
	if risk == "" {
		risk = "Low"
	}
	factors := []string{}
	if latestPrediction.BurnoutScore >= 6 {
		factors = append(factors, "Burnout prediktif tinggi")
	}
	if latestPrediction.PsychosomaticScore >= 6 {
		factors = append(factors, "Risiko psikosomatis prediktif tinggi")
	}
	if latestCurhat.StressScore >= 0.65 {
		factors = append(factors, "Bahasa curhat menunjukkan stres tinggi")
	}
	if latestCurhat.BurnoutScore >= 0.62 {
		factors = append(factors, "Curhat mengandung sinyal burnout")
	}
	if latestCurhat.PsychosomaticScore >= 0.58 {
		factors = append(factors, "Curhat mengandung keluhan psikosomatis")
	}
	if pendingTreatments > 0 {
		factors = append(factors, fmt.Sprintf("%d rekomendasi terapi masih pending", pendingTreatments))
	}
	if len(factors) == 0 {
		factors = append(factors, "Belum ada faktor risiko tinggi yang menonjol")
	}
	return gin.H{
		"user":                gin.H{"id": user.ID, "nama": user.Nama, "username": user.Username},
		"risk_level":          risk,
		"summary":             fmt.Sprintf("%s saat ini berada pada kategori %s berdasarkan timeline asesmen, curhat, check-in, dan tindak lanjut terapi.", user.Nama, strings.ToLower(risk)),
		"key_factors":         factors,
		"recommended_actions": adminRecommendationsForRisk(risk, latestCurhat.CrisisFlag),
		"model_explainability": gin.H{
			"burnout_score":        latestPrediction.BurnoutScore,
			"psychosomatic_score":  latestPrediction.PsychosomaticScore,
			"curhat_stress":        latestCurhat.StressScore,
			"curhat_burnout":       latestCurhat.BurnoutScore,
			"curhat_psychosomatic": latestCurhat.PsychosomaticScore,
			"model_version":        latestPrediction.ModelVersion,
		},
		"pending_treatments": pendingTreatments,
		"unread_replies":     unreadReplies,
		"timeline":           timeline,
		"privacy_note":       "Gunakan ringkasan ini untuk monitoring dan tindak lanjut internal. Ini bukan diagnosis medis.",
		"generated_at":       time.Now(),
	}
}

func buildTextReport(summary gin.H, timeline []RiskTimelineItem) string {
	lines := []string{
		"NexusMind Case Report",
		"Generated: " + time.Now().Format(time.RFC3339),
		"",
		fmt.Sprintf("Risk Level: %v", summary["risk_level"]),
		fmt.Sprintf("Summary: %v", summary["summary"]),
		"",
		"Key Factors:",
	}
	if factors, ok := summary["key_factors"].([]string); ok {
		for _, item := range factors {
			lines = append(lines, "- "+item)
		}
	}
	lines = append(lines, "", "Recommended Actions:")
	if actions, ok := summary["recommended_actions"].([]string); ok {
		for _, item := range actions {
			lines = append(lines, "- "+item)
		}
	}
	lines = append(lines, "", "Timeline:")
	for _, item := range timeline {
		lines = append(lines, fmt.Sprintf("- [%s] %s | %s | %s", item.CreatedAt.Format("2006-01-02 15:04"), item.Type, item.RiskLevel, item.Summary))
	}
	lines = append(lines, "", fmt.Sprintf("Privacy Note: %v", summary["privacy_note"]))
	return strings.Join(lines, "\n")
}

type pdfReportLine struct {
	Text  string
	Size  int
	Bold  bool
	Space float64
}

func buildPDFReport(summary gin.H, timeline []RiskTimelineItem) []byte {
	lines := buildOfficialPDFLines(summary, timeline)
	pages := paginatePDFLines(lines)
	return renderSimplePDF(pages)
}

func buildOfficialPDFLines(summary gin.H, timeline []RiskTimelineItem) []pdfReportLine {
	now := time.Now()
	user := pdfMap(summary["user"])
	docNumber := fmt.Sprintf("NX-CASE-%s-%s", pdfValue(user["id"]), now.Format("200601021504"))

	lines := []pdfReportLine{
		{Text: "NEXUSMIND", Size: 18, Bold: true, Space: 10},
		{Text: "LAPORAN MONITORING RISIKO BURNOUT DAN PSIKOSOMATIS", Size: 15, Bold: true, Space: 14},
		{Text: "Klasifikasi: RAHASIA INTERNAL", Size: 11, Bold: true, Space: 6},
		{Text: "Nomor Dokumen: " + docNumber, Size: 10, Bold: false, Space: 4},
		{Text: "Tanggal Terbit: " + now.Format("02-01-2006 15:04 MST"), Size: 10, Bold: false, Space: 18},
		{Text: "IDENTITAS SUBJEK", Size: 12, Bold: true, Space: 6},
	}

	lines = appendPDFKV(lines, "Nama", pdfValue(user["nama"]))
	lines = appendPDFKV(lines, "Username", "@"+pdfValue(user["username"]))
	lines = appendPDFKV(lines, "Kategori", pdfValue(user["user_type"]))
	lines = appendPDFKV(lines, "Level Risiko", pdfValue(summary["risk_level"]))
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "RINGKASAN EKSEKUTIF", Size: 12, Bold: true, Space: 6})
	lines = appendWrappedPDF(lines, pdfValue(summary["summary"]), 94, 10, false)
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "FAKTOR UTAMA", Size: 12, Bold: true, Space: 6})
	lines = appendPDFBullets(lines, pdfStringSlice(summary["key_factors"]), "Belum ada faktor risiko tinggi yang menonjol.")
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "REKOMENDASI TINDAKAN", Size: 12, Bold: true, Space: 6})
	lines = appendPDFBullets(lines, pdfStringSlice(summary["recommended_actions"]), "Pantau berkala dan lakukan follow-up sesuai protokol internal.")
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "MODEL EXPLAINABILITY", Size: 12, Bold: true, Space: 6})
	explain := pdfMap(summary["model_explainability"])
	for _, key := range []string{"burnout_score", "psychosomatic_score", "curhat_stress", "curhat_burnout", "curhat_psychosomatic", "model_version"} {
		lines = appendPDFKV(lines, strings.ReplaceAll(key, "_", " "), pdfValue(explain[key]))
	}
	lines = appendPDFKV(lines, "Terapi pending", pdfValue(summary["pending_treatments"]))
	lines = appendPDFKV(lines, "Balasan belum dibaca", pdfValue(summary["unread_replies"]))
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "TIMELINE RISIKO TERPADU", Size: 12, Bold: true, Space: 6})
	if len(timeline) == 0 {
		lines = appendWrappedPDF(lines, "- Belum ada timeline risiko yang bisa ditampilkan.", 94, 10, false)
	} else {
		for i, item := range timeline {
			if i >= 30 {
				break
			}
			title := fmt.Sprintf("- %s | %s | %s | %.0f%%", item.CreatedAt.Format("02-01-2006 15:04"), item.Type, firstNonEmpty(item.RiskLevel, "Low"), item.Score*100)
			lines = appendWrappedPDF(lines, title, 94, 10, true)
			lines = appendWrappedPDF(lines, "  "+firstNonEmpty(item.Summary, item.Title), 94, 9, false)
			if item.Recommended != "" {
				lines = appendWrappedPDF(lines, "  Rekomendasi: "+item.Recommended, 94, 9, false)
			}
		}
	}
	lines = append(lines, pdfReportLine{Text: "", Size: 10, Space: 8})

	lines = append(lines, pdfReportLine{Text: "CATATAN PRIVASI DAN BATASAN", Size: 12, Bold: true, Space: 6})
	lines = appendWrappedPDF(lines, firstNonEmpty(pdfValue(summary["privacy_note"]), "Dokumen ini dipakai untuk monitoring internal dan bukan diagnosis medis."), 94, 10, false)
	lines = appendWrappedPDF(lines, "Akses dokumen hanya untuk admin berwenang. Tindak lanjut perlu mempertimbangkan konteks, persetujuan, dan protokol organisasi.", 94, 10, false)
	return lines
}

func appendPDFKV(lines []pdfReportLine, key string, value string) []pdfReportLine {
	return appendWrappedPDF(lines, fmt.Sprintf("%s: %s", key, firstNonEmpty(value, "-")), 94, 10, false)
}

func appendPDFBullets(lines []pdfReportLine, items []string, fallback string) []pdfReportLine {
	if len(items) == 0 {
		items = []string{fallback}
	}
	for _, item := range items {
		lines = appendWrappedPDF(lines, "- "+item, 94, 10, false)
	}
	return lines
}

func appendWrappedPDF(lines []pdfReportLine, text string, width int, size int, bold bool) []pdfReportLine {
	wrapped := wrapPDFText(text, width)
	if len(wrapped) == 0 {
		return append(lines, pdfReportLine{Text: "", Size: size, Bold: bold, Space: 4})
	}
	for _, line := range wrapped {
		lines = append(lines, pdfReportLine{Text: line, Size: size, Bold: bold, Space: 3})
	}
	return lines
}

func wrapPDFText(text string, width int) []string {
	text = cleanPDFText(text)
	if strings.TrimSpace(text) == "" {
		return []string{}
	}
	words := strings.Fields(text)
	lines := []string{}
	current := ""
	for _, word := range words {
		if current == "" {
			current = word
			continue
		}
		if len(current)+1+len(word) > width {
			lines = append(lines, current)
			current = word
			continue
		}
		current += " " + word
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

func paginatePDFLines(lines []pdfReportLine) [][]pdfReportLine {
	pages := [][]pdfReportLine{}
	page := []pdfReportLine{}
	used := 0.0
	for _, line := range lines {
		height := float64(line.Size) + line.Space + 3
		if used+height > 665 && len(page) > 0 {
			pages = append(pages, page)
			page = []pdfReportLine{}
			used = 0
		}
		page = append(page, line)
		used += height
	}
	if len(page) > 0 {
		pages = append(pages, page)
	}
	if len(pages) == 0 {
		pages = append(pages, []pdfReportLine{{Text: "NEXUSMIND CASE REPORT", Size: 14, Bold: true}})
	}
	return pages
}

func renderSimplePDF(pages [][]pdfReportLine) []byte {
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
	}
	kids := []string{}
	for pageIndex, lines := range pages {
		content := renderPDFPageContent(lines, pageIndex+1, len(pages))
		contentObjectNumber := len(objects) + 1
		objects = append(objects, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content))
		pageObjectNumber := len(objects) + 1
		objects = append(objects, fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>", contentObjectNumber))
		kids = append(kids, fmt.Sprintf("%d 0 R", pageObjectNumber))
	}
	objects[1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(kids))

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	for i, object := range objects {
		offsets = append(offsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xrefOffset := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i < len(offsets); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", len(objects)+1, xrefOffset)
	return buf.Bytes()
}

func renderPDFPageContent(lines []pdfReportLine, pageNumber int, totalPages int) string {
	var buf bytes.Buffer
	buf.WriteString("0.06 w\n")
	buf.WriteString("0.10 0.12 0.18 RG\n")
	buf.WriteString("44 58 507 724 re S\n")
	buf.WriteString(pdfText(56, 805, 9, true, "NEXUSMIND CONFIDENTIAL CASE REPORT"))
	buf.WriteString(pdfText(56, 790, 8, false, "Dokumen monitoring internal. Bukan diagnosis medis."))
	buf.WriteString(pdfText(455, 805, 8, false, fmt.Sprintf("Halaman %d/%d", pageNumber, totalPages)))
	y := 752.0
	for _, line := range lines {
		if strings.TrimSpace(line.Text) == "" {
			y -= line.Space + 6
			continue
		}
		buf.WriteString(pdfText(62, y, line.Size, line.Bold, line.Text))
		y -= float64(line.Size) + line.Space + 3
	}
	buf.WriteString(pdfText(56, 38, 8, false, "Dicetak otomatis oleh NexusMind Risk Center. Validasi akhir tetap dilakukan oleh admin berwenang."))
	return buf.String()
}

func pdfText(x float64, y float64, size int, bold bool, text string) string {
	font := "F1"
	if bold {
		font = "F2"
	}
	return fmt.Sprintf("BT /%s %d Tf %.1f %.1f Td (%s) Tj ET\n", font, size, x, y, escapePDFString(cleanPDFText(text)))
}

func escapePDFString(text string) string {
	text = strings.ReplaceAll(text, "\\", "\\\\")
	text = strings.ReplaceAll(text, "(", "\\(")
	text = strings.ReplaceAll(text, ")", "\\)")
	return text
}

func cleanPDFText(text string) string {
	text = strings.ReplaceAll(text, "\r", " ")
	text = strings.ReplaceAll(text, "\n", " ")
	var builder strings.Builder
	for _, r := range text {
		if r >= 32 && r <= 126 {
			builder.WriteRune(r)
		} else {
			builder.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(builder.String()), " ")
}

func pdfMap(value interface{}) gin.H {
	switch typed := value.(type) {
	case gin.H:
		return typed
	case map[string]interface{}:
		return gin.H(typed)
	default:
		return gin.H{}
	}
}

func pdfStringSlice(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		items := []string{}
		for _, item := range typed {
			items = append(items, pdfValue(item))
		}
		return items
	default:
		return []string{}
	}
}

func pdfValue(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case float64:
		return fmt.Sprintf("%.2f", typed)
	case float32:
		return fmt.Sprintf("%.2f", typed)
	case int:
		return fmt.Sprintf("%d", typed)
	case int64:
		return fmt.Sprintf("%d", typed)
	case uint:
		return fmt.Sprintf("%d", typed)
	case uint64:
		return fmt.Sprintf("%d", typed)
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func recoveryFocusFromSignals(prediction Prediction, curhat Curhat, checkins []DailyCheckIn) []string {
	focus := []string{}
	if prediction.BurnoutScore >= 6 || curhat.BurnoutScore >= 0.62 {
		focus = append(focus, "Kurangi beban dan pulihkan energi sebelum menambah target baru")
	}
	if prediction.PsychosomaticScore >= 6 || curhat.PsychosomaticScore >= 0.58 {
		focus = append(focus, "Pantau keluhan fisik dan kualitas tidur lebih dekat")
	}
	if curhat.StressScore >= 0.65 {
		focus = append(focus, "Gunakan journaling pendek untuk memecah tekanan menjadi langkah kecil")
	}
	for _, item := range checkins {
		if item.SleepHours < 5 {
			focus = append(focus, "Utamakan perbaikan tidur dalam 48 jam ke depan")
			break
		}
	}
	if len(focus) == 0 {
		focus = append(focus, "Pertahankan rutinitas stabil dan lakukan check-in harian")
	}
	return sanitizeStringSlice(focus, 4)
}

func generateRecoveryPlan(user User, risk string, prediction Prediction, curhat Curhat, checkins []DailyCheckIn, timeline []RiskTimelineItem, aiEnabled bool) RecoveryPlanAI {
	fallback := buildLocalRecoveryPlan(risk, prediction, curhat, checkins)
	if !aiEnabled || os.Getenv("OPENROUTER_API_KEY") == "" {
		return fallback
	}

	timelinePayload := []gin.H{}
	for _, item := range timeline {
		timelinePayload = append(timelinePayload, gin.H{
			"type":       item.Type,
			"title":      item.Title,
			"summary":    item.Summary,
			"risk_level": item.RiskLevel,
			"score":      item.Score,
			"created_at": item.CreatedAt,
		})
		if len(timelinePayload) >= 10 {
			break
		}
	}
	payload, _ := json.Marshal(gin.H{
		"user": gin.H{
			"name": user.Nama,
		},
		"risk_level": risk,
		"latest_prediction": gin.H{
			"burnout_score":       prediction.BurnoutScore,
			"psychosomatic_score": prediction.PsychosomaticScore,
			"risk_level":          prediction.RiskLevel,
			"model_version":       prediction.ModelVersion,
		},
		"latest_curhat": gin.H{
			"stress":        curhat.StressScore,
			"burnout":       curhat.BurnoutScore,
			"psychosomatic": curhat.PsychosomaticScore,
			"risk_level":    curhat.RiskLevel,
			"summary":       curhat.AdminSummary,
			"crisis_flag":   curhat.CrisisFlag,
		},
		"checkins":      checkins,
		"timeline":      timelinePayload,
		"local_plan":    fallback,
		"current_time":  time.Now().Format(time.RFC3339),
		"safety_notice": "Tidak boleh memberi diagnosis medis. Bila ada sinyal krisis, arahkan ke orang terpercaya/profesional/bantuan darurat setempat.",
	})

	requestBody, _ := json.Marshal(gin.H{
		"model": "openai/gpt-4o-mini",
		"messages": []map[string]string{
			{
				"role": "system",
				"content": `Kamu adalah AI recovery coach di NexusMind. Buat rencana pemulihan personal yang presisi, realistis, dan aman.
Gunakan data asesmen, curhat, check-in, dan timeline. Jangan membuat diagnosis medis atau klaim menyembuhkan.
Kembalikan JSON valid dengan schema:
{
  "ai_summary": "ringkasan 2 kalimat yang spesifik dan menenangkan",
  "capacity_label": "Rendah|Sedang|Stabil",
  "focus": ["3-4 fokus utama"],
  "plan": [{"day":"Hari 1","title":"...","body":"...","category":"...","intensity":"ringan|sedang"}],
  "micro_actions": [{"title":"...","duration":"5 menit","reason":"..."}],
  "schedule": [{"time":"08:00","title":"...","duration":"10 menit","reason":"..."}],
  "suggested_checkin": {"mood_score": 1-5, "energy_score": 1-5, "sleep_hours": 0-16, "stress_score": 1-5, "notes": "catatan awal singkat", "confidence": 0.0, "reason": "alasan inferensi"},
  "safety_flags": ["..."],
  "ai_source": "ai"
}
Plan wajib 7 hari. Micro actions 3-5 item. Schedule 3-4 blok hari ini.
Suggested check-in harus otomatis diinferensi dari data terbaru, konservatif, dan boleh diedit user. Bahasa Indonesia natural dan ringkas.`,
			},
			{"role": "user", "content": string(payload)},
		},
		"max_tokens":      1000,
		"temperature":     0.35,
		"response_format": gin.H{"type": "json_object"},
	})

	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(requestBody))
	if err != nil {
		return fallback
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENROUTER_API_KEY"))
	req.Header.Set("HTTP-Referer", "http://localhost:5173")
	req.Header.Set("X-Title", "NexusMind Recovery Plan")

	client := &http.Client{Timeout: 18 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fallback
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fallback
	}

	var raw struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &raw); err != nil || len(raw.Choices) == 0 {
		return fallback
	}
	var candidate RecoveryPlanAI
	if err := json.Unmarshal([]byte(raw.Choices[0].Message.Content), &candidate); err != nil {
		return fallback
	}
	candidate = sanitizeRecoveryPlan(candidate, fallback)
	if len(candidate.Plan) < 7 {
		return fallback
	}
	return candidate
}

func buildLocalRecoveryPlan(risk string, prediction Prediction, curhat Curhat, checkins []DailyCheckIn) RecoveryPlanAI {
	focus := recoveryFocusFromSignals(prediction, curhat, checkins)
	capacity := "Stabil"
	if risk == "High" || risk == "Crisis" || curhat.StressScore >= 0.7 || prediction.BurnoutScore >= 7 {
		capacity = "Rendah"
	} else if risk == "Medium" || prediction.BurnoutScore >= 4 || curhat.StressScore >= 0.45 {
		capacity = "Sedang"
	}
	plan := []RecoveryPlanDay{
		{Day: "Hari 1", Title: "Reset beban utama", Body: "Pilih satu tanggung jawab paling mendesak, pecah jadi langkah 20 menit, lalu berhenti sejenak.", Category: "prioritas", Intensity: "ringan"},
		{Day: "Hari 2", Title: "Check-in tubuh", Body: "Catat tidur, energi, dan keluhan fisik. Bila sesak, nyeri, atau insomnia menetap, pertimbangkan bantuan profesional.", Category: "psikosomatis", Intensity: "ringan"},
		{Day: "Hari 3", Title: "Jeda sosial aman", Body: "Hubungi satu orang tepercaya dan kirim pesan singkat tentang kondisi kamu.", Category: "dukungan", Intensity: "ringan"},
		{Day: "Hari 4", Title: "Pemulihan energi", Body: "Buat blok istirahat 30 menit tanpa tuntutan produktivitas.", Category: "recovery", Intensity: "ringan"},
		{Day: "Hari 5", Title: "Refleksi pola", Body: "Lihat timeline risiko dan tandai pemicu yang paling sering muncul.", Category: "insight", Intensity: "sedang"},
		{Day: "Hari 6", Title: "Tindak lanjut admin", Body: "Balas rekomendasi terapi yang masih pending dengan progres atau kendala.", Category: "terapi", Intensity: "ringan"},
		{Day: "Hari 7", Title: "Evaluasi ringan", Body: "Isi kuisioner atau check-in ulang untuk melihat apakah risiko turun, stabil, atau naik.", Category: "evaluasi", Intensity: "sedang"},
	}
	safety := []string{"Rencana ini bukan diagnosis medis", "Cari bantuan profesional bila gejala berat atau menetap"}
	if curhat.CrisisFlag || risk == "Crisis" {
		safety = append([]string{"Hubungi orang tepercaya atau bantuan darurat setempat bila ada risiko keselamatan"}, safety...)
	}
	return RecoveryPlanAI{
		AISummary:        recoveryLocalSummary(risk, capacity),
		AISource:         "local-fallback",
		Focus:            focus,
		Plan:             plan,
		MicroActions:     buildLocalMicroActions(capacity),
		Schedule:         buildLocalRecoverySchedule(capacity),
		SuggestedCheckIn: buildLocalSuggestedCheckIn(risk, capacity, prediction, curhat, checkins),
		SafetyFlags:      safety,
		CapacityLabel:    capacity,
	}
}

func recoveryLocalSummary(risk string, capacity string) string {
	if risk == "High" || risk == "Crisis" {
		return "Sistem membaca kapasitas hari ini perlu dijaga ketat. Fokus utama adalah menurunkan beban, menjaga keselamatan, dan membuat langkah kecil yang bisa diselesaikan."
	}
	if risk == "Medium" {
		return "Ada sinyal tekanan yang perlu dipantau sebelum naik. Rencana ini menjaga ritme harian tetap ringan, jelas, dan bisa diulang."
	}
	return "Kondisi terakhir relatif stabil. Rencana ini membantu mempertahankan ritme sehat dan menangkap perubahan lebih dini."
}

func buildLocalMicroActions(capacity string) []RecoveryMicroAction {
	if capacity == "Rendah" {
		return []RecoveryMicroAction{
			{Title: "Minum air dan duduk tegak", Duration: "3 menit", Reason: "Menurunkan beban awal tanpa perlu berpikir panjang"},
			{Title: "Tulis satu hal paling berat", Duration: "5 menit", Reason: "Memindahkan tekanan dari kepala ke catatan"},
			{Title: "Kirim pesan ke orang tepercaya", Duration: "5 menit", Reason: "Membuka dukungan ketika kapasitas sedang tipis"},
		}
	}
	return []RecoveryMicroAction{
		{Title: "Napas 4-4-6", Duration: "4 menit", Reason: "Membantu tubuh turun dari mode waspada"},
		{Title: "Pilih satu tugas kecil", Duration: "10 menit", Reason: "Membangun rasa kendali tanpa memaksa diri"},
		{Title: "Rapikan area kerja kecil", Duration: "7 menit", Reason: "Mengurangi distraksi visual"},
	}
}

func buildLocalRecoverySchedule(capacity string) []RecoveryScheduleBlock {
	if capacity == "Rendah" {
		return []RecoveryScheduleBlock{
			{Time: "09:00", Title: "Check-in tubuh", Duration: "5 menit", Reason: "Mulai hari dengan membaca kapasitas"},
			{Time: "13:00", Title: "Jeda tanpa layar", Duration: "15 menit", Reason: "Memberi sistem saraf ruang turun"},
			{Time: "20:30", Title: "Catatan penutup", Duration: "8 menit", Reason: "Menutup hari tanpa menumpuk pikiran"},
		}
	}
	return []RecoveryScheduleBlock{
		{Time: "08:30", Title: "Prioritas kecil", Duration: "10 menit", Reason: "Menentukan satu target realistis"},
		{Time: "12:30", Title: "Pemulihan energi", Duration: "20 menit", Reason: "Menjaga stamina sebelum sore"},
		{Time: "19:30", Title: "Review ringan", Duration: "10 menit", Reason: "Melihat progres dan sinyal tubuh"},
	}
}

func buildLocalSuggestedCheckIn(risk string, capacity string, prediction Prediction, curhat Curhat, checkins []DailyCheckIn) RecoverySuggestedCheckIn {
	mood, energy, stress, sleep := 4, 4, 2, 7.0
	confidence := 0.55
	reason := "Saran awal dibuat dari sinyal risiko terakhir dan bisa diedit sebelum disimpan."
	if len(checkins) > 0 {
		latest := checkins[0]
		mood = latest.MoodScore
		energy = latest.EnergyScore
		stress = latest.StressScore
		sleep = latest.SleepHours
		confidence = 0.72
		reason = "Menggunakan check-in terakhir sebagai baseline, lalu disesuaikan dengan sinyal risiko terbaru."
	}
	if capacity == "Rendah" || risk == "High" || risk == "Crisis" {
		mood = clampInt(minInt(mood, 2), 1, 5)
		energy = clampInt(minInt(energy, 2), 1, 5)
		stress = clampInt(maxInt(stress, 4), 1, 5)
		if sleep > 6 {
			sleep = 5.5
		}
		confidence = mathMax(confidence, 0.76)
		reason = "AI membaca kapasitas rendah dari risiko tinggi, curhat, atau skor burnout sehingga check-in disetel lebih waspada."
	} else if risk == "Medium" || prediction.BurnoutScore >= 4 || curhat.StressScore >= 0.45 {
		mood = clampInt(minInt(mood, 3), 1, 5)
		energy = clampInt(minInt(energy, 3), 1, 5)
		stress = clampInt(maxInt(stress, 3), 1, 5)
		confidence = mathMax(confidence, 0.68)
		reason = "AI membaca tekanan sedang sehingga check-in disetel sebagai baseline pemantauan."
	}
	notes := fmt.Sprintf("Check-in AI: kapasitas %s, risiko %s. Edit bila tidak sesuai kondisi hari ini.", strings.ToLower(capacity), strings.ToLower(risk))
	if curhat.PsychosomaticScore >= 0.58 || prediction.PsychosomaticScore >= 6 {
		notes += " Perhatikan keluhan fisik dan kualitas tidur."
	}
	return RecoverySuggestedCheckIn{
		MoodScore:   mood,
		EnergyScore: energy,
		SleepHours:  clampFloat(sleep, 0, 16),
		StressScore: stress,
		Notes:       truncateString(notes, 260),
		Confidence:  clampFloat(confidence, 0.35, 0.95),
		Reason:      reason,
	}
}

func sanitizeRecoveryPlan(candidate RecoveryPlanAI, fallback RecoveryPlanAI) RecoveryPlanAI {
	candidate.AISummary = truncateString(strings.TrimSpace(firstNonEmpty(candidate.AISummary, fallback.AISummary)), 420)
	candidate.AISource = firstNonEmpty(candidate.AISource, "ai")
	candidate.CapacityLabel = firstNonEmpty(candidate.CapacityLabel, fallback.CapacityLabel)
	candidate.Focus = sanitizeStringSlice(append(candidate.Focus, fallback.Focus...), 4)
	candidate.SafetyFlags = sanitizeStringSlice(append(candidate.SafetyFlags, fallback.SafetyFlags...), 4)
	if len(candidate.Plan) == 0 {
		candidate.Plan = fallback.Plan
	}
	for i := range candidate.Plan {
		candidate.Plan[i].Day = truncateString(firstNonEmpty(candidate.Plan[i].Day, fmt.Sprintf("Hari %d", i+1)), 24)
		candidate.Plan[i].Title = truncateString(firstNonEmpty(candidate.Plan[i].Title, fallback.Plan[minInt(i, len(fallback.Plan)-1)].Title), 80)
		candidate.Plan[i].Body = truncateString(firstNonEmpty(candidate.Plan[i].Body, fallback.Plan[minInt(i, len(fallback.Plan)-1)].Body), 240)
		candidate.Plan[i].Category = truncateString(firstNonEmpty(candidate.Plan[i].Category, "recovery"), 32)
		candidate.Plan[i].Intensity = truncateString(firstNonEmpty(candidate.Plan[i].Intensity, "ringan"), 24)
	}
	candidate.MicroActions = sanitizeRecoveryMicroActions(candidate.MicroActions, fallback.MicroActions)
	candidate.Schedule = sanitizeRecoverySchedule(candidate.Schedule, fallback.Schedule)
	candidate.SuggestedCheckIn = sanitizeSuggestedCheckIn(candidate.SuggestedCheckIn, fallback.SuggestedCheckIn)
	return candidate
}

func sanitizeSuggestedCheckIn(item RecoverySuggestedCheckIn, fallback RecoverySuggestedCheckIn) RecoverySuggestedCheckIn {
	if item.MoodScore == 0 && item.EnergyScore == 0 && item.StressScore == 0 && item.SleepHours == 0 {
		return fallback
	}
	item.MoodScore = clampInt(firstNonZeroInt(item.MoodScore, fallback.MoodScore), 1, 5)
	item.EnergyScore = clampInt(firstNonZeroInt(item.EnergyScore, fallback.EnergyScore), 1, 5)
	item.StressScore = clampInt(firstNonZeroInt(item.StressScore, fallback.StressScore), 1, 5)
	if item.SleepHours <= 0 {
		item.SleepHours = fallback.SleepHours
	}
	item.SleepHours = clampFloat(item.SleepHours, 0, 16)
	item.Notes = truncateString(firstNonEmpty(item.Notes, fallback.Notes), 320)
	item.Reason = truncateString(firstNonEmpty(item.Reason, fallback.Reason), 260)
	item.Confidence = clampFloat(mathMax(item.Confidence, fallback.Confidence*0.85), 0.30, 0.98)
	return item
}

func firstNonZeroInt(value int, fallback int) int {
	if value != 0 {
		return value
	}
	return fallback
}

func sanitizeRecoveryMicroActions(items []RecoveryMicroAction, fallback []RecoveryMicroAction) []RecoveryMicroAction {
	if len(items) == 0 {
		return fallback
	}
	result := []RecoveryMicroAction{}
	for _, item := range items {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}
		result = append(result, RecoveryMicroAction{
			Title:    truncateString(title, 80),
			Duration: truncateString(firstNonEmpty(item.Duration, "5 menit"), 24),
			Reason:   truncateString(item.Reason, 160),
		})
		if len(result) >= 5 {
			break
		}
	}
	if len(result) == 0 {
		return fallback
	}
	return result
}

func sanitizeRecoverySchedule(items []RecoveryScheduleBlock, fallback []RecoveryScheduleBlock) []RecoveryScheduleBlock {
	if len(items) == 0 {
		return fallback
	}
	result := []RecoveryScheduleBlock{}
	for _, item := range items {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}
		result = append(result, RecoveryScheduleBlock{
			Time:     truncateString(firstNonEmpty(item.Time, "09:00"), 12),
			Title:    truncateString(title, 80),
			Duration: truncateString(firstNonEmpty(item.Duration, "10 menit"), 24),
			Reason:   truncateString(item.Reason, 160),
		})
		if len(result) >= 4 {
			break
		}
	}
	if len(result) == 0 {
		return fallback
	}
	return result
}

func parseUintParam(c *gin.Context, key string) (uint, bool) {
	value, err := strconv.ParseUint(c.Param(key), 10, 64)
	if err != nil || value == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return 0, false
	}
	return uint(value), true
}

func normalizeRiskScore(risk string, scores ...float64) float64 {
	maxScore := 0.0
	for _, score := range scores {
		if score > maxScore {
			maxScore = score
		}
	}
	switch risk {
	case "Crisis":
		maxScore = mathMax(maxScore, 0.92)
	case "High":
		maxScore = mathMax(maxScore, 0.72)
	case "Medium":
		maxScore = mathMax(maxScore, 0.45)
	case "Low":
		maxScore = mathMax(maxScore, 0.20)
	}
	return clampFloat(maxScore, 0, 1)
}

func riskFromNormalized(score float64) string {
	switch {
	case score >= 0.88:
		return "Crisis"
	case score >= 0.68:
		return "High"
	case score >= 0.38:
		return "Medium"
	default:
		return "Low"
	}
}

func severityFromRisk(risk string, score float64) string {
	if risk == "Crisis" || score >= 0.88 {
		return "urgent"
	}
	if risk == "High" || score >= 0.68 {
		return "high"
	}
	return "medium"
}

func recommendationForRisk(risk string) string {
	switch risk {
	case "Crisis":
		return "Prioritaskan kontak aman dan bantuan profesional bila ada risiko keselamatan."
	case "High":
		return "Kirim tindak lanjut admin dan rencana pemulihan terstruktur."
	case "Medium":
		return "Pantau ulang dalam beberapa hari dan dorong check-in harian."
	default:
		return "Pertahankan pemantauan ringan dan rutinitas protektif."
	}
}

func checkInRiskScore(checkin DailyCheckIn) float64 {
	score := 0.0
	score += float64(checkin.StressScore-1) / 4 * 0.38
	score += float64(5-checkin.MoodScore) / 4 * 0.25
	score += float64(5-checkin.EnergyScore) / 4 * 0.20
	if checkin.SleepHours < 4 {
		score += 0.20
	} else if checkin.SleepHours < 6 {
		score += 0.10
	}
	return clampFloat(score, 0, 1)
}

func moodSeverity(mood string) string {
	if mood == "worse" {
		return "high"
	}
	return "medium"
}

func moodScore(mood string) float64 {
	if mood == "worse" {
		return 0.72
	}
	return 0.42
}

func severityRank(severity string) int {
	switch severity {
	case "urgent":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func countWarningsBySeverity(items []EarlyWarningItem, severity string) int {
	count := 0
	for _, item := range items {
		if item.Severity == severity {
			count++
		}
	}
	return count
}

func mathMax(a float64, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
