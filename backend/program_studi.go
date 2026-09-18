package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type programStudiSeed struct {
	Code   string
	Name   string
	Degree string
}

var officialProgramStudi = []programStudiSeed{
	{Code: "TI", Name: "Teknik Informatika", Degree: "S1"},
	{Code: "RPL", Name: "Rekayasa Perangkat Lunak", Degree: "S1"},
	{Code: "TEKNIK-INDUSTRI", Name: "Teknik Industri", Degree: "S1"},
	{Code: "TEKNIK-MESIN", Name: "Teknik Mesin", Degree: "S1"},
	{Code: "MANAJEMEN", Name: "Manajemen", Degree: "S1"},
	{Code: "ILMU-KOMUNIKASI", Name: "Ilmu Komunikasi", Degree: "S1"},
	{Code: "HUKUM", Name: "Hukum", Degree: "S1"},
}

func SeedProgramStudi() {
	for _, seed := range officialProgramStudi {
		var program ProgramStudi
		result := DB.Where("code = ?", seed.Code).First(&program)
		if result.Error == gorm.ErrRecordNotFound {
			if err := DB.Create(&ProgramStudi{Code: seed.Code, Name: seed.Name, Degree: seed.Degree, IsActive: true}).Error; err != nil {
				log.Printf("Gagal menambahkan program studi %s: %v", seed.Name, err)
			}
			continue
		}
		if result.Error != nil {
			log.Printf("Gagal membaca program studi %s: %v", seed.Name, result.Error)
			continue
		}
		updates := map[string]interface{}{"name": seed.Name, "degree": seed.Degree, "is_active": true}
		if err := DB.Model(&program).Updates(updates).Error; err != nil {
			log.Printf("Gagal memperbarui program studi %s: %v", seed.Name, err)
		}
	}
	backfillProgramStudi()
}

func normalizedProgramName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "(s1)", "")
	value = strings.ReplaceAll(value, "s1", "")
	value = strings.ReplaceAll(value, "program studi", "")
	value = strings.NewReplacer(" ", "", "-", "", "_", "").Replace(value)
	return value
}

func backfillProgramStudi() {
	var programs []ProgramStudi
	if err := DB.Where("is_active = ?", true).Find(&programs).Error; err != nil {
		log.Printf("Gagal membaca program studi untuk backfill: %v", err)
		return
	}
	byName := make(map[string]ProgramStudi, len(programs))
	for _, program := range programs {
		byName[normalizedProgramName(program.Name)] = program
	}

	var users []User
	if err := DB.Where("program_studi_id = 0 AND prodi <> ''").Find(&users).Error; err != nil {
		log.Printf("Gagal membaca user untuk backfill program studi: %v", err)
		return
	}
	for _, user := range users {
		program, ok := byName[normalizedProgramName(user.Prodi)]
		if !ok {
			continue
		}
		if err := DB.Model(&user).Updates(map[string]interface{}{
			"program_studi_id": program.ID,
			"prodi":            program.Name,
		}).Error; err != nil {
			log.Printf("Gagal memetakan user %d ke program studi: %v", user.ID, err)
		}
	}
}

func programStudiLabel(program ProgramStudi) string {
	if strings.TrimSpace(program.Degree) == "" {
		return program.Name
	}
	return fmt.Sprintf("%s (%s)", program.Name, program.Degree)
}

func getProgramStudi(id uint) (ProgramStudi, bool) {
	if id == 0 {
		return ProgramStudi{}, false
	}
	var program ProgramStudi
	if err := DB.Where("id = ? AND is_active = ?", id, true).First(&program).Error; err != nil {
		return ProgramStudi{}, false
	}
	return program, true
}

func getProgramStudiByName(name string) (ProgramStudi, bool) {
	key := normalizedProgramName(name)
	if key == "" {
		return ProgramStudi{}, false
	}
	var programs []ProgramStudi
	if err := DB.Where("is_active = ?", true).Find(&programs).Error; err != nil {
		return ProgramStudi{}, false
	}
	for _, program := range programs {
		if normalizedProgramName(program.Name) == key {
			return program, true
		}
	}
	return ProgramStudi{}, false
}

func programStudiForUser(user User) (ProgramStudi, bool) {
	if user.ProgramStudiID > 0 {
		if program, ok := getProgramStudi(user.ProgramStudiID); ok {
			return program, true
		}
	}
	var program ProgramStudi
	if strings.TrimSpace(user.Prodi) == "" {
		return ProgramStudi{}, false
	}
	var programs []ProgramStudi
	if err := DB.Where("is_active = ?", true).Find(&programs).Error; err != nil {
		return ProgramStudi{}, false
	}
	key := normalizedProgramName(user.Prodi)
	for _, candidate := range programs {
		if normalizedProgramName(candidate.Name) == key {
			program = candidate
			return program, true
		}
	}
	return ProgramStudi{}, false
}

func PublicProgramStudiHandler(c *gin.Context) {
	var programs []ProgramStudi
	if err := DB.Where("is_active = ?", true).Order("id ASC").Find(&programs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Daftar program studi tidak dapat dimuat"})
		return
	}
	type programDTO struct {
		ID     uint   `json:"id"`
		Code   string `json:"code"`
		Name   string `json:"name"`
		Degree string `json:"degree"`
		Label  string `json:"label"`
	}
	items := make([]programDTO, 0, len(programs))
	for _, program := range programs {
		items = append(items, programDTO{ID: program.ID, Code: program.Code, Name: program.Name, Degree: program.Degree, Label: programStudiLabel(program)})
	}
	c.JSON(http.StatusOK, gin.H{"program_studi": items})
}

func adminProgramScope(user User) uint {
	if isSuperadminRole(user.Role) {
		return user.ProgramStudiID
	}
	return 0
}

func scopedStudentSubquery(user User) *gorm.DB {
	return studentSubqueryForProgram(adminProgramScope(user))
}

func userSubqueryForProgram(programID uint) *gorm.DB {
	query := DB.Model(&User{}).Select("id")
	if programID > 0 {
		query = query.Where("program_studi_id = ?", programID)
	}
	return query
}

func studentSubqueryForProgram(programID uint) *gorm.DB {
	return userSubqueryForProgram(programID).Where("role = ?", RoleStudent)
}

func canAdminAccessUser(actor User, target User) bool {
	if !isSuperadminRole(actor.Role) || actor.ProgramStudiID == 0 {
		return true
	}
	if isStaffRole(target.Role) {
		return true
	}
	// Akun lama yang belum terpetakan harus tetap terlihat agar Kaprodi dapat
	// melengkapinya. Saat disimpan, validasi pada handler tetap membatasi
	// pemetaan hanya ke program studi Kaprodi tersebut.
	return target.ID == actor.ID || target.ProgramStudiID == 0 || target.ProgramStudiID == actor.ProgramStudiID
}

func requireAdminUserAccess(c *gin.Context, target User) bool {
	actor := c.MustGet("user").(User)
	if canAdminAccessUser(actor, target) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "Akun berada di luar program studi Anda"})
	return false
}

func validateProgramAssignment(role string, programID uint) (ProgramStudi, error) {
	role = normalizeRole(role)
	if role == RoleStaff {
		return ProgramStudi{}, nil
	}
	if programID == 0 {
		return ProgramStudi{}, fmt.Errorf("program studi wajib dipilih untuk role ini")
	}
	program, ok := getProgramStudi(programID)
	if !ok {
		return ProgramStudi{}, fmt.Errorf("program studi tidak ditemukan atau tidak aktif")
	}
	return program, nil
}

func validateDpaProgram(dpa User, programID uint) error {
	if !isDpaRole(dpa.Role) {
		return fmt.Errorf("akun tujuan bukan DPA")
	}
	if programID == 0 || dpa.ProgramStudiID == 0 || dpa.ProgramStudiID != programID {
		return fmt.Errorf("DPA harus berasal dari program studi yang sama")
	}
	return nil
}

func validateSingleKaprodi(programID uint, excludeID uint) error {
	if programID == 0 {
		return fmt.Errorf("program studi wajib dipilih untuk akun Kaprodi")
	}
	var count int64
	query := DB.Model(&User{}).Where("role = ? AND program_studi_id = ?", RoleSuperadmin, programID)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return fmt.Errorf("gagal memeriksa akun Kaprodi pada program studi")
	}
	if count > 0 {
		return fmt.Errorf("satu program studi hanya dapat memiliki satu Kaprodi")
	}
	return nil
}
