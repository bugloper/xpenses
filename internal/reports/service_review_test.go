package reports

import (
	"context"
	"testing"

	"github.com/bugloper/xpensiv/internal/database"
)

// The account balance expression (repositories/accounts.go) and the reports
// must agree: summary.total_balance equals the sum of accounts[].balance, and
// over a period covering every transaction each account's balance is
// opening + income − expenses + transfers_in − transfers_out. The ledger mixes
// every type and status, including pending/void rows that must not count and
// an inactive account that is excluded from both sides.
func TestBalanceInvariants(t *testing.T) {
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	acct := func(id, typ string, opening int64, active int) {
		exec(t, db, `INSERT INTO accounts (id,name,type,currency,opening_balance,opening_balance_date,is_active,created_at,updated_at)
			VALUES (?,?,?,'BTN',?,'2026-01-01',?,?,?)`, id, id, typ, opening, active, ts, ts)
	}
	acct("bank", "bank", 100000, 1)
	acct("cash", "cash", 5000, 1)
	acct("card", "credit_card", -2000, 1)
	acct("old", "bank", 777, 0)

	tx := func(id, typ string, amount int64, from string, to any, date, status string) {
		exec(t, db, `INSERT INTO transactions (id,type,amount,currency,account_id,transfer_account_id,transaction_date,origin,status,created_at,updated_at)
			VALUES (?,?,?,'BTN',?,?,?,'manual',?,?,?)`, id, typ, amount, from, to, date, status, ts, ts)
	}
	tx("t1", "expense", 2500, "bank", nil, "2026-11-01", "cleared")
	tx("t2", "income", 50000, "bank", nil, "2026-11-01", "cleared")
	tx("t3", "refund", 500, "bank", nil, "2026-11-02", "cleared")
	tx("t4", "transfer", 10000, "bank", "cash", "2026-11-02", "cleared")
	tx("t5", "transfer", 4000, "cash", "card", "2026-11-03", "cleared")
	tx("t6", "adjustment", -300, "cash", nil, "2026-11-03", "cleared")
	tx("t7", "adjustment", 200, "bank", nil, "2026-11-04", "cleared")
	tx("t8", "expense", 1200, "card", nil, "2026-11-05", "cleared")
	tx("t9", "expense", 99999, "bank", nil, "2026-11-03", "pending")
	tx("t10", "income", 99999, "cash", nil, "2026-11-03", "void")
	tx("t11", "transfer", 99999, "bank", "cash", "2026-11-03", "pending")
	tx("t12", "transfer", 1000, "bank", "old", "2026-11-06", "cleared") // leaves the active set
	tx("t13", "expense", 50, "old", nil, "2026-11-06", "cleared")

	s := NewService(db)
	all := Period{From: "2026-01-01", To: "2026-12-31"}
	sum, err := s.Summary(context.Background(), all)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := s.Accounts(context.Background(), all)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("inactive account must be excluded: %s", dump(rows))
	}
	var total int64
	for _, r := range rows {
		total += r.Balance
		if delta := r.Income - r.Expenses + r.TransfersIn - r.TransfersOut; r.OpeningBalance+delta != r.Balance {
			t.Errorf("%s: opening %d + activity %d != balance %d (%+v)", r.AccountID, r.OpeningBalance, delta, r.Balance, r)
		}
	}
	if sum.TotalBalance != total {
		t.Fatalf("summary.total_balance %d != sum of accounts.balance %d", sum.TotalBalance, total)
	}
	// Hand-computed: bank 100000−2500+50000+500−10000+200−1000 = 137200,
	// cash 5000+10000−4000−300 = 10700, card −2000+4000−1200 = 800.
	if total != 137200+10700+800 {
		t.Fatalf("total want %d got %d", 137200+10700+800, total)
	}
	// Transfers and adjustments never reach the income/expense summary.
	if sum.Income != 50000+500 || sum.Expenses != 2500+1200+50 {
		t.Fatalf("summary flows: income %d expenses %d", sum.Income, sum.Expenses)
	}
}
