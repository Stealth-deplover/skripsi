package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HeatmapProdiAngkatanHandler agregat heatmap prodi x angkatan untuk Kaprodi.
// Menampilkan rata-rata Happiness Index dan Burnout per cohort.
func HeatmapProdiAngkatanHandler(c *gin.Context) {
	actor := c.MustGet("user").(User)
	type Group struct {
		Prodi      string  `json:"prodi"`
		Angkatan   string  `json:"angkatan"`
		Count      int64   `json:"mahasiswa_count"`
		AvgHI      float64 `json:"avg_happiness"`
		AvgBurnout float64 `json:"avg_burnout"`
		HighRisk   int64   `json:"high_risk_count"`
	}

	// Ambil cohort unik dari users student
	type Cohort struct {
		Prodi    string
		Angkatan string
		Count    int64
	}
	var cohorts []Cohort
	cohortQuery := DB.Model(&User{}).Select("prodi, angkatan, COUNT(*) as count").Where("role = ? AND prodi <> '' AND angkatan <> ''", RoleStudent)
	if scope := adminProgramScope(actor); scope > 0 {
		cohortQuery = cohortQuery.Where("program_studi_id = ?", scope)
	}
	cohortQuery.Group("prodi, angkatan").Scan(&cohorts)

	// Agregat happiness rata-rata per cohort (semua assessment)
	type HAvg struct {
		Prodi    string
		Angkatan string
		AvgHI    float64
	}
	var hAvgs []HAvg
	happinessQuery := DB.Table("happiness_assessments h JOIN users u ON u.id = h.user_id").Select("u.prodi as prodi, u.angkatan as angkatan, AVG(h.happiness_index) as avg_hi").Where("u.role = ?", RoleStudent)
	if scope := adminProgramScope(actor); scope > 0 {
		happinessQuery = happinessQuery.Where("u.program_studi_id = ?", scope)
	}
	happinessQuery.Group("u.prodi, u.angkatan").Scan(&hAvgs)
	hMap := map[string]float64{}
	for _, v := range hAvgs {
		k := v.Prodi + "|" + v.Angkatan
		hMap[k] = round2(v.AvgHI)
	}

	// Agregat burnout rata-rata + high risk count per cohort
	type BAvg struct {
		Prodi      string
		Angkatan   string
		AvgBurnout float64
		HighRisk   int64
	}
	// AVG burnout dari predictions, high risk = risk_level in high/urgent/critical
	var bAvgs []BAvg
	predictionQuery := DB.Table("predictions p JOIN users u ON u.id = p.user_id").Select("u.prodi as prodi, u.angkatan as angkatan, AVG(p.burnout_score) as avg_burnout, SUM(CASE WHEN p.risk_level IN ('high','urgent','critical') THEN 1 ELSE 0 END) as high_risk").Where("u.role = ?", RoleStudent)
	if scope := adminProgramScope(actor); scope > 0 {
		predictionQuery = predictionQuery.Where("u.program_studi_id = ?", scope)
	}
	predictionQuery.Group("u.prodi, u.angkatan").Scan(&bAvgs)
	bMap := map[string]float64{}
	hrMap := map[string]int64{}
	for _, v := range bAvgs {
		k := v.Prodi + "|" + v.Angkatan
		bMap[k] = round2(v.AvgBurnout)
		hrMap[k] = v.HighRisk
	}

	groups := make([]Group, 0, len(cohorts))
	prodiSet := map[string]bool{}
	angkatanSet := map[string]bool{}
	for _, ch := range cohorts {
		k := ch.Prodi + "|" + ch.Angkatan
		g := Group{
			Prodi:      ch.Prodi,
			Angkatan:   ch.Angkatan,
			Count:      ch.Count,
			AvgHI:      hMap[k],
			AvgBurnout: bMap[k],
			HighRisk:   hrMap[k],
		}
		groups = append(groups, g)
		prodiSet[ch.Prodi] = true
		angkatanSet[ch.Angkatan] = true
	}

	prodiList := []string{}
	for p := range prodiSet {
		prodiList = append(prodiList, p)
	}
	angkatanList := []string{}
	for a := range angkatanSet {
		angkatanList = append(angkatanList, a)
	}

	c.JSON(http.StatusOK, gin.H{
		"heatmap":       groups,
		"prodi_list":    prodiList,
		"angkatan_list": angkatanList,
		"total_cohorts": len(groups),
	})
}
