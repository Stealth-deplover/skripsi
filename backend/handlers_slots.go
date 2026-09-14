package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// DpaCreateSlotHandler DPA buat slot ketersediaan
func DpaCreateSlotHandler(c *gin.Context) {
	dpa := c.MustGet("user").(User)
	if !isDpaRole(dpa.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya DPA"})
		return
	}
	var input struct {
		StartTime string `json:"start_time" binding:"required"` // RFC3339
		EndTime   string `json:"end_time" binding:"required"`
		Capacity  *int   `json:"capacity"`
		Topic     string `json:"topic"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_time dan end_time wajib (RFC3339)"})
		return
	}
	start, err := time.Parse(time.RFC3339, input.StartTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format start_time harus RFC3339"})
		return
	}
	end, err := time.Parse(time.RFC3339, input.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format end_time harus RFC3339"})
		return
	}
	if !end.After(start) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_time harus setelah start_time"})
		return
	}
	cap := 1
	if input.Capacity != nil && *input.Capacity > 0 {
		cap = *input.Capacity
	}
	slot := DpaSlot{DpaID: dpa.ID, StartTime: start, EndTime: end, Capacity: cap, Topic: input.Topic, Status: "tersedia"}
	DB.Create(&slot)
	c.JSON(http.StatusOK, gin.H{"status": "success", "slot": slot})
}

func DpaSlotsListHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	role := normalizeRole(user.Role)
	var slots []DpaSlot
	if role == RoleStudent {
		// mahasiswa lihat slot DPA pembimbingnya + slot tersedia lain
		if user.DpaID != 0 {
			DB.Where("dpa_id = ? AND status IN (?)", user.DpaID, []string{"tersedia", "dipesan"}).Order("start_time ASC").Find(&slots)
		} else {
			DB.Where("status = ?", "tersedia").Order("start_time ASC").Limit(50).Find(&slots)
		}
	} else if role == RoleDPA {
		DB.Where("dpa_id = ?", user.ID).Order("start_time ASC").Find(&slots)
	} else {
		DB.Order("start_time ASC").Limit(100).Find(&slots)
	}
	c.JSON(http.StatusOK, gin.H{"slots": slots})
}

func DpaSlotBookHandler(c *gin.Context) {
	student := c.MustGet("user").(User)
	if !isStudentRole(student.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya mahasiswa"})
		return
	}
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var slot DpaSlot
	if err := DB.First(&slot, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot tidak ditemukan"})
		return
	}
	if slot.Status != "tersedia" || slot.BookedBy != 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Slot sudah dipesan"})
		return
	}
	if slot.DpaID != student.DpaID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya boleh booking slot DPA pembimbing Anda"})
		return
	}
	DB.Model(&slot).Updates(map[string]interface{}{"booked_by": student.ID, "status": "dipesan"})
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Slot berhasil dipesan"})
}

func DpaSlotCancelHandler(c *gin.Context) {
	user := c.MustGet("user").(User)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var slot DpaSlot
	if err := DB.First(&slot, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot tidak ditemukan"})
		return
	}
	if isStudentRole(user.Role) {
		if slot.BookedBy != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Bukan pemesan slot"})
			return
		}
	} else if isDpaRole(user.Role) {
		if slot.DpaID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Bukan slot Anda"})
			return
		}
	}
	DB.Model(&slot).Updates(map[string]interface{}{"booked_by": 0, "status": "tersedia"})
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Slot dibatalkan"})
}
