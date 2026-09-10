package main

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username     string `gorm:"uniqueIndex;size:191"`
	PasswordHash string
	Nama         string
	Role         string `gorm:"default:student"`
	Bio          string
	ProfilePic   string
	// Profil akademik mahasiswa (diisi Kaprodi/superadmin)
	Nim       string  `gorm:"size:32;index"`
	Prodi     string  `gorm:"size:128;index"`
	Angkatan  string  `gorm:"size:8;index"`
	Semester  int     `gorm:"default:0"`
	Ipk       float64 `gorm:"default:0"`
	Ips       float64 `gorm:"default:0"`
	Sks       int     `gorm:"default:0"`
	Kehadiran float64 `gorm:"default:0"`
	// Profil dosen (DPA), diisi sendiri oleh DPA
	Nip   string `gorm:"size:32"`
	Phone string `gorm:"size:32"`
	// Mapping mahasiswa ke DPA bimbingannya
	DpaID uint `gorm:"index;default:0"`
	Assessments            []Assessment
	HappinessAssessments   []HappinessAssessment
	MBTIResults            []MBTIResult
	Curhats                []Curhat
	Predictions            []Prediction
	TherapyRecommendations []TherapyRecommendation
}

type Follow struct {
	gorm.Model
	FollowerID  uint `gorm:"index"`
	FollowingID uint `gorm:"index"`
}

type Affinity struct {
	gorm.Model
	UserID       uint   `gorm:"index"`
	TargetUserID uint   `gorm:"index"`
	Type         string // teman, saudara, pacar
}

type Assessment struct {
	gorm.Model
	UserID                   uint
	OrderType                string
	ResponsesJSON            string
	InterferenceScore        float64
	OrderEffectScore         float64
	CognitiveDissonanceScore float64
	FatigueScore             float64
	CynicismScore            float64
	EfficacyScore            float64
	NLPStressScore           float64
	Timestamp                time.Time `gorm:"autoCreateTime"`
}

type MBTIResult struct {
	gorm.Model
	UserID          uint   `gorm:"index"`
	QuestionSet     string `gorm:"size:191"`
	ResponsesJSON   string
	PersonalityType string `gorm:"size:8;index"`
	Title           string
	Summary         string
	StrengthsJSON   string
	WatchoutsJSON   string
	DimensionsJSON  string
	Source          string    `gorm:"size:32"`
	Timestamp       time.Time `gorm:"autoCreateTime"`
}

type Curhat struct {
	gorm.Model
	UserID              uint
	User                User `gorm:"foreignKey:UserID"`
	IsAnonymous         bool `gorm:"default:true"`
	Text                string
	Image               string
	AttachmentName      string `gorm:"size:191"`
	AttachmentType      string `gorm:"size:64"`
	AttachmentData      string `gorm:"type:longtext"`
	AttachmentText      string `gorm:"type:longtext"`
	VoiceTranscript     string `gorm:"type:text"`
	MemorySummary       string `gorm:"type:text"`
	KeywordAnalysisJSON string `gorm:"type:longtext"`
	AgentInsightsJSON   string `gorm:"type:longtext"`
	StressScore         float64
	BurnoutScore        float64
	PsychosomaticScore  float64
	RiskLevel           string `gorm:"size:32;index"`
	AnalysisConfidence  float64
	CrisisFlag          bool   `gorm:"default:false;index"`
	AdminPriority       string `gorm:"size:32;index"`
	AdminStatus         string `gorm:"size:32;default:new;index"`
	AdminSummary        string `gorm:"type:text"`
	RedFlagsJSON        string `gorm:"type:text"`
	RecommendationsJSON string `gorm:"type:text"`
	UserNextStepsJSON   string `gorm:"type:text"`
	AnalysisSource      string `gorm:"size:32"`
	AIMode              string `gorm:"size:32;default:friend"`
	AIResponse          string
	Timestamp           time.Time `gorm:"autoCreateTime"`
	Replies             []CurhatReply
}

type GossipReact struct {
	gorm.Model
	CurhatID  uint
	UserID    uint
	ReactType string
}

type Prediction struct {
	gorm.Model
	AssessmentID           uint `gorm:"index"`
	UserID                 uint
	BurnoutScore           float64
	PsychosomaticScore     float64
	RiskLevel              string
	ModelVersion           string
	Timestamp              time.Time `gorm:"autoCreateTime"`
	TherapyRecommendations []TherapyRecommendation
}

type TherapyRecommendation struct {
	gorm.Model
	UserID       uint
	PredictionID uint
	ModuleName   string
	Category     string `gorm:"default:general"`
	Priority     string `gorm:"default:medium"`
	Duration     string `gorm:"default:1_week"`
	FollowUpDate *time.Time
	Status       string `gorm:"default:pending"`
	Replies      []TreatmentReply
}

type TreatmentReply struct {
	gorm.Model
	TherapyRecommendationID uint
	UserID                  uint
	Text                    string
	Mood                    string
	AdminSeen               bool `gorm:"default:false"`
}

type DailyCheckIn struct {
	gorm.Model
	UserID      uint      `gorm:"index"`
	MoodScore   int       `gorm:"default:3"`
	EnergyScore int       `gorm:"default:3"`
	SleepHours  float64   `gorm:"default:7"`
	StressScore int       `gorm:"default:3"`
	Notes       string    `gorm:"type:text"`
	Timestamp   time.Time `gorm:"autoCreateTime"`
}

type CurhatReply struct {
	gorm.Model
	CurhatID uint
	UserID   uint // if 0, maybe anonymous? We will keep it but still anonymous display
	Text     string
}

type Notification struct {
	gorm.Model
	UserID  uint
	Type    string
	Message string
	IsRead  bool `gorm:"default:false"`
}

type Message struct {
	gorm.Model
	SenderID   uint      `json:"SenderID"`
	ReceiverID uint      `json:"ReceiverID"`
	Text       string    `json:"Text"`
	Timestamp  time.Time `gorm:"autoCreateTime" json:"Timestamp"`
}

type Post struct {
	gorm.Model
	UserID    uint `gorm:"index"`
	Text      string
	Image     string
	Timestamp time.Time `gorm:"autoCreateTime"`
	Likes     []PostLike
	Comments  []PostComment
}

type PostLike struct {
	gorm.Model
	PostID uint `gorm:"index"`
	UserID uint `gorm:"index"`
}

type PostComment struct {
	gorm.Model
	PostID    uint `gorm:"index"`
	UserID    uint `gorm:"index"`
	Text      string
	Timestamp time.Time `gorm:"autoCreateTime"`
}

type UserFilm struct {
	gorm.Model
	UserID          uint   `gorm:"index"`
	Title           string `gorm:"size:191"`
	Studio          string `gorm:"size:191"`
	Duration        string `gorm:"size:64"`
	Mood            string `gorm:"size:64"`
	Description     string `gorm:"type:text"`
	EmbedURL        string `gorm:"size:512"`
	SourceURL       string `gorm:"size:512;index"`
	Accent          string `gorm:"size:32"`
	Tag             string `gorm:"size:64"`
	Category        string `gorm:"size:32;default:saved"`
	Status          string `gorm:"size:32;default:watchlist"`
	ProgressSeconds int
	Rating          int
	Notes           string `gorm:"type:text"`
	LastWatchedAt   *time.Time
}

type FilmWatchEvent struct {
	gorm.Model
	UserID          uint `gorm:"index"`
	UserFilmID      uint `gorm:"index"`
	Title           string
	SourceURL       string `gorm:"size:512"`
	Event           string `gorm:"size:32"`
	ProgressSeconds int
}

type FilmRecommendation struct {
	gorm.Model
	UserID    uint   `gorm:"index"`
	Mood      string `gorm:"size:191"`
	Query     string `gorm:"size:512"`
	Source    string `gorm:"size:64"`
	Reply     string `gorm:"type:text"`
	ItemsJSON string `gorm:"type:longtext"`
}

type ActivityLog struct {
	gorm.Model
	UserID     uint   `gorm:"index"`
	Username   string `gorm:"size:191;index"`
	Role       string `gorm:"size:32;index"`
	Action     string `gorm:"size:96;index"`
	Method     string `gorm:"size:12"`
	Path       string `gorm:"size:512;index"`
	StatusCode int
	IPAddress  string `gorm:"size:64"`
	UserAgent  string `gorm:"size:512"`
	TargetType string `gorm:"size:96"`
	TargetID   string `gorm:"size:96"`
	Metadata   string `gorm:"type:longtext"`
}

type HappinessAssessment struct {
	gorm.Model
	UserID             uint `gorm:"index"`
	ResponsesJSON      string `gorm:"type:longtext"`
	AcademicScore      float64
	MotivationScore    float64
	SocialScore        float64
	LecturerScore      float64
	EnvironmentScore   float64
	FacilitiesScore    float64
	HappinessIndex     float64
	Category           string `gorm:"size:32;index"`
	Timestamp          time.Time `gorm:"autoCreateTime"`
}

// DpaNote adalah catatan monitoring akademik yang dibuat DPA
// untuk mahasiswa bimbingannya.
type DpaNote struct {
	gorm.Model
	DpaID     uint `gorm:"index"`
	StudentID uint `gorm:"index"`
	Note      string `gorm:"type:text"`
	Status    string `gorm:"size:32;default:normal;index"`
	Timestamp time.Time `gorm:"autoCreateTime"`
}

// DpaMessage adalah pesan grup chat antara DPA dan mahasiswa bimbingannya.
// Satu DPA = satu grup; SenderID menunjuk pengirim (DPA atau student).
type DpaMessage struct {
	gorm.Model
	DpaID          uint `gorm:"index"`
	SenderID       uint `gorm:"index"`
	SenderRole     string `gorm:"size:16"` // dpa | student
	MsgType        string `gorm:"size:16;default:text;index"` // text | image | file | poll
	Body           string `gorm:"type:text"`
	AttachmentName string `gorm:"size:255"`
	AttachmentType string `gorm:"size:100"`
	AttachmentData string `gorm:"type:longtext"` // base64, dibaca via endpoint lampiran
	PollID         uint   `gorm:"index"`         // terisi bila MsgType = poll
	Timestamp      time.Time `gorm:"autoCreateTime"`
}

// DpaPoll adalah voting di dalam grup chat bimbingan.
type DpaPoll struct {
	gorm.Model
	DpaID     uint   `gorm:"index"`
	Question  string `gorm:"size:255"`
	Multi     bool
	CreatedBy uint
	Timestamp time.Time `gorm:"autoCreateTime"`
}

// DpaPollOption adalah pilihan jawaban sebuah polling.
type DpaPollOption struct {
	gorm.Model
	PollID uint   `gorm:"index"`
	Label  string `gorm:"size:255"`
	Sort   int
}

// DpaPollVote adalah suara anggota grup pada sebuah polling.
// Satu user boleh satu suara per opsi; aturan single-choice
// ditegakkan di handler.
type DpaPollVote struct {
	gorm.Model
	PollID   uint `gorm:"uniqueIndex:idx_poll_vote;index"`
	OptionID uint `gorm:"uniqueIndex:idx_poll_vote"`
	UserID   uint `gorm:"uniqueIndex:idx_poll_vote"`
}

// Bimbingan adalah catatan satu sesi bimbingan akademik mahasiswa
// dengan DPA-nya. Sesi dicatat mahasiswa (pending) atau DPA
// (langsung verified); hanya sesi verified yang dihitung sebagai
// syarat UTS/UAS. Saat mencatat, mahasiswa ikut mengirim data
// akademik terkini (IPK/IPS/SKS/kehadiran) dan keluhan.
type Bimbingan struct {
	gorm.Model
	DpaID      uint   `gorm:"index"`
	StudentID  uint   `gorm:"index"`
	Semester   string `gorm:"size:32;index"` // mis. "Ganjil 2026/2027"
	Topic      string `gorm:"size:255"`
	Notes      string `gorm:"type:text"`
	Ipk        float64
	Ips        float64
	Sks        int
	Kehadiran  float64
	Keluhan    string `gorm:"type:text"`
	Status     string `gorm:"size:16;default:pending;index"` // pending | verified | rejected
	RecordedBy string `gorm:"size:16"`                       // student | dpa
	Timestamp  time.Time `gorm:"autoCreateTime"`
}

// BimbinganReport adalah laporan DPA ke staf kampus yang
// menyatakan mahasiswa telah memenuhi syarat UTS/UAS untuk
// diproses staf (diproses | selesai | ditolak).
type BimbinganReport struct {
	gorm.Model
	DpaID        uint   `gorm:"index"`
	StudentID    uint   `gorm:"index"`
	Semester     string `gorm:"size:32;index"`
	ExamType     string `gorm:"size:8"` // UTS | UAS
	SessionCount int
	Threshold    int
	Status       string `gorm:"size:16;default:diproses;index"` // diproses | selesai | ditolak
	Note         string `gorm:"type:text"`                      // catatan DPA
	StaffNote    string `gorm:"type:text"`                      // catatan staf
	SubmittedAt  time.Time
	ProcessedAt  *time.Time
}

// DpaRating adalah penilaian bintang (1-5) mahasiswa terhadap performa
// DPA pembimbingnya. Satu mahasiswa = satu rating per DPA (upsert).
// Rating TIDAK PERNAH dikembalikan ke role dpa.
type DpaRating struct {
	gorm.Model
	DpaID     uint `gorm:"uniqueIndex:idx_dpa_rating_dpa_student;index"`
	StudentID uint `gorm:"uniqueIndex:idx_dpa_rating_dpa_student;index"`
	Stars     int
}

// DpaReferral adalah rujukan akademik yang dibuat DPA berdasarkan
// kondisi real-time mahasiswa (burnout, happiness, warning aktif).
type DpaReferral struct {
	gorm.Model
	DpaID         uint `gorm:"index"`
	StudentID     uint `gorm:"index"`
	PredictionID  uint
	ReferralType  string `gorm:"size:32"`
	Destination   string `gorm:"size:191"`
	Priority      string `gorm:"size:16;default:sedang"`
	Reason        string `gorm:"type:text"`
	Recommendation string `gorm:"type:text"`
	Status        string `gorm:"size:16;default:diproses;index"`
	FollowUpDate  *time.Time
	BurnoutScore  float64
	HappinessIndex float64
	Timestamp     time.Time `gorm:"autoCreateTime"`
}

type SystemConfig struct {
	gorm.Model
	BurnoutThresholdLow    float64 `gorm:"default:4"`
	BurnoutThresholdMedium float64 `gorm:"default:6"`
	PsychoThresholdLow     float64 `gorm:"default:4"`
	PsychoThresholdMedium  float64 `gorm:"default:6"`
	InterferenceWeight     float64 `gorm:"default:1.0"`
	EarlyWarningEnabled    bool    `gorm:"default:true"`
	EarlyWarningThreshold  float64 `gorm:"default:0.7"`
	MaintenanceMode        bool    `gorm:"default:false"`
	MaxAssessmentPerDay    int     `gorm:"default:3"`
	AIResponseEnabled      bool    `gorm:"default:true"`
	NotificationRetention  int     `gorm:"default:30"`
	DataRetentionDays      int     `gorm:"default:365"`
	ModelVersion           string  `gorm:"default:1.0.0"`
	AppName                string  `gorm:"default:QC Analytics"`
	// Minimum sesi bimbingan terverifikasi per semester sebagai
	// syarat mengikuti UTS/UAS.
	BimbinganMinUTS int `gorm:"default:4"`
	BimbinganMinUAS int `gorm:"default:8"`
	// Bobot Happiness Index (total = 1.0)
	HiWeightAcademic   float64 `gorm:"default:0.25"`
	HiWeightMotivation float64 `gorm:"default:0.20"`
	HiWeightSocial     float64 `gorm:"default:0.20"`
	HiWeightEnvironment float64 `gorm:"default:0.15"`
	HiWeightLecturer   float64 `gorm:"default:0.10"`
	HiWeightFacilities float64 `gorm:"default:0.10"`
	// Ambang early warning well-being
	WellbeingWarnBurnoutRise  float64 `gorm:"default:1.0"`
	WellbeingWarnHappinessDrop float64 `gorm:"default:10"`
}
