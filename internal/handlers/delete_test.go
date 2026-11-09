package handlers_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bugloper/xpenses/internal/testutil"
)

func TestBulkDeleteTransactions(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	other := env.Register(owner, "Other", "other@example.com")
	acc := owner.CreateAccount("Wallet", "cash", 100000)
	oacc := other.CreateAccount("Theirs", "cash", 100000)
	mk := func(c *testutil.Client, account string, amount int) string {
		st, res := c.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": amount, "account_id": account, "transaction_date": "2026-11-05"})
		if st != 201 {
			t.Fatalf("create: %d %v", st, res)
		}
		return testutil.Data(res)["id"].(string)
	}
	a, b, keep := mk(owner, acc, 1000), mk(owner, acc, 2000), mk(owner, acc, 3000)
	theirs := mk(other, oacc, 500)
	if st, _ := owner.MultipartMethod("PUT", "/transactions/"+a+"/attachment", nil, "file", "shot.png", tinyPNG); st != 200 {
		t.Fatalf("attach: %d", st)
	}
	file := filepath.Join(env.Cfg.AttachmentsDir(), owner.UserID, a)

	// Nothing to delete, or too many: refused.
	if st, _ := owner.Do("POST", "/transactions/bulk-delete", map[string]any{"ids": []string{}}); st != 422 {
		t.Fatalf("empty: %d", st)
	}
	tooMany := make([]string, 501)
	for i := range tooMany {
		tooMany[i] = string(rune('a'+i%26)) + string(rune('a'+i/26))
	}
	if st, _ := owner.Do("POST", "/transactions/bulk-delete", map[string]any{"ids": tooMany}); st != 422 {
		t.Fatalf("too many: %d", st)
	}

	// Another user's id and an unknown id are skipped; duplicates count once.
	st, res := owner.Do("POST", "/transactions/bulk-delete", map[string]any{"ids": []string{a, b, b, theirs, "nope"}})
	if st != 200 || testutil.Data(res)["deleted"] != float64(2) {
		t.Fatalf("bulk delete: %d %v", st, res)
	}
	for _, id := range []string{a, b} {
		if st, _ := owner.Do("GET", "/transactions/"+id, nil); st != 404 {
			t.Fatalf("%s should be gone: %d", id, st)
		}
	}
	if st, _ := owner.Do("GET", "/transactions/"+keep, nil); st != 200 {
		t.Fatalf("unselected transaction should stay: %d", st)
	}
	if st, _ := other.Do("GET", "/transactions/"+theirs, nil); st != 200 {
		t.Fatalf("other user's transaction must survive: %d", st)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf("attachment should go with its transaction: %v", err)
	}
	if got := owner.Balance(acc); got != 100000-3000 {
		t.Fatalf("balance after bulk delete: %d", got)
	}
}

func TestDeleteAccount(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	other := env.Register(owner, "Other", "other@example.com")
	empty := owner.CreateAccount("Unused", "bank", 0)
	used := owner.CreateAccount("Wallet", "cash", 5000)
	target := owner.CreateAccount("Savings", "savings", 0)
	if st, res := owner.Do("POST", "/transactions", map[string]any{"type": "transfer", "amount": 1000, "account_id": used, "transfer_account_id": target, "transaction_date": "2026-11-05"}); st != 201 {
		t.Fatalf("transfer: %d %v", st, res)
	}

	st, res := owner.Do("GET", "/accounts/"+target+"/usage", nil)
	if st != 200 || testutil.Data(res)["transactions"] != float64(1) || testutil.Data(res)["recurring"] != float64(0) {
		t.Fatalf("usage: %d %v", st, res)
	}
	// An account with history, even only as a transfer's destination, stays.
	for _, id := range []string{used, target} {
		if st, _ := owner.Do("DELETE", "/accounts/"+id, nil); st != 409 {
			t.Fatalf("delete account with history: %d", st)
		}
	}
	// Someone else cannot delete it; the owner can delete the empty one.
	if st, _ := other.Do("DELETE", "/accounts/"+empty, nil); st != 404 {
		t.Fatalf("other user delete: %d", st)
	}
	if st, _ := owner.Do("DELETE", "/accounts/"+empty, nil); st != 204 {
		t.Fatalf("delete empty account: %d", st)
	}
	if st, _ := owner.Do("GET", "/accounts/"+empty, nil); st != 404 {
		t.Fatalf("deleted account still there: %d", st)
	}
}

func TestDeleteCategory(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	other := env.Register(owner, "Other", "other@example.com")
	acc := owner.CreateAccount("Wallet", "cash", 100000)
	st, res := owner.Do("POST", "/categories", map[string]any{"name": "Model trains", "type": "expense", "icon": "music", "color": "#336699"})
	if st != 201 {
		t.Fatalf("create main: %d %v", st, res)
	}
	main := testutil.Data(res)["id"].(string)
	st, res = owner.Do("POST", "/categories", map[string]any{"name": "Track pieces", "type": "expense", "icon": "music", "color": "#336699", "parent_id": main})
	if st != 201 {
		t.Fatalf("create sub: %d %v", st, res)
	}
	sub := testutil.Data(res)["id"].(string)
	st, res = owner.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 700, "account_id": acc, "category_id": sub, "transaction_date": "2026-11-05"})
	if st != 201 {
		t.Fatalf("tx: %d %v", st, res)
	}
	txID := testutil.Data(res)["id"].(string)
	if st, res := owner.Do("POST", "/budgets", map[string]any{"category_id": main, "amount": 5000}); st != 201 {
		t.Fatalf("budget: %d %v", st, res)
	}
	if st, res := owner.Do("POST", "/recurring", map[string]any{"name": "Lessons", "type": "expense", "amount": 300, "account_id": acc, "category_id": sub, "frequency": "monthly", "start_date": "2026-12-01"}); st != 201 {
		t.Fatalf("recurring: %d %v", st, res)
	}

	st, res = owner.Do("GET", "/categories/"+main+"/usage", nil)
	u := testutil.Data(res)
	if st != 200 || u["sub_categories"] != float64(1) || u["transactions"] != float64(1) || u["budgets"] != float64(1) || u["recurring"] != float64(1) {
		t.Fatalf("usage: %d %v", st, res)
	}
	if st, _ := other.Do("DELETE", "/categories/"+main, nil); st != 404 {
		t.Fatalf("other user delete: %d", st)
	}
	if st, _ := owner.Do("DELETE", "/categories/"+main, nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	for _, id := range []string{main, sub} {
		if st, _ := owner.Do("GET", "/categories/"+id, nil); st != 404 {
			t.Fatalf("category %s should be gone: %d", id, st)
		}
	}
	// The transaction stays, uncategorised, and the money still counts.
	st, res = owner.Do("GET", "/transactions/"+txID, nil)
	if st != 200 || testutil.Data(res)["category_id"] != nil {
		t.Fatalf("transaction after delete: %d %v", st, res)
	}
	if got := owner.Balance(acc); got != 100000-700 {
		t.Fatalf("balance: %d", got)
	}
	st, res = owner.Do("GET", "/budgets", nil)
	if st != 200 || len(res["data"].([]any)) != 0 {
		t.Fatalf("budgets should be gone: %d %v", st, res)
	}
	st, res = owner.Do("GET", "/recurring", nil)
	rules := res["data"].([]any)
	if st != 200 || len(rules) != 1 || rules[0].(map[string]any)["category_id"] != nil {
		t.Fatalf("recurring rule should stay without a category: %d %v", st, res)
	}
}
