package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, role := range roles {
		allowed[strings.ToLower(strings.TrimSpace(role))] = true
	}

	return func(c *gin.Context) {
		user, ok := c.MustGet("user").(User)
		if !ok || !allowed[normalizeRole(user.Role)] {
			recordActivity(c, &user, "access_denied", "security", "", gin.H{"allowed_roles": roles})
			c.JSON(http.StatusForbidden, gin.H{"error": "Akses tidak diizinkan untuk role ini"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func ActivityLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		method := c.Request.Method
		if method == http.MethodGet || method == http.MethodOptions {
			return
		}

		user, _ := c.Get("user")
		if currentUser, ok := user.(User); ok {
			recordActivity(c, &currentUser, inferActivityAction(method, c.FullPath()), "", "", nil)
		}
	}
}

func recordActivity(c *gin.Context, user *User, action string, targetType string, targetID string, metadata interface{}) {
	if DB == nil {
		return
	}

	log := ActivityLog{
		Action:     truncateString(action, 96),
		Method:     c.Request.Method,
		Path:       truncateString(firstNonEmpty(c.FullPath(), c.Request.URL.Path), 512),
		StatusCode: c.Writer.Status(),
		IPAddress:  truncateString(c.ClientIP(), 64),
		UserAgent:  truncateString(c.Request.UserAgent(), 512),
		TargetType: truncateString(targetType, 96),
		TargetID:   truncateString(targetID, 96),
	}
	if user != nil {
		log.UserID = user.ID
		log.Username = user.Username
		log.Role = user.Role
	}
	if metadata != nil {
		if raw, err := json.Marshal(metadata); err == nil {
			log.Metadata = string(raw)
		}
	}

	DB.Create(&log)
}

func inferActivityAction(method string, path string) string {
	path = strings.ToLower(path)
	switch {
	case strings.Contains(path, "assessment/submit"):
		return "assessment_submitted"
	case strings.Contains(path, "mbti/submit"):
		return "mbti_submitted"
	case strings.Contains(path, "curhat"):
		return "curhat_updated"
	case strings.Contains(path, "treatment"):
		return "treatment_updated"
	case strings.Contains(path, "admin/config"):
		return "system_config_updated"
	case strings.Contains(path, "admin/users"):
		return "admin_user_management"
	case strings.Contains(path, "film"):
		return "cinema_updated"
	case strings.Contains(path, "post"):
		return "network_post_updated"
	case method == http.MethodDelete:
		return "record_deleted"
	case method == http.MethodPatch:
		return "record_patched"
	case method == http.MethodPut:
		return "record_updated"
	default:
		return "record_created"
	}
}

func AdminActivityLogsHandler(c *gin.Context) {
	actor := c.MustGet("user").(User)
	page := parsePositiveInt(c.DefaultQuery("page", "1"), 1)
	limit := parsePositiveInt(c.DefaultQuery("limit", "50"), 50)
	if limit > 100 {
		limit = 100
	}

	query := DB.Model(&ActivityLog{})
	query = query.Where("user_id IN (?)", userSubqueryForProgram(adminProgramScope(actor)))
	if role := strings.TrimSpace(c.Query("role")); role != "" {
		query = query.Where("role = ?", role)
	}
	if action := strings.TrimSpace(c.Query("action")); action != "" {
		query = query.Where("action = ?", action)
	}
	if username := strings.TrimSpace(c.Query("username")); username != "" {
		query = query.Where("username LIKE ?", "%"+username+"%")
	}

	var total int64
	query.Count(&total)

	var logs []ActivityLog
	if err := query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat activity log"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func AdminSystemHealthHandler(c *gin.Context) {
	actor := c.MustGet("user").(User)
	userScope := userSubqueryForProgram(adminProgramScope(actor))
	studentScope := scopedStudentSubquery(actor)
	sqlDB, dbErr := DB.DB()
	database := "ok"
	if dbErr != nil || sqlDB.Ping() != nil {
		database = "unavailable"
	}

	var users int64
	var assessments int64
	var predictions int64
	var logs24h int64
	since := time.Now().Add(-24 * time.Hour)
	DB.Model(&User{}).Where("id IN (?)", userScope).Count(&users)
	DB.Model(&Assessment{}).Where("user_id IN (?)", studentScope).Count(&assessments)
	DB.Model(&Prediction{}).Where("user_id IN (?)", studentScope).Count(&predictions)
	DB.Model(&ActivityLog{}).Where("user_id IN (?) AND created_at >= ?", userScope, since).Count(&logs24h)

	c.JSON(http.StatusOK, gin.H{
		"status":               map[bool]string{true: "ok", false: "degraded"}[database == "ok"],
		"database":             database,
		"ai_configured":        getSystemConfig().AIResponseEnabled,
		"openrouter_available": getEnv("OPENROUTER_API_KEY", "") != "",
		"users":                users,
		"assessments":          assessments,
		"predictions":          predictions,
		"activity_24h":         logs24h,
		"generated_at":         time.Now(),
	})
}

func parsePositiveInt(value string, fallback int) int {
	var result int
	if _, err := fmt.Sscanf(value, "%d", &result); err != nil || result <= 0 {
		return fallback
	}
	return result
}
