package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func CurhatSubmitHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}
	var input struct {
		Text            string `json:"text"`
		Mode            string `json:"mode"`
		AttachmentName  string `json:"attachment_name"`
		AttachmentType  string `json:"attachment_type"`
		AttachmentData  string `json:"attachment_data"`
		AttachmentText  string `json:"attachment_text"`
		VoiceTranscript string `json:"voice_transcript"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	input.Text = strings.TrimSpace(input.Text)
	input.AttachmentName = strings.TrimSpace(input.AttachmentName)
	input.AttachmentType = strings.TrimSpace(input.AttachmentType)
	input.AttachmentText = strings.TrimSpace(input.AttachmentText)
	input.VoiceTranscript = strings.TrimSpace(input.VoiceTranscript)
	if input.Text == "" && input.VoiceTranscript == "" && input.AttachmentData == "" && input.AttachmentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tulis curhat, kirim transkrip suara, atau lampirkan file terlebih dahulu"})
		return
	}
	if len(input.AttachmentData) > 8*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lampiran terlalu besar. Maksimal sekitar 4 MB"})
		return
	}

	// Fetch recent messages for conversational memory and risk continuity.
	var history []Curhat
	DB.Where("user_id = ?", user.ID).Order("id desc").Limit(12).Find(&history)
	// Reverse history to be chronological
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	input.AttachmentText = truncateString(input.AttachmentText, 16000)
	attachmentContext := buildAttachmentContext(input.AttachmentName, input.AttachmentType, input.AttachmentText, input.VoiceTranscript)
	systemContext := buildCurhatSystemContext(user)
	agentIntent := detectCurhatAgentIntent(input.Text, attachmentContext, systemContext)
	analysisText := strings.TrimSpace(input.Text + "\n" + input.VoiceTranscript + "\n" + input.AttachmentText)
	if analysisText == "" {
		analysisText = attachmentContext
	}
	initialStress := analyzeStressLevel(analysisText)
	aiResponse := "Respon otomatis sedang dinonaktifkan oleh admin. Pesan Anda tetap tersimpan dengan aman."
	aiMode := normalizeCurhatAIMode(input.Mode)
	analysis := analyzeCurhatClinicalSignals(strings.TrimSpace(analysisText+"\n"+attachmentContext), history, initialStress)
	analysis.AgentInsights = localAgentInsights(analysis, agentIntent, systemContext)
	if config.AIResponseEnabled {
		aiResponse, analysis = generateCurhatClinicalResponse(input.Text, history, initialStress, aiMode, attachmentContext, systemContext, input.AttachmentData, input.AttachmentType)
	}

	redFlagsJSON, _ := json.Marshal(analysis.RedFlags)
	recommendationsJSON, _ := json.Marshal(analysis.Recommendations)
	userNextStepsJSON, _ := json.Marshal(analysis.UserNextSteps)
	keywordAnalysisJSON, _ := json.Marshal(analysis.KeywordInsights)
	agentInsightsJSON, _ := json.Marshal(analysis.AgentInsights)
	memorySummary := buildCurhatMemorySummary(append(history, Curhat{
		Text:               input.Text,
		StressScore:        analysis.StressScore,
		BurnoutScore:       analysis.BurnoutScore,
		PsychosomaticScore: analysis.PsychosomaticScore,
		RiskLevel:          analysis.RiskLevel,
		CrisisFlag:         analysis.CrisisFlag,
	}))
	curhat := Curhat{
		UserID:              user.ID,
		Text:                input.Text,
		Image:               imageDataForCurhat(input.AttachmentType, input.AttachmentData),
		AttachmentName:      input.AttachmentName,
		AttachmentType:      input.AttachmentType,
		AttachmentData:      input.AttachmentData,
		AttachmentText:      input.AttachmentText,
		VoiceTranscript:     input.VoiceTranscript,
		MemorySummary:       memorySummary,
		KeywordAnalysisJSON: string(keywordAnalysisJSON),
		AgentInsightsJSON:   string(agentInsightsJSON),
		StressScore:         analysis.StressScore,
		BurnoutScore:        analysis.BurnoutScore,
		PsychosomaticScore:  analysis.PsychosomaticScore,
		RiskLevel:           analysis.RiskLevel,
		AnalysisConfidence:  analysis.Confidence,
		CrisisFlag:          analysis.CrisisFlag,
		AdminPriority:       analysis.AdminPriority,
		AdminStatus:         "new",
		AdminSummary:        analysis.AdminSummary,
		RedFlagsJSON:        string(redFlagsJSON),
		RecommendationsJSON: string(recommendationsJSON),
		UserNextStepsJSON:   string(userNextStepsJSON),
		AnalysisSource:      analysis.Source,
		AIMode:              aiMode,
		IsAnonymous:         true,
		AIResponse:          aiResponse,
	}
	DB.Create(&curhat)
	notifyAdminsForCurhatAnalysis(user, curhat, analysis)
	createCurhatTreatmentIfNeeded(user, curhat, analysis)

	c.JSON(http.StatusOK, gin.H{"status": "success", "curhat": curhat})
}

func CurhatReplyHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	curhatID := c.Param("id")

	var input struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var curhat Curhat
	if err := DB.First(&curhat, curhatID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Curhat not found"})
		return
	}

	reply := CurhatReply{
		CurhatID: curhat.ID,
		UserID:   user.ID,
		Text:     input.Text,
	}
	DB.Create(&reply)

	if curhat.UserID != user.ID {
		notification := Notification{
			UserID:  curhat.UserID,
			Type:    "reply",
			Message: "Seseorang membalas curhatan anonim Anda.",
		}
		DB.Create(&notification)
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "reply": reply})
}

func UserCurhatHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var curhats []Curhat
	DB.Where("user_id = ?", user.ID).Order("timestamp asc").Find(&curhats)
	c.JSON(http.StatusOK, gin.H{"curhats": curhats})
}

func imageDataForCurhat(attachmentType string, attachmentData string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(attachmentType)), "image/") {
		return attachmentData
	}
	return ""
}

func buildCurhatSystemContext(user User) string {
	context := map[string]interface{}{
		"profile": map[string]interface{}{
			"user_id":   user.ID,
			"nama":      user.Nama,
			"username":  user.Username,
			"role":      user.Role,
			"bio":       truncateString(user.Bio, 260),
		},
	}
	agentEvidence := []string{fmt.Sprintf("User teridentifikasi dengan role %s.", firstNonEmpty(user.Role, "user"))}
	agentActions := []string{}
	agentPriority := "normal"
	agentDataQuality := "cukup"

	var assessmentCount int64
	var predictionCount int64
	var curhatCount int64
	var highCurhatCount int64
	var pendingTreatmentCount int64
	var unreadNotificationCount int64
	DB.Model(&Assessment{}).Where("user_id = ?", user.ID).Count(&assessmentCount)
	DB.Model(&Prediction{}).Where("user_id = ?", user.ID).Count(&predictionCount)
	DB.Model(&Curhat{}).Where("user_id = ?", user.ID).Count(&curhatCount)
	DB.Model(&Curhat{}).Where("user_id = ? AND (risk_level IN ? OR crisis_flag = ?)", user.ID, []string{"High", "Crisis"}, true).Count(&highCurhatCount)
	DB.Model(&TherapyRecommendation{}).Where("user_id = ? AND status = ?", user.ID, "pending").Count(&pendingTreatmentCount)
	DB.Model(&Notification{}).Where("user_id = ? AND is_read = ?", user.ID, false).Count(&unreadNotificationCount)
	context["personal_counts"] = map[string]interface{}{
		"assessments":          assessmentCount,
		"predictions":          predictionCount,
		"curhats":              curhatCount,
		"high_risk_curhats":    highCurhatCount,
		"pending_treatments":   pendingTreatmentCount,
		"unread_notifications": unreadNotificationCount,
	}
	if assessmentCount == 0 {
		agentDataQuality = "rendah"
		agentActions = append(agentActions, "Minta user mengisi asesmen agar pembacaan kondisi lebih presisi.")
	}
	if pendingTreatmentCount > 0 {
		agentActions = append(agentActions, fmt.Sprintf("Ingatkan ada %d saran terapi/admin yang masih aktif.", pendingTreatmentCount))
	}
	if highCurhatCount > 0 {
		agentPriority = "monitoring"
		agentEvidence = append(agentEvidence, fmt.Sprintf("Ada %d riwayat curhat risiko tinggi/krisis.", highCurhatCount))
	}

	var latestAssessment Assessment
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestAssessment).Error; err == nil {
		agentEvidence = append(agentEvidence, fmt.Sprintf("Asesmen terbaru: fatigue %.0f, cynicism %.0f, efficacy %.0f, NLP stress %.0f.", latestAssessment.FatigueScore, latestAssessment.CynicismScore, latestAssessment.EfficacyScore, latestAssessment.NLPStressScore))
		if latestAssessment.FatigueScore >= 7 || latestAssessment.CynicismScore >= 7 || latestAssessment.NLPStressScore >= 0.7 {
			agentPriority = "elevated"
			agentActions = append(agentActions, "Bahas faktor energi, sinisme, dan tekanan dari asesmen terbaru.")
		}
		context["latest_assessment"] = map[string]interface{}{
			"created_at":                 latestAssessment.Timestamp.Format(time.RFC3339),
			"order_type":                 latestAssessment.OrderType,
			"fatigue_score":              latestAssessment.FatigueScore,
			"cynicism_score":             latestAssessment.CynicismScore,
			"efficacy_score":             latestAssessment.EfficacyScore,
			"nlp_stress_score":           latestAssessment.NLPStressScore,
			"interference_score":         latestAssessment.InterferenceScore,
			"order_effect_score":         latestAssessment.OrderEffectScore,
			"cognitive_dissonance_score": latestAssessment.CognitiveDissonanceScore,
			"responses_json_preview":     truncateString(latestAssessment.ResponsesJSON, 900),
			"context_note":               "Gunakan sebagai gambaran asesmen terbaru user. Jangan sebut diagnosis.",
		}
	} else {
		context["latest_assessment"] = "belum ada asesmen tersimpan"
	}

	var latestPrediction Prediction
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestPrediction).Error; err == nil {
		agentEvidence = append(agentEvidence, fmt.Sprintf("Prediksi terbaru: risiko %s, burnout %.0f%%, psikosomatis %.0f%%.", latestPrediction.RiskLevel, latestPrediction.BurnoutScore*100, latestPrediction.PsychosomaticScore*100))
		if latestPrediction.RiskLevel == "High" || latestPrediction.RiskLevel == "Crisis" || latestPrediction.BurnoutScore >= 0.68 || latestPrediction.PsychosomaticScore >= 0.68 {
			agentPriority = "high"
			agentActions = append(agentActions, "Gunakan prediksi ML sebagai konteks monitoring dan sarankan tindak lanjut ringan.")
		}
		context["latest_prediction"] = map[string]interface{}{
			"created_at":           latestPrediction.Timestamp.Format(time.RFC3339),
			"risk_level":           latestPrediction.RiskLevel,
			"burnout_score":        latestPrediction.BurnoutScore,
			"psychosomatic_score":  latestPrediction.PsychosomaticScore,
			"model_version":        latestPrediction.ModelVersion,
			"linked_assessment_id": latestPrediction.AssessmentID,
		}
	} else {
		context["latest_prediction"] = "belum ada prediksi machine learning tersimpan"
	}

	var latestMBTI MBTIResult
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestMBTI).Error; err == nil {
		agentEvidence = append(agentEvidence, fmt.Sprintf("MBTI terbaru %s: %s.", latestMBTI.PersonalityType, truncateString(latestMBTI.Title, 80)))
		context["latest_mbti"] = map[string]interface{}{
			"created_at":      latestMBTI.Timestamp.Format(time.RFC3339),
			"type":            latestMBTI.PersonalityType,
			"title":           latestMBTI.Title,
			"summary":         truncateString(latestMBTI.Summary, 700),
			"strengths_json":  truncateString(latestMBTI.StrengthsJSON, 700),
			"watchouts_json":  truncateString(latestMBTI.WatchoutsJSON, 700),
			"dimensions_json": truncateString(latestMBTI.DimensionsJSON, 700),
			"question_set":    latestMBTI.QuestionSet,
			"source":          latestMBTI.Source,
		}
	} else {
		context["latest_mbti"] = "belum ada hasil MBTI tersimpan"
	}

	var checkins []DailyCheckIn
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").Limit(7).Find(&checkins)
	checkinPayload := []map[string]interface{}{}
	for _, item := range checkins {
		checkinPayload = append(checkinPayload, map[string]interface{}{
			"created_at":   item.Timestamp.Format(time.RFC3339),
			"mood_score":   item.MoodScore,
			"energy_score": item.EnergyScore,
			"sleep_hours":  item.SleepHours,
			"stress_score": item.StressScore,
			"notes":        truncateString(item.Notes, 360),
		})
	}
	if len(checkinPayload) == 0 {
		context["recent_checkins"] = "belum ada check-in recovery"
		agentActions = append(agentActions, "Ajak user melakukan check-in recovery hari ini.")
	} else {
		context["recent_checkins"] = checkinPayload
		latestCheckin := checkins[0]
		agentEvidence = append(agentEvidence, fmt.Sprintf("Check-in terbaru: mood %d/5, energi %d/5, tidur %.1f jam, stres %d/5.", latestCheckin.MoodScore, latestCheckin.EnergyScore, latestCheckin.SleepHours, latestCheckin.StressScore))
		if latestCheckin.StressScore >= 4 || latestCheckin.EnergyScore <= 2 || latestCheckin.SleepHours < 5.5 {
			agentPriority = "elevated"
			agentActions = append(agentActions, "Prioritaskan stabilisasi energi, tidur, dan beban hari ini.")
		}
	}

	var treatments []TherapyRecommendation
	DB.Where("user_id = ?", user.ID).Order("created_at DESC").Limit(8).Find(&treatments)
	treatmentPayload := []map[string]interface{}{}
	for _, item := range treatments {
		followUpDate := ""
		if item.FollowUpDate != nil {
			followUpDate = item.FollowUpDate.Format(time.RFC3339)
		}
		treatmentPayload = append(treatmentPayload, map[string]interface{}{
			"id":             item.ID,
			"module_name":    item.ModuleName,
			"category":       item.Category,
			"priority":       item.Priority,
			"duration":       item.Duration,
			"status":         item.Status,
			"follow_up_date": followUpDate,
			"created_at":     item.CreatedAt.Format(time.RFC3339),
		})
	}
	if len(treatmentPayload) == 0 {
		context["recent_treatments_from_admin"] = "belum ada rekomendasi terapi/admin"
	} else {
		context["recent_treatments_from_admin"] = treatmentPayload
	}

	var treatmentReplies []TreatmentReply
	DB.Where("user_id = ?", user.ID).Order("created_at DESC").Limit(8).Find(&treatmentReplies)
	replyPayload := []map[string]interface{}{}
	for _, item := range treatmentReplies {
		replyPayload = append(replyPayload, map[string]interface{}{
			"treatment_id": item.TherapyRecommendationID,
			"created_at":   item.CreatedAt.Format(time.RFC3339),
			"mood":         item.Mood,
			"text":         truncateString(item.Text, 420),
			"admin_seen":   item.AdminSeen,
		})
	}
	if len(replyPayload) == 0 {
		context["recent_treatment_replies"] = "belum ada balasan user pada terapi"
	} else {
		context["recent_treatment_replies"] = replyPayload
		agentEvidence = append(agentEvidence, fmt.Sprintf("Ada %d balasan terbaru user pada saran terapi/admin.", len(replyPayload)))
	}

	var latestCurhats []Curhat
	DB.Where("user_id = ?", user.ID).Order("timestamp DESC").Limit(5).Find(&latestCurhats)
	curhatPayload := []map[string]interface{}{}
	for _, item := range latestCurhats {
		curhatPayload = append(curhatPayload, map[string]interface{}{
			"created_at":            item.Timestamp.Format(time.RFC3339),
			"risk_level":            item.RiskLevel,
			"stress_score":          item.StressScore,
			"burnout_score":         item.BurnoutScore,
			"psychosomatic_score":   item.PsychosomaticScore,
			"admin_priority":        item.AdminPriority,
			"admin_status":          item.AdminStatus,
			"memory_summary":        truncateString(item.MemorySummary, 450),
			"admin_summary":         truncateString(item.AdminSummary, 450),
			"keyword_analysis_json": truncateString(item.KeywordAnalysisJSON, 700),
		})
	}
	if len(curhatPayload) == 0 {
		context["recent_curhat_analytics"] = "belum ada analisis curhat sebelumnya"
	} else {
		context["recent_curhat_analytics"] = curhatPayload
	}

	var notifications []Notification
	DB.Where("user_id = ?", user.ID).Order("created_at DESC").Limit(5).Find(&notifications)
	notificationPayload := []map[string]interface{}{}
	for _, item := range notifications {
		notificationPayload = append(notificationPayload, map[string]interface{}{
			"type":       item.Type,
			"message":    truncateString(item.Message, 260),
			"is_read":    item.IsRead,
			"created_at": item.CreatedAt.Format(time.RFC3339),
		})
	}
	if len(notificationPayload) > 0 {
		context["recent_notifications"] = notificationPayload
	}

	if len(agentActions) == 0 {
		agentActions = append(agentActions, "Jawab pesan user langsung, lalu kaitkan dengan data sistem yang paling relevan.")
	}
	context["agent_brief"] = map[string]interface{}{
		"priority":            agentPriority,
		"data_quality":        agentDataQuality,
		"evidence":            sanitizeStringSlice(agentEvidence, 8),
		"recommended_actions": sanitizeStringSlice(agentActions, 8),
		"response_policy":     "Bersikap seperti agent pendamping: jawab kebutuhan utama user, gunakan bukti data sistem, susun prioritas, lalu beri langkah berikutnya yang bisa dilakukan.",
	}

	context["usage_rules"] = []string{
		"Ini adalah data internal NexusMind milik user yang sedang login.",
		"Gunakan data ini untuk mempersonalisasi jawaban dan menyebut bukti konteks yang relevan.",
		"Jika user bertanya tentang kondisi atau riwayat sistemnya, jawab berdasarkan data ini.",
		"Jika suatu data belum ada, katakan belum ada di sistem, jangan mengarang.",
		"Jangan membocorkan data user lain dan jangan menampilkan payload mentah berlebihan.",
	}

	raw, err := json.Marshal(context)
	if err != nil {
		return "{}"
	}
	return truncateString(string(raw), 9000)
}

func AdminCurhatAnalysisHandler(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	priority := strings.TrimSpace(c.Query("priority"))
	risk := strings.TrimSpace(c.Query("risk"))

	query := DB.Model(&Curhat{}).Where("risk_level <> ''")
	if status != "" && status != "all" {
		query = query.Where("admin_status = ?", status)
	}
	if priority != "" && priority != "all" {
		query = query.Where("admin_priority = ?", priority)
	}
	if risk != "" && risk != "all" {
		query = query.Where("risk_level = ?", risk)
	}

	var curhats []Curhat
	if err := query.Order("created_at DESC").Limit(120).Find(&curhats).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat analisis curhat"})
		return
	}

	type AdminCurhatDTO struct {
		ID                 uint                   `json:"id"`
		UserID             uint                   `json:"user_id"`
		UserName           string                 `json:"user_name"`
		Username           string                 `json:"username"`
		Text               string                 `json:"text"`
		AttachmentName     string                 `json:"attachment_name"`
		AttachmentType     string                 `json:"attachment_type"`
		AttachmentData     string                 `json:"attachment_data"`
		AttachmentText     string                 `json:"attachment_text"`
		VoiceTranscript    string                 `json:"voice_transcript"`
		MemorySummary      string                 `json:"memory_summary"`
		AIResponse         string                 `json:"ai_response"`
		StressScore        float64                `json:"stress_score"`
		BurnoutScore       float64                `json:"burnout_score"`
		PsychosomaticScore float64                `json:"psychosomatic_score"`
		RiskLevel          string                 `json:"risk_level"`
		Confidence         float64                `json:"confidence"`
		CrisisFlag         bool                   `json:"crisis_flag"`
		AdminPriority      string                 `json:"admin_priority"`
		AdminStatus        string                 `json:"admin_status"`
		AdminSummary       string                 `json:"admin_summary"`
		RedFlags           []string               `json:"red_flags"`
		Recommendations    []string               `json:"recommendations"`
		KeywordInsights    []CurhatKeywordInsight `json:"keyword_insights"`
		AgentInsights      []CurhatAgentInsight   `json:"agent_insights"`
		AnalysisSource     string                 `json:"analysis_source"`
		AIMode             string                 `json:"ai_mode"`
		CreatedAt          string                 `json:"created_at"`
	}

	result := []AdminCurhatDTO{}
	for _, item := range curhats {
		var user User
		DB.First(&user, item.UserID)
		redFlags := []string{}
		recommendations := []string{}
		keywordInsights := []CurhatKeywordInsight{}
		agentInsights := []CurhatAgentInsight{}
		_ = json.Unmarshal([]byte(item.RedFlagsJSON), &redFlags)
		_ = json.Unmarshal([]byte(item.RecommendationsJSON), &recommendations)
		_ = json.Unmarshal([]byte(item.KeywordAnalysisJSON), &keywordInsights)
		_ = json.Unmarshal([]byte(item.AgentInsightsJSON), &agentInsights)
		result = append(result, AdminCurhatDTO{
			ID:                 item.ID,
			UserID:             item.UserID,
			UserName:           user.Nama,
			Username:           user.Username,
			Text:               item.Text,
			AttachmentName:     item.AttachmentName,
			AttachmentType:     item.AttachmentType,
			AttachmentData:     item.AttachmentData,
			AttachmentText:     item.AttachmentText,
			VoiceTranscript:    item.VoiceTranscript,
			MemorySummary:      item.MemorySummary,
			AIResponse:         item.AIResponse,
			StressScore:        item.StressScore,
			BurnoutScore:       item.BurnoutScore,
			PsychosomaticScore: item.PsychosomaticScore,
			RiskLevel:          item.RiskLevel,
			Confidence:         item.AnalysisConfidence,
			CrisisFlag:         item.CrisisFlag,
			AdminPriority:      item.AdminPriority,
			AdminStatus:        item.AdminStatus,
			AdminSummary:       item.AdminSummary,
			RedFlags:           redFlags,
			Recommendations:    recommendations,
			KeywordInsights:    keywordInsights,
			AgentInsights:      agentInsights,
			AnalysisSource:     item.AnalysisSource,
			AIMode:             item.AIMode,
			CreatedAt:          item.CreatedAt.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{"curhats": result})
}

func AdminCurhatAnalysisStatusHandler(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status wajib diisi"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status != "new" && status != "reviewing" && status != "actioned" && status != "resolved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status tidak valid"})
		return
	}

	var curhat Curhat
	if err := DB.First(&curhat, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Analisis curhat tidak ditemukan"})
		return
	}
	curhat.AdminStatus = status
	DB.Save(&curhat)
	c.JSON(http.StatusOK, gin.H{"status": "success", "curhat": curhat})
}

func notifyAdminsForCurhatAnalysis(user User, curhat Curhat, analysis CurhatClinicalAnalysis) {
	if analysis.RiskLevel != "High" && analysis.RiskLevel != "Crisis" && !analysis.CrisisFlag {
		return
	}
	var admins []User
	DB.Where("role = ?", RoleSuperadmin).Find(&admins)
	for _, admin := range admins {
		DB.Create(&Notification{
			UserID:  admin.ID,
			Type:    "curhat_analysis",
			Message: fmt.Sprintf("Curhat %d memerlukan monitoring: risiko %s, prioritas %s, user %s.", curhat.ID, analysis.RiskLevel, analysis.AdminPriority, user.Nama),
		})
	}
}

func createCurhatTreatmentIfNeeded(user User, curhat Curhat, analysis CurhatClinicalAnalysis) {
	if analysis.RiskLevel != "High" && analysis.RiskLevel != "Crisis" {
		return
	}
	module := fmt.Sprintf("Monitoring curhat AI: %s\n\n%s", analysis.AdminSummary, strings.Join(analysis.Recommendations, "\n"))
	priority := "high"
	if analysis.CrisisFlag || analysis.RiskLevel == "Crisis" {
		priority = "urgent"
	}
	DB.Create(&TherapyRecommendation{
		UserID:     user.ID,
		ModuleName: truncateString(module, 1200),
		Category:   "konseling",
		Priority:   priority,
		Duration:   "1_week",
		Status:     "pending",
	})
	DB.Create(&Notification{
		UserID:  user.ID,
		Type:    "curhat_analysis",
		Message: "Analisis curhat terbaru menunjukkan kamu perlu tindak lanjut. Admin akan memantau dan saran sudah disiapkan.",
	})
}

func PostCreateHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var input struct {
		Text  string `json:"text"`
		Image string `json:"image"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Text == "" && input.Image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Text atau gambar harus diisi"})
		return
	}

	post := Post{
		UserID: user.ID,
		Text:   input.Text,
		Image:  input.Image,
	}
	if err := DB.Create(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat postingan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"status": "success",
		"post": gin.H{
			"id":        post.ID,
			"text":      post.Text,
			"image":     post.Image,
			"timestamp": post.Timestamp,
		},
	})
}
