package ocr_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bugloper/xpensiv/internal/ocr"
	"github.com/bugloper/xpensiv/internal/receipts"
	"github.com/bugloper/xpensiv/internal/receipts/synth"
)

func expectMBoB(t *testing.T, r receipts.Receipt, text string) {
	t.Helper()
	if !r.Recognised || r.Bank != "mBoB" || r.JournalNo != "551-428182" || r.Amount != 1000 ||
		r.PaymentType != "Personal Transfer" || r.Date != "2026-11-05" || r.Time != "01:38:10" {
		t.Fatalf("parsed receipt: %+v\ntext:\n%s", r, text)
	}
}

func expectMPay(t *testing.T, r receipts.Receipt, text string, rrno string) {
	t.Helper()
	if !r.Recognised || r.Bank != "mPay" || r.JournalNo != rrno || r.Amount != 1000 ||
		r.PaymentType != "Personal transfer" || r.Date != "2026-11-05" || r.Time != "10:59:20" {
		t.Fatalf("parsed receipt: %+v\ntext:\n%s", r, text)
	}
}

func extractSynthetic(t *testing.T, draw func(f *os.File) error) string {
	t.Helper()
	e := ocr.New("")
	if !e.Available() {
		t.Skip("tesseract not installed")
	}
	path := filepath.Join(t.TempDir(), "screen.png")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := draw(f); err != nil {
		t.Fatal(err)
	}
	f.Close()
	text, err := e.Extract(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	return text
}

// Reads a synthetic mBoB success screen drawn by code. Skipped where
// tesseract is not installed; the Docker image always has it.
func TestExtractSyntheticMBoB(t *testing.T) {
	text := extractSynthetic(t, func(f *os.File) error { return synth.MBoB(f, synth.DefaultMBoB) })
	if !strings.Contains(text, "428182") {
		t.Fatalf("journal number not read; text:\n%s", text)
	}
	expectMBoB(t, receipts.Parse(text), text)
}

func TestExtractSyntheticMPay(t *testing.T) {
	text := extractSynthetic(t, func(f *os.File) error { return synth.MPay(f, synth.DefaultMPay) })
	expectMPay(t, receipts.Parse(text), text, synth.DefaultMPay.RRNO)
}

// extractReal reads a real screenshot when one is present locally (they are
// never committed).
func extractReal(t *testing.T, path string) string {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Skip("no local real screenshot")
	}
	e := ocr.New("")
	if !e.Available() {
		t.Skip("tesseract not installed")
	}
	text, err := e.Extract(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	return text
}

func TestExtractRealMBoBIfPresent(t *testing.T) {
	text := extractReal(t, "../../testdata/receipts/mbob_success.png")
	expectMBoB(t, receipts.Parse(text), text)
}

func TestExtractRealMPayIfPresent(t *testing.T) {
	text := extractReal(t, "../../testdata/receipts/mpay_success.png")
	r := receipts.Parse(text)
	if len(r.JournalNo) != 12 {
		t.Fatalf("RRNO not read: %+v\ntext:\n%s", r, text)
	}
	expectMPay(t, r, text, r.JournalNo)
}

func TestExtractUnavailable(t *testing.T) {
	e := ocr.New("/definitely/not/tesseract")
	if e.Available() {
		t.Fatal("bogus binary reported available")
	}
	if _, err := e.Extract(context.Background(), "nope.png"); err != ocr.ErrUnavailable {
		t.Fatalf("want ErrUnavailable, got %v", err)
	}
}
