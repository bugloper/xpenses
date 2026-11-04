package services

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	apperr "github.com/bugloper/xpensiv/internal/errors"
)

func TestFingerprint(t *testing.T) {
	bal := int64(500)
	a := Fingerprint("acc", "2026-10-01", "POS PURCHASE  Eight Eleven", 1845, 0, &bal)
	if !regexp.MustCompile(`^[0-9a-f]{32}$`).MatchString(a) {
		t.Fatalf("shape: %s", a)
	}
	same := Fingerprint("acc", "2026-10-01", "  pos purchase eight   eleven ", 1845, 0, &bal)
	if a != same {
		t.Error("description normalisation must not change the fingerprint")
	}
	cases := map[string]string{
		"account":  Fingerprint("other", "2026-10-01", "POS PURCHASE Eight Eleven", 1845, 0, &bal),
		"date":     Fingerprint("acc", "2026-10-02", "POS PURCHASE Eight Eleven", 1845, 0, &bal),
		"desc":     Fingerprint("acc", "2026-10-01", "POS PURCHASE Eight Twelve", 1845, 0, &bal),
		"debit":    Fingerprint("acc", "2026-10-01", "POS PURCHASE Eight Eleven", 1846, 0, &bal),
		"credit":   Fingerprint("acc", "2026-10-01", "POS PURCHASE Eight Eleven", 0, 1845, &bal),
		"balance":  Fingerprint("acc", "2026-10-01", "POS PURCHASE Eight Eleven", 1845, 0, nil),
		"balance2": Fingerprint("acc", "2026-10-01", "POS PURCHASE Eight Eleven", 1845, 0, i64(501)),
	}
	for name, fp := range cases {
		if fp == a {
			t.Errorf("%s change must alter the fingerprint", name)
		}
	}
}

func i64(v int64) *int64 { return &v }

func TestValidateImport(t *testing.T) {
	vd := "2026-10-02"
	good := func() ImportRequest {
		return ImportRequest{UploadToken: "tok", AccountID: "acc",
			Statement:    PreviewStatement{PeriodStart: "2026-10-01", PeriodEnd: "2026-10-31"},
			Transactions: []PreviewTransaction{{TransactionDate: "2026-10-01", Debit: 100}, {TransactionDate: "2026-10-02", ValueDate: &vd, Credit: 5}}}
	}
	cases := []struct {
		name   string
		mutate func(r *ImportRequest)
		field  string
	}{
		{"valid", func(r *ImportRequest) {}, ""},
		{"missing token", func(r *ImportRequest) { r.UploadToken = "" }, "upload_token"},
		{"bad period", func(r *ImportRequest) { r.Statement.PeriodStart = "01-10-2026" }, "statement.period_start"},
		{"period order", func(r *ImportRequest) { r.Statement.PeriodEnd = "2026-09-30" }, "statement.period_end"},
		{"bad currency", func(r *ImportRequest) { r.Statement.Currency = "ngultrum" }, "statement.currency"},
		{"no rows", func(r *ImportRequest) { r.Transactions = nil }, "transactions"},
		{"bad date", func(r *ImportRequest) { r.Transactions[0].TransactionDate = "2026/10/01" }, "transactions[0].transaction_date"},
		{"bad value date", func(r *ImportRequest) { bad := "x"; r.Transactions[1].ValueDate = &bad }, "transactions[1].value_date"},
		{"negative debit", func(r *ImportRequest) { r.Transactions[0].Debit = -1 }, "transactions[0].debit"},
		{"negative credit", func(r *ImportRequest) { r.Transactions[1].Credit = -1 }, "transactions[1].credit"},
		{"both set", func(r *ImportRequest) { r.Transactions[1].Debit = 1 }, "transactions[1].credit"},
		{"neither set", func(r *ImportRequest) { r.Transactions[0].Debit = 0 }, "transactions[0].debit"},
		{"long description", func(r *ImportRequest) { r.Transactions[0].Description = strings.Repeat("x", 501) }, "transactions[0].description"},
	}
	for _, c := range cases {
		r := good()
		c.mutate(&r)
		err := validateImport(&r)
		if c.field == "" {
			if err != nil {
				t.Errorf("%s: unexpected %v", c.name, err)
			}
			if r.Statement.Currency != "BTN" {
				t.Errorf("%s: currency should default to BTN", c.name)
			}
			continue
		}
		if err == nil {
			t.Errorf("%s: expected error on %s", c.name, c.field)
			continue
		}
		ae, ok := apperr.As(err)
		if !ok || ae.Code != "validation_error" {
			t.Errorf("%s: want validation_error, got %v", c.name, err)
			continue
		}
		if _, present := ae.Details[c.field]; !present {
			t.Errorf("%s: field %s missing in %v", c.name, c.field, ae.Details)
		}
	}
}

func TestPurgePending(t *testing.T) {
	dir := t.TempDir()
	svc := NewStatementService(nil, dir)
	fixed := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return fixed }
	if err := os.MkdirAll(svc.pendingDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	oldPDF, oldMeta := svc.pendingPaths("00000000000000000000000000000001")
	newPDF, newMeta := svc.pendingPaths("00000000000000000000000000000002")
	for _, p := range []string{oldPDF, oldMeta, newPDF, newMeta} {
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	stale := fixed.Add(-31 * time.Minute)
	fresh := fixed.Add(-5 * time.Minute)
	for p, ts := range map[string]time.Time{oldPDF: stale, oldMeta: stale, newPDF: fresh, newMeta: fresh} {
		if err := os.Chtimes(p, ts, ts); err != nil {
			t.Fatal(err)
		}
	}
	svc.purgePending()
	left, _ := filepath.Glob(filepath.Join(svc.pendingDir(), "*"))
	if len(left) != 2 {
		t.Fatalf("want only the fresh pair left, got %v", left)
	}
	for _, p := range left {
		if !strings.Contains(p, "00000000000000000000000000000002") {
			t.Fatalf("stale file survived: %s", p)
		}
	}
}

func TestLoadPendingRejectsBadTokens(t *testing.T) {
	svc := NewStatementService(nil, t.TempDir())
	for _, tok := range []string{"", "../../etc/passwd", "ZZZZ", "0123456789abcdef0123456789abcde"} {
		if _, _, err := svc.loadPending(tok); err == nil {
			t.Errorf("token %q accepted", tok)
		}
	}
	if _, _, err := svc.loadPending("0123456789abcdef0123456789abcdef"); err == nil {
		t.Error("unknown token accepted")
	}
}
