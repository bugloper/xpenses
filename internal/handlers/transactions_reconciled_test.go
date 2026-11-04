package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/server"
)

// A matched transaction must keep its financial fields until it is unmatched;
// descriptive fields remain editable.
func TestPatchReconciledTransactionFreezesMoneyFields(t *testing.T) {
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cfg := config.Config{DefaultCurrency: "BTN", MaxUploadBytes: 1 << 20, DataDir: t.TempDir()}
	deps := server.NewDeps(cfg, db)
	e := server.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), deps, server.ExtraRegistrars(cfg, nil, db, deps)...)
	srv := httptest.NewServer(e)
	defer srv.Close()

	now := models.NowUTC()
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO accounts (id,name,type,currency,opening_balance,opening_balance_date,created_at,updated_at) VALUES ('acc','BOB','bank','BTN',0,'2026-01-01',?,?)`, now, now)
	mustExec(`INSERT INTO transactions (id,type,amount,currency,account_id,transaction_date,origin,status,created_at,updated_at) VALUES ('t1','expense',500,'BTN','acc','2026-10-05','manual','cleared',?,?)`, now, now)
	mustExec(`INSERT INTO bank_statements (id,provider,account_id,file_name,file_sha256,file_size,period_start,period_end,imported_at) VALUES ('s1','bob','acc','f.pdf','sha',1,'2026-10-01','2026-10-31',?)`, now)
	mustExec(`INSERT INTO bank_transactions (id,statement_id,account_id,line_no,transaction_date,description,debit,credit,fingerprint,created_at) VALUES ('b1','s1','acc',1,'2026-10-05','POS',500,0,'fp',?)`, now)
	mustExec(`INSERT INTO reconciliations (id,bank_transaction_id,transaction_id,status,match_type,created_at) VALUES ('r1','b1','t1','matched','manual',?)`, now)

	patch := func(body map[string]any) int {
		t.Helper()
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPatch, srv.URL+"/api/v1/transactions/t1", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}
	for name, body := range map[string]map[string]any{
		"amount":  {"amount": 600},
		"date":    {"transaction_date": "2026-10-06"},
		"status":  {"status": "void"},
		"account": {"account_id": "acc"},
		"type":    {"type": "income"},
	} {
		if st := patch(body); st != http.StatusConflict {
			t.Errorf("%s: want 409 got %d", name, st)
		}
	}
	if st := patch(map[string]any{"payee": "Shop", "notes": "ok", "category_id": "cat-food", "tags": []string{"x"}}); st != http.StatusOK {
		t.Errorf("descriptive edit: want 200 got %d", st)
	}
	var amount int64
	_ = db.QueryRow(`SELECT amount FROM transactions WHERE id='t1'`).Scan(&amount)
	if amount != 500 {
		t.Fatalf("amount changed to %d", amount)
	}
}
