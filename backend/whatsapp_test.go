package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalizePhoneForWhatsApp(t *testing.T) {
	cases := map[string]string{
		"+62 812-3456-7890":  "6281234567890",
		"081234567890":       "6281234567890",
		"6281234567890":      "6281234567890",
		" +62 812 3456 789 ": "628123456789",
		"":                   "",
		"abc":                "",
	}
	for input, want := range cases {
		if got := normalizePhoneForWhatsApp(input); got != want {
			t.Errorf("normalizePhoneForWhatsApp(%q) = %q, harus %q", input, got, want)
		}
	}
}

func TestSendWhatsAppDisabled(t *testing.T) {
	t.Setenv("WHATSAPP_ENABLED", "false")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("WHATSAPP_API_URL", server.URL)
	t.Setenv("WHATSAPP_TOKEN", "test-token")

	if err := sendWhatsApp("+62 812-3456-7890", "tes"); err != nil {
		t.Fatalf("disabled harus no-op tanpa error, dapat %v", err)
	}
	if calls != 0 {
		t.Errorf("disabled tidak boleh memanggil gateway, dapat %d panggilan", calls)
	}
}

func TestSendWhatsAppPayload(t *testing.T) {
	t.Setenv("WHATSAPP_ENABLED", "true")
	var gotTarget, gotMessage, gotAuth, gotType string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotType = r.Header.Get("Content-Type")
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse form gagal: %v", err)
		}
		gotTarget = r.FormValue("target")
		gotMessage = r.FormValue("message")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("WHATSAPP_API_URL", server.URL)
	t.Setenv("WHATSAPP_TOKEN", "secret-token")

	if err := sendWhatsApp("+62 812-3456-7890", "Prioritas Monitoring Akademik\nuji"); err != nil {
		t.Fatalf("send gagal: %v", err)
	}
	if gotAuth != "secret-token" {
		t.Errorf("Authorization = %q, harus token", gotAuth)
	}
	if gotType != "application/x-www-form-urlencoded" {
		t.Errorf("Content-Type = %q", gotType)
	}
	if gotTarget != "6281234567890" {
		t.Errorf("target = %q, harus 6281234567890", gotTarget)
	}
	if gotMessage != "Prioritas Monitoring Akademik uji" {
		t.Errorf("message = %q (newline harus diganti spasi)", gotMessage)
	}
}

func TestSendWhatsAppGatewayError(t *testing.T) {
	t.Setenv("WHATSAPP_ENABLED", "true")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()
	t.Setenv("WHATSAPP_API_URL", server.URL)
	t.Setenv("WHATSAPP_TOKEN", "secret-token")

	if err := sendWhatsApp("081234567890", "tes"); err == nil {
		t.Fatalf("gateway 403 harus menghasilkan error")
	}
}
