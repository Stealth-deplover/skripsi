package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

type authAttemptBucket struct {
	Count      int
	ResetTime  time.Time
	BlockedTil time.Time
}

var authAttemptMu sync.Mutex
var authAttempts = map[string]authAttemptBucket{}

func checkAuthRateLimit(c *gin.Context, scope string, identity string, limit int) bool {
	key := scope + ":" + c.ClientIP() + ":" + strings.ToLower(strings.TrimSpace(identity))
	now := time.Now()
	window := 10 * time.Minute
	authAttemptMu.Lock()
	defer authAttemptMu.Unlock()

	bucket := authAttempts[key]
	if !bucket.BlockedTil.IsZero() && now.Before(bucket.BlockedTil) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi."})
		return false
	}
	if bucket.ResetTime.IsZero() || now.After(bucket.ResetTime) {
		bucket = authAttemptBucket{ResetTime: now.Add(window)}
	}
	bucket.Count++
	if bucket.Count > limit {
		bucket.BlockedTil = now.Add(5 * time.Minute)
		authAttempts[key] = bucket
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Terlalu banyak percobaan. Akses sementara dibatasi untuk keamanan."})
		return false
	}
	authAttempts[key] = bucket
	return true
}

func validateUsername(username string) string {
	if len(username) < 3 || len(username) > 80 {
		return "Username minimal 3 karakter dan maksimal 80 karakter"
	}
	for _, char := range username {
		if unicode.IsLetter(char) || unicode.IsDigit(char) || char == '_' || char == '-' || char == '.' || char == '@' {
			continue
		}
		return "Username hanya boleh berisi huruf, angka, titik, underscore, strip, atau email"
	}
	return ""
}

func validateEmail(email string) string {
	email = strings.TrimSpace(email)
	if len(email) < 5 || len(email) > 191 {
		return "Email tidak valid"
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || !strings.Contains(email, "@") {
		return "Email tidak valid"
	}
	return ""
}

func validateNIM(nim string) string {
	nim = strings.TrimSpace(nim)
	if len(nim) < 4 || len(nim) > 32 {
		return "NIM harus berisi 4 sampai 32 karakter"
	}
	for _, char := range nim {
		if unicode.IsLetter(char) || unicode.IsDigit(char) || char == '-' || char == '/' || char == '.' {
			continue
		}
		return "NIM hanya boleh berisi huruf, angka, titik, garis miring, atau strip"
	}
	return ""
}

func validatePassword(password string) string {
	if len(password) < 8 {
		return "Kata sandi minimal 8 karakter"
	}
	var hasLower, hasUpper, hasDigit bool
	for _, char := range password {
		switch {
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsDigit(char):
			hasDigit = true
		}
	}
	if !hasLower || !hasUpper || !hasDigit {
		return "Kata sandi wajib mengandung huruf besar, huruf kecil, dan angka"
	}
	return ""
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		claims, err := ValidateJWT(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		var user User
		if err := DB.Where("username = ?", claims.Username).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Next()
	}
}

func RegisterHandler(c *gin.Context) {
	var input struct {
		Email          string `json:"email" binding:"required"`
		Nim            string `json:"nim" binding:"required"`
		Password       string `json:"password" binding:"required"`
		Nama           string `json:"nama" binding:"required"`
		ProgramStudiID uint   `json:"program_studi_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi NIM, nama lengkap, email, program studi, dan kata sandi"})
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Nim = strings.TrimSpace(input.Nim)
	if !checkAuthRateLimit(c, "register", input.Email, 5) {
		return
	}

	input.Nama = strings.TrimSpace(input.Nama)

	if input.Nama == "" || len(input.Nama) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama lengkap minimal 3 karakter"})
		return
	}
	if message := validateEmail(input.Email); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if message := validateNIM(input.Nim); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if message := validatePassword(input.Password); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	program, ok := getProgramStudi(input.ProgramStudiID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Program studi tidak ditemukan atau tidak aktif"})
		return
	}

	var count int64
	DB.Model(&User{}).Where("username = ? OR email = ?", input.Email, input.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email sudah terdaftar"})
		return
	}
	DB.Model(&User{}).Where("nim = ? AND role = ?", input.Nim, RoleStudent).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "NIM sudah terdaftar"})
		return
	}

	hashedPassword, _ := HashPassword(input.Password)
	user := User{
		Username:       input.Email,
		Email:          input.Email,
		PasswordHash:   hashedPassword,
		Nama:           input.Nama,
		Role:           RoleStudent,
		Nim:            input.Nim,
		ProgramStudiID: program.ID,
		Prodi:          program.Name,
	}
	if err := DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat akun"})
		return
	}
	recordActivity(c, &user, "auth_register", "user", fmt.Sprintf("%d", user.ID), nil)

	c.JSON(http.StatusOK, gin.H{"message": "Akun mahasiswa berhasil dibuat", "user": authUserPayload(user)})
}

func LoginHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi email atau username dan kata sandi"})
		return
	}
	if !checkAuthRateLimit(c, "login", input.Username, 8) {
		return
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))

	var user User
	if err := DB.Where("username = ? OR email = ?", input.Username, input.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if !CheckPasswordHash(input.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	token, err := GenerateJWT(user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	recordActivity(c, &user, "auth_login", "user", fmt.Sprintf("%d", user.ID), gin.H{"method": "password"})
	c.JSON(http.StatusOK, gin.H{"token": token, "user": authUserPayload(user)})
}

func GoogleLoginHandler(c *gin.Context) {
	var input struct {
		AccessToken string `json:"access_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Access token is required"})
		return
	}
	if !checkAuthRateLimit(c, "google", c.ClientIP(), 12) {
		return
	}

	// Verify token with Google
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	req.Header.Add("Authorization", "Bearer "+input.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid Google token"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var googleUser struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	json.Unmarshal(body, &googleUser)

	if googleUser.Email == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to get email from Google"})
		return
	}
	googleUser.Email = strings.ToLower(strings.TrimSpace(googleUser.Email))
	googleUser.Name = strings.TrimSpace(googleUser.Name)
	if googleUser.Name == "" {
		googleUser.Name = googleUser.Email
	}

	var user User
	if err := DB.Where("username = ? OR email = ?", googleUser.Email, googleUser.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Akun Google belum terdaftar. Daftar melalui formulir mahasiswa dengan NIM dan program studi terlebih dahulu."})
		return
	}
	if user.Email == "" {
		DB.Model(&user).Update("email", googleUser.Email)
		user.Email = googleUser.Email
	}

	token, err := GenerateJWT(user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate internal token"})
		return
	}

	recordActivity(c, &user, "auth_login", "user", fmt.Sprintf("%d", user.ID), gin.H{"method": "google"})
	c.JSON(http.StatusOK, gin.H{"token": token, "user": authUserPayload(user)})
}

func authUserPayload(user User) gin.H {
	program, ok := programStudiForUser(user)
	payload := gin.H{
		"id":               user.ID,
		"username":         user.Username,
		"email":            user.Email,
		"nama":             user.Nama,
		"role":             normalizeRole(user.Role),
		"nim":              user.Nim,
		"program_studi_id": user.ProgramStudiID,
		"prodi":            user.Prodi,
		"dpa_id":           user.DpaID,
	}
	if ok {
		payload["program_studi"] = gin.H{"id": program.ID, "code": program.Code, "name": program.Name, "degree": program.Degree, "label": programStudiLabel(program)}
	}
	return payload
}

func ForgotPasswordHandler(c *gin.Context) {
	var input struct {
		Username    string `json:"username" binding:"required"`
		Nama        string `json:"nama" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi username, nama lengkap, dan kata sandi baru"})
		return
	}
	if !checkAuthRateLimit(c, "forgot", input.Username, 5) {
		return
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Nama = strings.TrimSpace(input.Nama)

	if message := validateUsername(input.Username); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if input.Nama == "" || len(input.Nama) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama lengkap minimal 3 karakter"})
		return
	}
	if message := validatePassword(input.NewPassword); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var user User
	if err := DB.Where("username = ? AND nama = ?", input.Username, input.Nama).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Data verifikasi tidak cocok"})
		return
	}
	if CheckPasswordHash(input.NewPassword, user.PasswordHash) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kata sandi baru tidak boleh sama dengan kata sandi lama"})
		return
	}

	hashedPassword, _ := HashPassword(input.NewPassword)
	if err := DB.Model(&user).Update("password_hash", hashedPassword).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mereset kata sandi"})
		return
	}

	recordActivity(c, &user, "auth_password_reset", "user", fmt.Sprintf("%d", user.ID), nil)
	c.JSON(http.StatusOK, gin.H{"message": "Kata sandi berhasil direset. Silakan masuk dengan kata sandi baru."})
}
