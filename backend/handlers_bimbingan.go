package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// Bimbingan Akademik — sesi bimbingan mahasiswa↔DPA sebagai
// syarat mengikuti UTS/UAS, plus laporan DPA ke staf kampus.
// Minimum sesi terverifikasi per semester dikonfigurasi lewat
// SystemConfig (BimbinganMinUTS / BimbinganMinUAS).
// Aliran status:
//   sesi   : pending → verified | rejected (keputusan DPA)
//   laporan: diproses → selesai | ditolak  (keputusan staf)
// ============================================================

// currentSemester mengembalikan label semester akademik berjalan:
// Jul-Des = Ganjil, Jan-Jun = Genap (tahun akademik mulai Ganjil).
func currentSemester() string {
	now := time.Now()
	if now.Month() >= time.July {
		return fmt.Sprintf("Ganjil %d/%d", now.Year(), now.Year()+1)
	}
	return fmt.Sprintf("Genap %d/%d", now.Year()-1, now.Year())
}

func bimbinganVerifiedCount(dpaID uint, studentID uint, semester string) int64 {
	var count int64
	DB.Model(&Bimbingan{}).
		Where("dpa_id = ? AND student_id = ? AND semester = ? AND status = ?", dpaID, studentID, semester, "verified").
		Count(&count)
	return count
}

// bimbinganThresholdFor mengembalikan minimum sesi untuk jenis ujian.
func bimbinganThresholdFor(examType string, config SystemConfig) int {
	if examType == "UTS" {
		return config.BimbinganMinUTS
	}
	return config.BimbinganMinUAS
}

// ---- DPA ----

// DpaBimbinganHandler: daftar sesi + progres + laporan per mahasiswa
// bimbingan untuk satu semester (default semester berjalan).
func DpaBimbinganHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()
	semester := currentSemester()
	if raw := strings.TrimSpace(c.Query("semester")); raw != "" {
		semester = raw
	}

	type SessionItem struct {
		ID         uint      `json:"id"`
		StudentID  uint      `json:"student_id"`
		Topic      string    `json:"topic"`
		Notes      string    `json:"notes"`
		Ipk        float64   `json:"ipk"`
		Ips        float64   `json:"ips"`
		Sks        int       `json:"sks"`
		Kehadiran  float64   `json:"kehadiran"`
		Keluhan    string    `json:"keluhan"`
		Status     string    `json:"status"`
		RecordedBy string    `json:"recorded_by"`
		Timestamp  time.Time `json:"timestamp"`
	}
	type ReportItem struct {
		ID           uint       `json:"id"`
		StudentID    uint       `json:"student_id"`
		Semester     string     `json:"semester"`
		ExamType     string     `json:"exam_type"`
		SessionCount int        `json:"session_count"`
		Threshold    int        `json:"threshold"`
		Status       string     `json:"status"`
		Note         string     `json:"note"`
		StaffNote    string     `json:"staff_note"`
		SubmittedAt  time.Time  `json:"submitted_at"`
		ProcessedAt  *time.Time `json:"processed_at"`
	}
	type StudentBimbingan struct {
		ID            uint          `json:"id"`
		Nama          string        `json:"nama"`
		Nim           string        `json:"nim"`
		Prodi         string        `json:"prodi"`
		VerifiedCount int64         `json:"verified_count"`
		PendingCount  int64         `json:"pending_count"`
		RejectedCount int64         `json:"rejected_count"`
		UTSEligible   bool          `json:"uts_eligible"`
		UASEligible   bool          `json:"uas_eligible"`
		Sessions      []SessionItem `json:"sessions"`
		Reports       []ReportItem  `json:"reports"`
	}

	var sessions []Bimbingan
	DB.Where("dpa_id = ? AND semester = ?", dpa.ID, semester).Order("created_at ASC").Find(&sessions)
	var reports []BimbinganReport
	DB.Where("dpa_id = ? AND semester = ?", dpa.ID, semester).Order("submitted_at DESC").Find(&reports)

	sessionsByStudent := map[uint][]SessionItem{}
	counts := map[uint][3]int64{} // [verified, pending, rejected]
	for _, session := range sessions {
		sessionsByStudent[session.StudentID] = append(sessionsByStudent[session.StudentID], SessionItem{
			ID:         session.ID,
			StudentID:  session.StudentID,
			Topic:      session.Topic,
			Notes:      session.Notes,
			Ipk:        session.Ipk,
			Ips:        session.Ips,
			Sks:        session.Sks,
			Kehadiran:  session.Kehadiran,
			Keluhan:    session.Keluhan,
			Status:     session.Status,
			RecordedBy: session.RecordedBy,
			Timestamp:  session.Timestamp,
		})
		count := counts[session.StudentID]
		switch session.Status {
		case "verified":
			count[0]++
		case "pending":
			count[1]++
		default:
			count[2]++
		}
		counts[session.StudentID] = count
	}
	reportsByStudent := map[uint][]ReportItem{}
	for _, report := range reports {
		reportsByStudent[report.StudentID] = append(reportsByStudent[report.StudentID], ReportItem{
			ID:           report.ID,
			StudentID:    report.StudentID,
			Semester:     report.Semester,
			ExamType:     report.ExamType,
			SessionCount: report.SessionCount,
			Threshold:    report.Threshold,
			Status:       report.Status,
			Note:         report.Note,
			StaffNote:    report.StaffNote,
			SubmittedAt:  report.SubmittedAt,
			ProcessedAt:  report.ProcessedAt,
		})
	}

	students := dpaAdvisees(dpa.ID)
	items := make([]StudentBimbingan, 0, len(students))
	for _, student := range students {
		count := counts[student.ID]
		sessionItems := sessionsByStudent[student.ID]
		if sessionItems == nil {
			sessionItems = []SessionItem{}
		}
		reportItems := reportsByStudent[student.ID]
		if reportItems == nil {
			reportItems = []ReportItem{}
		}
		items = append(items, StudentBimbingan{
			ID:            student.ID,
			Nama:          student.Nama,
			Nim:           student.Nim,
			Prodi:         student.Prodi,
			VerifiedCount: count[0],
			PendingCount:  count[1],
			RejectedCount: count[2],
			UTSEligible:   count[0] >= int64(config.BimbinganMinUTS),
			UASEligible:   count[0] >= int64(config.BimbinganMinUAS),
			Sessions:      sessionItems,
			Reports:       reportItems,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"semester": semester,
		"min_uts":  config.BimbinganMinUTS,
		"min_uas":  config.BimbinganMinUAS,
		"students": items,
	})
}

// DpaCreateBimbinganHandler: DPA mencatat sesi bimbingan seorang
// mahasiswa (langsung terverifikasi).
func DpaCreateBimbinganHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)

	var input struct {
		StudentID uint    `json:"student_id" binding:"required"`
		Topic     string  `json:"topic" binding:"required"`
		Notes     string  `json:"notes"`
		Ipk       float64 `json:"ipk"`
		Ips       float64 `json:"ips"`
		Sks       int     `json:"sks"`
		Kehadiran float64 `json:"kehadiran"`
		Keluhan   string  `json:"keluhan"`
		Semester  string  `json:"semester"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mahasiswa dan topik bimbingan wajib diisi"})
		return
	}

	var student User
	if err := DB.First(&student, input.StudentID).Error; err != nil || student.DpaID != dpa.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Mahasiswa ini bukan bimbingan Anda"})
		return
	}

	semester := strings.TrimSpace(input.Semester)
	if semester == "" {
		semester = currentSemester()
	}
	session := Bimbingan{
		DpaID:      dpa.ID,
		StudentID:  student.ID,
		Semester:   semester,
		Topic:      truncateString(strings.TrimSpace(input.Topic), 255),
		Notes:      strings.TrimSpace(input.Notes),
		Ipk:        input.Ipk,
		Ips:        input.Ips,
		Sks:        input.Sks,
		Kehadiran:  input.Kehadiran,
		Keluhan:    strings.TrimSpace(input.Keluhan),
		Status:     "verified",
		RecordedBy: "dpa",
		Timestamp:  time.Now(),
	}
	if err := DB.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mencatat sesi bimbingan"})
		return
	}

	DB.Create(&Notification{
		UserID:  student.ID,
		Type:    "bimbingan",
		Message: fmt.Sprintf("Sesi bimbingan \"%s\" tercatat dan terverifikasi oleh %s.", session.Topic, dpa.Nama),
	})

	verified := bimbinganVerifiedCount(dpa.ID, student.ID, semester)
	c.JSON(http.StatusCreated, gin.H{
		"status":         "success",
		"session":        session,
		"verified_count": verified,
	})
}

// DpaBimbinganStatusHandler: DPA memverifikasi atau menolak sesi
// yang dicatat mahasiswa.
func DpaBimbinganStatusHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	sessionID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID sesi tidak valid"})
		return
	}

	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status wajib diisi"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status != "verified" && status != "rejected" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus verified atau rejected"})
		return
	}

	var session Bimbingan
	if err := DB.First(&session, sessionID).Error; err != nil || session.DpaID != dpa.ID {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sesi bimbingan tidak ditemukan"})
		return
	}
	if err := DB.Model(&session).Update("status", status).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui status sesi"})
		return
	}

	if status == "verified" {
		DB.Create(&Notification{
			UserID:  session.StudentID,
			Type:    "bimbingan",
			Message: fmt.Sprintf("Sesi bimbingan \"%s\" dikonfirmasi oleh %s dan dihitung sebagai syarat ujian.", session.Topic, dpa.Nama),
		})
	} else {
		DB.Create(&Notification{
			UserID:  session.StudentID,
			Type:    "bimbingan",
			Message: fmt.Sprintf("Sesi bimbingan \"%s\" ditolak oleh %s. Silakan konsultasi ulang.", session.Topic, dpa.Nama),
		})
	}

	verified := bimbinganVerifiedCount(session.DpaID, session.StudentID, session.Semester)
	c.JSON(http.StatusOK, gin.H{"status": "success", "session_status": status, "verified_count": verified})
}

// DpaBimbinganReportHandler: DPA mengirim laporan pemenuhan syarat
// UTS/UAS mahasiswa ke antrean staf kampus.
func DpaBimbinganReportHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	config := getSystemConfig()

	var input struct {
		StudentID uint   `json:"student_id" binding:"required"`
		ExamType  string `json:"exam_type" binding:"required"`
		Semester  string `json:"semester"`
		Note      string `json:"note"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mahasiswa dan jenis ujian wajib diisi"})
		return
	}
	examType := strings.ToUpper(strings.TrimSpace(input.ExamType))
	if examType != "UTS" && examType != "UAS" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis ujian harus UTS atau UAS"})
		return
	}

	var student User
	if err := DB.First(&student, input.StudentID).Error; err != nil || student.DpaID != dpa.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Mahasiswa ini bukan bimbingan Anda"})
		return
	}

	semester := strings.TrimSpace(input.Semester)
	if semester == "" {
		semester = currentSemester()
	}
	threshold := bimbinganThresholdFor(examType, config)
	verified := bimbinganVerifiedCount(dpa.ID, student.ID, semester)
	if verified < int64(threshold) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Syarat %s belum terpenuhi: %d/%d sesi terverifikasi pada semester %s.", examType, verified, threshold, semester),
		})
		return
	}

	// Cegah laporan ganda yang masih berjalan/selesai.
	var existing BimbinganReport
	if err := DB.Where("dpa_id = ? AND student_id = ? AND semester = ? AND exam_type = ? AND status IN ?",
		dpa.ID, student.ID, semester, examType, []string{"diproses", "selesai"}).First(&existing).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Laporan %s semester %s sudah ada (status: %s).", examType, semester, existing.Status),
		})
		return
	}

	report := BimbinganReport{
		DpaID:        dpa.ID,
		StudentID:    student.ID,
		Semester:     semester,
		ExamType:     examType,
		SessionCount: int(verified),
		Threshold:    threshold,
		Status:       "diproses",
		Note:         strings.TrimSpace(input.Note),
		SubmittedAt:  time.Now(),
	}
	if err := DB.Create(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengirim laporan"})
		return
	}

	var staffUsers []User
	DB.Where("role = ?", RoleStaff).Find(&staffUsers)
	for _, staffUser := range staffUsers {
		DB.Create(&Notification{
			UserID:  staffUser.ID,
			Type:    "bimbingan",
			Message: fmt.Sprintf("Laporan syarat %s untuk %s dari DPA %s menunggu diproses.", examType, student.Nama, dpa.Nama),
		})
	}
	DB.Create(&Notification{
		UserID:  student.ID,
		Type:    "bimbingan",
		Message: fmt.Sprintf("Laporan syarat %s semester %s telah dikirim ke staf kampus untuk diproses.", examType, semester),
	})

	c.JSON(http.StatusCreated, gin.H{"status": "success", "report": report})
}

// DpaBimbinganReportsHandler: seluruh laporan yang pernah dikirim
// DPA ini beserta status pemrosesan staf.
func DpaBimbinganReportsHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)

	var reports []BimbinganReport
	DB.Where("dpa_id = ?", dpa.ID).Order("submitted_at DESC").Limit(200).Find(&reports)

	type ReportRow struct {
		ID           uint       `json:"id"`
		StudentID    uint       `json:"student_id"`
		StudentName  string     `json:"student_name"`
		StudentNim   string     `json:"student_nim"`
		Semester     string     `json:"semester"`
		ExamType     string     `json:"exam_type"`
		SessionCount int        `json:"session_count"`
		Threshold    int        `json:"threshold"`
		Status       string     `json:"status"`
		Note         string     `json:"note"`
		StaffNote    string     `json:"staff_note"`
		SubmittedAt  time.Time  `json:"submitted_at"`
		ProcessedAt  *time.Time `json:"processed_at"`
	}
	studentNames := map[uint]User{}
	studentIDs := []uint{}
	for _, report := range reports {
		studentIDs = append(studentIDs, report.StudentID)
	}
	if len(studentIDs) > 0 {
		var students []User
		DB.Where("id IN ?", studentIDs).Find(&students)
		for _, student := range students {
			studentNames[student.ID] = student
		}
	}
	items := make([]ReportRow, 0, len(reports))
	for _, report := range reports {
		student := studentNames[report.StudentID]
		items = append(items, ReportRow{
			ID:           report.ID,
			StudentID:    report.StudentID,
			StudentName:  student.Nama,
			StudentNim:   student.Nim,
			Semester:     report.Semester,
			ExamType:     report.ExamType,
			SessionCount: report.SessionCount,
			Threshold:    report.Threshold,
			Status:       report.Status,
			Note:         report.Note,
			StaffNote:    report.StaffNote,
			SubmittedAt:  report.SubmittedAt,
			ProcessedAt:  report.ProcessedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"reports": items})
}

// ---- Student ----

// StudentBimbinganHandler: progres syarat, daftar sesi, dan status
// laporan untuk mahasiswa yang login.
func StudentBimbinganHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	semester := currentSemester()
	if raw := strings.TrimSpace(c.Query("semester")); raw != "" {
		semester = raw
	}

	if user.DpaID == 0 {
		c.JSON(http.StatusOK, gin.H{
			"semester": semester,
			"min_uts":  config.BimbinganMinUTS,
			"min_uas":  config.BimbinganMinUAS,
			"dpa":      nil,
			"sessions": []gin.H{},
			"reports":  []gin.H{},
		})
		return
	}

	var dpa User
	DB.First(&dpa, user.DpaID)

	var sessions []Bimbingan
	DB.Where("dpa_id = ? AND student_id = ? AND semester = ?", user.DpaID, user.ID, semester).Order("created_at ASC").Find(&sessions)
	var reports []BimbinganReport
	DB.Where("student_id = ? AND semester = ?", user.ID, semester).Order("submitted_at DESC").Find(&reports)

	verified := bimbinganVerifiedCount(user.DpaID, user.ID, semester)
	var pending int64
	DB.Model(&Bimbingan{}).
		Where("dpa_id = ? AND student_id = ? AND semester = ? AND status = ?", user.DpaID, user.ID, semester, "pending").
		Count(&pending)

	type SessionItem struct {
		ID         uint      `json:"id"`
		Topic      string    `json:"topic"`
		Notes      string    `json:"notes"`
		Ipk        float64   `json:"ipk"`
		Ips        float64   `json:"ips"`
		Sks        int       `json:"sks"`
		Kehadiran  float64   `json:"kehadiran"`
		Keluhan    string    `json:"keluhan"`
		Status     string    `json:"status"`
		RecordedBy string    `json:"recorded_by"`
		Timestamp  time.Time `json:"timestamp"`
	}
	sessionItems := make([]SessionItem, 0, len(sessions))
	for _, session := range sessions {
		sessionItems = append(sessionItems, SessionItem{
			ID:         session.ID,
			Topic:      session.Topic,
			Notes:      session.Notes,
			Ipk:        session.Ipk,
			Ips:        session.Ips,
			Sks:        session.Sks,
			Kehadiran:  session.Kehadiran,
			Keluhan:    session.Keluhan,
			Status:     session.Status,
			RecordedBy: session.RecordedBy,
			Timestamp:  session.Timestamp,
		})
	}

	type ReportItem struct {
		ID           uint       `json:"id"`
		Semester     string     `json:"semester"`
		ExamType     string     `json:"exam_type"`
		SessionCount int        `json:"session_count"`
		Threshold    int        `json:"threshold"`
		Status       string     `json:"status"`
		StaffNote    string     `json:"staff_note"`
		SubmittedAt  time.Time  `json:"submitted_at"`
		ProcessedAt  *time.Time `json:"processed_at"`
	}
	reportItems := make([]ReportItem, 0, len(reports))
	for _, report := range reports {
		reportItems = append(reportItems, ReportItem{
			ID:           report.ID,
			Semester:     report.Semester,
			ExamType:     report.ExamType,
			SessionCount: report.SessionCount,
			Threshold:    report.Threshold,
			Status:       report.Status,
			StaffNote:    report.StaffNote,
			SubmittedAt:  report.SubmittedAt,
			ProcessedAt:  report.ProcessedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"semester":       semester,
		"min_uts":        config.BimbinganMinUTS,
		"min_uas":        config.BimbinganMinUAS,
		"dpa":            gin.H{"id": dpa.ID, "nama": dpa.Nama},
		// Data akademik terkini dipakai mengisi otomatis formulir
		// pencatatan sesi baru di popup mahasiswa.
		"profile":        gin.H{"ipk": user.Ipk, "ips": user.Ips, "sks": user.Sks, "kehadiran": user.Kehadiran},
		"verified_count": verified,
		"pending_count":  pending,
		"uts_eligible":   verified >= int64(config.BimbinganMinUTS),
		"uas_eligible":   verified >= int64(config.BimbinganMinUAS),
		"sessions":       sessionItems,
		"reports":        reportItems,
	})
}

// StudentCreateBimbinganHandler: mahasiswa mencatat sesi bimbingan
// (status pending, menunggu konfirmasi DPA).
func StudentCreateBimbinganHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	if user.DpaID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Anda belum dipetakan ke DPA pembimbing"})
		return
	}

	var input struct {
		Topic     string  `json:"topic" binding:"required"`
		Notes     string  `json:"notes"`
		Ipk       float64 `json:"ipk"`
		Ips       float64 `json:"ips"`
		Sks       int     `json:"sks"`
		Kehadiran float64 `json:"kehadiran"`
		Keluhan   string  `json:"keluhan"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Topik bimbingan wajib diisi"})
		return
	}
	if input.Ipk < 0 || input.Ipk > 4 || input.Ips < 0 || input.Ips > 4 || input.Sks < 0 || input.Kehadiran < 0 || input.Kehadiran > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IPK/IPS harus 0–4, SKS ≥ 0, kehadiran 0–100%"})
		return
	}

	// Data akademik terkini disinkronkan ke profil mahasiswa
	// (hanya nilai yang diisi, agar nilainya tidak terhapus).
	profileUpdates := map[string]interface{}{}
	if input.Ipk > 0 {
		profileUpdates["ipk"] = input.Ipk
	}
	if input.Ips > 0 {
		profileUpdates["ips"] = input.Ips
	}
	if input.Sks > 0 {
		profileUpdates["sks"] = input.Sks
	}
	if input.Kehadiran > 0 {
		profileUpdates["kehadiran"] = input.Kehadiran
	}
	if len(profileUpdates) > 0 {
		DB.Model(&User{}).Where("id = ?", user.ID).Updates(profileUpdates)
	}

	session := Bimbingan{
		DpaID:      user.DpaID,
		StudentID:  user.ID,
		Semester:   currentSemester(),
		Topic:      truncateString(strings.TrimSpace(input.Topic), 255),
		Notes:      strings.TrimSpace(input.Notes),
		Ipk:        input.Ipk,
		Ips:        input.Ips,
		Sks:        input.Sks,
		Kehadiran:  input.Kehadiran,
		Keluhan:    strings.TrimSpace(input.Keluhan),
		Status:     "pending",
		RecordedBy: "student",
		Timestamp:  time.Now(),
	}
	if err := DB.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mencatat sesi bimbingan"})
		return
	}

	DB.Create(&Notification{
		UserID:  user.DpaID,
		Type:    "bimbingan",
		Message: fmt.Sprintf("%s mencatat sesi bimbingan \"%s\". Menunggu konfirmasi Anda.", user.Nama, session.Topic),
	})

	c.JSON(http.StatusCreated, gin.H{"status": "success", "session": session})
}

// ---- Staff ----

type staffReportRow struct {
	ID           uint       `json:"id"`
	DpaID        uint       `json:"dpa_id"`
	DpaName      string     `json:"dpa_name"`
	StudentID    uint       `json:"student_id"`
	StudentName  string     `json:"student_name"`
	StudentNim   string     `json:"student_nim"`
	StudentProdi string     `json:"student_prodi"`
	Semester     string     `json:"semester"`
	ExamType     string     `json:"exam_type"`
	SessionCount int        `json:"session_count"`
	Threshold    int        `json:"threshold"`
	Status       string     `json:"status"`
	Note         string     `json:"note"`
	StaffNote    string     `json:"staff_note"`
	SubmittedAt  time.Time  `json:"submitted_at"`
	ProcessedAt  *time.Time `json:"processed_at"`
}

func buildStaffReportRows(reports []BimbinganReport) []staffReportRow {
	userIDs := []uint{}
	for _, report := range reports {
		userIDs = append(userIDs, report.StudentID, report.DpaID)
	}
	usersByID := map[uint]User{}
	if len(userIDs) > 0 {
		var users []User
		DB.Where("id IN ?", userIDs).Find(&users)
		for _, user := range users {
			usersByID[user.ID] = user
		}
	}
	rows := make([]staffReportRow, 0, len(reports))
	for _, report := range reports {
		student := usersByID[report.StudentID]
		dpa := usersByID[report.DpaID]
		rows = append(rows, staffReportRow{
			ID:           report.ID,
			DpaID:        report.DpaID,
			DpaName:      dpa.Nama,
			StudentID:    report.StudentID,
			StudentName:  student.Nama,
			StudentNim:   student.Nim,
			StudentProdi: student.Prodi,
			Semester:     report.Semester,
			ExamType:     report.ExamType,
			SessionCount: report.SessionCount,
			Threshold:    report.Threshold,
			Status:       report.Status,
			Note:         report.Note,
			StaffNote:    report.StaffNote,
			SubmittedAt:  report.SubmittedAt,
			ProcessedAt:  report.ProcessedAt,
		})
	}
	return rows
}

// StaffBimbinganReportsHandler: antrean laporan syarat UTS/UAS
// untuk staf kampus (filter opsional ?status=diproses).
func StaffBimbinganReportsHandler(c *gin.Context) {
	query := DB.Model(&BimbinganReport{})
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("status = ?", status)
	}
	var reports []BimbinganReport
	query.Order("submitted_at DESC").Limit(300).Find(&reports)
	c.JSON(http.StatusOK, gin.H{"reports": buildStaffReportRows(reports)})
}

// staffReportForStaff memuat laporan beserta validasi akses staf.
func staffReportForStaff(c *gin.Context) (BimbinganReport, bool) {
	reportID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID laporan tidak valid"})
		return BimbinganReport{}, false
	}
	var report BimbinganReport
	if err := DB.First(&report, reportID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Laporan tidak ditemukan"})
		return BimbinganReport{}, false
	}
	return report, true
}

// StaffBimbinganReportDetailHandler: detail satu laporan termasuk
// daftar sesi terverifikasi yang menjadi dasarnya.
func StaffBimbinganReportDetailHandler(c *gin.Context) {
	report, ok := staffReportForStaff(c)
	if !ok {
		return
	}
	rows := buildStaffReportRows([]BimbinganReport{report})
	var sessions []Bimbingan
	DB.Where("dpa_id = ? AND student_id = ? AND semester = ? AND status = ?",
		report.DpaID, report.StudentID, report.Semester, "verified").Order("created_at ASC").Find(&sessions)
	c.JSON(http.StatusOK, gin.H{"report": rows[0], "sessions": sessions})
}

// StaffBimbinganReportStatusHandler: staf memproses laporan
// (selesai | ditolak) dengan catatan.
func StaffBimbinganReportStatusHandler(c *gin.Context) {
	report, ok := staffReportForStaff(c)
	if !ok {
		return
	}
	var input struct {
		Status    string `json:"status" binding:"required"`
		StaffNote string `json:"staff_note"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status wajib diisi"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status != "selesai" && status != "ditolak" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status harus selesai atau ditolak"})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"status":       status,
		"staff_note":   strings.TrimSpace(input.StaffNote),
		"processed_at": &now,
	}
	if err := DB.Model(&report).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui laporan"})
		return
	}

	var student User
	DB.First(&student, report.StudentID)
	statusLabel := "selesai diproses"
	if status == "ditolak" {
		statusLabel = "ditolak staf kampus"
	}
	DB.Create(&Notification{
		UserID:  report.StudentID,
		Type:    "bimbingan",
		Message: fmt.Sprintf("Laporan syarat %s semester %s Anda %s. Catatan staf: %s", report.ExamType, report.Semester, statusLabel, orDash(strings.TrimSpace(input.StaffNote))),
	})
	DB.Create(&Notification{
		UserID:  report.DpaID,
		Type:    "bimbingan",
		Message: fmt.Sprintf("Laporan syarat %s untuk %s telah %s oleh staf kampus.", report.ExamType, student.Nama, statusLabel),
	})

	DB.First(&report, report.ID)
	c.JSON(http.StatusOK, gin.H{"status": "success", "report": report})
}

// StaffBimbinganReportDocHandler: dokumen laporan bimbingan
// (format=pdf|txt) untuk arsip staf kampus.
func StaffBimbinganReportDocHandler(c *gin.Context) {
	report, ok := staffReportForStaff(c)
	if !ok {
		return
	}
	var student User
	DB.First(&student, report.StudentID)
	var dpa User
	DB.First(&dpa, report.DpaID)

	format := strings.ToLower(c.DefaultQuery("format", "pdf"))
	lines := []pdfReportLine{
		{Text: "QC ANALYTICS - UMCI", Size: 16, Bold: true, Space: 10},
		{Text: fmt.Sprintf("LAPORAN BIMBINGAN AKADEMIK - SYARAT %s", report.ExamType), Size: 13, Bold: true, Space: 16},
		{Text: fmt.Sprintf("Semester          : %s", report.Semester), Size: 10, Space: 4},
		{Text: fmt.Sprintf("Nama Mahasiswa    : %s", orDash(student.Nama)), Size: 10, Space: 4},
		{Text: fmt.Sprintf("NIM               : %s", orDash(student.Nim)), Size: 10, Space: 4},
		{Text: fmt.Sprintf("Program Studi     : %s", orDash(student.Prodi)), Size: 10, Space: 4},
		{Text: fmt.Sprintf("DPA Pembimbing    : %s", orDash(dpa.Nama)), Size: 10, Space: 10},
		{Text: fmt.Sprintf("Sesi Terverifikasi: %d dari minimum %d sesi", report.SessionCount, report.Threshold), Size: 10, Bold: true, Space: 14},
	}

	var sessions []Bimbingan
	DB.Where("dpa_id = ? AND student_id = ? AND semester = ? AND status = ?",
		report.DpaID, report.StudentID, report.Semester, "verified").Order("created_at ASC").Find(&sessions)
	lines = append(lines, pdfReportLine{Text: "RINCIAN SESI BIMBINGAN", Size: 12, Bold: true, Space: 8})
	if len(sessions) == 0 {
		lines = append(lines, pdfReportLine{Text: "  - (tidak ada sesi terverifikasi)", Size: 10, Space: 4})
	}
	for _, session := range sessions {
		lines = append(lines, pdfReportLine{
			Text: fmt.Sprintf("  - %s | %s", session.Timestamp.Format("02 Jan 2006"), session.Topic),
			Size: 10, Space: 4,
		})
	}

	if strings.TrimSpace(report.Note) != "" {
		lines = append(lines,
			pdfReportLine{Text: "CATATAN DPA", Size: 12, Bold: true, Space: 8},
			pdfReportLine{Text: report.Note, Size: 10, Space: 10},
		)
	}
	lines = append(lines,
		pdfReportLine{Text: "STATUS PEMROSESAN STAF", Size: 12, Bold: true, Space: 8},
		pdfReportLine{Text: fmt.Sprintf("Status            : %s", strings.ToUpper(report.Status)), Size: 10, Bold: true, Space: 4},
		pdfReportLine{Text: fmt.Sprintf("Catatan staf      : %s", orDash(report.StaffNote)), Size: 10, Space: 4},
		pdfReportLine{Text: fmt.Sprintf("Dikirim           : %s", report.SubmittedAt.Format("02 Jan 2006 15:04")), Size: 10, Space: 4},
	)
	if report.ProcessedAt != nil {
		lines = append(lines, pdfReportLine{Text: fmt.Sprintf("Diproses          : %s", report.ProcessedAt.Format("02 Jan 2006 15:04")), Size: 10, Space: 4})
	}
	lines = append(lines,
		pdfReportLine{Text: "Catatan: Dokumen ini adalah Bukti pemenuhan syarat bimbingan akademik.", Size: 9, Space: 8},
		pdfReportLine{Text: fmt.Sprintf("Dicetak oleh staf kampus - %s", time.Now().Format("02 Jan 2006 15:04")), Size: 9, Space: 4},
	)

	if format == "txt" {
		var sb strings.Builder
		for _, line := range lines {
			sb.WriteString(line.Text)
			sb.WriteString("\n")
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=bimbingan-report-%d.txt", report.ID))
		c.String(http.StatusOK, sb.String())
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=bimbingan-report-%d.pdf", report.ID))
	c.Data(http.StatusOK, "application/pdf", renderSimplePDF(paginatePDFLines(lines)))
}
