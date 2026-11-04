package handlers_test

import (
	"testing"

	"github.com/bugloper/xpensiv/internal/testutil"
)

// The payee picker is fed from the user's own history: distinct names, most
// used first, each with the category last used alongside it, never another
// user's payees and never void rows.
func TestPayeesFromOwnHistory(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	other := env.Register(owner, "Other", "other@example.com")

	acc := owner.CreateAccount("Wallet", "cash", 100000)
	food := owner.Category("Food")
	groceries := owner.Category("Groceries")
	tx := func(c *testutil.Client, payee, date, category string) map[string]any {
		body := map[string]any{"type": "expense", "amount": 1000, "account_id": acc, "payee": payee, "transaction_date": date}
		if category != "" {
			body["category_id"] = category
		}
		st, res := c.Do("POST", "/transactions", body)
		if st != 201 {
			t.Fatalf("create %s: %d %v", payee, st, res)
		}
		return testutil.Data(res)
	}
	tx(owner, "Ambient Cafe", "2026-11-01", food)
	tx(owner, "Ambient Cafe", "2026-11-03", groceries) // latest use decides the category
	tx(owner, "8 Eleven", "2026-11-02", groceries)
	tx(owner, "", "2026-11-02", food) // blank payees are not offered
	voided := tx(owner, "Old Shop", "2026-10-01", food)
	if st, res := owner.Do("PATCH", "/transactions/"+voided["id"].(string), map[string]any{"status": "void"}); st != 200 {
		t.Fatalf("void: %d %v", st, res)
	}

	otherAcc := other.CreateAccount("Wallet", "cash", 0)
	if st, res := other.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 500, "account_id": otherAcc, "payee": "Secret Place", "transaction_date": "2026-11-02"}); st != 201 {
		t.Fatalf("other create: %d %v", st, res)
	}

	st, res := owner.Do("GET", "/payees", nil)
	if st != 200 {
		t.Fatalf("payees: %d %v", st, res)
	}
	got := testutil.List(res)
	if len(got) != 2 {
		t.Fatalf("want 2 payees, got %v", got)
	}
	first := got[0].(map[string]any)
	if first["name"] != "Ambient Cafe" || first["count"].(float64) != 2 || first["last_used"] != "2026-11-03" {
		t.Fatalf("first payee: %v", first)
	}
	if first["last_category_id"] != groceries || first["last_account_id"] != acc {
		t.Fatalf("last used category/account: %v", first)
	}
	if got[1].(map[string]any)["name"] != "8 Eleven" {
		t.Fatalf("second payee: %v", got[1])
	}

	if st, res := env.Anon().Do("GET", "/payees", nil); st != 401 {
		t.Fatalf("anonymous payees: %d %v", st, res)
	}
}
