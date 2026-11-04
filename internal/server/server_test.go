package server_test

import (
	"testing"

	"github.com/bugloper/xpensiv/internal/auth"
	"github.com/bugloper/xpensiv/internal/testutil"
)

type env struct {
	t *testing.T
	*testutil.Client
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := testutil.New(t)
	return &env{t: t, Client: e.Setup("Owner", "owner@example.com")}
}

func (e *env) do(method, path string, body any) (int, map[string]any) {
	return e.Do(method, path, body)
}

func data(m map[string]any) map[string]any { return testutil.Data(m) }

func (e *env) createAccount(name, typ string, opening int64) string {
	return e.CreateAccount(name, typ, opening)
}

func (e *env) balance(id string) int64 { return e.Balance(id) }

func (e *env) cat(name string) string { return e.Category(name) }

func TestHealth(t *testing.T) {
	e := newEnv(t)
	st, body := e.do("GET", "/health", nil)
	if st != 200 || body["status"] != "ok" {
		t.Fatalf("health: %d %v", st, body)
	}
}

func TestDefaultCategoriesSeeded(t *testing.T) {
	e := newEnv(t)
	st, body := e.do("GET", "/categories", nil)
	if st != 200 {
		t.Fatal(st)
	}
	cats := body["data"].([]any)
	if len(cats) != auth.DefaultCategoryCount() {
		t.Fatalf("want %d default categories, got %d", auth.DefaultCategoryCount(), len(cats))
	}
}

func TestBalanceCalculation(t *testing.T) {
	e := newEnv(t)
	bank := e.createAccount("BOB", "bank", 100000)
	cash := e.createAccount("Wallet", "cash", 5000)

	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"expense", map[string]any{"type": "expense", "amount": 2500, "account_id": bank, "category_id": e.cat("Eating out"), "transaction_date": "2026-11-01"}, 201},
		{"income", map[string]any{"type": "income", "amount": 50000, "account_id": bank, "category_id": e.cat("Salary"), "transaction_date": "2026-11-01"}, 201},
		{"refund", map[string]any{"type": "refund", "amount": 500, "account_id": bank, "category_id": e.cat("Refunds"), "transaction_date": "2026-11-02"}, 201},
		{"transfer", map[string]any{"type": "transfer", "amount": 10000, "account_id": bank, "transfer_account_id": cash, "transaction_date": "2026-11-02"}, 201},
		{"adjustment negative", map[string]any{"type": "adjustment", "amount": -300, "account_id": cash, "transaction_date": "2026-11-03"}, 201},
		{"pending draft not counted", map[string]any{"type": "expense", "amount": 99999, "account_id": bank, "transaction_date": "2026-11-03", "status": "pending"}, 201},
		{"void not counted", map[string]any{"type": "expense", "amount": 99999, "account_id": bank, "transaction_date": "2026-11-03", "status": "void"}, 201},
		{"wrong category type rejected", map[string]any{"type": "expense", "amount": 100, "account_id": bank, "category_id": e.cat("Salary"), "transaction_date": "2026-11-03"}, 422},
		{"transfer to self rejected", map[string]any{"type": "transfer", "amount": 100, "account_id": bank, "transfer_account_id": bank, "transaction_date": "2026-11-03"}, 422},
		{"zero amount rejected", map[string]any{"type": "expense", "amount": 0, "account_id": bank, "transaction_date": "2026-11-03"}, 422},
		{"bad date rejected", map[string]any{"type": "expense", "amount": 10, "account_id": bank, "transaction_date": "03/11/2026"}, 422},
		{"unknown account rejected", map[string]any{"type": "expense", "amount": 10, "account_id": "nope", "transaction_date": "2026-11-03"}, 422},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st, body := e.do("POST", "/transactions", tc.body)
			if st != tc.want {
				t.Fatalf("want %d got %d: %v", tc.want, st, body)
			}
		})
	}
	// bank: 100000 - 2500 + 50000 + 500 - 10000 = 138000
	if got := e.balance(bank); got != 138000 {
		t.Fatalf("bank balance want 138000 got %d", got)
	}
	// cash: 5000 + 10000 - 300 = 14700
	if got := e.balance(cash); got != 14700 {
		t.Fatalf("cash balance want 14700 got %d", got)
	}
	// transfers are balanced: total = sum of opening + income + refund - expense + adjustment
	if total := e.balance(bank) + e.balance(cash); total != 100000+5000+50000+500-2500-300 {
		t.Fatalf("total balance mismatch: %d", total)
	}
}

func TestTransactionListFilterAndDelete(t *testing.T) {
	e := newEnv(t)
	bank := e.createAccount("BOB", "bank", 0)
	_, b1 := e.do("POST", "/transactions", map[string]any{"type": "expense", "amount": 100, "account_id": bank, "category_id": e.cat("Eating out"), "transaction_date": "2026-10-05", "payee": "Cafe", "tags": []string{"Work", "work"}})
	e.do("POST", "/transactions", map[string]any{"type": "expense", "amount": 200, "account_id": bank, "category_id": e.cat("Fuel"), "transaction_date": "2026-11-05"})
	id := data(b1)["id"].(string)
	if tags := data(b1)["tags"].([]any); len(tags) != 1 || tags[0] != "work" {
		t.Fatalf("tags normalised: %v", tags)
	}
	st, body := e.do("GET", "/transactions?date_from=2026-11-01&date_to=2026-11-30", nil)
	if st != 200 || len(body["data"].([]any)) != 1 {
		t.Fatalf("date filter: %d %v", st, body)
	}
	st, body = e.do("GET", "/transactions?search=cafe", nil)
	if st != 200 || len(body["data"].([]any)) != 1 {
		t.Fatalf("search: %d %v", st, body)
	}
	st, body = e.do("GET", "/transactions?category_id="+e.cat("Fuel")+"&per_page=1", nil)
	if st != 200 || body["meta"].(map[string]any)["total"].(float64) != 1 {
		t.Fatalf("category filter: %d %v", st, body)
	}
	st, body = e.do("PATCH", "/transactions/"+id, map[string]any{"amount": 150, "clear_category": true})
	if st != 200 || data(body)["amount"].(float64) != 150 || data(body)["category_id"] != nil {
		t.Fatalf("patch: %d %v", st, body)
	}
	st, body = e.do("POST", "/transactions/"+id+"/duplicate", map[string]any{"transaction_date": "2026-11-06"})
	if st != 201 || data(body)["transaction_date"] != "2026-11-06" || data(body)["amount"].(float64) != 150 {
		t.Fatalf("duplicate: %d %v", st, body)
	}
	if st, _ := e.do("DELETE", "/transactions/"+id, nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if st, _ := e.do("GET", "/transactions/"+id, nil); st != 404 {
		t.Fatalf("after delete want 404 got %d", st)
	}
}

func TestOfflineClientIDIsIdempotent(t *testing.T) {
	e := newEnv(t)
	bank := e.createAccount("BOB", "bank", 0)
	body := map[string]any{"type": "expense", "amount": 700, "account_id": bank, "transaction_date": "2026-11-04", "client_id": "11111111-2222-3333-4444-555555555555"}
	st1, b1 := e.do("POST", "/transactions", body)
	st2, b2 := e.do("POST", "/transactions", body)
	if st1 != 201 || st2 != 200 {
		t.Fatalf("want 201 then 200, got %d %d", st1, st2)
	}
	if data(b1)["id"] != data(b2)["id"] {
		t.Fatal("replay created a second transaction")
	}
	if got := e.balance(bank); got != -700 {
		t.Fatalf("balance want -700 got %d", got)
	}
}

func TestBudgets(t *testing.T) {
	e := newEnv(t)
	st, body := e.do("POST", "/budgets", map[string]any{"category_id": e.cat("Eating out"), "amount": 500000})
	if st != 201 {
		t.Fatalf("create: %d %v", st, body)
	}
	if st, _ := e.do("POST", "/budgets", map[string]any{"category_id": e.cat("Eating out"), "amount": 1}); st != 409 {
		t.Fatalf("duplicate budget want 409 got %d", st)
	}
	if st, _ := e.do("POST", "/budgets", map[string]any{"category_id": e.cat("Salary"), "amount": 1}); st != 422 {
		t.Fatalf("income budget want 422 got %d", st)
	}
	id := data(body)["id"].(string)
	if st, b := e.do("PATCH", "/budgets/"+id, map[string]any{"amount": 600000}); st != 200 || data(b)["amount"].(float64) != 600000 {
		t.Fatalf("patch: %d %v", st, b)
	}
}

func TestRecurringGeneration(t *testing.T) {
	e := newEnv(t)
	bank := e.createAccount("BOB", "bank", 0)
	st, body := e.do("POST", "/recurring", map[string]any{"name": "Internet", "type": "expense", "amount": 99900, "account_id": bank,
		"category_id": e.cat("Internet/Wi-Fi"), "frequency": "monthly", "start_date": "2026-01-31", "generate_as": "cleared"})
	if st != 201 {
		t.Fatalf("create recurring: %d %v", st, body)
	}
	st, body = e.do("POST", "/recurring/run?as_of=2026-04-30", nil)
	if st != 200 || data(body)["generated"].(float64) != 4 {
		t.Fatalf("run: %d %v", st, body)
	}
	// Re-running never duplicates.
	st, body = e.do("POST", "/recurring/run?as_of=2026-04-30", nil)
	if st != 200 || data(body)["generated"].(float64) != 0 {
		t.Fatalf("rerun: %d %v", st, body)
	}
	st, list := e.do("GET", "/transactions?sort=date&order=asc&per_page=10", nil)
	if st != 200 {
		t.Fatal(st)
	}
	var dates []string
	for _, x := range list["data"].([]any) {
		dates = append(dates, x.(map[string]any)["transaction_date"].(string))
	}
	want := []string{"2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"}
	if len(dates) != 4 {
		t.Fatalf("dates %v", dates)
	}
	for i := range want {
		if dates[i] != want[i] {
			t.Fatalf("month clamping: want %v got %v", want, dates)
		}
	}
	if got := e.balance(bank); got != -4*99900 {
		t.Fatalf("balance want %d got %d", -4*99900, got)
	}
}

func TestSettings(t *testing.T) {
	e := newEnv(t)
	st, body := e.do("PATCH", "/settings", map[string]any{"ui.theme": "dark"})
	if st != 200 || data(body)["ui.theme"] != "dark" {
		t.Fatalf("settings: %d %v", st, body)
	}
	if st, _ := e.do("PATCH", "/settings", map[string]any{"evil": "1"}); st != 422 {
		t.Fatalf("unknown key want 422 got %d", st)
	}
}

func TestErrorEnvelope(t *testing.T) {
	e := newEnv(t)
	st, body := e.do("GET", "/accounts/missing", nil)
	if st != 404 {
		t.Fatal(st)
	}
	errBody := body["error"].(map[string]any)
	if errBody["code"] != "not_found" || errBody["request_id"] == "" {
		t.Fatalf("envelope: %v", body)
	}
}
