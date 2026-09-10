package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// Grup Chat DPA — satu grup per DPA berisi DPA + seluruh
// mahasiswa bimbingannya. Proteksi scope ketat:
//   - DPA hanya melihat grup miliknya sendiri.
//   - Student hanya melihat grup DPA pembimbingnya.
// Pengiriman pesan realtime via SSE broker di bawah; polling
// tetap tersedia sebagai fallback.
// ============================================================

const dpaMessageLimit = 200

// Batas lampiran chat: 6 MB hasil decode (≈8 MB base64).
const maxAttachmentBytes = 6 * 1024 * 1024

// attachmentMimeTypes membatasi tipe lampiran yang boleh dikirim.
var attachmentMimeTypes = map[string]map[string]bool{
	"image": {
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
	},
	"file": {
		"application/pdf": true,
		"application/msword": true,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
		"application/vnd.ms-excel":                                                 true,
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":        true,
		"application/vnd.ms-powerpoint":                                            true,
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
		"text/plain":      true,
		"application/zip": true,
	},
}

// ---- SSE broker (in-memory, satu set subscriber per grup DPA) ----

// chatBroadcast adalah unit siaran SSE: pesan chat baru ("message")
// atau sinyal muat ulang ("refresh", mis. hasil polling berubah).
type chatBroadcast struct {
	Event   string
	Payload gin.H
}

type chatSubscriber struct {
	ID       uint
	Messages chan chatBroadcast
	Done     chan struct{}
}

var chatMu sync.RWMutex
var chatSubscribers = map[uint]map[*chatSubscriber]struct{}{}

func subscribeChat(dpaID uint) *chatSubscriber {
	sub := &chatSubscriber{
		ID:       dpaID,
		Messages: make(chan chatBroadcast, 16),
		Done:     make(chan struct{}),
	}
	chatMu.Lock()
	defer chatMu.Unlock()
	if chatSubscribers[dpaID] == nil {
		chatSubscribers[dpaID] = map[*chatSubscriber]struct{}{}
	}
	chatSubscribers[dpaID][sub] = struct{}{}
	return sub
}

func unsubscribeChat(sub *chatSubscriber) {
	chatMu.Lock()
	defer chatMu.Unlock()
	if group, ok := chatSubscribers[sub.ID]; ok {
		delete(group, sub)
		if len(group) == 0 {
			delete(chatSubscribers, sub.ID)
		}
	}
	close(sub.Done)
}

// publishChatEvent fan-out event ke semua subscriber grup.
// Channel penuh → event di-drop untuk subscriber itu; client
// menyusul lewat fetch awal/polling.
func publishChatEvent(dpaID uint, event chatBroadcast) {
	chatMu.RLock()
	defer chatMu.RUnlock()
	for sub := range chatSubscribers[dpaID] {
		select {
		case sub.Messages <- event:
		default:
		}
	}
}

// chatMessageLightPayload membuat payload SSE ringan: tanpa isi
// lampiran (dimuat lewat endpoint lampiran) dan tanpa hasil polling
// (client memuat ulang saat menerima event refresh).
func chatMessageLightPayload(message DpaMessage, senderName string) gin.H {
	payload := gin.H{
		"id":              message.ID,
		"sender_id":       message.SenderID,
		"sender_name":     senderName,
		"sender_role":     message.SenderRole,
		"body":            message.Body,
		"timestamp":       message.Timestamp,
		"msg_type":        message.MsgType,
		"attachment_name": message.AttachmentName,
		"attachment_type": message.AttachmentType,
	}
	if message.MsgType == "image" || message.MsgType == "file" {
		// Tanpa URL ini, penerima tidak bisa menampilkan lampiran
		// sampai refetch penuh (bubble kosong).
		payload["attachment_url"] = fmt.Sprintf("/dpa/chat/attachments/%d", message.ID)
	}
	return payload
}

func publishChatMessage(dpaID uint, message DpaMessage, senderName string) {
	publishChatEvent(dpaID, chatBroadcast{Event: "message", Payload: chatMessageLightPayload(message, senderName)})
}

// publishChatRefresh menyuruh seluruh grup memuat ulang data chat,
// dipakai saat hasil polling berubah.
func publishChatRefresh(dpaID uint, reason string) {
	publishChatEvent(dpaID, chatBroadcast{Event: "refresh", Payload: gin.H{"reason": reason}})
}

func DpaChatMessagesHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var dpaID uint
	switch normalizeRole(user.Role) {
	case RoleDPA:
		dpaID = user.ID
	case RoleStudent:
		if user.DpaID == 0 {
			c.JSON(http.StatusOK, gin.H{"messages": []gin.H{}, "dpa": nil, "students": []gin.H{}})
			return
		}
		dpaID = user.DpaID
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": "Grup chat hanya untuk DPA dan mahasiswa bimbingannya"})
		return
	}

	after := 0
	if raw := c.Query("after"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			after = parsed
		}
	}

	query := DB.Where("dpa_id = ?", dpaID).Order("id ASC")
	if after > 0 {
		query = query.Where("id > ?", after)
	}
	var messages []DpaMessage
	query.Limit(dpaMessageLimit).Find(&messages)

	// Nama pengirim untuk rendering bubble.
	senderNames := map[uint]string{}
	senderRoles := map[uint]string{}
	students := dpaAdvisees(dpaID)
	var dpa User
	DB.First(&dpa, dpaID)
	senderNames[dpa.ID] = dpa.Nama
	senderRoles[dpa.ID] = RoleDPA
	for _, student := range students {
		senderNames[student.ID] = student.Nama
		senderRoles[student.ID] = RoleStudent
	}

	type ChatPollOption struct {
		ID       uint   `json:"id"`
		Label    string `json:"label"`
		Votes    int64  `json:"votes"`
		HasVoted bool   `json:"has_voted"`
	}
	type ChatPoll struct {
		ID       uint             `json:"id"`
		Question string           `json:"question"`
		Multi    bool             `json:"multi"`
		Options  []ChatPollOption `json:"options"`
	}
	type ChatMessage struct {
		ID             uint      `json:"id"`
		SenderID       uint      `json:"sender_id"`
		SenderName     string    `json:"sender_name"`
		SenderRole     string    `json:"sender_role"`
		MsgType        string    `json:"msg_type"`
		Body           string    `json:"body"`
		AttachmentName string    `json:"attachment_name,omitempty"`
		AttachmentType string    `json:"attachment_type,omitempty"`
		AttachmentURL  string    `json:"attachment_url,omitempty"`
		Poll           *ChatPoll `json:"poll,omitempty"`
		Timestamp      time.Time `json:"timestamp"`
	}

	// Hasil polling disiapkan sekali untuk seluruh pesan bertipe poll.
	pollByMessage := map[uint]*ChatPoll{}
	pollIDs := []uint{}
	for _, message := range messages {
		if message.PollID > 0 {
			pollIDs = append(pollIDs, message.PollID)
		}
	}
	if len(pollIDs) > 0 {
		var polls []DpaPoll
		DB.Where("id IN ?", pollIDs).Find(&polls)
		pollByID := map[uint]DpaPoll{}
		for _, poll := range polls {
			pollByID[poll.ID] = poll
		}
		var options []DpaPollOption
		DB.Where("poll_id IN ?", pollIDs).Order("sort ASC, id ASC").Find(&options)
		optionsByPoll := map[uint][]DpaPollOption{}
		for _, option := range options {
			optionsByPoll[option.PollID] = append(optionsByPoll[option.PollID], option)
		}
		type optionCount struct {
			OptionID uint
			Count    int64
		}
		var counts []optionCount
		DB.Model(&DpaPollVote{}).
			Select("option_id, COUNT(*) AS count").
			Where("poll_id IN ?", pollIDs).
			Group("option_id").Scan(&counts)
		countByOption := map[uint]int64{}
		for _, count := range counts {
			countByOption[count.OptionID] = count.Count
		}
		var viewerVotes []DpaPollVote
		DB.Where("poll_id IN ? AND user_id = ?", pollIDs, user.ID).Find(&viewerVotes)
		votedByViewer := map[uint]bool{}
		for _, vote := range viewerVotes {
			votedByViewer[vote.OptionID] = true
		}
		for _, message := range messages {
			poll, ok := pollByID[message.PollID]
			if !ok {
				continue
			}
			chatOptions := make([]ChatPollOption, 0, len(optionsByPoll[poll.ID]))
			for _, option := range optionsByPoll[poll.ID] {
				chatOptions = append(chatOptions, ChatPollOption{
					ID:       option.ID,
					Label:    option.Label,
					Votes:    countByOption[option.ID],
					HasVoted: votedByViewer[option.ID],
				})
			}
			pollByMessage[message.ID] = &ChatPoll{ID: poll.ID, Question: poll.Question, Multi: poll.Multi, Options: chatOptions}
		}
	}

	items := make([]ChatMessage, 0, len(messages))
	for _, message := range messages {
		item := ChatMessage{
			ID:         message.ID,
			SenderID:   message.SenderID,
			SenderName: senderNames[message.SenderID],
			SenderRole: message.SenderRole,
			MsgType:    message.MsgType,
			Body:       message.Body,
			Timestamp:  message.Timestamp,
		}
		if message.MsgType == "image" || message.MsgType == "file" {
			item.AttachmentName = message.AttachmentName
			item.AttachmentType = message.AttachmentType
			item.AttachmentURL = fmt.Sprintf("/dpa/chat/attachments/%d", message.ID)
		}
		item.Poll = pollByMessage[message.ID]
		items = append(items, item)
	}

	// Roster anggota grup (dipakai rail kanan DPA & header student).
	type Member struct {
		ID       uint   `json:"id"`
		Nama     string `json:"nama"`
		Nim      string `json:"nim"`
		Role     string `json:"role"`
		Online   bool   `json:"-"`
	}
	members := []Member{{ID: dpa.ID, Nama: dpa.Nama, Role: RoleDPA}}
	for _, student := range students {
		members = append(members, Member{ID: student.ID, Nama: student.Nama, Nim: student.Nim, Role: RoleStudent})
	}

	// Well-being snapshot per mahasiswa untuk DPA (chip status di roster).
	wellbeing := map[uint]gin.H{}
	if normalizeRole(user.Role) == RoleDPA {
		config := getSystemConfig()
		for _, student := range students {
			snapshot := gin.H{}
			if burnout, ok := latestBurnoutFor(student.ID); ok {
				snapshot["burnout"] = round2(burnout.BurnoutScore)
				snapshot["burnout_category"] = burnoutCategoryLabel(burnout.BurnoutScore, config)
			}
			if happiness, ok := latestHappinessFor(student.ID); ok {
				snapshot["happiness"] = round2(happiness.HappinessIndex)
				snapshot["happiness_category"] = happiness.Category
			}
			if len(snapshot) > 0 {
				wellbeing[student.ID] = snapshot
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"dpa":       gin.H{"id": dpa.ID, "nama": dpa.Nama},
		"messages":  items,
		"members":   members,
		"wellbeing": wellbeing,
		"me":        gin.H{"id": user.ID, "nama": user.Nama, "role": user.Role},
	})
}

func DpaChatSendHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var dpaID uint
	var senderRole string
	switch normalizeRole(user.Role) {
	case RoleDPA:
		dpaID = user.ID
		senderRole = RoleDPA
	case RoleStudent:
		if user.DpaID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Anda belum dipetakan ke DPA pembimbing"})
			return
		}
		dpaID = user.DpaID
		senderRole = RoleStudent
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": "Grup chat hanya untuk DPA dan mahasiswa bimbingannya"})
		return
	}

	var input struct {
		Body           string   `json:"body"`
		MsgType        string   `json:"msg_type"`
		AttachmentName string   `json:"attachment_name"`
		AttachmentType string   `json:"attachment_type"`
		AttachmentData string   `json:"attachment_data"`
		PollQuestion   string   `json:"poll_question"`
		PollOptions    []string `json:"poll_options"`
		PollMulti      bool     `json:"poll_multi"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format pesan tidak valid"})
		return
	}

	msgType := strings.ToLower(strings.TrimSpace(input.MsgType))
	if msgType == "" {
		msgType = "text"
	}

	message := DpaMessage{
		DpaID:      dpaID,
		SenderID:   user.ID,
		SenderRole: senderRole,
		MsgType:    msgType,
		Body:       truncateString(strings.TrimSpace(input.Body), 2000),
		Timestamp:  time.Now(),
	}

	switch msgType {
	case "image", "file":
		// Tolak dulu payload base64 raksasa sebelum di-decode.
		if len(input.AttachmentData) > maxAttachmentBytes*4/3+1024 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ukuran lampiran maksimal 6 MB"})
			return
		}
		raw, err := decodeChatAttachment(input.AttachmentData)
		if err != nil || len(raw) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Lampiran tidak valid"})
			return
		}
		if len(raw) > maxAttachmentBytes {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ukuran lampiran maksimal 6 MB"})
			return
		}
		if !attachmentMimeTypes[msgType][strings.ToLower(strings.TrimSpace(input.AttachmentType))] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe file lampiran tidak didukung"})
			return
		}
		message.AttachmentName = truncateString(strings.TrimSpace(input.AttachmentName), 255)
		if message.AttachmentName == "" {
			message.AttachmentName = "lampiran"
		}
		message.AttachmentType = strings.ToLower(strings.TrimSpace(input.AttachmentType))
		message.AttachmentData = cleanBase64(input.AttachmentData)
	case "poll":
		question := strings.TrimSpace(input.PollQuestion)
		options := []string{}
		for _, option := range input.PollOptions {
			if trimmed := strings.TrimSpace(option); trimmed != "" {
				options = append(options, trimmed)
			}
		}
		if question == "" || len(options) < 2 || len(options) > 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Polling butuh pertanyaan dan 2-8 opsi jawaban"})
			return
		}
		poll := DpaPoll{
			DpaID:     dpaID,
			Question:  truncateString(question, 255),
			Multi:     input.PollMulti,
			CreatedBy: user.ID,
			Timestamp: time.Now(),
		}
		if err := DB.Create(&poll).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat polling"})
			return
		}
		for index, option := range options {
			DB.Create(&DpaPollOption{PollID: poll.ID, Label: truncateString(option, 255), Sort: index})
		}
		message.PollID = poll.ID
		message.Body = ""
	default:
		message.MsgType = "text"
		if message.Body == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Pesan tidak boleh kosong"})
			return
		}
	}

	if err := DB.Create(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengirim pesan"})
		return
	}
	publishChatMessage(dpaID, message, user.Nama)

	// Notifikasi: pesan DPA → semua mahasiswa bimbingan;
	// pesan student → DPA-nya.
	recipients := []uint{}
	if senderRole == RoleDPA {
		for _, student := range dpaAdvisees(dpaID) {
			recipients = append(recipients, student.ID)
		}
	} else {
		recipients = append(recipients, dpaID)
	}
	for _, recipientID := range recipients {
		DB.Create(&Notification{
			UserID:  recipientID,
			Type:    "dpa_chat",
			Message: fmt.Sprintf("Pesan baru di grup chat bimbingan dari %s.", user.Nama),
		})
	}

	response := gin.H{
		"id":          message.ID,
		"sender_id":   message.SenderID,
		"sender_name": user.Nama,
		"sender_role": senderRole,
		"msg_type":    message.MsgType,
		"body":        message.Body,
		"timestamp":   message.Timestamp,
	}
	if message.MsgType == "image" || message.MsgType == "file" {
		response["attachment_name"] = message.AttachmentName
		response["attachment_type"] = message.AttachmentType
		response["attachment_url"] = fmt.Sprintf("/dpa/chat/attachments/%d", message.ID)
	}
	c.JSON(http.StatusCreated, gin.H{"status": "success", "message": response})
}

// chatGroupIDForUser mengembalikan ID grup chat (dpa_id) untuk
// peminta: DPA → grup miliknya, student → grup DPA pembimbingnya.
func chatGroupIDForUser(user User) (uint, bool) {
	switch normalizeRole(user.Role) {
	case RoleDPA:
		return user.ID, true
	case RoleStudent:
		if user.DpaID == 0 {
			return 0, false
		}
		return user.DpaID, true
	default:
		return 0, false
	}
}

// cleanBase64 menghapus prefiks data-URL dan whitespace sehingga
// tersisa payload base64 murni.
func cleanBase64(data string) string {
	clean := strings.TrimSpace(data)
	if strings.HasPrefix(clean, "data:") {
		if idx := strings.Index(clean, ","); idx >= 0 {
			clean = clean[idx+1:]
		}
	}
	return strings.NewReplacer("\r", "", "\n", "", " ", "").Replace(clean)
}

// decodeChatAttachment memvalidasi sekaligus menerjemahkan payload
// base64 (dengan/tanpa prefiks data-URL) menjadi byte.
func decodeChatAttachment(data string) ([]byte, error) {
	clean := cleanBase64(data)
	if clean == "" {
		return nil, fmt.Errorf("lampiran kosong")
	}
	if raw, err := base64.StdEncoding.DecodeString(clean); err == nil {
		return raw, nil
	}
	if raw, err := base64.RawStdEncoding.DecodeString(clean); err == nil {
		return raw, nil
	}
	if raw, err := base64.URLEncoding.DecodeString(clean); err == nil {
		return raw, nil
	}
	return base64.RawURLEncoding.DecodeString(clean)
}

// DpaChatAttachmentHandler mengirim isi lampiran (image/file) pesan
// grup chat. Route berada di grup SSE sehingga auth memakai token
// query-param (img/a pada browser tidak bisa mengirim header).
func DpaChatAttachmentHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	dpaID, ok := chatGroupIDForUser(user)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "Tidak diizinkan"})
		return
	}
	messageID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pesan tidak valid"})
		return
	}
	var message DpaMessage
	if err := DB.First(&message, messageID).Error; err != nil || message.DpaID != dpaID {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lampiran tidak ditemukan"})
		return
	}
	raw, err := decodeChatAttachment(message.AttachmentData)
	if err != nil || len(raw) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lampiran tidak ditemukan"})
		return
	}
	mimeType := message.AttachmentType
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if message.AttachmentName != "" {
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", message.AttachmentName))
	}
	c.Data(http.StatusOK, mimeType, raw)
}

// DpaChatVoteHandler mencatat suara polling grup chat. Single-choice:
// satu user satu suara; multi: satu suara per opsi. Setelah suara
// tersimpan seluruh grup menerima sinyal refresh agar hasil live.
func DpaChatVoteHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	dpaID, ok := chatGroupIDForUser(user)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "Grup chat hanya untuk DPA dan mahasiswa bimbingannya"})
		return
	}
	pollID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID polling tidak valid"})
		return
	}
	var poll DpaPoll
	if err := DB.First(&poll, pollID).Error; err != nil || poll.DpaID != dpaID {
		c.JSON(http.StatusNotFound, gin.H{"error": "Polling tidak ditemukan"})
		return
	}
	var input struct {
		OptionID uint `json:"option_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.OptionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Opsi polling tidak valid"})
		return
	}
	var option DpaPollOption
	if err := DB.Where("id = ? AND poll_id = ?", input.OptionID, poll.ID).First(&option).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Opsi polling tidak ditemukan"})
		return
	}
	var existing []DpaPollVote
	DB.Where("poll_id = ? AND user_id = ?", poll.ID, user.ID).Find(&existing)
	if !poll.Multi && len(existing) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Anda sudah memberikan suara pada polling ini"})
		return
	}
	for _, vote := range existing {
		if vote.OptionID == option.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Anda sudah memilih opsi ini"})
			return
		}
	}
	if err := DB.Create(&DpaPollVote{PollID: poll.ID, OptionID: option.ID, UserID: user.ID}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan suara"})
		return
	}
	publishChatRefresh(dpaID, "poll")
	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

// DpaRemoveStudentGroupHandler mengeluarkan mahasiswa dari grup
// bimbingan (users.dpa_id = 0). Riwayat pesannya tetap tersimpan di
// grup; mahasiswa diberi notifikasi agar bergabung ke DPA lain.
func DpaRemoveStudentGroupHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	student, ok := dpaStudentForDpa(c, dpa)
	if !ok {
		return
	}
	if err := DB.Model(&student).Update("dpa_id", 0).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengeluarkan mahasiswa dari grup"})
		return
	}
	DB.Create(&Notification{
		UserID:  student.ID,
		Type:    "dpa_chat",
		Message: fmt.Sprintf("Anda dikeluarkan dari grup bimbingan oleh %s. Silakan pilih DPA lain melalui Direktori DPA.", dpa.Nama),
	})
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": fmt.Sprintf("%s dikeluarkan dari grup bimbingan.", student.Nama)})
}

// SSEAuthMiddleware memvalidasi JWT dari query-param `token`.
// Diperlukan karena EventSource tidak dapat mengirim header Authorization.
func SSEAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.Query("token")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token diperlukan untuk streaming"})
			c.Abort()
			return
		}
		claims, err := ValidateJWT(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token tidak valid"})
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

// DpaChatStreamHandler: SSE endpoint untuk pesan grup chat realtime.
// Event: message (payload JSON pesan), heartbeat tiap 25 detik.
func DpaChatStreamHandler(c *gin.Context) {
	user := c.MustGet("user").(User)

	var dpaID uint
	switch normalizeRole(user.Role) {
	case RoleDPA:
		dpaID = user.ID
	case RoleStudent:
		if user.DpaID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Anda belum tergabung di grup bimbingan"})
			return
		}
		dpaID = user.DpaID
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": "Grup chat hanya untuk DPA dan mahasiswa bimbingannya"})
		return
	}

	// Payload SSE ringan sudah membawa nama pengirim saat publish,
	// sehingga tidak perlu peta nama di sini.
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming tidak didukung"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	sub := subscribeChat(dpaID)
	defer unsubscribeChat(sub)

	// Event awal agar client tahu stream siap.
	fmt.Fprint(c.Writer, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case event := <-sub.Messages:
			payload, err := json.Marshal(event.Payload)
			if err != nil {
				continue
			}
			fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event.Event, payload)
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}
