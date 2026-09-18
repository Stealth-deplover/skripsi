package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Demo seed sengaja opt-in. Data ini hanya dibuat ketika SEED_DEMO_DATA=true
// dan DEMO_PASSWORD diisi, sehingga tidak pernah masuk ke database produksi
// secara tidak sengaja.
const demoSeedMarker = "demo_seed_umci_ti_v1"

type demoStudentSpec struct {
	Username    string
	Email       string
	Nama        string
	NIM         string
	Angkatan    string
	Semester    int
	Ipk         float64
	Ips         float64
	Sks         int
	Kehadiran   float64
	DPAGroup    string
	Burnout     []float64
	Psychosom   []float64
	Risks       []string
	Happiness   []float64
	MBTI        string
	MBTITitle   string
	ProfileNote string
}

var demoStudentSpecs = []demoStudentSpec{
	{Username: "ti20230001", Email: "ti20230001@umci.demo", Nama: "Andi Pratama", NIM: "TI20230001", Angkatan: "2023", Semester: 8, Ipk: 3.62, Ips: 3.74, Sks: 138, Kehadiran: 94, DPAGroup: "iskandar", Burnout: []float64{3.2, 4.1, 5.2}, Psychosom: []float64{2.8, 3.6, 4.5}, Risks: []string{"Low", "Medium", "Medium"}, Happiness: []float64{74, 78}, MBTI: "ENTJ", MBTITitle: "The Commander", ProfileNote: "Sedang mematangkan topik tugas akhir dan persiapan sidang."},
	{Username: "ti20230002", Email: "ti20230002@umci.demo", Nama: "Siti Aulia", NIM: "TI20230002", Angkatan: "2023", Semester: 8, Ipk: 3.84, Ips: 3.90, Sks: 142, Kehadiran: 97, DPAGroup: "iskandar", Burnout: []float64{2.6, 3.2, 3.1}, Psychosom: []float64{2.4, 2.8, 3.0}, Risks: []string{"Low", "Low", "Low"}, Happiness: []float64{82, 86}, MBTI: "ENFJ", MBTITitle: "The Protagonist", ProfileNote: "Aktif dalam kegiatan akademik dan organisasi mahasiswa."},
	{Username: "ti20230003", Email: "ti20230003@umci.demo", Nama: "Bima Saputra", NIM: "TI20230003", Angkatan: "2023", Semester: 8, Ipk: 3.28, Ips: 3.18, Sks: 130, Kehadiran: 86, DPAGroup: "iskandar", Burnout: []float64{4.1, 6.0, 7.4}, Psychosom: []float64{3.8, 5.5, 6.8}, Risks: []string{"Medium", "Medium", "High"}, Happiness: []float64{61, 55}, MBTI: "INTP", MBTITitle: "The Logician", ProfileNote: "Memerlukan pendampingan untuk menjaga ritme pengerjaan tugas akhir."},
	{Username: "ti20230004", Email: "ti20230004@umci.demo", Nama: "Citra Lestari", NIM: "TI20230004", Angkatan: "2023", Semester: 8, Ipk: 3.05, Ips: 2.94, Sks: 126, Kehadiran: 78, DPAGroup: "iskandar", Burnout: []float64{5.1, 6.8, 8.4}, Psychosom: []float64{4.8, 6.2, 7.6}, Risks: []string{"Medium", "High", "Crisis"}, Happiness: []float64{48, 42}, MBTI: "INFP", MBTITitle: "The Mediator", ProfileNote: "Perlu prioritas monitoring akademik dan tindak lanjut konseling."},
	{Username: "ti20230005", Email: "ti20230005@umci.demo", Nama: "Dimas Nugraha", NIM: "TI20230005", Angkatan: "2023", Semester: 8, Ipk: 3.47, Ips: 3.52, Sks: 135, Kehadiran: 91, DPAGroup: "iskandar", Burnout: []float64{3.4, 4.0, 4.9}, Psychosom: []float64{3.0, 3.7, 4.2}, Risks: []string{"Low", "Medium", "Medium"}, Happiness: []float64{70, 68}, MBTI: "ISTJ", MBTITitle: "The Logistician", ProfileNote: "Konsisten mengikuti bimbingan dan menyelesaikan target mingguan."},
	{Username: "ti20230006", Email: "ti20230006@umci.demo", Nama: "Nabila Rahma", NIM: "TI20230006", Angkatan: "2023", Semester: 8, Ipk: 3.76, Ips: 3.81, Sks: 140, Kehadiran: 96, DPAGroup: "iskandar", Burnout: []float64{2.2, 2.8, 3.8}, Psychosom: []float64{2.0, 2.6, 3.4}, Risks: []string{"Low", "Low", "Low"}, Happiness: []float64{88, 91}, MBTI: "ISFJ", MBTITitle: "The Defender", ProfileNote: "Menjadi salah satu mahasiswa dengan progres tugas akhir paling stabil."},
	{Username: "ti20240001", Email: "ti20240001@umci.demo", Nama: "Fajar Hidayat", NIM: "TI20240001", Angkatan: "2024", Semester: 6, Ipk: 3.41, Ips: 3.48, Sks: 90, Kehadiran: 92, DPAGroup: "ashari", Burnout: []float64{3.8, 4.7, 5.7}, Psychosom: []float64{3.2, 4.2, 5.0}, Risks: []string{"Low", "Medium", "Medium"}, Happiness: []float64{67, 64}, MBTI: "ESTJ", MBTITitle: "The Executive", ProfileNote: "Sedang menyiapkan proyek praktikum dan rencana magang."},
	{Username: "ti20240002", Email: "ti20240002@umci.demo", Nama: "Nadia Safitri", NIM: "TI20240002", Angkatan: "2024", Semester: 6, Ipk: 3.73, Ips: 3.79, Sks: 96, Kehadiran: 95, DPAGroup: "ashari", Burnout: []float64{2.6, 3.3, 3.9}, Psychosom: []float64{2.2, 2.9, 3.2}, Risks: []string{"Low", "Low", "Low"}, Happiness: []float64{78, 82}, MBTI: "ESFJ", MBTITitle: "The Consul", ProfileNote: "Aktif berdiskusi dan memiliki target belajar yang terukur."},
	{Username: "ti20240003", Email: "ti20240003@umci.demo", Nama: "Reza Firmansyah", NIM: "TI20240003", Angkatan: "2024", Semester: 6, Ipk: 3.16, Ips: 3.08, Sks: 88, Kehadiran: 83, DPAGroup: "ashari", Burnout: []float64{4.5, 5.9, 6.6}, Psychosom: []float64{4.0, 5.1, 6.0}, Risks: []string{"Medium", "Medium", "High"}, Happiness: []float64{63, 58}, MBTI: "ISTP", MBTITitle: "The Virtuoso", ProfileNote: "Perlu pendampingan untuk menjaga kehadiran dan fokus praktikum."},
	{Username: "ti20240004", Email: "ti20240004@umci.demo", Nama: "Intan Maharani", NIM: "TI20240004", Angkatan: "2024", Semester: 6, Ipk: 3.54, Ips: 3.58, Sks: 102, Kehadiran: 90, DPAGroup: "ashari", Burnout: []float64{3.0, 3.6, 4.2}, Psychosom: []float64{2.8, 3.2, 3.8}, Risks: []string{"Low", "Low", "Medium"}, Happiness: []float64{74, 72}, MBTI: "ENFP", MBTITitle: "The Campaigner", ProfileNote: "Membutuhkan penguatan manajemen waktu menjelang semester akhir."},
	{Username: "ti20240005", Email: "ti20240005@umci.demo", Nama: "Galih Ramadhan", NIM: "TI20240005", Angkatan: "2024", Semester: 6, Ipk: 2.98, Ips: 2.87, Sks: 84, Kehadiran: 75, DPAGroup: "ashari", Burnout: []float64{5.0, 6.4, 7.2}, Psychosom: []float64{4.6, 5.8, 6.5}, Risks: []string{"Medium", "High", "High"}, Happiness: []float64{52, 47}, MBTI: "ISFP", MBTITitle: "The Adventurer", ProfileNote: "Masuk daftar prioritas monitoring karena kombinasi akademik dan kehadiran."},
	{Username: "ti20240006", Email: "ti20240006@umci.demo", Nama: "Putri Amalia", NIM: "TI20240006", Angkatan: "2024", Semester: 6, Ipk: 3.68, Ips: 3.72, Sks: 98, Kehadiran: 94, DPAGroup: "ashari", Burnout: []float64{2.4, 3.0, 3.5}, Psychosom: []float64{2.1, 2.6, 3.0}, Risks: []string{"Low", "Low", "Low"}, Happiness: []float64{84, 88}, MBTI: "INFJ", MBTITitle: "The Advocate", ProfileNote: "Progres belajar konsisten dan aktif membantu kelompok praktikum."},
}

type demoUserSpec struct {
	Username  string
	Email     string
	Nama      string
	Role      string
	NIM       string
	Angkatan  string
	Semester  int
	Ipk       float64
	Ips       float64
	Sks       int
	Kehadiran float64
	Prodi     string
	ProgramID uint
	DpaID     uint
	Nip       string
	Phone     string
	Bio       string
}

// SeedDemoData mengisi data presentasi UMCI secara idempoten. Marker disimpan
// di activity_logs, sehingga restart aplikasi tidak menggandakan data demo.
func SeedDemoData() {
	if !strings.EqualFold(strings.TrimSpace(getEnv("SEED_DEMO_DATA", "false")), "true") {
		return
	}

	var marker ActivityLog
	if err := DB.Where("action = ?", demoSeedMarker).First(&marker).Error; err == nil {
		if err := repairDemoMBTIResults(); err != nil {
			log.Printf("Perbaikan hasil MBTI demo gagal: %v", err)
		}
		log.Printf("Seed demo sudah pernah dijalankan (%s)", demoSeedMarker)
		return
	}

	demoPassword := getEnv("DEMO_PASSWORD", "")
	if message := validatePassword(demoPassword); message != "" {
		log.Printf("Seed demo dilewati: DEMO_PASSWORD %s", strings.ToLower(message))
		return
	}

	var program ProgramStudi
	if err := DB.Where("code = ? AND is_active = ?", "TI", true).First(&program).Error; err != nil {
		log.Printf("Seed demo dilewati: program studi TI belum tersedia: %v", err)
		return
	}
	hashedPassword, err := HashPassword(demoPassword)
	if err != nil {
		log.Printf("Seed demo gagal membuat password: %v", err)
		return
	}

	kaprodi, err := ensureDemoUser(demoUserSpec{
		Username: "kaprodi.ti", Email: "kaprodi.ti@umci.demo", Nama: "Kaprodi Teknik Informatika", Role: RoleSuperadmin,
		ProgramID: program.ID, Prodi: program.Name, Nip: "KAP-TI-DEMO", Phone: "0812-0000-1001",
		Bio: "Akun demo Kaprodi Teknik Informatika untuk presentasi NexusMind UMCI.",
	}, hashedPassword)
	if err != nil {
		log.Printf("Seed demo gagal membuat Kaprodi: %v", err)
		return
	}
	iskandar, err := ensureDemoUser(demoUserSpec{
		Username: "iskandar.ti", Email: "iskandar.ti@umci.demo", Nama: "Pak Iskandar", Role: RoleDPA,
		ProgramID: program.ID, Prodi: program.Name, Nip: "DPA-TI-DEMO-01", Phone: "0812-0000-1002",
		Bio: "Dosen Pembimbing Akademik Teknik Informatika, pembimbing mahasiswa semester 8.",
	}, hashedPassword)
	if err != nil {
		log.Printf("Seed demo gagal membuat Pak Iskandar: %v", err)
		return
	}
	ashari, err := ensureDemoUser(demoUserSpec{
		Username: "ashari.ti", Email: "ashari.ti@umci.demo", Nama: "Pak Ashari", Role: RoleDPA,
		ProgramID: program.ID, Prodi: program.Name, Nip: "DPA-TI-DEMO-02", Phone: "0812-0000-1003",
		Bio: "Dosen Pembimbing Akademik Teknik Informatika, pembimbing mahasiswa semester 6.",
	}, hashedPassword)
	if err != nil {
		log.Printf("Seed demo gagal membuat Pak Ashari: %v", err)
		return
	}
	staff, err := ensureDemoUser(demoUserSpec{
		Username: "staff.demo", Email: "staff.demo@umci.demo", Nama: "Staf Akademik Demo", Role: RoleStaff,
		Phone: "0812-0000-1004", Bio: "Akun demo staf kampus untuk memproses laporan bimbingan akademik.",
	}, hashedPassword)
	if err != nil {
		log.Printf("Seed demo gagal membuat staf: %v", err)
		return
	}

	students := make([]struct {
		User User
		Spec demoStudentSpec
		Dpa  User
	}, 0, len(demoStudentSpecs))
	for _, spec := range demoStudentSpecs {
		dpa := iskandar
		if spec.DPAGroup == "ashari" {
			dpa = ashari
		}
		student, err := ensureDemoUser(demoUserSpec{
			Username: spec.Username, Email: spec.Email, Nama: spec.Nama, Role: RoleStudent,
			NIM: spec.NIM, Angkatan: spec.Angkatan, Semester: spec.Semester, Ipk: spec.Ipk, Ips: spec.Ips,
			Sks: spec.Sks, Kehadiran: spec.Kehadiran, ProgramID: program.ID, Prodi: program.Name, DpaID: dpa.ID,
			Bio: spec.ProfileNote,
		}, hashedPassword)
		if err != nil {
			log.Printf("Seed demo gagal membuat mahasiswa %s: %v", spec.NIM, err)
			return
		}
		if err := seedDemoStudentRecords(student, spec, dpa, staff, kaprodi); err != nil {
			log.Printf("Seed demo gagal membuat data mahasiswa %s: %v", spec.NIM, err)
			return
		}
		students = append(students, struct {
			User User
			Spec demoStudentSpec
			Dpa  User
		}{student, spec, dpa})
	}

	if err := seedDemoBimbingan(students, staff); err != nil {
		log.Printf("Seed demo gagal membuat bimbingan: %v", err)
		return
	}
	if err := seedDemoDpaWorkspace(iskandar, ashari, kaprodi, students); err != nil {
		log.Printf("Seed demo gagal membuat workspace DPA: %v", err)
		return
	}
	if err := seedDemoSocialWorkspace(students); err != nil {
		log.Printf("Seed demo gagal membuat data sosial: %v", err)
		return
	}

	if err := DB.Create(&ActivityLog{Action: demoSeedMarker, Method: "SEED", Path: "demo-seed", StatusCode: 200, TargetType: "system", TargetID: "umci-ti"}).Error; err != nil {
		log.Printf("Seed demo selesai tetapi marker gagal disimpan: %v", err)
		return
	}
	log.Printf("Seed demo UMCI selesai: %d mahasiswa, DPA %s dan %s, Kaprodi %s, staf %s", len(students), iskandar.Username, ashari.Username, kaprodi.Username, staff.Username)
}

func repairDemoMBTIResults() error {
	var results []MBTIResult
	if err := DB.Where("source = ? AND question_set = ?", "demo-seed", "demo-mbti-2026").Find(&results).Error; err != nil {
		return err
	}

	for _, result := range results {
		var dimensions []MBTIDimensionResult
		if err := json.Unmarshal([]byte(result.DimensionsJSON), &dimensions); err == nil && len(dimensions) == len(mbtiDimensionAxes) {
			continue
		}
		encoded, err := json.Marshal(buildDemoMBTIDimensions(result.PersonalityType))
		if err != nil {
			return err
		}
		if err := DB.Model(&MBTIResult{}).Where("id = ?", result.ID).Update("dimensions_json", string(encoded)).Error; err != nil {
			return err
		}
	}

	return nil
}

func ensureDemoUser(spec demoUserSpec, hashedPassword string) (User, error) {
	var user User
	result := DB.Where("username = ?", spec.Username).First(&user)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		user = User{Username: spec.Username}
	} else if result.Error != nil {
		return User{}, result.Error
	}
	updates := map[string]interface{}{
		"username":         spec.Username,
		"email":            spec.Email,
		"password_hash":    hashedPassword,
		"nama":             spec.Nama,
		"role":             spec.Role,
		"nim":              spec.NIM,
		"angkatan":         spec.Angkatan,
		"semester":         spec.Semester,
		"ipk":              spec.Ipk,
		"ips":              spec.Ips,
		"sks":              spec.Sks,
		"kehadiran":        spec.Kehadiran,
		"prodi":            spec.Prodi,
		"program_studi_id": spec.ProgramID,
		"dpa_id":           spec.DpaID,
		"nip":              spec.Nip,
		"phone":            spec.Phone,
		"bio":              spec.Bio,
	}
	if spec.Role == RoleStaff {
		updates["program_studi_id"] = 0
		updates["prodi"] = ""
		updates["dpa_id"] = 0
	}
	if user.ID == 0 {
		user = User{
			Username: spec.Username, Email: spec.Email, PasswordHash: hashedPassword, Nama: spec.Nama, Role: spec.Role,
			Nim: spec.NIM, Angkatan: spec.Angkatan, Semester: spec.Semester, Ipk: spec.Ipk, Ips: spec.Ips,
			Sks: spec.Sks, Kehadiran: spec.Kehadiran, Prodi: spec.Prodi, ProgramStudiID: spec.ProgramID,
			DpaID: spec.DpaID, Nip: spec.Nip, Phone: spec.Phone, Bio: spec.Bio,
		}
		if spec.Role == RoleStaff {
			user.Prodi = ""
			user.ProgramStudiID = 0
			user.DpaID = 0
		}
		if err := DB.Create(&user).Error; err != nil {
			return User{}, err
		}
	} else if err := DB.Model(&user).Updates(updates).Error; err != nil {
		return User{}, err
	}
	return user, DB.First(&user, user.ID).Error
}

func seedDemoStudentRecords(student User, spec demoStudentSpec, dpa User, staff User, kaprodi User) error {
	now := time.Now()
	for i, burnout := range spec.Burnout {
		at := now.AddDate(0, 0, -(70 - i*30))
		fatigue := clamp(burnout+0.4, 0, 10)
		cynicism := clamp(burnout-0.8, 0, 10)
		efficacy := clamp(9.2-burnout*0.35, 0, 10)
		responses, _ := json.Marshal(map[string]interface{}{"source": "demo-seed", "fatigue": fatigue, "cynicism": cynicism, "efficacy": efficacy})
		assessment := Assessment{
			UserID: student.ID, OrderType: "balanced", ResponsesJSON: string(responses),
			InterferenceScore: clamp(0.25+burnout/15, 0, 1), OrderEffectScore: clamp(0.2+burnout/18, 0, 1),
			CognitiveDissonanceScore: clamp(0.18+burnout/20, 0, 1), FatigueScore: fatigue, CynicismScore: cynicism,
			EfficacyScore: efficacy, NLPStressScore: clamp(0.18+burnout/12, 0, 1), Timestamp: at,
		}
		if err := DB.Create(&assessment).Error; err != nil {
			return err
		}
		prediction := Prediction{
			AssessmentID: assessment.ID, UserID: student.ID, BurnoutScore: burnout,
			PsychosomaticScore: spec.Psychosom[i], RiskLevel: spec.Risks[i], ModelVersion: activeModelVersion + ":demo", Timestamp: at.Add(2 * time.Hour),
		}
		if err := DB.Create(&prediction).Error; err != nil {
			return err
		}
	}

	for i, index := range spec.Happiness {
		at := now.AddDate(0, 0, -(52 - i*42))
		academic := clamp(index+2, 0, 100)
		motivation := clamp(index+4, 0, 100)
		social := clamp(index-3, 0, 100)
		lecturer := clamp(index+1, 0, 100)
		environment := clamp(index-1, 0, 100)
		facilities := clamp(index-5, 0, 100)
		responses, _ := json.Marshal(demoHappinessResponses(index))
		assessment := HappinessAssessment{
			UserID: student.ID, ResponsesJSON: string(responses), AcademicScore: academic, MotivationScore: motivation,
			SocialScore: social, LecturerScore: lecturer, EnvironmentScore: environment, FacilitiesScore: facilities,
			HappinessIndex: index, Category: classifyHappiness(index), Timestamp: at,
		}
		if err := DB.Create(&assessment).Error; err != nil {
			return err
		}
	}

	for i := 0; i < 2; i++ {
		at := now.AddDate(0, 0, -(3 - i*2))
		risk := spec.Risks[len(spec.Risks)-1]
		stress, mood, energy, sleep := 2, 4, 4, 7.0
		if risk == "Medium" {
			stress, mood, energy, sleep = 3, 3, 3, 6.2
		}
		if risk == "High" {
			stress, mood, energy, sleep = 4, 2, 2, 5.1
		}
		if risk == "Crisis" {
			stress, mood, energy, sleep = 5, 1, 2, 4.2
		}
		if i == 0 {
			stress = maxInt(1, stress-1)
			mood = minInt(5, mood+1)
		}
		if err := DB.Create(&DailyCheckIn{UserID: student.ID, MoodScore: mood, EnergyScore: energy, SleepHours: sleep, StressScore: stress, Notes: "Check-in demo untuk presentasi monitoring harian.", Timestamp: at}).Error; err != nil {
			return err
		}
	}

	latestPrediction := Prediction{}
	if err := DB.Where("user_id = ?", student.ID).Order("timestamp DESC").First(&latestPrediction).Error; err != nil {
		return err
	}
	risk := latestPrediction.RiskLevel
	curhatStress, curhatBurnout, curhatPsycho := 0.28, 0.32, 0.26
	priority, status := "rendah", "new"
	if risk == "Medium" {
		curhatStress, curhatBurnout, curhatPsycho, priority = 0.48, 0.5, 0.42, "sedang"
		status = "reviewing"
	}
	if risk == "High" {
		curhatStress, curhatBurnout, curhatPsycho, priority = 0.72, 0.78, 0.68, "tinggi"
		status = "reviewing"
	}
	if risk == "Crisis" {
		curhatStress, curhatBurnout, curhatPsycho, priority = 0.9, 0.92, 0.84, "darurat"
		status = "reviewing"
	}
	redFlags := []string{}
	if risk == "High" || risk == "Crisis" {
		redFlags = []string{"beban akademik meningkat", "pola tidur perlu dipantau"}
	}
	redFlagsJSON, _ := json.Marshal(redFlags)
	recommendationsJSON, _ := json.Marshal([]string{"Jadwalkan konsultasi dengan DPA", "Susun target belajar mingguan", "Gunakan layanan dukungan kampus bila diperlukan"})
	curhat := Curhat{
		UserID: student.ID, IsAnonymous: false,
		Text:        fmt.Sprintf("Saya sedang menghadapi dinamika kuliah semester %d. %s", student.Semester, spec.ProfileNote),
		StressScore: curhatStress, BurnoutScore: curhatBurnout, PsychosomaticScore: curhatPsycho, RiskLevel: risk,
		AnalysisConfidence: 0.91, CrisisFlag: risk == "Crisis", AdminPriority: priority, AdminStatus: status,
		AdminSummary: "Data demo untuk simulasi triage dan monitoring mahasiswa.", RedFlagsJSON: string(redFlagsJSON),
		RecommendationsJSON: string(recommendationsJSON), UserNextStepsJSON: string(recommendationsJSON), AnalysisSource: "demo-seed", AIMode: "friend",
		AIResponse: "Terima kasih sudah berbagi. Mari susun langkah kecil yang realistis dan bahas progresnya bersama DPA.", Timestamp: now.AddDate(0, 0, -7),
	}
	if err := DB.Create(&curhat).Error; err != nil {
		return err
	}
	if risk == "High" || risk == "Crisis" {
		if err := DB.Create(&CurhatReply{CurhatID: curhat.ID, UserID: dpa.ID, Text: "Terima kasih sudah menyampaikan kondisi ini. Kita jadwalkan bimbingan tambahan untuk menyusun langkah berikutnya."}).Error; err != nil {
			return err
		}
	}

	dimensionsJSON, err := json.Marshal(buildDemoMBTIDimensions(spec.MBTI))
	if err != nil {
		return err
	}
	mbti := MBTIResult{
		UserID: student.ID, QuestionSet: "demo-mbti-2026", PersonalityType: spec.MBTI, Title: spec.MBTITitle,
		Summary: "Hasil demo untuk memperlihatkan profil refleksi diri mahasiswa.", StrengthsJSON: `["Konsisten", "Mau belajar", "Kolaboratif"]`,
		WatchoutsJSON: `["Menjaga ritme", "Mengatur prioritas"]`, DimensionsJSON: string(dimensionsJSON),
		Source: "demo-seed", Timestamp: now.AddDate(0, 0, -14),
	}
	if err := DB.Create(&mbti).Error; err != nil {
		return err
	}

	if risk == "High" || risk == "Crisis" || risk == "Medium" {
		followUp := now.AddDate(0, 0, 7)
		category := "academic"
		status := "pending"
		priorityLabel := "medium"
		if risk == "High" || risk == "Crisis" {
			category, priorityLabel = "wellbeing", "high"
		}
		therapy := TherapyRecommendation{
			UserID: student.ID, PredictionID: latestPrediction.ID, ModuleName: "Rencana pemulihan dan monitoring mingguan",
			Category: category, Priority: priorityLabel, Duration: "1_week", FollowUpDate: &followUp, Status: status,
		}
		if err := DB.Create(&therapy).Error; err != nil {
			return err
		}
		if risk == "Medium" {
			score := 4
			completed := now.AddDate(0, 0, -4)
			if err := DB.Model(&therapy).Updates(map[string]interface{}{"status": "selesai", "outcome_score": score, "completed_at": completed}).Error; err != nil {
				return err
			}
			if err := DB.Create(&TreatmentReply{TherapyRecommendationID: therapy.ID, UserID: student.ID, Text: "Saya sudah mencoba target mingguan dan merasa lebih teratur.", Mood: "better", AdminSeen: false}).Error; err != nil {
				return err
			}
		}
	}

	if risk == "High" || risk == "Crisis" {
		if err := DB.Create(&DpaNote{DpaID: dpa.ID, StudentID: student.ID, Note: "Prioritas monitoring demo: cek progres akademik dan kondisi kesejahteraan pada bimbingan berikutnya.", Status: "perlu_tindak_lanjut", Timestamp: now.AddDate(0, 0, -2)}).Error; err != nil {
			return err
		}
		if err := DB.Create(&DpaReferral{DpaID: dpa.ID, StudentID: student.ID, PredictionID: latestPrediction.ID, ReferralType: "konseling_akademik", Destination: "Layanan Konseling Akademik UMCI", Priority: "tinggi", Reason: "Sinyal risiko demo memerlukan tindak lanjut terstruktur.", Recommendation: "Jadwalkan pertemuan dengan DPA dan evaluasi ulang minggu depan.", Status: "diproses", FollowUpDate: func() *time.Time { value := now.AddDate(0, 0, 7); return &value }(), BurnoutScore: latestPrediction.BurnoutScore, HappinessIndex: spec.Happiness[len(spec.Happiness)-1], Timestamp: now.AddDate(0, 0, -1)}).Error; err != nil {
			return err
		}
	}

	if err := DB.Create(&DpaRating{DpaID: dpa.ID, StudentID: student.ID, Stars: 4 + int(student.ID%2), Comment: "Pendampingan jelas dan responsif.", Semester: currentSemester(), Sentiment: "positif"}).Error; err != nil {
		return err
	}
	if err := DB.Create(&Notification{UserID: student.ID, Type: "demo_seed", Message: "Data demo berhasil dimuat. Periksa dashboard untuk melihat rangkaian asesmen dan bimbingan."}).Error; err != nil {
		return err
	}
	if risk == "High" || risk == "Crisis" {
		if err := DB.Create(&Notification{UserID: dpa.ID, Type: "student_wellbeing_priority", Message: fmt.Sprintf("[Demo] %s masuk prioritas monitoring dengan risiko %s.", student.Nama, risk)}).Error; err != nil {
			return err
		}
	}
	if err := DB.Create(&Notification{UserID: staff.ID, Type: "demo_seed", Message: fmt.Sprintf("[Demo] Data mahasiswa %s siap dipakai untuk presentasi laporan.", student.Nama)}).Error; err != nil {
		return err
	}
	if err := DB.Create(&Notification{UserID: kaprodi.ID, Type: "demo_seed", Message: fmt.Sprintf("[Demo] Dashboard Teknik Informatika berisi data %s.", student.Nama)}).Error; err != nil {
		return err
	}
	return nil
}

func seedDemoBimbingan(students []struct {
	User User
	Spec demoStudentSpec
	Dpa  User
}, staff User) error {
	semesterLabel := currentSemester()
	now := time.Now()
	for index, item := range students {
		sessionCount := 5
		if item.Spec.Semester == 8 {
			sessionCount = 8
		}
		for sessionIndex := 0; sessionIndex < sessionCount; sessionIndex++ {
			status := "verified"
			if sessionIndex == sessionCount-1 && index%4 == 0 {
				status = "pending"
			}
			at := now.AddDate(0, 0, -(45 - sessionIndex*5))
			session := Bimbingan{
				DpaID: item.Dpa.ID, StudentID: item.User.ID, Semester: semesterLabel,
				Topic: fmt.Sprintf("Evaluasi target akademik %d", sessionIndex+1),
				Notes: fmt.Sprintf("Catatan demo bimbingan sesi %d untuk %s.", sessionIndex+1, item.User.Nama),
				Ipk:   item.Spec.Ipk, Ips: item.Spec.Ips, Sks: item.Spec.Sks, Kehadiran: item.Spec.Kehadiran,
				Keluhan: "Menjaga konsistensi target mingguan.", Status: status, RecordedBy: "dpa", Timestamp: at,
			}
			if err := DB.Create(&session).Error; err != nil {
				return err
			}
		}

		utsStatus := "diproses"
		var utsProcessed *time.Time
		if index%3 == 0 {
			utsStatus = "selesai"
			value := now.AddDate(0, 0, -3)
			utsProcessed = &value
		}
		if err := createDemoReport(item, semesterLabel, "UTS", minInt(sessionCount, 4), 4, utsStatus, utsProcessed, staff, now); err != nil {
			return err
		}
		uasStatus := "diproses"
		if item.Spec.Semester == 6 && index%3 == 2 {
			uasStatus = "ditolak"
		}
		var uasProcessed *time.Time
		if uasStatus == "ditolak" {
			value := now.AddDate(0, 0, -2)
			uasProcessed = &value
		}
		if err := createDemoReport(item, semesterLabel, "UAS", sessionCount, 8, uasStatus, uasProcessed, staff, now); err != nil {
			return err
		}
	}
	return nil
}

func createDemoReport(item struct {
	User User
	Spec demoStudentSpec
	Dpa  User
}, semesterLabel string, examType string, count int, threshold int, status string, processedAt *time.Time, staff User, now time.Time) error {
	report := BimbinganReport{
		DpaID: item.Dpa.ID, StudentID: item.User.ID, Semester: semesterLabel, ExamType: examType,
		SessionCount: count, Threshold: threshold, Status: status,
		Note: fmt.Sprintf("Laporan demo %s untuk %s.", examType, item.User.Nama), SubmittedAt: now.AddDate(0, 0, -2), ProcessedAt: processedAt,
	}
	if status == "selesai" {
		report.StaffNote = "Diverifikasi staf akademik demo."
	} else if status == "ditolak" {
		report.StaffNote = "Demo: jumlah sesi atau dokumen perlu dilengkapi."
	}
	if err := DB.Create(&report).Error; err != nil {
		return err
	}
	message := fmt.Sprintf("[Demo] Laporan %s %s untuk %s.", examType, item.User.Nama, status)
	if err := DB.Create(&Notification{UserID: staff.ID, Type: "bimbingan", Message: message}).Error; err != nil {
		return err
	}
	return nil
}

func seedDemoDpaWorkspace(iskandar User, ashari User, kaprodi User, students []struct {
	User User
	Spec demoStudentSpec
	Dpa  User
}) error {
	now := time.Now()
	byDpa := map[uint]User{iskandar.ID: iskandar, ashari.ID: ashari}
	for _, dpa := range byDpa {
		firstStudent := User{}
		for _, item := range students {
			if item.Dpa.ID == dpa.ID {
				firstStudent = item.User
				break
			}
		}
		if firstStudent.ID == 0 {
			continue
		}
		messages := []DpaMessage{
			{DpaID: dpa.ID, SenderID: dpa.ID, SenderRole: RoleDPA, MsgType: "text", Body: fmt.Sprintf("Selamat datang di grup bimbingan %s.", currentSemester()), Timestamp: now.AddDate(0, 0, -6)},
			{DpaID: dpa.ID, SenderID: firstStudent.ID, SenderRole: RoleStudent, MsgType: "text", Body: "Terima kasih Pak, saya siap mengikuti target bimbingan minggu ini.", Timestamp: now.AddDate(0, 0, -5)},
			{DpaID: dpa.ID, SenderID: dpa.ID, SenderRole: RoleDPA, MsgType: "text", Body: "Silakan gunakan grup ini untuk update progres dan pertanyaan akademik.", Timestamp: now.AddDate(0, 0, -4)},
		}
		for _, message := range messages {
			if err := DB.Create(&message).Error; err != nil {
				return err
			}
		}
		start := now.AddDate(0, 0, 3).Truncate(time.Minute)
		if err := DB.Create(&DpaSlot{DpaID: dpa.ID, StartTime: start, EndTime: start.Add(45 * time.Minute), Capacity: 3, Topic: "Konsultasi progres akademik demo", Status: "tersedia"}).Error; err != nil {
			return err
		}
		start = now.AddDate(0, 0, 5).Truncate(time.Minute)
		if err := DB.Create(&DpaSlot{DpaID: dpa.ID, StartTime: start, EndTime: start.Add(45 * time.Minute), Capacity: 2, BookedBy: firstStudent.ID, Topic: "Review target semester", Status: "dipesan"}).Error; err != nil {
			return err
		}
		if err := DB.Create(&DpaFollowUp{DpaID: dpa.ID, Note: "Data demo menunjukkan perlunya review progres bimbingan secara berkala.", Status: "diproses", CreatedBy: kaprodi.ID}).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedDemoSocialWorkspace(students []struct {
	User User
	Spec demoStudentSpec
	Dpa  User
}) error {
	if len(students) < 3 {
		return nil
	}
	now := time.Now()
	posts := []Post{
		{UserID: students[0].User.ID, Text: "Target minggu ini: menyelesaikan revisi bab metodologi dan konsultasi dengan DPA.", Timestamp: now.AddDate(0, 0, -4)},
		{UserID: students[6].User.ID, Text: "Berbagi tips mengatur jadwal praktikum dan belajar untuk semester 6.", Timestamp: now.AddDate(0, 0, -2)},
		{UserID: students[3].User.ID, Text: "Sedikit demi sedikit, progres tugas akhir tetap berjalan.", Timestamp: now.AddDate(0, 0, -1)},
	}
	for index, post := range posts {
		if err := DB.Create(&post).Error; err != nil {
			return err
		}
		if err := DB.Create(&PostLike{PostID: post.ID, UserID: students[(index+1)%len(students)].User.ID}).Error; err != nil {
			return err
		}
		if err := DB.Create(&PostComment{PostID: post.ID, UserID: students[(index+2)%len(students)].User.ID, Text: "Semangat, targetnya jelas dan realistis.", Timestamp: now.AddDate(0, 0, -1)}).Error; err != nil {
			return err
		}
	}
	return nil
}

func demoHappinessResponses(index float64) map[string]int {
	value := 3
	switch {
	case index >= 80:
		value = 5
	case index >= 60:
		value = 4
	case index >= 40:
		value = 3
	case index >= 20:
		value = 2
	default:
		value = 1
	}
	responses := make(map[string]int, len(happinessQuestions))
	for _, question := range happinessQuestions {
		responses[question.ID] = value
	}
	return responses
}
