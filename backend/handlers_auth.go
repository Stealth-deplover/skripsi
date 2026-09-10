package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Nama     string `json:"nama" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi username, nama lengkap, dan kata sandi"})
		return
	}
	if !checkAuthRateLimit(c, "register", input.Username, 5) {
		return
	}

	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Nama = strings.TrimSpace(input.Nama)

	if input.Nama == "" || len(input.Nama) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama lengkap minimal 3 karakter"})
		return
	}
	if message := validateUsername(input.Username); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if message := validatePassword(input.Password); message != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var count int64
	DB.Model(&User{}).Where("username = ?", input.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username already taken"})
		return
	}

		hashedPassword, _ := HashPassword(input.Password)
	user := User{Username: input.Username, PasswordHash: hashedPassword, Nama: input.Nama, Role: RoleStudent}
	DB.Create(&user)
	recordActivity(c, &user, "auth_register", "user", fmt.Sprintf("%d", user.ID), nil)

	c.JSON(http.StatusOK, gin.H{"message": "User registered successfully"})
}

func LoginHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi username, nama lengkap, jenis akun, dan kata sandi baru"})
		return
	}
	if !checkAuthRateLimit(c, "login", input.Username, 8) {
		return
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))

	var user User
	if err := DB.Where("username = ?", input.Username).First(&user).Error; err != nil {
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
	c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"username": user.Username, "nama": user.Nama, "role": user.Role}})
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
	if err := DB.Where("username = ?", googleUser.Email).First(&user).Error; err != nil {
		// Create user if not exists
		user = User{Username: googleUser.Email, Nama: googleUser.Name, PasswordHash: "google-oauth-dummy", Role: RoleStudent}
		DB.Create(&user)
	}

	token, err := GenerateJWT(user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate internal token"})
		return
	}

	recordActivity(c, &user, "auth_login", "user", fmt.Sprintf("%d", user.ID), gin.H{"method": "google"})
	c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"username": user.Username, "nama": user.Nama, "role": user.Role}})
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
