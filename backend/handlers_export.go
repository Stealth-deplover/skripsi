package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ExportDpaRatingPDFHandler Kaprodi export laporan rating DPA (HTML yang siap print PDF)
func ExportDpaRatingPDFHandler(c *gin.Context) {
	// pakai data sama dengan SuperadminDpaRatingsHandler tapi render HTML
	actor := c.MustGet("user").(User)
	var dpas []User
	dpaQuery := DB.Where("role = ?", RoleDPA)
	if adminProgramScope(actor) > 0 {
		dpaQuery = dpaQuery.Where("program_studi_id = ?", actor.ProgramStudiID)
	}
	dpaQuery.Order("nama ASC").Find(&dpas)
	dpaIDs := make([]uint, 0, len(dpas))
	for _, dpa := range dpas {
		dpaIDs = append(dpaIDs, dpa.ID)
	}

	type Agg struct {
		DpaID   uint
		RatedBy int64
		Avg     float64
	}
	var aggs []Agg
	aggQuery := DB.Model(&DpaRating{}).Select("dpa_id, COUNT(*) as rated_by, AVG(stars) as avg").Group("dpa_id")
	if adminProgramScope(actor) > 0 {
		aggQuery = aggQuery.Where("dpa_id IN ?", dpaIDs)
	}
	aggQuery.Scan(&aggs)
	aggMap := map[uint]Agg{}
	for _, a := range aggs {
		aggMap[a.DpaID] = a
	}

	var totalRatings int64
	totalQuery := DB.Model(&DpaRating{})
	if adminProgramScope(actor) > 0 {
		totalQuery = totalQuery.Where("dpa_id IN ?", dpaIDs)
	}
	totalQuery.Count(&totalRatings)

	// build HTML
	var rowsHTML strings.Builder
	for _, dpa := range dpas {
		agg := aggMap[dpa.ID]
		advCount := int64(0)
		adviseeQuery := DB.Model(&User{}).Where("dpa_id = ? AND role = ?", dpa.ID, RoleStudent)
		if scope := adminProgramScope(actor); scope > 0 {
			adviseeQuery = adviseeQuery.Where("program_studi_id = ?", scope)
		}
		adviseeQuery.Count(&advCount)
		avgStr := "-"
		if agg.RatedBy > 0 {
			avgStr = fmt.Sprintf("%.2f", agg.Avg)
		}
		rowsHTML.WriteString(fmt.Sprintf("<tr><td>%s</td><td>%s</td><td>%d</td><td>%d</td><td>%s</td></tr>", dpa.Nama, dpa.Username, advCount, agg.RatedBy, avgStr))
	}

	html := fmt.Sprintf(`<html><head><meta charset="utf-8"><title>Laporan Penilaian DPA</title>
<style>
body{font-family:Arial,sans-serif;color:#1e293b;padding:0;max-width:980px;margin:auto;background:#f8fafc}
.page{background:#fff;min-height:100vh;padding:34px 40px;border:1px solid #e2e8f0}
h1{font-size:22px;color:#0f172a;margin:8px 0}
.meta{font-size:11px;color:#64748b;margin-bottom:12px}
table{width:100%%;border-collapse:collapse;font-size:11px;border:1px solid #cbd5e1}
th{background:#0f172a;color:#fff;padding:8px;border:1px solid #1e293b}
td{padding:7px;border:1px solid #e2e8f0}
</style></head><body><main class="page">
<h1>Laporan Penilaian DPA — QC Analytics</h1>
<div class="meta">Tanggal: %s | Total penilaian: %d | Dokumen internal</div>
<table><tr><th>Nama DPA</th><th>Username</th><th>Advisee</th><th>Penilai</th><th>Rata-rata</th></tr>
%s
</table>
<p style="font-size:10px;color:#64748b;margin-top:12px">Anonim — identitas mahasiswa tidak ditampilkan. Sumber: DpaRating.</p>
</main></body></html>`, time.Now().Format("02 January 2006"), totalRatings, rowsHTML.String())

	c.Header("Content-Disposition", "inline; filename=laporan-dpa-rating.html")
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

// BimbinganReminderHandler Kaprodi lihat mahasiswa kurang sesi UTS/UAS
func BimbinganReminderHandler(c *gin.Context) {
	config := getSystemConfig()
	type Reminder struct {
		StudentID   uint   `json:"student_id"`
		Nama        string `json:"nama"`
		Username    string `json:"username"`
		Prodi       string `json:"prodi"`
		DpaID       uint   `json:"dpa_id"`
		DpaName     string `json:"dpa_name"`
		VerifiedUTS int64  `json:"verified_uts"`
		VerifiedUAS int64  `json:"verified_uas"`
		NeedUTS     int    `json:"need_uts"`
		NeedUAS     int    `json:"need_uas"`
		Semester    string `json:"semester"`
	}
	var students []User
	studentQuery := DB.Where("role = ?", RoleStudent)
	if actor := c.MustGet("user").(User); adminProgramScope(actor) > 0 {
		studentQuery = studentQuery.Where("program_studi_id = ?", actor.ProgramStudiID)
	}
	studentQuery.Find(&students)
	dpaNames := map[uint]string{}
	var dpas []User
	dpaQuery := DB.Where("role = ?", RoleDPA)
	if actor := c.MustGet("user").(User); adminProgramScope(actor) > 0 {
		dpaQuery = dpaQuery.Where("program_studi_id = ?", actor.ProgramStudiID)
	}
	dpaQuery.Find(&dpas)
	for _, d := range dpas {
		dpaNames[d.ID] = d.Nama
	}
	// semester terbaru dari bimbingan jika ada
	currentSem := currentSemesterLabel()
	// fallback gunakan current semester
	var result []Reminder
	for _, s := range students {
		var cntUTS int64
		DB.Model(&Bimbingan{}).Where("student_id = ? AND semester = ? AND status = ?", s.ID, currentSem, "verified").Count(&cntUTS)
		var cntUAS int64
		DB.Model(&Bimbingan{}).Where("student_id = ? AND status = ?", s.ID, "verified").Count(&cntUAS)
		needUTS := config.BimbinganMinUTS - int(cntUTS)
		if needUTS < 0 {
			needUTS = 0
		}
		needUAS := config.BimbinganMinUAS - int(cntUAS)
		if needUAS < 0 {
			needUAS = 0
		}
		if needUTS > 0 || needUAS > 0 {
			result = append(result, Reminder{
				StudentID: s.ID, Nama: s.Nama, Username: s.Username, Prodi: s.Prodi, DpaID: s.DpaID, DpaName: dpaNames[s.DpaID],
				VerifiedUTS: cntUTS, VerifiedUAS: cntUAS, NeedUTS: needUTS, NeedUAS: needUAS, Semester: currentSem,
			})
		}
	}
	// WA dispatch (async) untuk yang urgent, jika WHATSAPP_ENABLED
	if whatsappEnabled() {
		for _, r := range result {
			if r.NeedUTS > 0 && r.DpaID != 0 {
				if dpa, ok := dpaNames[r.DpaID]; ok {
					_ = dpa
				}
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"reminders": result, "semester": currentSem, "total": len(result)})
}
