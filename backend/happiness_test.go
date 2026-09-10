package main

import "testing"

func TestCalculateHappinessIndex(t *testing.T) {
	config := SystemConfig{
		HiWeightAcademic:    0.25,
		HiWeightMotivation:  0.20,
		HiWeightSocial:      0.20,
		HiWeightEnvironment: 0.15,
		HiWeightLecturer:    0.10,
		HiWeightFacilities:  0.10,
	}

	// Semua jawaban = 5 → semua dimensi 100 → HI 100
	responses := make([]HappinessResponse, 0)
	for _, q := range happinessQuestions {
		responses = append(responses, HappinessResponse{ID: q.ID, Value: 5})
	}
	index, dims := calculateHappiness(responses, config)
	if index != 100 {
		t.Fatalf("HI untuk semua jawaban 5 harus 100, dapat %v", index)
	}
	if len(dims) != 6 {
		t.Fatalf("Jumlah dimensi harus 6, dapat %d", len(dims))
	}

	// Semua jawaban = 1 → HI 0
	responses = nil
	for _, q := range happinessQuestions {
		responses = append(responses, HappinessResponse{ID: q.ID, Value: 1})
	}
	index, _ = calculateHappiness(responses, config)
	if index != 0 {
		t.Fatalf("HI untuk semua jawaban 1 harus 0, dapat %v", index)
	}

	// Semua jawaban = 4 → semua dimensi (4-1)/4*100 = 75 → HI 75
	responses = nil
	for _, q := range happinessQuestions {
		responses = append(responses, HappinessResponse{ID: q.ID, Value: 4})
	}
	index, _ = calculateHappiness(responses, config)
	if index != 75 {
		t.Fatalf("HI untuk semua jawaban 4 harus 75, dapat %v", index)
	}
}

func TestCalculateHappinessWeighted(t *testing.T) {
	config := SystemConfig{
		HiWeightAcademic:    0.25,
		HiWeightMotivation:  0.20,
		HiWeightSocial:      0.20,
		HiWeightEnvironment: 0.15,
		HiWeightLecturer:    0.10,
		HiWeightFacilities:  0.10,
	}

	responses := make([]HappinessResponse, 0)
	for _, q := range happinessQuestions {
		value := 3
		if q.Dimension == HappinessDimAcademic {
			value = 5
		}
		responses = append(responses, HappinessResponse{ID: q.ID, Value: value})
	}
	index, dims := calculateHappiness(responses, config)

	// Academic = 100 (w=0.25), lainnya 50 (w=0.75 total)
	// HI = 100*0.25 + 50*0.75 = 25 + 37.5 = 62.5
	if index != 62.5 {
		t.Fatalf("HI terbobot harus 62.5, dapat %v", index)
	}
	factors := happinessFactors(dims)
	if factors[0].Key == HappinessDimAcademic {
		t.Fatalf("Dimensi terlemah bukan academic (academic harus skor tertinggi): %v", factors[0].Key)
	}
}

func TestClassifyHappiness(t *testing.T) {
	cases := []struct {
		index    float64
		expected string
	}{
		{0, "Sangat Rendah"},
		{39.9, "Sangat Rendah"},
		{40, "Rendah"},
		{59.9, "Rendah"},
		{60, "Sedang"},
		{74.9, "Sedang"},
		{75, "Tinggi"},
		{89.9, "Tinggi"},
		{90, "Sangat Tinggi"},
		{100, "Sangat Tinggi"},
	}
	for _, tc := range cases {
		if got := classifyHappiness(tc.index); got != tc.expected {
			t.Errorf("classifyHappiness(%v) = %s, harus %s", tc.index, got, tc.expected)
		}
	}
}

func TestClassifyHappinessLevel(t *testing.T) {
	cases := map[string]string{
		"Sangat Tinggi": "HIGH",
		"Tinggi":        "HIGH",
		"Sedang":        "MEDIUM",
		"Rendah":        "LOW",
		"Sangat Rendah": "LOW",
	}
	for cat, want := range cases {
		if got := classifyHappinessLevel(cat); got != want {
			t.Errorf("classifyHappinessLevel(%s) = %s, harus %s", cat, got, want)
		}
	}
}

func TestWellBeingInterpretation(t *testing.T) {
	cases := []struct {
		burnout   string
		happiness string
		wantLabel string
	}{
		{"Rendah", "Tinggi", "Kondisi relatif baik"},
		{"Rendah", "Sedang", "Relatif baik"},
		{"Sedang", "Tinggi", "Relatif baik"},
		{"Sedang", "Rendah", "Perlu monitoring"},
		{"Tinggi", "Tinggi", "Perlu observasi"},
		{"Tinggi", "Rendah", "Prioritas Monitoring Akademik"},
		{"Tinggi", "Sangat Rendah", "Prioritas Monitoring Akademik"},
	}
	for _, tc := range cases {
		got := wellBeingInterpretation(tc.burnout, tc.happiness)
		if got.Label != tc.wantLabel {
			t.Errorf("interpretasi(%s, %s) = %s, harus %s", tc.burnout, tc.happiness, got.Label, tc.wantLabel)
		}
	}
}

func TestDetectWellbeingChange(t *testing.T) {
	config := SystemConfig{
		EarlyWarningEnabled:         true,
		WellbeingWarnBurnoutRise:    1.0,
		WellbeingWarnHappinessDrop:  10,
	}

	// Burnout naik signifikan + happiness turun signifikan → prioritas gabungan
	warnings := detectWellbeingChange(5.2, 7.4, 78, 58, config)
	if len(warnings) != 1 {
		t.Fatalf("Harus satu warning gabungan, dapat %d", len(warnings))
	}
	if warnings[0].Type != "combined" || warnings[0].Label != "Prioritas Monitoring Akademik" {
		t.Errorf("Warning gabungan salah: %+v", warnings[0])
	}

	// Burnout naik kecil, happiness stabil → tidak ada warning
	warnings = detectWellbeingChange(5.0, 5.2, 78, 77, config)
	if len(warnings) != 0 {
		t.Errorf("Tidak seharusnya ada warning, dapat %+v", warnings)
	}

	// Hanya burnout naik signifikan
	warnings = detectWellbeingChange(5.0, 7.0, 78, 78, config)
	if len(warnings) != 1 || warnings[0].Type != "burnout_increase" {
		t.Errorf("Harus warning burnout_increase, dapat %+v", warnings)
	}

	// Hanya happiness turun signifikan
	warnings = detectWellbeingChange(5.0, 5.0, 78, 60, config)
	if len(warnings) != 1 || warnings[0].Type != "happiness_decline" {
		t.Errorf("Harus warning happiness_decline, dapat %+v", warnings)
	}

	// Early warning dimatikan
	config.EarlyWarningEnabled = false
	warnings = detectWellbeingChange(5.2, 7.4, 78, 58, config)
	if len(warnings) != 0 {
		t.Errorf("Early warning dimatikan tapi masih ada warning: %+v", warnings)
	}
}

func TestBurnoutCategoryLabel(t *testing.T) {
	config := SystemConfig{BurnoutThresholdLow: 4, BurnoutThresholdMedium: 6}
	if got := burnoutCategoryLabel(3.0, config); got != "Rendah" {
		t.Errorf("burnoutCategoryLabel(3.0) = %s, harus Rendah", got)
	}
	if got := burnoutCategoryLabel(5.0, config); got != "Sedang" {
		t.Errorf("burnoutCategoryLabel(5.0) = %s, harus Sedang", got)
	}
	if got := burnoutCategoryLabel(7.5, config); got != "Tinggi" {
		t.Errorf("burnoutCategoryLabel(7.5) = %s, harus Tinggi", got)
	}
}

func TestNormalizeHappinessWeights(t *testing.T) {
	// Bobot valid → dipertahankan
	config := normalizeHappinessWeights(SystemConfig{
		HiWeightAcademic: 0.25, HiWeightMotivation: 0.20, HiWeightSocial: 0.20,
		HiWeightEnvironment: 0.15, HiWeightLecturer: 0.10, HiWeightFacilities: 0.10,
	})
	if config.HiWeightAcademic != 0.25 || config.HiWeightFacilities != 0.10 {
		t.Errorf("Bobot valid berubah: %+v", config)
	}

	// Bobot nol semua → fallback default
	config = normalizeHappinessWeights(SystemConfig{})
	if config.HiWeightAcademic != 0.25 {
		t.Errorf("Fallback bobot academic harus 0.25, dapat %v", config.HiWeightAcademic)
	}

	// Bobot tidak wajar (di luar 0.5-1.5) → fallback default
	config = normalizeHappinessWeights(SystemConfig{
		HiWeightAcademic: 2.0, HiWeightMotivation: 2.0, HiWeightSocial: 2.0,
		HiWeightEnvironment: 2.0, HiWeightLecturer: 2.0, HiWeightFacilities: 2.0,
	})
	if config.HiWeightAcademic != 0.25 {
		t.Errorf("Bobot tidak wajar harus fallback 0.25, dapat %v", config.HiWeightAcademic)
	}

	// Bobot total 0.8 → dinormalisasi ke total 1.0
	config = normalizeHappinessWeights(SystemConfig{
		HiWeightAcademic: 0.20, HiWeightMotivation: 0.16, HiWeightSocial: 0.16,
		HiWeightEnvironment: 0.12, HiWeightLecturer: 0.08, HiWeightFacilities: 0.08,
	})
	total := config.HiWeightAcademic + config.HiWeightMotivation + config.HiWeightSocial +
		config.HiWeightEnvironment + config.HiWeightLecturer + config.HiWeightFacilities
	if total < 0.999 || total > 1.001 {
		t.Errorf("Total bobot harus 1.0, dapat %v", total)
	}
}

func TestHappinessQuestionsCoverage(t *testing.T) {
	if len(happinessQuestions) != 24 {
		t.Fatalf("Bank soal happiness harus 24 butir, dapat %d", len(happinessQuestions))
	}
	seen := map[string]bool{}
	counts := map[string]int{}
	for _, q := range happinessQuestions {
		if seen[q.ID] {
			t.Errorf("ID soal duplikat: %s", q.ID)
		}
		seen[q.ID] = true
		counts[q.Dimension]++
	}
	if len(counts) != 6 {
		t.Fatalf("Harus ada 6 dimensi, dapat %d", len(counts))
	}
	for dim, count := range counts {
		if count != 4 {
			t.Errorf("Dimensi %s harus 4 butir, dapat %d", dim, count)
		}
	}
}
