package handlers_test

import (
	"net/http"
	"testing"

	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/testutil"
)

// A matched transaction must keep its financial fields until it is unmatched;
// descriptive fields remain editable.
func TestPatchReconciledTransactionFreezesMoneyFields(t *testing.T) {
	e := testutil.New(t)
	c := e.Setup("Owner", "owner@example.com")
	acc := c.CreateAccount("BOB", "bank", 0)
	_, created := c.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 500, "account_id": acc, "transaction_date": "2026-10-05"})
	txID := testutil.Data(created)["id"].(string)
	now := models.NowUTC()
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := e.DB.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO bank_statements (user_id,id,provider,account_id,file_name,file_sha256,file_size,period_start,period_end,imported_at) VALUES (?,'s1','bob',?,'f.pdf','sha',1,'2026-10-01','2026-10-31',?)`, c.UserID, acc, now)
	mustExec(`INSERT INTO bank_transactions (user_id,id,statement_id,account_id,line_no,transaction_date,description,debit,credit,fingerprint,created_at) VALUES (?,'b1','s1',?,1,'2026-10-05','POS',500,0,'fp',?)`, c.UserID, acc, now)
	mustExec(`INSERT INTO reconciliations (user_id,id,bank_transaction_id,transaction_id,status,match_type,created_at) VALUES (?,'r1','b1',?,'matched','manual',?)`, c.UserID, txID, now)

	for name, body := range map[string]map[string]any{
		"amount":  {"amount": 600},
		"date":    {"transaction_date": "2026-10-06"},
		"status":  {"status": "void"},
		"account": {"account_id": acc},
		"type":    {"type": "income"},
	} {
		if st, _ := c.Do(http.MethodPatch, "/transactions/"+txID, body); st != http.StatusConflict {
			t.Errorf("%s: want 409 got %d", name, st)
		}
	}
	if st, _ := c.Do(http.MethodPatch, "/transactions/"+txID, map[string]any{"payee": "Shop", "notes": "ok", "category_id": c.Category("Eating out"), "tags": []string{"x"}}); st != http.StatusOK {
		t.Errorf("descriptive edit: want 200 got %d", st)
	}
	var amount int64
	_ = e.DB.QueryRow(`SELECT amount FROM transactions WHERE id=?`, txID).Scan(&amount)
	if amount != 500 {
		t.Fatalf("amount changed to %d", amount)
	}
}
