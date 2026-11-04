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

// Reads a synthetic mBoB success screen drawn by code. Skipped where
// tesseract is not installed; the Docker image always has it.
func TestExtractSyntheticMBoB(t *testing.T) {
	e := ocr.New("")
	if !e.Available() {
		t.Skip("tesseract not installed")
	}
	path := filepath.Join(t.TempDir(), "mbob.png")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := synth.MBoB(f, synth.DefaultMBoB); err != nil {
		t.Fatal(err)
	}
	f.Close()
	text, err := e.Extract(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "428182") {
		t.Fatalf("journal number not read; text:\n%s", text)
	}
	expectMBoB(t, receipts.Parse(text), text)
}

// A real screenshot, when one is present locally (it is never committed).
func TestExtractRealMBoBIfPresent(t *testing.T) {
	const path = "../../testdata/receipts/mbob_success.png"
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
	expectMBoB(t, receipts.Parse(text), text)
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
