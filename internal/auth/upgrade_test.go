package auth_test

import (
	"context"
	"testing"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/testutil"
)

// A user from before the two-level tree has the old flat defaults. The
// upgrade must give them the tree, keep every transaction reachable, move
// budgets and recurring rules, and do nothing on a second run.
func TestUpgradeCategoryTreesFromFlatDefaults(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	var uid string
	if err := env.DB.QueryRow(`SELECT id FROM users WHERE email = 'owner@example.com'`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	// Rewind the owner to the flat defaults of earlier releases plus one custom category.
	if _, err := env.DB.Exec(`DELETE FROM categories WHERE user_id = ?`, uid); err != nil {
		t.Fatal(err)
	}
	legacy := []struct{ id, name, typ string }{
		{"l-food", "Food", "expense"}, {"l-groceries", "Groceries", "expense"}, {"l-fuel", "Fuel", "expense"},
		{"l-bills", "Bills", "expense"}, {"l-loan", "Loan Repayment", "expense"}, {"l-other", "Other", "expense"},
		{"l-salary", "Salary", "income"}, {"l-business", "Business", "income"}, {"l-oi", "Other Income", "income"},
	}
	for i, c := range legacy {
		if _, err := env.DB.Exec(`INSERT INTO categories (id, user_id, name, icon, color, type, is_active, is_system, sort_order, created_at, updated_at)
			VALUES (?,?,?,'circle','#64748b',?,1,1,?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`, c.id, uid, c.name, c.typ, i); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := env.DB.Exec(`INSERT INTO categories (id, user_id, name, icon, color, type, is_active, is_system, sort_order, created_at, updated_at)
		VALUES ('u-momo', ?, 'Momo', 'utensils', '#f97316', 'expense', 1, 0, 50, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`, uid); err != nil {
		t.Fatal(err)
	}
	acc := owner.CreateAccount("Wallet", "cash", 100000)
	tx := func(cat string, amount int64) {
		if st, res := owner.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": amount, "account_id": acc, "category_id": cat, "transaction_date": "2026-11-01"}); st != 201 {
			t.Fatalf("tx %s: %d %v", cat, st, res)
		}
	}
	tx("l-food", 100)
	tx("l-groceries", 200)
	tx("l-bills", 300)
	tx("l-loan", 400)
	tx("u-momo", 500)
	if st, res := owner.Do("POST", "/budgets", map[string]any{"category_id": "l-loan", "amount": 5000}); st != 201 {
		t.Fatalf("budget: %d %v", st, res)
	}

	if err := auth.UpgradeCategoryTrees(context.Background(), env.DB); err != nil {
		t.Fatal(err)
	}

	st, body := owner.Do("GET", "/categories?include_inactive=1", nil)
	if st != 200 {
		t.Fatalf("categories: %d %v", st, body)
	}
	byName := map[string]map[string]any{}
	for _, x := range testutil.List(body) {
		m := x.(map[string]any)
		byName[m["name"].(string)] = m
	}
	if len(byName) != auth.DefaultCategoryCount()+1 {
		t.Fatalf("want tree + custom category, got %d categories", len(byName))
	}
	// Same-named old defaults were adopted in place.
	if byName["Groceries"]["id"] != "l-groceries" || byName["Groceries"]["parent_id"] != byName["Food & Groceries"]["id"] {
		t.Fatalf("Groceries should be adopted under Food & Groceries: %v", byName["Groceries"])
	}
	if byName["Salary"]["id"] != "l-salary" || byName["Fuel"]["id"] != "l-fuel" {
		t.Fatalf("Salary/Fuel should keep their ids")
	}
	// A legacy name that matches a new group becomes that group.
	if byName["Other Income"]["id"] != "l-oi" || byName["Other Income"]["parent_id"] != nil || byName["Other income"]["parent_id"] != "l-oi" {
		t.Fatalf("Other Income should be adopted as the group: %v / %v", byName["Other Income"], byName["Other income"])
	}
	// The custom category is untouched.
	if byName["Momo"]["id"] != "u-momo" || byName["Momo"]["parent_id"] != nil {
		t.Fatalf("custom category changed: %v", byName["Momo"])
	}
	// Mapped legacy rows are gone and their transactions moved.
	for _, gone := range []string{"Food", "Bills", "Loan Repayment", "Other", "Business"} {
		if _, ok := byName[gone]; ok {
			t.Fatalf("legacy category %q should have been removed", gone)
		}
	}
	sum := func(name string) int64 {
		var n int64
		if err := env.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE category_id = ?`, byName[name]["id"]).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if sum("Food & Groceries") != 100 || sum("Groceries") != 200 || sum("Household Expenses") != 300 || sum("Loan repayments") != 400 || sum("Momo") != 500 {
		t.Fatalf("transactions not where expected: %d %d %d %d %d", sum("Food & Groceries"), sum("Groceries"), sum("Household Expenses"), sum("Loan repayments"), sum("Momo"))
	}
	var orphans int
	if err := env.DB.QueryRow(`SELECT COUNT(*) FROM transactions t WHERE t.user_id = ? AND t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)`, uid).Scan(&orphans); err != nil {
		t.Fatal(err)
	}
	if orphans != 0 {
		t.Fatalf("%d transactions point at a deleted category", orphans)
	}
	var budgetCat string
	if err := env.DB.QueryRow(`SELECT category_id FROM budgets WHERE user_id = ?`, uid).Scan(&budgetCat); err != nil {
		t.Fatal(err)
	}
	if budgetCat != byName["Loan repayments"]["id"] {
		t.Fatalf("budget should follow the mapped category")
	}

	// Idempotent: a second run changes nothing.
	if err := auth.UpgradeCategoryTrees(context.Background(), env.DB); err != nil {
		t.Fatal(err)
	}
	st, body = owner.Do("GET", "/categories?include_inactive=1", nil)
	if st != 200 || len(testutil.List(body)) != auth.DefaultCategoryCount()+1 {
		t.Fatalf("second run altered categories: %d %d", st, len(testutil.List(body)))
	}
	// A freshly registered user already has the tree and is left alone too.
	other := env.Register(owner, "Other", "other@example.com")
	if st, b := other.Do("GET", "/categories", nil); st != 200 || len(testutil.List(b)) != auth.DefaultCategoryCount() {
		t.Fatalf("new user categories: %d %d", st, len(testutil.List(b)))
	}
}
