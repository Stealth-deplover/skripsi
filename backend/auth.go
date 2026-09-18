package main

import (
	"crypto/rand"
	"log"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtKey []byte

func configureJWTKey() {
	secret := strings.TrimSpace(getEnv("SECRET_KEY", ""))
	if secret != "" {
		if len(secret) < 32 {
			log.Fatal("SECRET_KEY harus memiliki panjang minimal 32 karakter")
		}
		jwtKey = []byte(secret)
		return
	}
	if strings.EqualFold(getEnv("APP_ENV", "development"), "production") {
		log.Fatal("SECRET_KEY wajib diisi pada environment production")
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatal("Gagal membuat secret key development:", err)
	}
	jwtKey = key
	log.Println("SECRET_KEY tidak diatur; memakai key acak sementara untuk development")
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

type Claims struct {
	Username string `json:"sub"`
	jwt.RegisteredClaims
}

func GenerateJWT(username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

func ValidateJWT(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}
	return claims, nil
}
