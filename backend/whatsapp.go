package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ============================================================
// Notifikasi WhatsApp satu arah (early warning prioritas).
// Env-gated: WHATSAPP_ENABLED=false berarti no-op.
// Provider default: Fonnte (POST target+message, header Authorization).
// ============================================================

func whatsappEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(getEnv("WHATSAPP_ENABLED", "false")), "true")
}

func whatsappAPIURL() string {
	return strings.TrimSpace(getEnv("WHATSAPP_API_URL", "https://api.fonnte.com/send"))
}

func whatsappToken() string {
	return strings.TrimSpace(getEnv("WHATSAPP_TOKEN", ""))
}

// normalizePhoneForWhatsApp mengubah "+62 812-3456-7890" / "0812..."
// menjadi format internasional tanpa karakter non-digit ("62812...").
func normalizePhoneForWhatsApp(phone string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if digits == "" {
		return ""
	}
	if strings.HasPrefix(digits, "0") {
		digits = "62" + digits[1:]
	}
	return digits
}

// sendWhatsApp mengirim satu pesan WA secara sinkron; dipanggil lewat
// goroutine agar kegagalan gateway tidak memengaruhi request utama.
func sendWhatsApp(phone string, message string) error {
	if !whatsappEnabled() {
		return nil
	}
	target := normalizePhoneForWhatsApp(phone)
	if target == "" {
		return fmt.Errorf("nomor telepon kosong/tidak valid")
	}
	token := whatsappToken()
	if token == "" {
		return fmt.Errorf("WHATSAPP_TOKEN belum diisi")
	}

	body := strings.NewReader(fmt.Sprintf("target=%s&message=%s", target, strings.ReplaceAll(message, "\n", " ")))
	req, err := http.NewRequest(http.MethodPost, whatsappAPIURL(), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", token)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("gateway WhatsApp balas %d", resp.StatusCode)
	}
	return nil
}

// dispatchWhatsAppAsync mengirim pesan WA di background; kegagalan hanya
// dicatat ke log dan tidak pernah menggagalkan request pemanggil.
func dispatchWhatsAppAsync(phone string, message string) {
	if !whatsappEnabled() || strings.TrimSpace(phone) == "" {
		return
	}
	go func() {
		if err := sendWhatsApp(phone, message); err != nil {
			log.Printf("WhatsApp notification gagal: %v", err)
		}
	}()
}

// notifyDpaWhatsApp mengirim peringatan prioritas ke telepon DPA.
func notifyDpaWhatsApp(dpa User, studentName string, detail string) {
	if !whatsappEnabled() || strings.TrimSpace(dpa.Phone) == "" {
		return
	}
	message := fmt.Sprintf(
		"[QC Analytics UMCI] Prioritas Monitoring Akademik.\nMahasiswa bimbingan %s memerlukan perhatian: %s\nSilakan cek portal DPA untuk detail dan catatan monitoring. (Pesan otomatis, bukan diagnosis.)",
		studentName, detail,
	)
	dispatchWhatsAppAsync(dpa.Phone, message)
}
