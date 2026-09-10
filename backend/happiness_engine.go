package main

import (
	"fmt"
	"math"
	"sort"
)

// ============================================================
// Happiness Engine — modul tambahan di samping Burnout Analytics.
// Mengukur Happiness Index (HI) 0-100 dari 24 butir Likert 1-5
// yang terbagi dalam 6 dimensi dengan bobot terkonfigurasi.
// ============================================================

// Dimensi happiness beserta bobot default (master prompt §12).
const (
	HappinessDimAcademic    = "academic"
	HappinessDimMotivation  = "motivation"
	HappinessDimSocial      = "social"
	HappinessDimLecturer    = "lecturer"
	HappinessDimEnvironment = "environment"
	HappinessDimFacilities  = "facilities"
)

var happinessDimensionMeta = []struct {
	Key        string
	Label      string
	DefWeight  float64
	ConfigName string
}{
	{HappinessDimAcademic, "Akademik", 0.25, "HiWeightAcademic"},
	{HappinessDimMotivation, "Motivasi", 0.20, "HiWeightMotivation"},
	{HappinessDimSocial, "Sosial", 0.20, "HiWeightSocial"},
	{HappinessDimLecturer, "Dosen", 0.10, "HiWeightLecturer"},
	{HappinessDimEnvironment, "Lingkungan", 0.15, "HiWeightEnvironment"},
	{HappinessDimFacilities, "Fasilitas", 0.10, "HiWeightFacilities"},
}

type HappinessQuestion struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	Dimension  string `json:"dimension"`
	DimensionL string `json:"dimension_label"`
}

type HappinessResponse struct {
	ID    string `json:"id"`
	Value int    `json:"value"`
}

type HappinessDimensionScore struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Score float64 `json:"score"`
	Weight float64 `json:"weight"`
}

// happinessQuestions: 4 butir per dimensi sesuai master prompt §11.
var happinessQuestions = []HappinessQuestion{
	// Akademik
	{ID: "h1", Text: "Saya puas dengan proses pembelajaran yang saya terima di kampus.", Dimension: HappinessDimAcademic, DimensionL: "Akademik"},
	{ID: "h2", Text: "Saya mampu mengikuti perkuliahan dengan baik.", Dimension: HappinessDimAcademic, DimensionL: "Akademik"},
	{ID: "h3", Text: "Beban akademik saya masih dapat saya kelola dengan baik.", Dimension: HappinessDimAcademic, DimensionL: "Akademik"},
	{ID: "h4", Text: "Saya puas dengan pencapaian akademik saya sejauh ini.", Dimension: HappinessDimAcademic, DimensionL: "Akademik"},
	// Motivasi
	{ID: "h5", Text: "Saya bersemangat mengikuti perkuliahan.", Dimension: HappinessDimMotivation, DimensionL: "Motivasi"},
	{ID: "h6", Text: "Saya memiliki tujuan akademik yang jelas.", Dimension: HappinessDimMotivation, DimensionL: "Motivasi"},
	{ID: "h7", Text: "Motivasi belajar saya tetap terjaga.", Dimension: HappinessDimMotivation, DimensionL: "Motivasi"},
	{ID: "h8", Text: "Saya optimis dengan masa depan akademik saya.", Dimension: HappinessDimMotivation, DimensionL: "Motivasi"},
	// Sosial
	{ID: "h9", Text: "Hubungan saya dengan teman-teman berjalan baik.", Dimension: HappinessDimSocial, DimensionL: "Sosial"},
	{ID: "h10", Text: "Saya mendapatkan dukungan sosial dari orang-orang di lingkungan kampus.", Dimension: HappinessDimSocial, DimensionL: "Sosial"},
	{ID: "h11", Text: "Saya merasa diterima di lingkungan kampus.", Dimension: HappinessDimSocial, DimensionL: "Sosial"},
	{ID: "h12", Text: "Interaksi saya dengan lingkungan kampus berjalan positif.", Dimension: HappinessDimSocial, DimensionL: "Sosial"},
	// Dosen
	{ID: "h13", Text: "Komunikasi saya dengan dosen berjalan baik.", Dimension: HappinessDimLecturer, DimensionL: "Dosen"},
	{ID: "h14", Text: "Dosen memberikan dukungan akademik yang saya butuhkan.", Dimension: HappinessDimLecturer, DimensionL: "Dosen"},
	{ID: "h15", Text: "Saya merasa nyaman saat berkonsultasi akademik dengan dosen.", Dimension: HappinessDimLecturer, DimensionL: "Dosen"},
	{ID: "h16", Text: "Kualitas interaksi akademik saya dengan dosen baik.", Dimension: HappinessDimLecturer, DimensionL: "Dosen"},
	// Lingkungan
	{ID: "h17", Text: "Saya merasa nyaman beraktivitas di kampus.", Dimension: HappinessDimEnvironment, DimensionL: "Lingkungan"},
	{ID: "h18", Text: "Suasana belajar di kampus mendukung saya.", Dimension: HappinessDimEnvironment, DimensionL: "Lingkungan"},
	{ID: "h19", Text: "Saya merasa aman beraktivitas di lingkungan kampus.", Dimension: HappinessDimEnvironment, DimensionL: "Lingkungan"},
	{ID: "h20", Text: "Lingkungan akademik di kampus berdampak positif bagi saya.", Dimension: HappinessDimEnvironment, DimensionL: "Lingkungan"},
	// Fasilitas
	{ID: "h21", Text: "Ruang kelas yang saya gunakan memadai.", Dimension: HappinessDimFacilities, DimensionL: "Fasilitas"},
	{ID: "h22", Text: "Akses internet di kampus memadai untuk kebutuhan belajar saya.", Dimension: HappinessDimFacilities, DimensionL: "Fasilitas"},
	{ID: "h23", Text: "Perpustakaan memenuhi kebutuhan belajar saya.", Dimension: HappinessDimFacilities, DimensionL: "Fasilitas"},
	{ID: "h24", Text: "Fasilitas pembelajaran di kampus memadai.", Dimension: HappinessDimFacilities, DimensionL: "Fasilitas"},
}

func happinessWeight(config SystemConfig, key string) float64 {
	switch key {
	case HappinessDimAcademic:
		return config.HiWeightAcademic
	case HappinessDimMotivation:
		return config.HiWeightMotivation
	case HappinessDimSocial:
		return config.HiWeightSocial
	case HappinessDimLecturer:
		return config.HiWeightLecturer
	case HappinessDimEnvironment:
		return config.HiWeightEnvironment
	case HappinessDimFacilities:
		return config.HiWeightFacilities
	default:
		return 0
	}
}

func happinessDimensionLabel(key string) string {
	for _, dim := range happinessDimensionMeta {
		if dim.Key == key {
			return dim.Label
		}
	}
	return key
}

// calculateHappiness mengubah respons Likert 1-5 menjadi skor dimensi 0-100
// dan Happiness Index terbobot 0-100.
func calculateHappiness(responses []HappinessResponse, config SystemConfig) (float64, []HappinessDimensionScore) {
	sums := map[string]float64{}
	counts := map[string]int{}
	for _, r := range responses {
		if r.Value < 1 || r.Value > 5 {
			continue
		}
		var dim string
		for _, q := range happinessQuestions {
			if q.ID == r.ID {
				dim = q.Dimension
				break
			}
		}
		if dim == "" {
			continue
		}
		sums[dim] += float64(r.Value)
		counts[dim]++
	}

	dimensions := make([]HappinessDimensionScore, 0, len(happinessDimensionMeta))
	index := 0.0
	for _, meta := range happinessDimensionMeta {
		score := 0.0
		if counts[meta.Key] > 0 {
			// Normalisasi Likert 1-5 ke 0-100: mean 1 -> 0, mean 5 -> 100
			mean := sums[meta.Key] / float64(counts[meta.Key])
			score = ((mean - 1) / 4) * 100
		}
		weight := happinessWeight(config, meta.Key)
		dimensions = append(dimensions, HappinessDimensionScore{
			Key:    meta.Key,
			Label:  meta.Label,
			Score:  round2(score),
			Weight: weight,
		})
		index += score * weight
	}
	return round2(clamp(index, 0, 100)), dimensions
}

// classifyHappiness mengelompokkan HI sesuai master prompt §12.
func classifyHappiness(index float64) string {
	switch {
	case index >= 90:
		return "Sangat Tinggi"
	case index >= 75:
		return "Tinggi"
	case index >= 60:
		return "Sedang"
	case index >= 40:
		return "Rendah"
	default:
		return "Sangat Rendah"
	}
}

// happinessFactors mengurutkan dimensi dari skor terendah (perlu perhatian)
// ke tertinggi.
func happinessFactors(dimensions []HappinessDimensionScore) []HappinessDimensionScore {
	sorted := append([]HappinessDimensionScore{}, dimensions...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Score < sorted[j].Score
	})
	return sorted
}

// burnoutCategoryLabel memetakan skor burnout 0-10 ke label Indonesia
// konsisten dengan kategori admin analytics.
func burnoutCategoryLabel(score float64, config SystemConfig) string {
	if score <= config.BurnoutThresholdLow {
		return "Rendah"
	}
	if score <= config.BurnoutThresholdMedium {
		return "Sedang"
	}
	return "Tinggi"
}

// ============================================================
// Combined Well-Being: interpretasi gabungan burnout x happiness
// ============================================================

type WellBeingInterpretation struct {
	Label    string `json:"label"`
	Priority int    `json:"priority"` // 0 baik, 1 observasi, 2 monitoring, 3 prioritas
	Insight  string `json:"insight"`
}

// wellBeingInterpretation matrix sesuai master prompt §9 (bukan diagnosis).
func wellBeingInterpretation(burnoutCat string, happinessCat string) WellBeingInterpretation {
	key := burnoutCat + "|" + happinessCat
	matrix := map[string]WellBeingInterpretation{
		"Rendah|Sangat Tinggi": {Label: "Kondisi relatif baik", Priority: 0, Insight: "Burnout rendah dan Happiness Index sangat tinggi. Pertahankan kondisi belajar yang seimbang ini."},
		"Rendah|Tinggi":        {Label: "Kondisi relatif baik", Priority: 0, Insight: "Burnout rendah dan Happiness Index tinggi. Kondisi akademik mahasiswa relatif sehat."},
		"Rendah|Sedang":        {Label: "Relatif baik", Priority: 0, Insight: "Burnout rendah dengan Happiness Index sedang. Pertahankan pola belajar dan pantau faktor kebahagiaan berskor rendah."},
		"Rendah|Rendah":        {Label: "Perlu observasi", Priority: 1, Insight: "Burnout rendah namun Happiness Index rendah. Perhatikan faktor kebahagiaan yang bermasalah meski indikator burnout masih baik."},
		"Rendah|Sangat Rendah": {Label: "Perlu observasi", Priority: 1, Insight: "Burnout rendah namun Happiness Index sangat rendah. Disarankan evaluasi faktor kebahagiaan dan diskusi dengan DPA."},
		"Sedang|Sangat Tinggi": {Label: "Relatif baik", Priority: 0, Insight: "Burnout sedang dengan Happiness Index sangat tinggi. Kondisi relatif baik, tetap lakukan monitoring berkala."},
		"Sedang|Tinggi":        {Label: "Relatif baik", Priority: 0, Insight: "Burnout sedang dengan Happiness Index tinggi. Kondisi relatif baik, tetap lakukan monitoring berkala."},
		"Sedang|Sedang":        {Label: "Perlu observasi", Priority: 1, Insight: "Burnout dan Happiness Index sama-sama sedang. Lakukan monitoring berkala terhadap perubahan kondisi akademik."},
		"Sedang|Rendah":        {Label: "Perlu monitoring", Priority: 2, Insight: "Burnout sedang sementara Happiness Index rendah. Disarankan monitoring akademik melalui Dosen Pembimbing Akademik."},
		"Sedang|Sangat Rendah": {Label: "Perlu monitoring", Priority: 2, Insight: "Burnout sedang sementara Happiness Index sangat rendah. Disarankan monitoring akademik melalui Dosen Pembimbing Akademik."},
		"Tinggi|Sangat Tinggi": {Label: "Perlu observasi", Priority: 1, Insight: "Burnout tinggi namun Happiness Index sangat tinggi. Perlu observasi untuk memahami sumber beban akademik yang tinggi."},
		"Tinggi|Tinggi":        {Label: "Perlu observasi", Priority: 1, Insight: "Burnout tinggi namun Happiness Index tinggi. Perlu observasi terhadap beban studi yang menekan."},
		"Tinggi|Sedang":        {Label: "Perlu monitoring", Priority: 2, Insight: "Burnout tinggi dengan Happiness Index sedang. Disarankan monitoring akademik dan evaluasi faktor yang memiliki skor rendah."},
		"Tinggi|Rendah":        {Label: "Prioritas Monitoring Akademik", Priority: 3, Insight: "Burnout tinggi sementara Happiness Index rendah. Hasil analitik menyarankan monitoring akademik melalui Dosen Pembimbing Akademik."},
		"Tinggi|Sangat Rendah": {Label: "Prioritas Monitoring Akademik", Priority: 3, Insight: "Burnout tinggi sementara Happiness Index sangat rendah. Prioritas monitoring akademik melalui Dosen Pembimbing Akademik sangat disarankan."},
	}
	if interp, ok := matrix[key]; ok {
		return interp
	}
	return WellBeingInterpretation{Label: "Perlu observasi", Priority: 1, Insight: "Data belum lengkap untuk interpretasi penuh. Lakukan monitoring berkala."}
}

// wellbeingRecommendation menghasilkan rekomendasi akademik gabungan (§26)
// beserta fokus dimensi happiness terlemah.
func wellbeingRecommendation(burnoutCat string, happinessCat string, dimensions []HappinessDimensionScore) string {
	var base string
	switch {
	case burnoutCat == "Tinggi" && (happinessCat == "Rendah" || happinessCat == "Sangat Rendah"):
		base = "Disarankan melakukan konsultasi akademik dengan DPA untuk mengevaluasi beban studi dan hambatan akademik."
	case burnoutCat == "Tinggi" && happinessCat == "Sedang":
		base = "Disarankan melakukan monitoring berkala dan mengevaluasi faktor akademik yang memiliki skor rendah."
	case burnoutCat == "Tinggi" && (happinessCat == "Tinggi" || happinessCat == "Sangat Tinggi"):
		base = "Indikator burnout perlu dipantau; evaluasi beban studi meskipun Happiness Index masih tinggi."
	case burnoutCat == "Sedang" && (happinessCat == "Tinggi" || happinessCat == "Sangat Tinggi"):
		base = "Kondisi relatif baik, tetap lakukan monitoring secara berkala."
	case burnoutCat == "Sedang" && happinessCat == "Sedang":
		base = "Kondisi sedang, pertahankan pola belajar yang seimbang dan pantau perubahan kondisi secara berkala."
	case burnoutCat == "Sedang" && (happinessCat == "Rendah" || happinessCat == "Sangat Rendah"):
		base = "Perhatikan faktor kebahagiaan dengan skor rendah dan pertimbangkan diskusi dengan DPA."
	case burnoutCat == "Rendah" && (happinessCat == "Rendah" || happinessCat == "Sangat Rendah"):
		base = "Perhatikan faktor kebahagiaan dengan skor rendah dan pertimbangkan diskusi dengan DPA."
	default:
		base = "Kondisi relatif baik. Pertahankan pola belajar yang sehat dan lakukan monitoring berkala."
	}

	if len(dimensions) > 0 {
		weakest := happinessFactors(dimensions)[0]
		if weakest.Score < 60 {
			base += fmt.Sprintf(" Dimensi \"%s\" memiliki skor terendah (%.0f) sehingga layak menjadi fokus perbaikan.", weakest.Label, weakest.Score)
		}
	}
	return base
}

// ============================================================
// Early warning gabungan (§18): perubahan antar-dua assessment
// ============================================================

type WellBeingWarning struct {
	Type     string `json:"type"` // burnout_increase | happiness_decline | combined
	Label    string `json:"label"`
	Detail   string `json:"detail"`
	Priority int    `json:"priority"`
}

// detectWellbeingChange mendeteksi burnout meningkat dan/atau happiness
// menurun secara signifikan. Tanpa label diagnosis.
func detectWellbeingChange(prevBurnout float64, curBurnout float64, prevHI float64, curHI float64, config SystemConfig) []WellBeingWarning {
	warnings := []WellBeingWarning{}
	burnoutRise := curBurnout - prevBurnout
	happinessDrop := prevHI - curHI

	burnoutWarning := config.EarlyWarningEnabled && burnoutRise >= config.WellbeingWarnBurnoutRise
	happinessWarning := config.EarlyWarningEnabled && happinessDrop >= config.WellbeingWarnHappinessDrop

	if burnoutWarning && happinessWarning {
		warnings = append(warnings, WellBeingWarning{
			Type:  "combined",
			Label: "Prioritas Monitoring Akademik",
			Detail: fmt.Sprintf("Indikator burnout meningkat dari %.1f ke %.1f sementara Happiness Index turun dari %.0f ke %.0f. Disarankan monitoring akademik melalui DPA.",
				prevBurnout, curBurnout, prevHI, curHI),
			Priority: 3,
		})
		return warnings
	}
	if burnoutWarning {
		warnings = append(warnings, WellBeingWarning{
			Type:     "burnout_increase",
			Label:    "Burnout Meningkat",
			Detail:   fmt.Sprintf("Indikator burnout meningkat dari %.1f ke %.1f. Perlu monitoring kondisi akademik.", prevBurnout, curBurnout),
			Priority: 2,
		})
	}
	if happinessWarning {
		warnings = append(warnings, WellBeingWarning{
			Type:     "happiness_decline",
			Label:    "Happiness Menurun",
			Detail:   fmt.Sprintf("Happiness Index menurun dari %.0f ke %.0f. Perlu evaluasi faktor kebahagiaan berskor rendah.", prevHI, curHI),
			Priority: 2,
		})
	}
	return warnings
}

// ============================================================
// Pipeline klasifikasi happiness (siap ML, tanpa akurasi palsu)
// ============================================================

// happinessModelStatus menjelaskan status model: HI scoring-based digunakan
// sampai dataset memadai untuk klasifikasi (LOW/MEDIUM/HIGH).
func happinessModelStatus(sampleCount int) map[string]interface{} {
	status := map[string]interface{}{
		"mode":         "scoring-based",
		"target":       []string{"LOW", "MEDIUM", "HIGH"},
		"min_samples":  60,
		"ready_for_ml": false,
	}
	if sampleCount >= 60 {
		status["ready_for_ml"] = true
		status["mode"] = "ml-classification-ready"
	}
	return status
}

// classifyHappinessLevel memetakan kategori HI ke target klasifikasi 3 level.
func classifyHappinessLevel(category string) string {
	switch category {
	case "Sangat Tinggi", "Tinggi":
		return "HIGH"
	case "Sedang":
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
