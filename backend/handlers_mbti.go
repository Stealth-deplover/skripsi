package main

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type MBTIQuestion struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	Dimension string `json:"dimension"`
	HighPole  string `json:"high_pole"`
	LowPole   string `json:"low_pole"`
	Theme     string `json:"theme"`
}

type MBTIResponse struct {
	ID             string `json:"id"`
	Value          int    `json:"value"`
	ReactionTimeMs int    `json:"reaction_time_ms"`
}

type MBTIDimensionResult struct {
	Dimension  string  `json:"dimension"`
	LeftPole   string  `json:"left_pole"`
	RightPole  string  `json:"right_pole"`
	LeftScore  float64 `json:"left_score"`
	RightScore float64 `json:"right_score"`
	Selected   string  `json:"selected"`
}

var mbtiDimensionAxes = []struct {
	dimension string
	leftPole  string
	rightPole string
}{
	{dimension: "EI", leftPole: "E", rightPole: "I"},
	{dimension: "SN", leftPole: "S", rightPole: "N"},
	{dimension: "TF", leftPole: "T", rightPole: "F"},
	{dimension: "JP", leftPole: "J", rightPole: "P"},
}

func buildMBTIDimensionsFromScores(scores map[string]float64, personalityType string) []MBTIDimensionResult {
	personalityType = strings.ToUpper(strings.TrimSpace(personalityType))
	dimensions := make([]MBTIDimensionResult, 0, len(mbtiDimensionAxes))

	for index, axis := range mbtiDimensionAxes {
		leftScore, hasLeft := scores[axis.leftPole]
		rightScore, hasRight := scores[axis.rightPole]
		if !hasLeft || !hasRight {
			leftScore, rightScore = 55, 45
			if index < len(personalityType) && string(personalityType[index]) == axis.rightPole {
				leftScore, rightScore = 45, 55
			}
		}

		selected := axis.leftPole
		if rightScore > leftScore || (rightScore == leftScore && index < len(personalityType) && string(personalityType[index]) == axis.rightPole) {
			selected = axis.rightPole
		}
		dimensions = append(dimensions, MBTIDimensionResult{
			Dimension:  axis.dimension,
			LeftPole:   axis.leftPole,
			RightPole:  axis.rightPole,
			LeftScore:  leftScore,
			RightScore: rightScore,
			Selected:   selected,
		})
	}

	return dimensions
}

func buildDemoMBTIDimensions(personalityType string) []MBTIDimensionResult {
	personalityType = strings.ToUpper(strings.TrimSpace(personalityType))
	scores := make(map[string]float64, len(mbtiDimensionAxes)*2)
	for index, axis := range mbtiDimensionAxes {
		if index < len(personalityType) && string(personalityType[index]) == axis.rightPole {
			scores[axis.leftPole], scores[axis.rightPole] = 45, 55
			continue
		}
		scores[axis.leftPole], scores[axis.rightPole] = 55, 45
	}
	return buildMBTIDimensionsFromScores(scores, personalityType)
}

type MBTIEvaluation struct {
	Type       string                `json:"type"`
	Title      string                `json:"title"`
	Summary    string                `json:"summary"`
	Strengths  []string              `json:"strengths"`
	Watchouts  []string              `json:"watchouts"`
	Dimensions []MBTIDimensionResult `json:"dimensions"`
	Source     string                `json:"source"`
}

type MBTITypeInfo struct {
	Title     string
	Summary   string
	Strengths []string
	Watchouts []string
}

type MBTISessionMode struct {
	Label            string `json:"label"`
	QuestionsPerAxis int    `json:"questions_per_axis"`
	EstimatedMinutes int    `json:"estimated_minutes"`
	Description      string `json:"description"`
}

var mbtiSessionModes = map[string]MBTISessionMode{
	"quick":    {Label: "Ringkas", QuestionsPerAxis: 3, EstimatedMinutes: 4, Description: "Pemetaan cepat untuk membaca kecenderungan utama."},
	"balanced": {Label: "Seimbang", QuestionsPerAxis: 4, EstimatedMinutes: 6, Description: "Kombinasi stabil antara variasi soal dan durasi tes."},
	"deep":     {Label: "Mendalam", QuestionsPerAxis: 5, EstimatedMinutes: 8, Description: "Lebih banyak konteks untuk hasil yang lebih kaya dibaca."},
}

var mbtiFocusLabels = map[string]string{
	"general":  "Umum",
	"academic": "Akademik",
	"work":     "Kerja",
	"social":   "Relasi",
}

var mbtiQuestionBank = map[string][]MBTIQuestion{
	"EI": {
		{ID: "ei_energy_group", Text: "Saya merasa lebih berenergi setelah berdiskusi dengan banyak orang.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "general"},
		{ID: "ei_process_out_loud", Text: "Saya lebih mudah menemukan ide ketika membicarakannya langsung.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "general"},
		{ID: "ei_seek_stimulation", Text: "Saat lelah, saya cenderung mencari suasana ramai untuk kembali bersemangat.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "social"},
		{ID: "ei_present_group", Text: "Dalam tugas kelompok, saya sering memulai diskusi agar semua orang cepat bergerak.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "academic"},
		{ID: "ei_network_work", Text: "Di lingkungan kerja, saya nyaman membangun relasi baru tanpa perlu banyak persiapan.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "work"},
		{ID: "ei_event_social", Text: "Saya menikmati acara sosial yang memberi banyak kesempatan bertemu orang baru.", Dimension: "EI", HighPole: "E", LowPole: "I", Theme: "social"},
		{ID: "ei_quiet_reset", Text: "Saya membutuhkan waktu sendiri untuk mengisi ulang energi setelah hari yang padat.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "general"},
		{ID: "ei_reflect_first", Text: "Saya biasanya berpikir cukup lama sebelum menyampaikan pendapat.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "general"},
		{ID: "ei_small_circle", Text: "Saya lebih menikmati percakapan mendalam dengan sedikit orang daripada banyak interaksi singkat.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "social"},
		{ID: "ei_solo_study", Text: "Saat belajar, saya lebih fokus jika bisa memproses materi sendiri terlebih dahulu.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "academic"},
		{ID: "ei_prepare_meeting", Text: "Sebelum rapat penting, saya lebih nyaman menyiapkan poin sendiri daripada langsung berdiskusi spontan.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "work"},
		{ID: "ei_after_social", Text: "Setelah terlalu banyak interaksi, saya perlu jeda sunyi sebelum kembali produktif.", Dimension: "EI", HighPole: "I", LowPole: "E", Theme: "social"},
	},
	"SN": {
		{ID: "sn_concrete_detail", Text: "Saya lebih percaya pada fakta yang terlihat daripada kemungkinan yang masih abstrak.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "general"},
		{ID: "sn_step_sequence", Text: "Saya nyaman bekerja dengan langkah yang jelas dan urutan yang konkret.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "general"},
		{ID: "sn_practical_example", Text: "Contoh nyata membantu saya memahami sesuatu lebih cepat daripada teori umum.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "academic"},
		{ID: "sn_data_before_plan", Text: "Sebelum menyusun rencana kerja, saya ingin melihat data dan batasan yang nyata terlebih dahulu.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "work"},
		{ID: "sn_social_detail", Text: "Dalam percakapan, saya biasanya menangkap detail spesifik yang orang lain lewatkan.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "social"},
		{ID: "sn_repeat_method", Text: "Jika sebuah metode sudah terbukti berhasil, saya lebih suka menyempurnakannya daripada mengganti total.", Dimension: "SN", HighPole: "S", LowPole: "N", Theme: "work"},
		{ID: "sn_pattern_future", Text: "Saya spontan mencari pola besar dan kemungkinan masa depan dari sebuah situasi.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "general"},
		{ID: "sn_new_angle", Text: "Saya tertarik mengeksplorasi ide baru meski belum tahu hasil praktisnya.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "general"},
		{ID: "sn_meaning_first", Text: "Saya sering menangkap makna keseluruhan sebelum memperhatikan detail kecil.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "social"},
		{ID: "sn_academic_concept", Text: "Saat belajar, saya lebih tertarik memahami konsep besar sebelum menghafal rincian.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "academic"},
		{ID: "sn_innovation_path", Text: "Dalam proyek, saya terdorong membayangkan arah baru yang belum dicoba tim.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "work"},
		{ID: "sn_read_between_lines", Text: "Saya kerap membaca maksud tersembunyi dari pola ucapan dan situasi sosial.", Dimension: "SN", HighPole: "N", LowPole: "S", Theme: "social"},
	},
	"TF": {
		{ID: "tf_logic_priority", Text: "Saat mengambil keputusan sulit, konsistensi logis biasanya menjadi prioritas saya.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "general"},
		{ID: "tf_direct_feedback", Text: "Saya lebih menghargai umpan balik yang jujur dan langsung meski terasa tegas.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "work"},
		{ID: "tf_detached_review", Text: "Saya cenderung memisahkan perasaan pribadi ketika menilai sebuah masalah.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "general"},
		{ID: "tf_grade_evidence", Text: "Dalam tugas atau presentasi, saya menilai kualitas berdasarkan bukti dan konsistensi argumen.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "academic"},
		{ID: "tf_process_rule", Text: "Jika aturan sudah disepakati, saya mengutamakan penerapan yang adil meski ada pihak kurang nyaman.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "work"},
		{ID: "tf_debate_clarity", Text: "Dalam diskusi, saya lebih fokus menjernihkan alasan daripada menjaga suasana tetap ringan.", Dimension: "TF", HighPole: "T", LowPole: "F", Theme: "social"},
		{ID: "tf_people_impact", Text: "Saya memikirkan dampak keputusan pada perasaan orang lain sebelum memilih tindakan.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "general"},
		{ID: "tf_harmony_value", Text: "Menjaga keharmonisan hubungan sering sama pentingnya dengan hasil akhir.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "social"},
		{ID: "tf_values_filter", Text: "Nilai pribadi dan empati sangat memengaruhi cara saya membuat keputusan.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "general"},
		{ID: "tf_team_morale", Text: "Saat bekerja dalam tim, saya mempertimbangkan semangat anggota sebelum menentukan pendekatan.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "work"},
		{ID: "tf_peer_support", Text: "Dalam lingkungan belajar, saya melihat dukungan emosional sebagai bagian penting dari keberhasilan kelompok.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "academic"},
		{ID: "tf_relationship_repair", Text: "Ketika ada konflik, saya lebih dulu mencari cara memperbaiki hubungan sebelum membahas solusi teknis.", Dimension: "TF", HighPole: "F", LowPole: "T", Theme: "social"},
	},
	"JP": {
		{ID: "jp_plan_ahead", Text: "Saya merasa lebih tenang ketika rencana sudah tersusun sebelum mulai bekerja.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "general"},
		{ID: "jp_close_loops", Text: "Saya senang menuntaskan keputusan lebih awal daripada membiarkannya terbuka.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "general"},
		{ID: "jp_deadline_structure", Text: "Jadwal dan tenggat yang jelas membantu saya bekerja lebih optimal.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "work"},
		{ID: "jp_study_calendar", Text: "Saya lebih nyaman belajar jika sudah ada jadwal rinci untuk tiap bagian materi.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "academic"},
		{ID: "jp_group_commitment", Text: "Dalam tim, saya suka menetapkan pembagian tugas dan tenggat sejak awal.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "work"},
		{ID: "jp_social_plan", Text: "Saat membuat janji dengan teman, saya lebih suka waktu dan rencananya jelas dari awal.", Dimension: "JP", HighPole: "J", LowPole: "P", Theme: "social"},
		{ID: "jp_adapt_options", Text: "Saya lebih suka menjaga beberapa pilihan tetap terbuka selama mungkin.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "general"},
		{ID: "jp_spontaneous_shift", Text: "Saya mudah menyesuaikan arah ketika muncul peluang baru di tengah proses.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "general"},
		{ID: "jp_flexible_flow", Text: "Saya bekerja baik ketika punya ruang untuk improvisasi, bukan aturan yang terlalu kaku.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "work"},
		{ID: "jp_last_minute_energy", Text: "Dalam tugas akademik, saya sering merasa ide terbaik muncul ketika tenggat sudah dekat.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "academic"},
		{ID: "jp_open_brief", Text: "Saya nyaman memulai proyek meski beberapa detail masih bisa berubah di tengah jalan.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "work"},
		{ID: "jp_social_spontaneity", Text: "Saya menikmati ajakan mendadak selama terasa menarik pada saat itu.", Dimension: "JP", HighPole: "P", LowPole: "J", Theme: "social"},
	},
}

var mbtiTypeInfo = map[string]MBTITypeInfo{
	"ISTJ": {"The Inspector", "Terstruktur, teliti, dan nyaman menjaga standar agar pekerjaan berjalan konsisten.", []string{"Disiplin", "Andal", "Kuat pada detail"}, []string{"Bisa terlalu kaku", "Perlu memberi ruang pada perubahan"}},
	"ISFJ": {"The Protector", "Hangat, bertanggung jawab, dan peka terhadap kebutuhan orang di sekitarnya.", []string{"Suportif", "Telaten", "Loyal"}, []string{"Mudah memendam beban", "Perlu menjaga batas diri"}},
	"INFJ": {"The Advocate", "Reflektif, intuitif, dan terdorong mencari makna serta dampak positif jangka panjang.", []string{"Visioner", "Empatik", "Mendalam"}, []string{"Cenderung perfeksionis", "Perlu menguji asumsi dengan fakta"}},
	"INTJ": {"The Strategist", "Analitis, mandiri, dan kuat menyusun strategi untuk tujuan jangka panjang.", []string{"Strategis", "Mandiri", "Berorientasi sistem"}, []string{"Bisa tampak terlalu kritis", "Perlu membuka ruang kolaborasi"}},
	"ISTP": {"The Virtuoso", "Praktis, tenang, dan cepat memahami cara kerja sesuatu melalui pengalaman langsung.", []string{"Adaptif", "Problem solver", "Tenang saat krisis"}, []string{"Kadang terlalu singkat berkomunikasi", "Perlu menyampaikan proses pikir"}},
	"ISFP": {"The Composer", "Lembut, fleksibel, dan peka pada nilai personal serta pengalaman nyata.", []string{"Peka", "Kreatif", "Mudah beradaptasi"}, []string{"Bisa menghindari konflik", "Perlu menegaskan prioritas"}},
	"INFP": {"The Mediator", "Idealistis, penuh nilai, dan tertarik pada pertumbuhan diri maupun orang lain.", []string{"Imajinatif", "Empatik", "Otentik"}, []string{"Mudah larut dalam kemungkinan", "Perlu memecah ide menjadi langkah"}},
	"INTP": {"The Analyst", "Penasaran, konseptual, dan senang mengurai masalah menjadi pola yang masuk akal.", []string{"Logis", "Inovatif", "Objektif"}, []string{"Bisa terlalu lama menganalisis", "Perlu menutup keputusan"}},
	"ESTP": {"The Dynamo", "Gesit, praktis, dan nyaman bergerak cepat saat situasi berubah.", []string{"Berani", "Responsif", "Pragmatis"}, []string{"Bisa melewatkan dampak jangka panjang", "Perlu memperlambat saat risiko tinggi"}},
	"ESFP": {"The Entertainer", "Ekspresif, ramah, dan membawa energi positif ke dalam pengalaman bersama.", []string{"Hangat", "Spontan", "Membangun suasana"}, []string{"Mudah terdistraksi", "Perlu menjaga konsistensi"}},
	"ENFP": {"The Campaigner", "Antusias, kreatif, dan cepat melihat potensi dalam orang maupun ide baru.", []string{"Inspiratif", "Kreatif", "Fleksibel"}, []string{"Bisa terlalu banyak membuka proyek", "Perlu memilih fokus"}},
	"ENTP": {"The Debater", "Cerdas, eksploratif, dan senang menguji ide dari banyak sudut.", []string{"Inventif", "Cepat belajar", "Argumentatif sehat"}, []string{"Bisa tampak menantang terus-menerus", "Perlu menuntaskan eksekusi"}},
	"ESTJ": {"The Executive", "Tegas, terorganisir, dan fokus membuat sistem berjalan efisien.", []string{"Tegas", "Terarah", "Eksekutor kuat"}, []string{"Bisa kurang lentur", "Perlu mendengar konteks emosional"}},
	"ESFJ": {"The Consul", "Kooperatif, perhatian, dan suka memastikan kelompok berjalan harmonis.", []string{"Peduli", "Terorganisir", "Membangun relasi"}, []string{"Bisa terlalu mencari persetujuan", "Perlu menerima perbedaan"}},
	"ENFJ": {"The Protagonist", "Karismatik, terarah, dan kuat menggerakkan orang menuju tujuan bersama.", []string{"Memotivasi", "Empatik", "Komunikatif"}, []string{"Bisa terlalu memikul kebutuhan orang lain", "Perlu menjaga energi pribadi"}},
	"ENTJ": {"The Commander", "Strategis, tegas, dan nyaman memimpin perubahan untuk mencapai hasil besar.", []string{"Visioner", "Efisien", "Berani mengambil keputusan"}, []string{"Bisa terlalu dominan", "Perlu memberi ruang pada proses orang lain"}},
}

func MBTIQuestionsHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	if userActionBlockedByMaintenance(user, getSystemConfig()) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	modeKey := normalizeMBTISessionMode(c.Query("mode"))
	focusKey := normalizeMBTIFocus(c.Query("focus"))
	mode := mbtiSessionModes[modeKey]

	variant := c.Query("variant")
	if variant == "" {
		variant = time.Now().Format("2006-01-02") + ":" + modeKey + ":" + focusKey
	}
	questionSet := "mbti:" + modeKey + ":" + focusKey + ":" + variant
	questions := buildMBTIQuestions(questionSet, modeKey, focusKey)
	hash := md5.Sum([]byte(questionSet))

	c.JSON(http.StatusOK, gin.H{
		"questions":         questions,
		"question_set":      questionSet,
		"fingerprint":       hex.EncodeToString(hash[:]),
		"source":            "adaptive-local-api",
		"mode":              modeKey,
		"mode_label":        mode.Label,
		"focus":             focusKey,
		"focus_label":       mbtiFocusLabels[focusKey],
		"estimated_minutes": mode.EstimatedMinutes,
		"blueprint":         buildMBTIQuestionBlueprint(questions),
	})
}

func MBTISubmitHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	if userActionBlockedByMaintenance(user, getSystemConfig()) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	var input struct {
		QuestionSet string         `json:"question_set"`
		Responses   []MBTIResponse `json:"responses"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(input.Responses) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Minimal 8 respons MBTI diperlukan"})
		return
	}

	questionMap := buildMBTIQuestionMap()
	questions := make([]MBTIQuestion, 0, len(input.Responses))
	validResponses := make([]MBTIResponse, 0, len(input.Responses))
	seen := map[string]bool{}
	for _, response := range input.Responses {
		if seen[response.ID] || response.Value < 1 || response.Value > 5 {
			continue
		}
		question, ok := questionMap[response.ID]
		if !ok {
			continue
		}
		seen[response.ID] = true
		questions = append(questions, question)
		validResponses = append(validResponses, response)
	}
	if len(validResponses) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Respons MBTI tidak valid atau belum lengkap"})
		return
	}

	evaluation := evaluateMBTIWithAI(validResponses, questions)
	responsesJSON, _ := json.Marshal(validResponses)
	strengthsJSON, _ := json.Marshal(evaluation.Strengths)
	watchoutsJSON, _ := json.Marshal(evaluation.Watchouts)
	dimensionsJSON, _ := json.Marshal(evaluation.Dimensions)
	result := MBTIResult{
		UserID:          user.ID,
		QuestionSet:     input.QuestionSet,
		ResponsesJSON:   string(responsesJSON),
		PersonalityType: evaluation.Type,
		Title:           evaluation.Title,
		Summary:         evaluation.Summary,
		StrengthsJSON:   string(strengthsJSON),
		WatchoutsJSON:   string(watchoutsJSON),
		DimensionsJSON:  string(dimensionsJSON),
		Source:          evaluation.Source,
	}
	DB.Create(&result)

	notification := Notification{
		UserID:  user.ID,
		Type:    "mbti",
		Message: fmt.Sprintf("Hasil MBTI terbaru Anda: %s - %s.", evaluation.Type, evaluation.Title),
	}
	DB.Create(&notification)

	c.JSON(http.StatusOK, gin.H{
		"id":         result.ID,
		"type":       evaluation.Type,
		"title":      evaluation.Title,
		"summary":    evaluation.Summary,
		"strengths":  evaluation.Strengths,
		"watchouts":  evaluation.Watchouts,
		"dimensions": evaluation.Dimensions,
		"source":     evaluation.Source,
	})
}

func UserLatestMBTIHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var result MBTIResult
	if err := DB.Where("user_id = ?", user.ID).Order("timestamp DESC").First(&result).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"result": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": hydrateMBTIResult(result)})
}

func buildMBTIQuestions(seed, mode, focus string) []MBTIQuestion {
	dimensions := []string{"EI", "SN", "TF", "JP"}
	modeConfig := mbtiSessionModes[normalizeMBTISessionMode(mode)]
	result := make([]MBTIQuestion, 0, modeConfig.QuestionsPerAxis*len(dimensions))
	for _, dimension := range dimensions {
		result = append(result, selectMBTIDimensionQuestions(
			append([]MBTIQuestion{}, mbtiQuestionBank[dimension]...),
			seed,
			focus,
			modeConfig.QuestionsPerAxis,
		)...)
	}
	sort.SliceStable(result, func(i, j int) bool {
		left := md5.Sum([]byte(seed + result[i].ID + ":mix"))
		right := md5.Sum([]byte(seed + result[j].ID + ":mix"))
		return hex.EncodeToString(left[:]) < hex.EncodeToString(right[:])
	})
	return result
}

func normalizeMBTISessionMode(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if _, ok := mbtiSessionModes[value]; ok {
		return value
	}
	return "balanced"
}

func normalizeMBTIFocus(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if _, ok := mbtiFocusLabels[value]; ok {
		return value
	}
	return "general"
}

func selectMBTIDimensionQuestions(bank []MBTIQuestion, seed, focus string, targetCount int) []MBTIQuestion {
	sortMBTIQuestionsBySeed(bank, seed+":all")

	focusPool := make([]MBTIQuestion, 0, len(bank))
	for _, question := range bank {
		if question.Theme == focus {
			focusPool = append(focusPool, question)
		}
	}
	sortMBTIQuestionsBySeed(focusPool, seed+":focus")

	focusTarget := targetCount / 2
	if focusTarget == 0 {
		focusTarget = 1
	}
	if len(focusPool) < focusTarget {
		focusTarget = len(focusPool)
	}

	selected := make([]MBTIQuestion, 0, targetCount)
	used := map[string]bool{}
	for _, question := range focusPool[:focusTarget] {
		selected = append(selected, question)
		used[question.ID] = true
	}
	for _, question := range bank {
		if len(selected) >= targetCount {
			break
		}
		if used[question.ID] {
			continue
		}
		selected = append(selected, question)
		used[question.ID] = true
	}
	return selected
}

func sortMBTIQuestionsBySeed(questions []MBTIQuestion, seed string) {
	sort.SliceStable(questions, func(i, j int) bool {
		left := md5.Sum([]byte(seed + questions[i].ID))
		right := md5.Sum([]byte(seed + questions[j].ID))
		return hex.EncodeToString(left[:]) < hex.EncodeToString(right[:])
	})
}

func buildMBTIQuestionBlueprint(questions []MBTIQuestion) gin.H {
	dimensions := map[string]int{}
	themes := map[string]int{}
	for _, question := range questions {
		dimensions[question.Dimension]++
		themes[question.Theme]++
	}
	return gin.H{
		"dimensions": dimensions,
		"themes":     themes,
	}
}

func buildMBTIQuestionMap() map[string]MBTIQuestion {
	questions := map[string]MBTIQuestion{}
	for _, bank := range mbtiQuestionBank {
		for _, question := range bank {
			questions[question.ID] = question
		}
	}
	return questions
}

func evaluateMBTIWithAI(responses []MBTIResponse, questions []MBTIQuestion) MBTIEvaluation {
	fallback := buildMBTIFallbackEvaluation(responses, questions)
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		return fallback
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"questions": questions,
		"responses": responses,
		"fallback":  fallback,
	})
	requestBody, _ := json.Marshal(map[string]interface{}{
		"model": "openai/gpt-4o-mini",
		"messages": []map[string]string{
			{
				"role": "system",
				"content": `Kamu adalah evaluator MBTI berbahasa Indonesia. Gunakan respons Likert 1-5 dan metadata pole setiap pertanyaan untuk menentukan tipe MBTI paling konsisten.
Kembalikan JSON valid:
{
  "type": "INTJ",
  "title": "The Strategist",
  "summary": "2-3 kalimat penjelasan yang mudah dipahami, tidak mengklaim diagnosis klinis.",
  "strengths": ["maksimal 3 poin"],
  "watchouts": ["maksimal 3 poin"],
  "dimensions": [
    {"dimension":"EI","left_pole":"E","right_pole":"I","left_score":0,"right_score":0,"selected":"I"}
  ]
}
Gunakan fallback yang diberikan sebagai titik awal, tetapi koreksi bila pola respons menunjukkan hal lain. Jangan memberi diagnosis medis.`,
			},
			{"role": "user", "content": string(payload)},
		},
		"max_tokens":      700,
		"temperature":     0.2,
		"response_format": map[string]string{"type": "json_object"},
	})

	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(requestBody))
	if err != nil {
		return fallback
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "http://localhost:5173")
	req.Header.Set("X-Title", "NexusMind MBTI")

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

	var ai MBTIEvaluation
	if err := json.Unmarshal([]byte(raw.Choices[0].Message.Content), &ai); err != nil {
		return fallback
	}
	ai.Type = strings.ToUpper(strings.TrimSpace(ai.Type))
	info, ok := mbtiTypeInfo[ai.Type]
	if !ok || len(ai.Dimensions) != 4 {
		return fallback
	}
	if strings.TrimSpace(ai.Title) == "" {
		ai.Title = info.Title
	}
	if strings.TrimSpace(ai.Summary) == "" {
		ai.Summary = info.Summary
	}
	if len(ai.Strengths) == 0 {
		ai.Strengths = info.Strengths
	}
	if len(ai.Watchouts) == 0 {
		ai.Watchouts = info.Watchouts
	}
	ai.Source = "ai"
	return ai
}

func buildMBTIFallbackEvaluation(responses []MBTIResponse, questions []MBTIQuestion) MBTIEvaluation {
	type pair struct {
		left  string
		right string
	}
	pairs := map[string]pair{
		"EI": {"E", "I"},
		"SN": {"S", "N"},
		"TF": {"T", "F"},
		"JP": {"J", "P"},
	}
	scores := map[string]map[string]float64{}
	for dimension, item := range pairs {
		scores[dimension] = map[string]float64{item.left: 0, item.right: 0}
	}

	questionMap := map[string]MBTIQuestion{}
	for _, question := range questions {
		questionMap[question.ID] = question
	}
	for _, response := range responses {
		question, ok := questionMap[response.ID]
		if !ok {
			continue
		}
		normalized := float64(response.Value-1) / 4
		scores[question.Dimension][question.HighPole] += normalized
		scores[question.Dimension][question.LowPole] += 1 - normalized
	}

	order := []string{"EI", "SN", "TF", "JP"}
	dimensions := make([]MBTIDimensionResult, 0, len(order))
	var mbtiType strings.Builder
	for _, dimension := range order {
		item := pairs[dimension]
		leftScore := scores[dimension][item.left]
		rightScore := scores[dimension][item.right]
		selected := item.left
		if rightScore > leftScore {
			selected = item.right
		}
		mbtiType.WriteString(selected)
		dimensions = append(dimensions, MBTIDimensionResult{
			Dimension:  dimension,
			LeftPole:   item.left,
			RightPole:  item.right,
			LeftScore:  roundMBTIScore(leftScore),
			RightScore: roundMBTIScore(rightScore),
			Selected:   selected,
		})
	}

	personalityType := mbtiType.String()
	info := mbtiTypeInfo[personalityType]
	return MBTIEvaluation{
		Type:       personalityType,
		Title:      info.Title,
		Summary:    info.Summary,
		Strengths:  info.Strengths,
		Watchouts:  info.Watchouts,
		Dimensions: dimensions,
		Source:     "local-fallback",
	}
}

func hydrateMBTIResult(result MBTIResult) gin.H {
	var strengths []string
	var watchouts []string
	_ = json.Unmarshal([]byte(result.StrengthsJSON), &strengths)
	_ = json.Unmarshal([]byte(result.WatchoutsJSON), &watchouts)
	if strengths == nil {
		strengths = []string{}
	}
	if watchouts == nil {
		watchouts = []string{}
	}

	var dimensions []MBTIDimensionResult
	if err := json.Unmarshal([]byte(result.DimensionsJSON), &dimensions); err != nil || len(dimensions) == 0 {
		var legacyScores map[string]float64
		if err := json.Unmarshal([]byte(result.DimensionsJSON), &legacyScores); err == nil && len(legacyScores) > 0 {
			dimensions = buildMBTIDimensionsFromScores(legacyScores, result.PersonalityType)
		} else {
			dimensions = buildMBTIDimensionsFromScores(nil, result.PersonalityType)
		}
	}

	return gin.H{
		"id":           result.ID,
		"type":         result.PersonalityType,
		"title":        result.Title,
		"summary":      result.Summary,
		"strengths":    strengths,
		"watchouts":    watchouts,
		"dimensions":   dimensions,
		"source":       result.Source,
		"timestamp":    result.Timestamp,
		"question_set": result.QuestionSet,
	}
}

func roundMBTIScore(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
