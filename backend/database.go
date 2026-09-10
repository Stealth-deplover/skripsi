package main

import (
	"fmt"
	"log"
	"os"

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
		&Assessment{},
		&HappinessAssessment{},
		&DpaNote{},
		&DpaMessage{},
		&DpaPoll{},
		&DpaPollOption{},
		&DpaPollVote{},
		&DpaRating{},
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
	SeedAdmin()
	SeedSuperadmin()
	SeedStaff()
	NormalizeSystemConfig()
	backfillLegacyQuantumMetrics()
}

// migrateRoles mengonversi role lama (admin/user) ke role baru
// (dpa/student) secara idempoten saat startup.
func migrateRoles() {
	if err := DB.Model(&User{}).Where("role = ?", "user").Update("role", RoleStudent).Error; err != nil {
		log.Println("Migrasi role user->student gagal:", err)
	}
	if err := DB.Model(&User{}).Where("role = ?", "admin").Update("role", RoleDPA).Error; err != nil {
		log.Println("Migrasi role admin->dpa gagal:", err)
	}
}

func SeedAdmin() {
	var admin User
	if err := DB.Where("username = ?", "admin").First(&admin).Error; err != nil {
		// Admin not found, let's create one as DPA
		hashedPassword, _ := HashPassword("admin123")
		newAdmin := User{
			Username:     "admin",
			PasswordHash: hashedPassword,
			Nama:         "Dosen Pembimbing Akademik",
			Role:         RoleDPA,
		}
		DB.Create(&newAdmin)
		log.Println("DPA user created successfully (username: admin, password: admin123).")
	} else {
		// Admin exists, update password and role to ensure it works
		hashedPassword, _ := HashPassword("admin123")
		DB.Model(&admin).Updates(map[string]interface{}{
			"password_hash": hashedPassword,
			"role":          RoleDPA,
		})
		log.Println("DPA user updated to ensure login works (username: admin, password: admin123).")
	}
}

// SeedSuperadmin membuat akun kaprodi (superadmin) untuk analitik tingkat prodi.
func SeedSuperadmin() {
	var kaprodi User
	if err := DB.Where("username = ?", "kaprodi").First(&kaprodi).Error; err != nil {
		hashedPassword, _ := HashPassword("kaprodi123")
		newKaprodi := User{
			Username:     "kaprodi",
			PasswordHash: hashedPassword,
			Nama:         "Ketua Program Studi",
			Role:         RoleSuperadmin,
		}
		DB.Create(&newKaprodi)
		log.Println("Kaprodi user created successfully (username: kaprodi, password: kaprodi123).")
	} else {
		hashedPassword, _ := HashPassword("kaprodi123")
		DB.Model(&kaprodi).Updates(map[string]interface{}{
			"password_hash": hashedPassword,
			"role":          RoleSuperadmin,
		})
		log.Println("Kaprodi user updated to ensure login works (username: kaprodi, password: kaprodi123).")
	}
}

// SeedStaff membuat akun staf kampus pemroses laporan bimbingan.
func SeedStaff() {
	var staff User
	if err := DB.Where("username = ?", "staff").First(&staff).Error; err != nil {
		hashedPassword, _ := HashPassword("staff123")
		newStaff := User{
			Username:     "staff",
			PasswordHash: hashedPassword,
			Nama:         "Staf Kampus",
			Role:         RoleStaff,
		}
		DB.Create(&newStaff)
		log.Println("Staff user created successfully (username: staff, password: staff123).")
	} else if !isStaffRole(staff.Role) {
		DB.Model(&staff).Update("role", RoleStaff)
		log.Println("Staff user role normalized (username: staff).")
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
