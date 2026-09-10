package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func UserHistoryHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	config := getSystemConfig()
	cutoff := retentionCutoff(config.DataRetentionDays)

	var predictions []Prediction
	if err := DB.Where("user_id = ? AND timestamp >= ?", user.ID, cutoff).Order("timestamp DESC").Find(&predictions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch predictions"})
		return
	}

	var assessments []Assessment
	if err := DB.Where("user_id = ? AND timestamp >= ?", user.ID, cutoff).Order("timestamp DESC").Find(&assessments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assessments"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"predictions": predictions,
		"assessments": assessments,
	})
}

func UserProfileGetHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var followerCount int64
	DB.Model(&Follow{}).Where("following_id = ?", user.ID).Count(&followerCount)

	var followingCount int64
	DB.Model(&Follow{}).Where("follower_id = ?", user.ID).Count(&followingCount)

	response := gin.H{
		"id":              user.ID,
		"username":        user.Username,
		"nama":            user.Nama,
		"bio":             user.Bio,
		"profile_pic":     user.ProfilePic,
		"nip":             user.Nip,
		"phone":           user.Phone,
		"follower_count":  followerCount,
		"following_count": followingCount,
	}
	c.JSON(http.StatusOK, response)
}

func UserProfilePutHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var input struct {
		Username   string `json:"username"`
		Nama       string `json:"nama"`
		Password   string `json:"password"`
		Bio        string `json:"bio"`
		ProfilePic string `json:"profile_pic"`
		Nip        string `json:"nip"`
		Phone      string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"bio": input.Bio,
	}

	if input.ProfilePic != "" {
		updates["profile_pic"] = input.ProfilePic
	}

	if input.Nama != "" {
		updates["nama"] = strings.TrimSpace(input.Nama)
	}

	// Profil dosen: NIP dan nomor telepon (karakter terbatas agar aman ditampilkan).
	if input.Nip != "" {
		nip := strings.TrimSpace(input.Nip)
		if len(nip) > 32 || !isValidContact(nip) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "NIP/NIDN hanya boleh berisi angka, huruf, titik, atau strip"})
			return
		}
		updates["nip"] = nip
	}
	if input.Phone != "" {
		phone := strings.TrimSpace(input.Phone)
		if len(phone) > 32 || !isValidContact(phone) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nomor telepon hanya boleh berisi angka, spasi, tanda +, atau strip"})
			return
		}
		updates["phone"] = phone
	}

	authChanged := false

	if input.Username != "" && input.Username != user.Username {
		var count int64
		DB.Model(&User{}).Where("username = ?", input.Username).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username already taken"})
			return
		}
		updates["username"] = input.Username
		authChanged = true
	}

	if input.Password != "" {
		hashedPassword, _ := HashPassword(input.Password)
		updates["password_hash"] = hashedPassword
		authChanged = true
	}

	if err := DB.Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
		return
	}

	var updated User
	DB.First(&updated, user.ID)

	c.JSON(http.StatusOK, gin.H{
		"status":       "success",
		"message":      "Profile updated",
		"auth_changed": authChanged,
		"user": gin.H{
			"id":          updated.ID,
			"username":    updated.Username,
			"nama":        updated.Nama,
			"role":        updated.Role,
			"bio":         updated.Bio,
			"profile_pic": updated.ProfilePic,
			"nip":         updated.Nip,
			"phone":       updated.Phone,
		},
	})
}

// isValidContact membatasi karakter NIP/NIDN dan nomor telepon.
func isValidContact(value string) bool {
	for _, char := range value {
		if (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			char == '+' || char == '-' || char == '.' || char == ' ' || char == '(' || char == ')' {
			continue
		}
		return false
	}
	return true
}

func NetworkUsersHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	var users []User
	// Hanya tampilkan mahasiswa/karyawan (student) di jejaring
	DB.Where("id != ? AND role = ?", user.ID, RoleStudent).Find(&users)

	type NetworkUserDTO struct {
		ID         uint   `json:"id"`
		Nama       string `json:"nama"`
		Username   string `json:"username"`
		Bio        string `json:"bio"`
		ProfilePic string `json:"profile_pic"`
		IsFollowed bool   `json:"is_followed"`
		Affinity   string `json:"affinity"`
	}

	var results []NetworkUserDTO
	for _, u := range users {
		// Check if current user follows this user
		var count int64
		DB.Model(&Follow{}).Where("follower_id = ? AND following_id = ?", user.ID, u.ID).Count(&count)

		// Check affinity
		var affinity Affinity
		affinityType := ""
		if err := DB.Where("user_id = ? AND target_user_id = ?", user.ID, u.ID).First(&affinity).Error; err == nil {
			affinityType = affinity.Type
		}

		results = append(results, NetworkUserDTO{
			ID:         u.ID,
			Nama:       u.Nama,
			Username:   u.Username,
			Bio:        u.Bio,
			ProfilePic: u.ProfilePic,
			IsFollowed: count > 0,
			Affinity:   affinityType,
		})
	}

	c.JSON(http.StatusOK, gin.H{"users": results})
}

func NetworkFollowHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	targetID := c.Param("id")

	var targetUser User
	if err := DB.First(&targetUser, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target user not found"})
		return
	}

	var follow Follow
	result := DB.Where("follower_id = ? AND following_id = ?", user.ID, targetUser.ID).First(&follow)

	if result.Error == nil {
		// Already following, so unfollow
		DB.Delete(&follow)
		c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Unfollowed", "is_followed": false})
	} else {
		// Follow
		newFollow := Follow{FollowerID: user.ID, FollowingID: targetUser.ID}
		DB.Create(&newFollow)
		c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Followed", "is_followed": true})
	}
}

func NetworkAffinityHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	targetID := c.Param("id")

	var targetUser User
	if err := DB.First(&targetUser, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target user not found"})
		return
	}

	var input struct {
		Type string `json:"type" binding:"required"` // teman, pacar, saudara, or empty to remove
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var affinity Affinity
	result := DB.Where("user_id = ? AND target_user_id = ?", user.ID, targetUser.ID).First(&affinity)

	if input.Type == "" || input.Type == "none" {
		if result.Error == nil {
			DB.Delete(&affinity)
		}
		c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Affinity removed", "affinity": ""})
		return
	}

	if result.Error == nil {
		// Update
		affinity.Type = input.Type
		DB.Save(&affinity)
	} else {
		// Create
		affinity = Affinity{UserID: user.ID, TargetUserID: targetUser.ID, Type: input.Type}
		DB.Create(&affinity)
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Affinity updated", "affinity": affinity.Type})
}

func GosipGetHandler(c *gin.Context) {
	var curhats []Curhat
	DB.Preload("Replies").Order("timestamp desc").Limit(20).Find(&curhats)
	c.JSON(http.StatusOK, gin.H{"curhats": curhats})
}

func NetworkConversationsHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	type ConvResult struct {
		ID         uint
		Nama       string
		Username   string
		ProfilePic string
		LastText   string
		LastTime   time.Time
		PartnerID  uint
	}

	var convs []ConvResult
	DB.Raw(`
		SELECT DISTINCT u.id, u.nama, u.username, u.profile_pic,
			COALESCE(lm.text, '') AS last_text, COALESCE(lm.timestamp, u.created_at) AS last_time,
			u.id AS partner_id
		FROM users u
		INNER JOIN messages m ON (m.sender_id = u.id OR m.receiver_id = u.id)
		LEFT JOIN LATERAL (
			SELECT text, timestamp FROM messages
			WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?)
			ORDER BY timestamp DESC LIMIT 1
		) lm ON true
		WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
		GROUP BY u.id
		ORDER BY last_time DESC
		LIMIT 30
	`, user.ID, user.ID, user.ID, user.ID, user.ID).Scan(&convs)

	type ConversationDTO struct {
		ID          uint      `json:"id"`
		Nama        string    `json:"nama"`
		Username    string    `json:"username"`
		ProfilePic  string    `json:"profile_pic"`
		LastMessage string    `json:"last_message"`
		LastTime    time.Time `json:"last_time"`
	}

	var results []ConversationDTO
	for _, c := range convs {
		results = append(results, ConversationDTO{
			ID:          c.ID,
			Nama:        c.Nama,
			Username:    c.Username,
			ProfilePic:  c.ProfilePic,
			LastMessage: c.LastText,
			LastTime:    c.LastTime,
		})
	}

	if results == nil {
		results = []ConversationDTO{}
	}
	c.JSON(http.StatusOK, gin.H{"conversations": results})
}

func NetworkMessagesHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	targetID := c.Param("userId")

	var target User
	if err := DB.First(&target, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var messages []Message
	DB.Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		user.ID, targetID, targetID, user.ID,
	).Order("timestamp ASC").Limit(100).Find(&messages)

	if messages == nil {
		messages = []Message{}
	}

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
		"partner": gin.H{
			"id":          target.ID,
			"nama":        target.Nama,
			"username":    target.Username,
			"profile_pic": target.ProfilePic,
		},
	})
}

func NetworkSendMessageHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	targetID := c.Param("userId")

	var input struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pesan tidak boleh kosong"})
		return
	}

	var target User
	if err := DB.First(&target, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	msg := Message{
		SenderID:   user.ID,
		ReceiverID: target.ID,
		Text:       input.Text,
		Timestamp:  time.Now(),
	}

	if err := DB.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengirim pesan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": msg})
}

func NetworkUserProfileHandler(c *gin.Context) {
	currentUser := c.MustGet("user").(User)
	username := c.Param("username")

	var target User
	if err := DB.Where("username = ?", username).First(&target).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	var followerCount, followingCount int64
	DB.Model(&Follow{}).Where("following_id = ?", target.ID).Count(&followerCount)
	DB.Model(&Follow{}).Where("follower_id = ?", target.ID).Count(&followingCount)

	var isFollowed bool
	var followCount int64
	DB.Model(&Follow{}).Where("follower_id = ? AND following_id = ?", currentUser.ID, target.ID).Count(&followCount)
	isFollowed = followCount > 0

	var affinityType string
	var affinity Affinity
	if err := DB.Where("user_id = ? AND target_user_id = ?", currentUser.ID, target.ID).First(&affinity).Error; err == nil {
		affinityType = affinity.Type
	}

	var mutualFriendIDs []uint
	DB.Raw(`
		SELECT f1.following_id FROM follows f1
		INNER JOIN follows f2 ON f1.following_id = f2.follower_id
		WHERE f1.follower_id = ? AND f2.following_id = ? AND f1.following_id != ?
		LIMIT 20
	`, currentUser.ID, target.ID, currentUser.ID).Pluck("following_id", &mutualFriendIDs)

	var mutualFriends []User
	if len(mutualFriendIDs) > 0 {
		DB.Where("id IN ?", mutualFriendIDs).Find(&mutualFriends)
	}

	type MutualFriendDTO struct {
		ID         uint   `json:"id"`
		Nama       string `json:"nama"`
		Username   string `json:"username"`
		ProfilePic string `json:"profile_pic"`
	}
	var mfDTO []MutualFriendDTO
	for _, m := range mutualFriends {
		mfDTO = append(mfDTO, MutualFriendDTO{
			ID: m.ID, Nama: m.Nama, Username: m.Username, ProfilePic: m.ProfilePic,
		})
	}
	if mfDTO == nil {
		mfDTO = []MutualFriendDTO{}
	}

	var postCount int64
	DB.Model(&Post{}).Where("user_id = ?", target.ID).Count(&postCount)

	var assessmentCount int64
	DB.Model(&Assessment{}).Where("user_id = ?", target.ID).Count(&assessmentCount)

	var recentPosts []Post
	DB.Where("user_id = ?", target.ID).
		Order("created_at DESC").Limit(9).Find(&recentPosts)

	type PostDTO struct {
		ID        uint   `json:"ID"`
		Text      string `json:"Text"`
		Image     string `json:"Image"`
		Timestamp string `json:"Timestamp"`
		Reactions int    `json:"Reactions"`
	}
	var postsDTO []PostDTO
	for _, p := range recentPosts {
		var likeCount int64
		DB.Model(&PostLike{}).Where("post_id = ?", p.ID).Count(&likeCount)
		postsDTO = append(postsDTO, PostDTO{
			ID: p.ID, Text: p.Text, Image: p.Image,
			Timestamp: p.Timestamp.Format("2006-01-02T15:04:05Z07:00"),
			Reactions: int(likeCount),
		})
	}
	if postsDTO == nil {
		postsDTO = []PostDTO{}
	}

	var activityItems []gin.H
	var recentPredictions []Prediction
	DB.Where("user_id = ?", target.ID).Order("timestamp DESC").Limit(10).Find(&recentPredictions)
	for _, pred := range recentPredictions {
		activityItems = append(activityItems, gin.H{
			"type":      "prediction",
			"timestamp": pred.Timestamp,
			"detail":    pred.RiskLevel,
			"score":     pred.BurnoutScore,
		})
	}
	if activityItems == nil {
		activityItems = []gin.H{}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               target.ID,
		"nama":             target.Nama,
		"username":         target.Username,
		"bio":              target.Bio,
		"profile_pic":      target.ProfilePic,
		"joined_at":        target.CreatedAt,
		"follower_count":   followerCount,
		"following_count":  followingCount,
		"is_followed":      isFollowed,
		"affinity":         affinityType,
		"mutual_friends":   mfDTO,
		"post_count":       postCount,
		"assessment_count": assessmentCount,
		"posts":            postsDTO,
		"activity":         activityItems,
	})
}
