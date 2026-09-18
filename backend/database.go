package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDatabase() {
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "3306")
	user := getEnv("DB_USER", "root")
	pass := getEnv("DB_PASS", "")
	name := getEnv("DB_NAME", "nexusmind")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local", user, pass, host, port, name)

	database, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to MySQL database!", err)
	}

	log.Println("Connected to MySQL database:", name)

	err = database.AutoMigrate(
		&User{},
		&ProgramStudi{},
		&Assessment{},
		&HappinessAssessment{},
		&DpaNote{},
		&DpaMessage{},
		&DpaPoll{},
		&DpaPollOption{},
		&DpaPollVote{},
		&DpaRating{},
		&DpaFollowUp{},
		&DpaSlot{},
		&DpaReferral{},
		&Bimbingan{},
		&BimbinganReport{},
		&MBTIResult{},
		&Curhat{},
		&CurhatReply{},
		&Notification{},
		&GossipReact{},
		&Prediction{},
		&TherapyRecommendation{},
		&TreatmentReply{},
		&DailyCheckIn{},
		&Follow{},
		&Affinity{},
		&Message{},
		&SystemConfig{},
		&Post{},
		&PostLike{},
		&PostComment{},
		&UserFilm{},
		&FilmWatchEvent{},
		&FilmRecommendation{},
		&ActivityLog{},
	)
	if err != nil {
		log.Fatal("Failed to auto migrate database!", err)
	}

	DB = database

	migrateRoles()
	SeedProgramStudi()
	SeedAdmin()
	SeedSuperadmin()
	SeedStaff()
	NormalizeSystemConfig()
	backfillLegacyQuantumMetrics()
	SeedDemoData()
}

// migrateRoles mengonversi role lama (admin/user) ke role baru
// (dpa/student) secara idempoten saat startup.
func migrateRoles() {
	if err := DB.Model(&User{}).Where("role = ?", "user").Update("role", RoleStudent).Error; err != nil {
		log.Println("Migrasi role user->student gagal:", err)
	}
	if err := DB.Model(&User{}).Where("role IN ?", []string{"admin", "dosen"}).Update("role", RoleDPA).Error; err != nil {
		log.Println("Migrasi role admin/dosen->dpa gagal:", err)
	}
	if err := DB.Model(&User{}).Where("role = ?", "kaprodi").Update("role", RoleSuperadmin).Error; err != nil {
		log.Println("Migrasi role kaprodi->superadmin gagal:", err)
	}
	if err := DB.Model(&User{}).Where("role = ?", "staf").Update("role", RoleStaff).Error; err != nil {
		log.Println("Migrasi role staf->staff gagal:", err)
	}
	if err := DB.Model(&User{}).Where("role = ?", RoleStaff).Updates(map[string]interface{}{"program_studi_id": 0, "prodi": ""}).Error; err != nil {
		log.Println("Normalisasi staff global gagal:", err)
	}
}

func SeedAdmin() {
	seedBootstrapAccount("BOOTSTRAP_DPA", RoleDPA, "Dosen Pembimbing Akademik", true)
}

// SeedSuperadmin membuat akun kaprodi (superadmin) untuk analitik tingkat prodi.
func SeedSuperadmin() {
	seedBootstrapAccount("BOOTSTRAP_KAPRODI", RoleSuperadmin, "Ketua Program Studi", true)
}

// SeedStaff membuat akun staf kampus pemroses laporan bimbingan.
func SeedStaff() {
	seedBootstrapAccount("BOOTSTRAP_STAFF", RoleStaff, "Staf Kampus", false)
}

func seedBootstrapAccount(prefix string, role string, defaultName string, requiresProgram bool) {
	username := strings.ToLower(strings.TrimSpace(getEnv(prefix+"_USERNAME", "")))
	password := getEnv(prefix+"_PASSWORD", "")
	if username == "" || password == "" {
		return
	}

	programID := uint(0)
	if raw := strings.TrimSpace(getEnv(prefix+"_PROGRAM_STUDI_ID", "")); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			log.Printf("%s_PROGRAM_STUDI_ID tidak valid", prefix)
			return
		}
		programID = uint(parsed)
	}
	if requiresProgram {
		program, ok := getProgramStudi(programID)
		if !ok {
			log.Printf("Bootstrap %s dilewati: program studi wajib valid", prefix)
			return
		}
		_ = program
	}
	if role == RoleStaff {
		programID = 0
	}

	var account User
	if err := DB.Where("username = ?", username).First(&account).Error; err == nil {
		if role == RoleSuperadmin && (normalizeRole(account.Role) != RoleSuperadmin || account.ProgramStudiID != programID) {
			if err := validateSingleKaprodi(programID, account.ID); err != nil {
				log.Printf("Bootstrap %s dilewati: %v", prefix, err)
				return
			}
		}
		updates := map[string]interface{}{"role": role}
		if role == RoleStaff {
			updates["program_studi_id"] = 0
			updates["prodi"] = ""
		} else if programID > 0 {
			if program, ok := getProgramStudi(programID); ok {
				updates["program_studi_id"] = programID
				updates["prodi"] = program.Name
			}
		}
		DB.Model(&account).Updates(updates)
		return
	}
	if role == RoleSuperadmin {
		if err := validateSingleKaprodi(programID, 0); err != nil {
			log.Printf("Bootstrap %s dilewati: %v", prefix, err)
			return
		}
	}

	hashedPassword, err := HashPassword(password)
	if err != nil {
		log.Printf("Bootstrap %s gagal membuat password hash: %v", prefix, err)
		return
	}
	account = User{Username: username, PasswordHash: hashedPassword, Nama: defaultName, Role: role, ProgramStudiID: programID}
	if program, ok := getProgramStudi(programID); ok {
		account.Prodi = program.Name
	}
	if err := DB.Create(&account).Error; err != nil {
		log.Printf("Bootstrap %s gagal membuat akun: %v", prefix, err)
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func NormalizeSystemConfig() {
	var config SystemConfig
	if err := DB.First(&config).Error; err != nil {
		DB.Create(&SystemConfig{
			BurnoutThresholdLow:    4,
			BurnoutThresholdMedium: 6,
			PsychoThresholdLow:     4,
			PsychoThresholdMedium:  6,
		})
		return
	}

	if config.BurnoutThresholdLow > 10 || config.BurnoutThresholdMedium > 10 ||
		config.PsychoThresholdLow > 10 || config.PsychoThresholdMedium > 10 {
		DB.Model(&config).Updates(map[string]interface{}{
			"burnout_threshold_low":    4,
			"burnout_threshold_medium": 6,
			"psycho_threshold_low":     4,
			"psycho_threshold_medium":  6,
		})
	}
}
