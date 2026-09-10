package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type AssistantTurn struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type AssistantAction struct {
	Label       string `json:"label"`
	Path        string `json:"path"`
	Description string `json:"description"`
}

type AssistantReply struct {
	Reply            string            `json:"reply"`
	Mood             string            `json:"mood"`
	Title            string            `json:"title,omitempty"`
	KeyPoints        []string          `json:"key_points,omitempty"`
	NextSteps        []string          `json:"next_steps,omitempty"`
	SuggestedActions []AssistantAction `json:"suggested_actions"`
	Source           string            `json:"source"`
}

type AssistantInsight struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Body        string           `json:"body"`
	Tone        string           `json:"tone"`
	Priority    int              `json:"priority"`
	Action      *AssistantAction `json:"action,omitempty"`
	MetricLabel string           `json:"metric_label,omitempty"`
	MetricValue string           `json:"metric_value,omitempty"`
}

type AssistantScheduleTask struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	DurationMinutes int    `json:"duration_minutes"`
	Priority        string `json:"priority"`
	DueAt           string `json:"due_at,omitempty"`
	Category        string `json:"category,omitempty"`
}

type AssistantScheduleBlock struct {
	TaskID   string `json:"task_id"`
	Title    string `json:"title"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Priority string `json:"priority"`
	Reason   string `json:"reason"`
}

type AssistantSchedulePlan struct {
	Date           string                   `json:"date"`
	Summary        string                   `json:"summary"`
	Blocks         []AssistantScheduleBlock `json:"blocks"`
	Unscheduled    []AssistantScheduleTask  `json:"unscheduled"`
	TotalMinutes   int                      `json:"total_minutes"`
	AvailableMins  int                      `json:"available_minutes"`
	Source         string                   `json:"source"`
	GeneratedAt    time.Time                `json:"generated_at"`
	WorkdayStart   string                   `json:"workday_start"`
	WorkdayEnd     string                   `json:"workday_end"`
	RecommendedBy  string                   `json:"recommended_by"`
	AssistantNotes []string                 `json:"assistant_notes"`
}

type AssistantContextResponse struct {
	Role        string                  `json:"role"`
	Name        string                  `json:"name"`
	GeneratedAt time.Time               `json:"generated_at"`
	Summary     string                  `json:"summary"`
	Stats       map[string]interface{}  `json:"stats"`
	Needs       []AssistantInsight      `json:"needs"`
	Actions     []AssistantAction       `json:"actions"`
	SeedTasks   []AssistantScheduleTask `json:"seed_tasks"`
}

func AssistantContextHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	c.JSON(http.StatusOK, buildAssistantContextResponse(user))
}

func AssistantChatHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	var input struct {
		Message     string          `json:"message"`
		CurrentPath string          `json:"current_path"`
		History     []AssistantTurn `json:"history"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pesan asisten tidak valid"})
		return
	}

	input.Message = strings.TrimSpace(input.Message)
	if input.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pesan tidak boleh kosong"})
		return
	}
	if len([]rune(input.Message)) > 800 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pesan terlalu panjang"})
		return
	}
	if len(input.History) > 8 {
		input.History = input.History[len(input.History)-8:]
	}

	contextResponse := buildAssistantContextResponse(user)
	context := contextResponse.Stats
	context["needs"] = contextResponse.Needs
	context["seed_tasks"] = contextResponse.SeedTasks
	actions := assistantActionsForRole(user.Role)
	reply := generateAssistantReply(user, input.Message, input.CurrentPath, input.History, context, actions, config.AIResponseEnabled)
	c.JSON(http.StatusOK, reply)
}

func buildAssistantContextResponse(user User) AssistantContextResponse {
	stats := map[string]interface{}{
		"role": user.Role,
		"name": user.Nama,
	}
	actions := assistantActionsForRole(user.Role)
	response := AssistantContextResponse{
		Role:        user.Role,
		Name:        user.Nama,
		GeneratedAt: time.Now(),
		Stats:       stats,
		Actions:     actions,
	}

	if user.Role == RoleSuperadmin {
		now := time.Now()
		startOfDay := startOfLocalDay(now)
		var respondents int64
		var pendingTreatments int64
		var unseenReplies int64
		var totalPredictions int64
		var assessmentsToday int64
		var unreadNotifications int64
		var highRiskCount int64
		var overdueFollowUps int64
		var students int64
		var postsToday int64
		var curhatsToday int64
		var usersWithPrediction int64
		DB.Model(&User{}).Where("role = ?", RoleStudent).Count(&respondents)
		DB.Model(&User{}).Where("role = ?", RoleStudent).Count(&students)
		DB.Model(&TherapyRecommendation{}).Where("status = ?", "pending").Count(&pendingTreatments)
		DB.Model(&TherapyRecommendation{}).Where("status = ? AND follow_up_date IS NOT NULL AND follow_up_date <= ?", "pending", now).Count(&overdueFollowUps)
		DB.Model(&TreatmentReply{}).Where("admin_seen = ?", false).Count(&unseenReplies)
		DB.Model(&Prediction{}).Count(&totalPredictions)
		DB.Model(&Assessment{}).Where("timestamp >= ?", startOfDay).Count(&assessmentsToday)
		DB.Model(&Notification{}).Where("is_read = ?", false).Count(&unreadNotifications)
		DB.Model(&Post{}).Where("timestamp >= ?", startOfDay).Count(&postsToday)
		DB.Model(&Curhat{}).Where("timestamp >= ?", startOfDay).Count(&curhatsToday)
		DB.Model(&Prediction{}).Distinct("user_id").Count(&usersWithPrediction)
		DB.Model(&Prediction{}).
			Where("id IN (?)",
				DB.Model(&Prediction{}).
					Select("MAX(id)").
					Group("user_id"),
			).
			Where("risk_level IN ?", []string{"High", "Crisis"}).
			Count(&highRiskCount)

		stats["respondents"] = respondents
		stats["students"] = students
		stats["pending_treatments"] = pendingTreatments
		stats["overdue_follow_ups"] = overdueFollowUps
		stats["unseen_replies"] = unseenReplies
		stats["total_predictions"] = totalPredictions
		stats["assessments_today"] = assessmentsToday
		stats["unread_notifications"] = unreadNotifications
		stats["high_risk_respondents"] = highRiskCount
		stats["users_without_prediction"] = respondents - usersWithPrediction
		stats["posts_today"] = postsToday
		stats["curhats_today"] = curhatsToday

		needs := []AssistantInsight{}
		if unseenReplies > 0 {
			needs = append(needs, AssistantInsight{
				ID:          "admin-unseen-replies",
				Title:       "Balasan terapi menunggu respons",
				Body:        fmt.Sprintf("%d balasan user belum dibaca. Mulai dari kotak masuk responden agar tindak lanjut tidak tertunda.", unseenReplies),
				Tone:        "urgent",
				Priority:    1,
				Action:      findAssistantAction(actions, "/responden"),
				MetricLabel: "Balasan baru",
				MetricValue: fmt.Sprintf("%d", unseenReplies),
			})
		}
		if highRiskCount > 0 {
			needs = append(needs, AssistantInsight{
				ID:          "admin-high-risk",
				Title:       "Responden berisiko tinggi",
				Body:        fmt.Sprintf("%d responden terakhir berada pada kategori tinggi atau krisis. Pemeriksaan prioritas layak dilakukan sekarang.", highRiskCount),
				Tone:        "warning",
				Priority:    2,
				Action:      findAssistantAction(actions, "/responden"),
				MetricLabel: "Risiko tinggi",
				MetricValue: fmt.Sprintf("%d", highRiskCount),
			})
		}
		if pendingTreatments > 0 {
			needs = append(needs, AssistantInsight{
				ID:          "admin-pending-treatment",
				Title:       "Rekomendasi terapi belum selesai",
				Body:        fmt.Sprintf("%d rekomendasi masih pending dan perlu dilihat agar follow-up tetap berjalan.", pendingTreatments),
				Tone:        "info",
				Priority:    3,
				Action:      findAssistantAction(actions, "/responden"),
				MetricLabel: "Pending",
				MetricValue: fmt.Sprintf("%d", pendingTreatments),
			})
		}
		if overdueFollowUps > 0 {
			needs = append(needs, AssistantInsight{
				ID:          "admin-overdue-follow-up",
				Title:       "Follow-up terapi sudah jatuh tempo",
				Body:        fmt.Sprintf("%d tindak lanjut melewati tanggal follow-up. Ini layak dinaikkan sebelum membuat pekerjaan baru.", overdueFollowUps),
				Tone:        "urgent",
				Priority:    1,
				Action:      findAssistantAction(actions, "/responden"),
				MetricLabel: "Jatuh tempo",
				MetricValue: fmt.Sprintf("%d", overdueFollowUps),
			})
		}
		if respondents-usersWithPrediction > 0 {
			needs = append(needs, AssistantInsight{
				ID:          "admin-users-without-prediction",
				Title:       "Ada responden tanpa prediksi terbaru",
				Body:        fmt.Sprintf("%d responden belum memiliki prediksi tersimpan. Pastikan data asesmen mereka cukup sebelum analitik dijadikan dasar keputusan.", respondents-usersWithPrediction),
				Tone:        "info",
				Priority:    4,
				Action:      findAssistantAction(actions, "/prediksi"),
				MetricLabel: "Tanpa prediksi",
				MetricValue: fmt.Sprintf("%d", respondents-usersWithPrediction),
			})
		}
		if len(needs) == 0 {
			needs = append(needs, AssistantInsight{
				ID:       "admin-stable",
				Title:    "Sistem relatif tenang",
				Body:     "Tidak ada antrean prioritas besar saat ini. Ini waktu yang baik untuk meninjau analitik atau laporan.",
				Tone:     "success",
				Priority: 4,
				Action:   findAssistantAction(actions, "/analitik"),
			})
		}
		response.Needs = sortAssistantNeeds(needs)
		response.Summary = fmt.Sprintf("%d responden (%d mahasiswa), %d risiko tinggi, %d balasan baru, %d follow-up jatuh tempo, dan %d asesmen masuk hari ini.", respondents, students, highRiskCount, unseenReplies, overdueFollowUps, assessmentsToday)
		response.SeedTasks = buildAdminSeedTasks(highRiskCount, unseenReplies, pendingTreatments, overdueFollowUps)
		return response
	}

	var latestPrediction Prediction
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestPrediction).Error; err == nil {
		stats["latest_risk"] = latestPrediction.RiskLevel
		stats["latest_burnout"] = latestPrediction.BurnoutScore
		stats["latest_psychosomatic"] = latestPrediction.PsychosomaticScore
	}

	var latestMBTI MBTIResult
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestMBTI).Error; err == nil {
		stats["latest_mbti"] = latestMBTI.PersonalityType
		stats["latest_mbti_title"] = latestMBTI.Title
	}

	var latestAssessment Assessment
	var assessmentAgeHours float64
	hasAssessment := false
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&latestAssessment).Error; err == nil {
		hasAssessment = true
		assessmentAgeHours = time.Since(latestAssessment.Timestamp).Hours()
		stats["latest_assessment_at"] = latestAssessment.Timestamp
		stats["assessment_age_hours"] = math.Round(assessmentAgeHours*10) / 10
	}

	var unreadNotifications int64
	var pendingTreatments int64
	var totalCurhats int64
	var totalPosts int64
	DB.Model(&Notification{}).Where("user_id = ? AND is_read = ?", user.ID, false).Count(&unreadNotifications)
	DB.Model(&TherapyRecommendation{}).Where("user_id = ? AND status = ?", user.ID, "pending").Count(&pendingTreatments)
	DB.Model(&Curhat{}).Where("user_id = ?", user.ID).Count(&totalCurhats)
	DB.Model(&Post{}).Where("user_id = ?", user.ID).Count(&totalPosts)
	stats["unread_notifications"] = unreadNotifications
	stats["pending_treatments"] = pendingTreatments
	stats["total_curhats"] = totalCurhats
	stats["total_posts"] = totalPosts

	needs := []AssistantInsight{}
	if !hasAssessment || assessmentAgeHours >= 24 {
		needs = append(needs, AssistantInsight{
			ID:          "user-assessment-due",
			Title:       "Check-in harian belum terbaru",
			Body:        "Kuisioner harian belum diperbarui dalam 24 jam terakhir. Isi asesmen agar saran hari ini lebih akurat.",
			Tone:        "warning",
			Priority:    1,
			Action:      findAssistantAction(actions, "/user/kuisioner"),
			MetricLabel: "Asesmen",
			MetricValue: "Perlu isi",
		})
	}
	if risk, ok := stats["latest_risk"].(string); ok && (risk == "High" || risk == "Crisis") {
		needs = append(needs, AssistantInsight{
			ID:          "user-risk-followup",
			Title:       "Kondisi butuh perhatian ekstra",
			Body:        fmt.Sprintf("Hasil terakhir berada pada risiko %s. Ambil jeda, tinjau saran terapi, dan gunakan ruang curhat bila perlu.", strings.ToLower(risk)),
			Tone:        "urgent",
			Priority:    1,
			Action:      findAssistantAction(actions, "/user/curhat"),
			MetricLabel: "Risiko",
			MetricValue: risk,
		})
	}
	if pendingTreatments > 0 {
		needs = append(needs, AssistantInsight{
			ID:          "user-pending-treatment",
			Title:       "Saran terapi menunggu tindak lanjut",
			Body:        fmt.Sprintf("Ada %d saran terapi yang belum selesai. Membalas atau memperbarui status akan membantu admin memberi dukungan yang lebih tepat.", pendingTreatments),
			Tone:        "info",
			Priority:    2,
			Action:      findAssistantAction(actions, "/user/curhat"),
			MetricLabel: "Saran",
			MetricValue: fmt.Sprintf("%d", pendingTreatments),
		})
	}
	if unreadNotifications > 0 {
		needs = append(needs, AssistantInsight{
			ID:          "user-unread-notifications",
			Title:       "Ada notifikasi belum dibaca",
			Body:        fmt.Sprintf("%d notifikasi baru menunggu dilihat.", unreadNotifications),
			Tone:        "info",
			Priority:    3,
			Action:      findAssistantAction(actions, "/user/dashboard"),
			MetricLabel: "Notifikasi",
			MetricValue: fmt.Sprintf("%d", unreadNotifications),
		})
	}
	if len(needs) == 0 {
		needs = append(needs, AssistantInsight{
			ID:       "user-steady",
			Title:    "Kondisimu cukup terpantau",
			Body:     "Tidak ada kebutuhan mendesak yang terbaca sekarang. Kamu bisa menjaga ritme dengan check-in ringan atau melihat progresmu.",
			Tone:     "success",
			Priority: 4,
			Action:   findAssistantAction(actions, "/user/dashboard"),
		})
	}
	response.Needs = sortAssistantNeeds(needs)
	response.Summary = buildUserAssistantSummary(stats)
	response.SeedTasks = buildUserSeedTasks(stats, pendingTreatments, hasAssessment, assessmentAgeHours)
	return response
}

func assistantActionsForRole(role string) []AssistantAction {
	if role == RoleSuperadmin {
		return []AssistantAction{
			{Label: "Dashboard", Path: "/dashboard", Description: "Ringkasan operasional admin"},
			{Label: "Data Responden", Path: "/responden", Description: "Pantau responden dan balasan terapi"},
			{Label: "Prediksi Individu", Path: "/prediksi", Description: "Buka analisis detail per responden"},
			{Label: "Analitik", Path: "/analitik", Description: "Lihat insight dan distribusi data"},
			{Label: "Model", Path: "/model", Description: "Tinjau performa model"},
			{Label: "Laporan", Path: "/laporan", Description: "Siapkan laporan dan ekspor data"},
			{Label: "Pengaturan", Path: "/settings", Description: "Kelola konfigurasi sistem"},
		}
	}

	return []AssistantAction{
		{Label: "Dashboard", Path: "/user/dashboard", Description: "Lihat kondisi dan tindakan hari ini"},
		{Label: "Kuisioner", Path: "/user/kuisioner", Description: "Isi asesmen dan tes MBTI"},
		{Label: "Curhat", Path: "/user/curhat", Description: "Bicara dengan AI dan lihat saran terapi"},
		{Label: "Riwayat", Path: "/user/asesmen", Description: "Baca perkembangan asesmen"},
		{Label: "Jaringan Teman", Path: "/user/network", Description: "Lihat teman, postingan, dan musik"},
		{Label: "Pengaturan Akun", Path: "/user/settings", Description: "Atur profil dan preferensi"},
	}
}

func AssistantScheduleOptimizeHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	if userActionBlockedByMaintenance(user, config) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	var input struct {
		Date         string                  `json:"date"`
		WorkdayStart string                  `json:"workday_start"`
		WorkdayEnd   string                  `json:"workday_end"`
		Tasks        []AssistantScheduleTask `json:"tasks"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data jadwal tidak valid"})
		return
	}

	context := buildAssistantContextResponse(user)
	if len(input.Tasks) == 0 {
		input.Tasks = context.SeedTasks
	}
	input.Tasks = sanitizeAssistantScheduleTasks(input.Tasks)
	if len(input.Tasks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tambahkan minimal satu tugas"})
		return
	}

	localPlan := buildLocalSchedulePlan(user, input.Date, input.WorkdayStart, input.WorkdayEnd, input.Tasks)
	plan := optimizeScheduleWithAI(user, context, localPlan, input.Tasks, config.AIResponseEnabled)
	c.JSON(http.StatusOK, plan)
}

func generateAssistantReply(user User, message string, currentPath string, history []AssistantTurn, context map[string]interface{}, allowedActions []AssistantAction, aiEnabled bool) AssistantReply {
	fallback := fallbackAssistantReply(user, message, context, allowedActions)
	if !aiEnabled || os.Getenv("OPENROUTER_API_KEY") == "" {
		return fallback
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"user":            context,
		"current_path":    currentPath,
		"allowed_actions": allowedActions,
		"history":         history,
		"message":         message,
	})

	requestBody, _ := json.Marshal(map[string]interface{}{
		"model": "openai/gpt-4o-mini",
		"messages": []map[string]string{
			{
				"role": "system",
				"content": `Kamu adalah Nexus, teman AI di aplikasi kesehatan mental dan dashboard analitik.
Tugasmu:
1. Jawab dalam Bahasa Indonesia yang hangat, jelas, dan ringkas.
2. Beri saran yang praktis berdasarkan konteks pengguna.
3. Untuk admin, bantu membaca prioritas operasional.
4. Untuk user, jadi teman yang suportif tanpa mengklaim diagnosis medis.
5. Kamu hanya boleh menyarankan aksi dari allowed_actions yang diberikan. Jangan membuat path baru.
6. Jangan mengaku sudah melakukan tindakan yang belum benar-benar dilakukan.

Kembalikan JSON valid:
{
  "title": "judul pendek maksimal 8 kata",
  "reply": "jawaban",
  "key_points": ["maksimal 3 poin singkat dan konkret"],
  "next_steps": ["maksimal 3 langkah praktis"],
  "mood": "supportive|focused|celebrate",
  "suggested_actions": [
    {"label":"...", "path":"...", "description":"..."}
  ]
}
Maksimal 3 suggested_actions.`,
			},
			{"role": "user", "content": string(payload)},
		},
		"max_tokens":      650,
		"temperature":     0.45,
		"response_format": map[string]string{"type": "json_object"},
	})

	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(requestBody))
	if err != nil {
		return fallback
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENROUTER_API_KEY"))
	req.Header.Set("HTTP-Referer", "http://localhost:5173")
	req.Header.Set("X-Title", "Nexus Assistant")

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

	var reply AssistantReply
	if err := json.Unmarshal([]byte(raw.Choices[0].Message.Content), &reply); err != nil {
		return fallback
	}
	reply.Reply = strings.TrimSpace(reply.Reply)
	if reply.Reply == "" {
		return fallback
	}
	reply.Mood = normalizeAssistantMood(reply.Mood)
	reply.Title = strings.TrimSpace(reply.Title)
	reply.KeyPoints = sanitizeAssistantStrings(reply.KeyPoints, 3)
	reply.NextSteps = sanitizeAssistantStrings(reply.NextSteps, 3)
	reply.SuggestedActions = sanitizeAssistantActions(reply.SuggestedActions, allowedActions)
	reply.Source = "ai"
	return reply
}

func fallbackAssistantReply(user User, message string, context map[string]interface{}, allowedActions []AssistantAction) AssistantReply {
	lower := strings.ToLower(message)
	title := "Nexus siap membantu"
	reply := "Aku siap menemani dan membantu memakai fitur di sistem ini."
	mood := "supportive"
	keyPoints := []string{"Kamu bisa meminta ringkasan kondisi, bantuan navigasi, atau rencana singkat."}
	nextSteps := []string{"Tulis kebutuhanmu secara spesifik agar aku bisa memberi saran yang lebih tepat."}

	if user.Role == RoleSuperadmin {
		title = "Prioritas admin saat ini"
		reply = fmt.Sprintf(
			"Ada %v responden, %v balasan terapi belum dibaca, dan %v rekomendasi masih pending. Aku bisa bantu buka prioritas kerja yang paling perlu dilihat.",
			context["respondents"], context["unseen_replies"], context["pending_treatments"],
		)
		mood = "focused"
		keyPoints = []string{
			fmt.Sprintf("%v balasan terapi belum dibaca.", context["unseen_replies"]),
			fmt.Sprintf("%v rekomendasi masih pending.", context["pending_treatments"]),
			fmt.Sprintf("%v responden perlu tetap dipantau.", context["respondents"]),
		}
		nextSteps = []string{
			"Buka daftar responden untuk tindak lanjut prioritas.",
			"Periksa balasan baru sebelum membuat rekomendasi tambahan.",
		}
	} else if risk, ok := context["latest_risk"].(string); ok && risk != "" {
		title = "Ringkasan kondisi terbaru"
		reply = fmt.Sprintf("Hasil terakhir menunjukkan risiko %s. Aku bisa bantu kamu cek tren, isi asesmen baru, atau ngobrol sebentar kalau hari ini terasa berat.", strings.ToLower(risk))
		keyPoints = []string{
			fmt.Sprintf("Risiko terakhir terbaca %s.", strings.ToLower(risk)),
			"Data terbaru akan membuat saran terasa lebih relevan.",
		}
		nextSteps = []string{
			"Cek tren asesmen terakhir.",
			"Isi kuisioner jika data hari ini belum lengkap.",
		}
	}

	switch {
	case strings.Contains(lower, "kuisioner") || strings.Contains(lower, "mbti") || strings.Contains(lower, "tes"):
		title = "Arahkan ke kuisioner"
		reply = "Boleh. Aku arahkan ke kuisioner supaya kamu bisa isi asesmen atau tes MBTI terbaru."
		keyPoints = []string{
			"Asesmen membantu membaca kondisi terkini.",
			"Tes MBTI dapat memperkaya pemahaman preferensi diri.",
		}
		nextSteps = []string{"Buka kuisioner lalu pilih tes yang ingin dikerjakan."}
	case strings.Contains(lower, "curhat") || strings.Contains(lower, "sedih") || strings.Contains(lower, "capek"):
		title = "Ruang untuk bercerita"
		reply = "Aku dengar kamu. Kita bisa buka ruang curhat dulu, lalu kamu ceritakan yang paling berat satu bagian demi satu bagian."
		keyPoints = []string{
			"Kamu tidak harus menjelaskan semuanya sekaligus.",
			"Mulai dari satu hal yang paling mengganggu hari ini.",
		}
		nextSteps = []string{"Buka ruang curhat dan tulis satu bagian yang paling ingin dikeluarkan."}
	case strings.Contains(lower, "responden") || strings.Contains(lower, "balasan terapi"):
		title = "Fokus tindak lanjut responden"
		reply = "Bagian responden cocok untuk memeriksa risiko terbaru, rekomendasi terapi, dan balasan user yang belum dibaca."
		keyPoints = []string{
			"Pantau risiko terbaru.",
			"Periksa balasan terapi yang belum dibaca.",
			"Gunakan riwayat untuk melihat pola perubahan.",
		}
		nextSteps = []string{"Buka Data Responden lalu urutkan tindak lanjut paling mendesak."}
	case strings.Contains(lower, "laporan"):
		title = "Siapkan laporan"
		reply = "Aku bisa bantu buka laporan supaya kamu menyiapkan ringkasan data yang lebih rapi."
		keyPoints = []string{
			"Laporan membantu merangkum tren utama.",
			"Ekspor data berguna untuk dokumentasi lanjutan.",
		}
		nextSteps = []string{"Buka halaman laporan dan pilih periode yang ingin dirangkum."}
	case strings.Contains(lower, "halo") || strings.Contains(lower, "hai"):
		title = "Halo"
		reply = fmt.Sprintf("Hai %s, aku di sini. Mau dibantu membuka fitur, membaca kondisi terbaru, atau sekadar ngobrol sebentar?", firstName(user.Nama))
		keyPoints = []string{"Aku bisa membaca konteks sistem dan membantu memilih langkah berikutnya."}
		nextSteps = []string{"Pilih salah satu prompt cepat atau tulis kebutuhanmu sendiri."}
	}

	return AssistantReply{
		Reply:            reply,
		Mood:             mood,
		Title:            title,
		KeyPoints:        sanitizeAssistantStrings(keyPoints, 3),
		NextSteps:        sanitizeAssistantStrings(nextSteps, 3),
		SuggestedActions: suggestAssistantActions(message, allowedActions),
		Source:           "local-fallback",
	}
}

func buildAdminSeedTasks(highRiskCount int64, unseenReplies int64, pendingTreatments int64, overdueFollowUps int64) []AssistantScheduleTask {
	tasks := []AssistantScheduleTask{}
	if overdueFollowUps > 0 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "review-overdue-follow-up",
			Title:           "Selesaikan follow-up terapi jatuh tempo",
			DurationMinutes: clampMinutes(int(overdueFollowUps)*10, 20, 75),
			Priority:        "urgent",
			Category:        "follow_up",
		})
	}
	if unseenReplies > 0 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "review-replies",
			Title:           "Tinjau balasan terapi baru",
			DurationMinutes: clampMinutes(int(unseenReplies)*8, 20, 60),
			Priority:        "urgent",
			Category:        "follow_up",
		})
	}
	if highRiskCount > 0 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "review-high-risk",
			Title:           "Review responden risiko tinggi",
			DurationMinutes: clampMinutes(int(highRiskCount)*12, 30, 90),
			Priority:        "urgent",
			Category:        "clinical_review",
		})
	}
	if pendingTreatments > 0 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "review-treatment",
			Title:           "Periksa rekomendasi terapi pending",
			DurationMinutes: clampMinutes(int(pendingTreatments)*6, 20, 60),
			Priority:        "high",
			Category:        "therapy",
		})
	}
	tasks = append(tasks, AssistantScheduleTask{
		ID:              "analytics-check",
		Title:           "Tinjau dashboard analitik",
		DurationMinutes: 25,
		Priority:        "medium",
		Category:        "analysis",
	})
	return tasks
}

func buildUserSeedTasks(stats map[string]interface{}, pendingTreatments int64, hasAssessment bool, assessmentAgeHours float64) []AssistantScheduleTask {
	tasks := []AssistantScheduleTask{}
	if !hasAssessment || assessmentAgeHours >= 24 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "daily-assessment",
			Title:           "Isi kuisioner harian",
			DurationMinutes: 15,
			Priority:        "high",
			Category:        "self_check",
		})
	}
	if pendingTreatments > 0 {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "therapy-follow-up",
			Title:           "Tinjau dan balas saran terapi",
			DurationMinutes: 20,
			Priority:        "high",
			Category:        "therapy",
		})
	}
	if risk, ok := stats["latest_risk"].(string); ok && (risk == "High" || risk == "Crisis") {
		tasks = append(tasks, AssistantScheduleTask{
			ID:              "recovery-block",
			Title:           "Blok pemulihan tanpa distraksi",
			DurationMinutes: 30,
			Priority:        "urgent",
			Category:        "recovery",
		})
	}
	tasks = append(tasks, AssistantScheduleTask{
		ID:              "reflection",
		Title:           "Refleksi singkat atau journaling",
		DurationMinutes: 15,
		Priority:        "medium",
		Category:        "reflection",
	})
	return tasks
}

func sanitizeAssistantScheduleTasks(tasks []AssistantScheduleTask) []AssistantScheduleTask {
	result := make([]AssistantScheduleTask, 0, len(tasks))
	seen := map[string]bool{}
	for index, task := range tasks {
		task.Title = strings.TrimSpace(task.Title)
		if task.Title == "" {
			continue
		}
		if strings.TrimSpace(task.ID) == "" {
			task.ID = fmt.Sprintf("task-%d", index+1)
		}
		if seen[task.ID] {
			task.ID = fmt.Sprintf("%s-%d", task.ID, index+1)
		}
		task.Priority = normalizeSchedulePriority(task.Priority)
		task.DurationMinutes = clampMinutes(task.DurationMinutes, 10, 240)
		seen[task.ID] = true
		result = append(result, task)
	}
	return result
}

func buildLocalSchedulePlan(user User, date string, workdayStart string, workdayEnd string, tasks []AssistantScheduleTask) AssistantSchedulePlan {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if workdayStart == "" {
		workdayStart = "08:00"
	}
	if workdayEnd == "" {
		workdayEnd = "17:00"
	}

	start := parseScheduleClock(date, workdayStart, 8, 0)
	end := parseScheduleClock(date, workdayEnd, 17, 0)
	if !end.After(start) {
		end = start.Add(9 * time.Hour)
		workdayEnd = end.Format("15:04")
	}

	sorted := append([]AssistantScheduleTask{}, tasks...)
	sort.SliceStable(sorted, func(i, j int) bool {
		leftWeight := schedulePriorityWeight(sorted[i].Priority)
		rightWeight := schedulePriorityWeight(sorted[j].Priority)
		if leftWeight != rightWeight {
			return leftWeight < rightWeight
		}
		leftDue, leftHasDue := parseOptionalScheduleDue(sorted[i].DueAt)
		rightDue, rightHasDue := parseOptionalScheduleDue(sorted[j].DueAt)
		if leftHasDue && rightHasDue && !leftDue.Equal(rightDue) {
			return leftDue.Before(rightDue)
		}
		if leftHasDue != rightHasDue {
			return leftHasDue
		}
		return sorted[i].DurationMinutes > sorted[j].DurationMinutes
	})

	cursor := start
	blocks := []AssistantScheduleBlock{}
	unscheduled := []AssistantScheduleTask{}
	totalMinutes := 0
	for _, task := range sorted {
		duration := time.Duration(task.DurationMinutes) * time.Minute
		if cursor.Add(duration).After(end) {
			unscheduled = append(unscheduled, task)
			continue
		}
		blocks = append(blocks, AssistantScheduleBlock{
			TaskID:   task.ID,
			Title:    task.Title,
			Start:    cursor.Format(time.RFC3339),
			End:      cursor.Add(duration).Format(time.RFC3339),
			Priority: task.Priority,
			Reason:   localScheduleReason(task),
		})
		totalMinutes += task.DurationMinutes
		cursor = cursor.Add(duration + 10*time.Minute)
	}

	summary := fmt.Sprintf("%d tugas terjadwal dalam %d menit, dengan prioritas tertinggi ditempatkan lebih awal.", len(blocks), totalMinutes)
	if len(unscheduled) > 0 {
		summary += fmt.Sprintf(" %d tugas belum masuk karena kapasitas hari ini tidak cukup.", len(unscheduled))
	}

	return AssistantSchedulePlan{
		Date:           date,
		Summary:        summary,
		Blocks:         blocks,
		Unscheduled:    unscheduled,
		TotalMinutes:   totalMinutes,
		AvailableMins:  int(end.Sub(start).Minutes()),
		Source:         "local-optimizer",
		GeneratedAt:    time.Now(),
		WorkdayStart:   workdayStart,
		WorkdayEnd:     workdayEnd,
		RecommendedBy:  "Nexus",
		AssistantNotes: buildScheduleNotes(user, blocks, unscheduled),
	}
}

func optimizeScheduleWithAI(user User, context AssistantContextResponse, fallback AssistantSchedulePlan, tasks []AssistantScheduleTask, aiEnabled bool) AssistantSchedulePlan {
	if !aiEnabled || os.Getenv("OPENROUTER_API_KEY") == "" {
		return fallback
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"user_role":     user.Role,
		"context":       context,
		"tasks":         tasks,
		"fallback_plan": fallback,
	})
	requestBody, _ := json.Marshal(map[string]interface{}{
		"model": "openai/gpt-4o-mini",
		"messages": []map[string]string{
			{
				"role": "system",
				"content": `Kamu adalah optimizer jadwal untuk aplikasi NexusMind.
Tugasmu menyusun blok jadwal yang realistis dari task yang diberikan.
Aturan:
1. Gunakan hanya task_id yang ada.
2. Jangan menjadwalkan tugas di luar workday_start dan workday_end.
3. Prioritas urgent/high harus lebih awal bila memungkinkan.
4. Kembalikan JSON valid memakai schema plan yang sama seperti fallback_plan:
{
  "summary": "...",
  "blocks": [{"task_id":"...", "title":"...", "start":"RFC3339", "end":"RFC3339", "priority":"...", "reason":"..."}],
  "unscheduled": [],
  "assistant_notes": ["..."]
}
Jangan ubah date, workday_start, workday_end, total_minutes, available_minutes, atau generated_at.`,
			},
			{"role": "user", "content": string(payload)},
		},
		"max_tokens":      900,
		"temperature":     0.25,
		"response_format": map[string]string{"type": "json_object"},
	})

	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(requestBody))
	if err != nil {
		return fallback
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENROUTER_API_KEY"))
	req.Header.Set("HTTP-Referer", "http://localhost:5173")
	req.Header.Set("X-Title", "Nexus Schedule Optimizer")

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

	var candidate struct {
		Summary        string                   `json:"summary"`
		Blocks         []AssistantScheduleBlock `json:"blocks"`
		Unscheduled    []AssistantScheduleTask  `json:"unscheduled"`
		AssistantNotes []string                 `json:"assistant_notes"`
	}
	if err := json.Unmarshal([]byte(raw.Choices[0].Message.Content), &candidate); err != nil {
		return fallback
	}
	if !validAIScheduleBlocks(candidate.Blocks, tasks, fallback.WorkdayStart, fallback.WorkdayEnd, fallback.Date) {
		return fallback
	}

	taskByID := map[string]AssistantScheduleTask{}
	for _, task := range tasks {
		taskByID[task.ID] = task
	}
	totalMinutes := 0
	for index := range candidate.Blocks {
		block := &candidate.Blocks[index]
		start, _ := time.Parse(time.RFC3339, block.Start)
		end, _ := time.Parse(time.RFC3339, block.End)
		totalMinutes += int(end.Sub(start).Minutes())
		if task, ok := taskByID[block.TaskID]; ok && block.Title == "" {
			block.Title = task.Title
		}
	}
	fallback.Summary = strings.TrimSpace(candidate.Summary)
	if fallback.Summary == "" {
		fallback.Summary = fmt.Sprintf("%d tugas dioptimalkan oleh AI berdasarkan prioritas dan kapasitas hari ini.", len(candidate.Blocks))
	}
	fallback.Blocks = candidate.Blocks
	fallback.Unscheduled = candidate.Unscheduled
	fallback.TotalMinutes = totalMinutes
	fallback.Source = "ai"
	fallback.AssistantNotes = candidate.AssistantNotes
	if len(fallback.AssistantNotes) == 0 {
		fallback.AssistantNotes = buildScheduleNotes(user, fallback.Blocks, fallback.Unscheduled)
	}
	return fallback
}

func validAIScheduleBlocks(blocks []AssistantScheduleBlock, tasks []AssistantScheduleTask, startClock string, endClock string, date string) bool {
	if len(blocks) == 0 {
		return false
	}
	taskIDs := map[string]bool{}
	for _, task := range tasks {
		taskIDs[task.ID] = true
	}
	windowStart := parseScheduleClock(date, startClock, 8, 0)
	windowEnd := parseScheduleClock(date, endClock, 17, 0)
	used := map[string]bool{}
	parsedBlocks := make([]struct {
		start time.Time
		end   time.Time
	}, 0, len(blocks))
	for _, block := range blocks {
		if !taskIDs[block.TaskID] || used[block.TaskID] {
			return false
		}
		start, errStart := time.Parse(time.RFC3339, block.Start)
		end, errEnd := time.Parse(time.RFC3339, block.End)
		if errStart != nil || errEnd != nil || !end.After(start) {
			return false
		}
		if start.Before(windowStart) || end.After(windowEnd) {
			return false
		}
		used[block.TaskID] = true
		parsedBlocks = append(parsedBlocks, struct {
			start time.Time
			end   time.Time
		}{start: start, end: end})
	}
	sort.Slice(parsedBlocks, func(i, j int) bool {
		return parsedBlocks[i].start.Before(parsedBlocks[j].start)
	})
	for index := 1; index < len(parsedBlocks); index++ {
		if parsedBlocks[index].start.Before(parsedBlocks[index-1].end) {
			return false
		}
	}
	return true
}

func buildUserAssistantSummary(stats map[string]interface{}) string {
	if risk, ok := stats["latest_risk"].(string); ok && risk != "" {
		return fmt.Sprintf("Risiko terakhir %s, %v notifikasi belum dibaca, dan %v saran terapi pending.", strings.ToLower(risk), stats["unread_notifications"], stats["pending_treatments"])
	}
	return fmt.Sprintf("%v notifikasi belum dibaca dan %v saran terapi pending.", stats["unread_notifications"], stats["pending_treatments"])
}

func sortAssistantNeeds(needs []AssistantInsight) []AssistantInsight {
	sort.SliceStable(needs, func(i, j int) bool {
		return needs[i].Priority < needs[j].Priority
	})
	return needs
}

func findAssistantAction(actions []AssistantAction, path string) *AssistantAction {
	for _, action := range actions {
		if action.Path == path {
			copy := action
			return &copy
		}
	}
	return nil
}

func startOfLocalDay(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
}

func parseScheduleClock(date string, clock string, fallbackHour int, fallbackMinute int) time.Time {
	base, err := time.ParseInLocation("2006-01-02", date, time.Local)
	if err != nil {
		now := time.Now()
		base = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	}
	parts := strings.Split(clock, ":")
	hour := fallbackHour
	minute := fallbackMinute
	if len(parts) >= 2 {
		if parsedHour, err := strconv.Atoi(parts[0]); err == nil {
			hour = parsedHour
		}
		if parsedMinute, err := strconv.Atoi(parts[1]); err == nil {
			minute = parsedMinute
		}
	}
	return time.Date(base.Year(), base.Month(), base.Day(), hour, minute, 0, 0, base.Location())
}

func parseOptionalScheduleDue(value string) (time.Time, bool) {
	if strings.TrimSpace(value) == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, value)
	return parsed, err == nil
}

func normalizeSchedulePriority(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "urgent", "high", "medium", "low":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "medium"
	}
}

func schedulePriorityWeight(value string) int {
	switch normalizeSchedulePriority(value) {
	case "urgent":
		return 0
	case "high":
		return 1
	case "medium":
		return 2
	default:
		return 3
	}
}

func clampMinutes(value int, min int, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func localScheduleReason(task AssistantScheduleTask) string {
	switch normalizeSchedulePriority(task.Priority) {
	case "urgent":
		return "Ditempatkan paling awal karena membutuhkan respons segera."
	case "high":
		return "Dijadwalkan awal agar tindak lanjut penting tidak tertunda."
	case "low":
		return "Diletakkan setelah tugas inti selesai."
	default:
		return "Dimasukkan setelah prioritas yang lebih mendesak."
	}
}

func buildScheduleNotes(user User, blocks []AssistantScheduleBlock, unscheduled []AssistantScheduleTask) []string {
	notes := []string{}
	if len(blocks) > 0 {
		notes = append(notes, "Mulai dari blok pertama agar pekerjaan paling penting selesai saat energi masih tinggi.")
	}
	if user.Role == "user" {
		notes = append(notes, "Sisakan jeda pemulihan singkat di antara blok agar jadwal tidak terasa terlalu padat.")
	} else {
		notes = append(notes, "Gunakan jeda antarblok untuk pembaruan status singkat atau dokumentasi tindak lanjut.")
	}
	if len(unscheduled) > 0 {
		notes = append(notes, "Ada tugas yang belum tertampung; pertimbangkan memperpanjang jam kerja atau memindahkannya ke hari berikutnya.")
	}
	return notes
}

func sanitizeAssistantActions(requested []AssistantAction, allowed []AssistantAction) []AssistantAction {
	allowedByPath := map[string]AssistantAction{}
	for _, action := range allowed {
		allowedByPath[action.Path] = action
	}
	result := make([]AssistantAction, 0, 3)
	for _, action := range requested {
		if safe, ok := allowedByPath[action.Path]; ok {
			result = append(result, safe)
		}
		if len(result) == 3 {
			break
		}
	}
	if len(result) == 0 {
		return allowed[:minInt(3, len(allowed))]
	}
	return result
}

func suggestAssistantActions(message string, allowed []AssistantAction) []AssistantAction {
	lower := strings.ToLower(message)
	type scored struct {
		action AssistantAction
		score  int
	}
	items := make([]scored, 0, len(allowed))
	for _, action := range allowed {
		score := 0
		label := strings.ToLower(action.Label + " " + action.Description)
		for _, word := range strings.Fields(lower) {
			if strings.Contains(label, word) {
				score++
			}
		}
		items = append(items, scored{action: action, score: score})
	}

	result := make([]AssistantAction, 0, 3)
	for len(result) < 3 && len(items) > 0 {
		best := 0
		for i := 1; i < len(items); i++ {
			if items[i].score > items[best].score {
				best = i
			}
		}
		result = append(result, items[best].action)
		items = append(items[:best], items[best+1:]...)
	}
	return result
}

func normalizeAssistantMood(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "focused", "celebrate", "supportive":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "supportive"
	}
}

func sanitizeAssistantStrings(items []string, limit int) []string {
	result := make([]string, 0, minInt(limit, len(items)))
	for _, item := range items {
		cleaned := strings.TrimSpace(item)
		if cleaned == "" {
			continue
		}
		result = append(result, cleaned)
		if len(result) == limit {
			break
		}
	}
	return result
}

func firstName(value string) string {
	parts := strings.Fields(strings.TrimSpace(value))
	if len(parts) == 0 {
		return "teman"
	}
	return parts[0]
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}
