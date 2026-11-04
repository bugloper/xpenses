package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/bugloper/xpensiv/internal/testutil"
)

const reportTS = "2026-11-04T00:00:00Z"

// newReportEnv starts the full API and signs in the admin, who owns one bank
// account with two transactions and a Food budget.
func newReportEnv(t *testing.T) (*testutil.Env, *testutil.Client) {
	t.Helper()
	env := testutil.New(t)
	admin := env.Setup("Alice", "alice@example.com")
	acc := admin.CreateAccount("BOB", "bank", 10000)
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := env.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec(`INSERT INTO transactions (id,user_id,type,amount,account_id,category_id,payee,transaction_date,created_at,updated_at) VALUES
		('t1',?,'expense',2500,?,?,'Cafe','2026-11-02',?,?),
		('t2',?,'income',50000,?,?,'Employer','2026-11-01',?,?)`,
		admin.UserID, acc, admin.Category("Eating out"), reportTS, reportTS,
		admin.UserID, acc, admin.Category("Salary"), reportTS, reportTS)
	exec(`INSERT INTO budgets (id,user_id,category_id,amount,created_at,updated_at) VALUES ('b1',?,?,5000,?,?)`,
		admin.UserID, admin.Category("Eating out"), reportTS, reportTS)
	return env, admin
}

func get(t *testing.T, c *testutil.Client, path string) (int, http.Header, []byte) {
	t.Helper()
	st, body, h := c.Get(path)
	return st, h, body
}

func decode(t *testing.T, body []byte) map[string]any {
	t.Helper()
	out := map[string]any{}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("bad json: %s", body)
	}
	return out
}

func TestReportsJSON(t *testing.T) {
	_, c := newReportEnv(t)
	st, _, body := get(t, c, "/reports/summary?from=2026-11-01&to=2026-11-30")
	if st != 200 {
		t.Fatalf("summary: %d %s", st, body)
	}
	d := decode(t, body)["data"].(map[string]any)
	if d["income"].(float64) != 50000 || d["expenses"].(float64) != 2500 || d["net"].(float64) != 47500 || d["total_balance"].(float64) != 57500 {
		t.Fatalf("summary: %v", d)
	}
	if d["expense_change_pct"] != nil {
		t.Fatalf("expense_change_pct should be null: %v", d["expense_change_pct"])
	}
	prev := d["previous"].(map[string]any)
	if prev["from"] != "2026-10-02" || prev["to"] != "2026-10-31" {
		t.Fatalf("previous: %v", prev)
	}
	if len(d["recent_transactions"].([]any)) != 2 {
		t.Fatalf("recent: %v", d["recent_transactions"])
	}

	st, _, body = get(t, c, "/reports/categories?from=2026-11-01&to=2026-11-30")
	rows := decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["name"] != "Eating out" || rows[0].(map[string]any)["pct"].(float64) != 100 {
		t.Fatalf("categories: %d %s", st, body)
	}

	st, _, body = get(t, c, "/reports/cash-flow?from=2026-11-01&to=2026-11-03&granularity=day")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 3 || rows[2].(map[string]any)["period"] != "2026-11-03" || rows[2].(map[string]any)["net"].(float64) != 0 {
		t.Fatalf("cash-flow: %d %s", st, body)
	}

	st, _, body = get(t, c, "/reports/merchants?from=2026-11-01&to=2026-11-30&type=income")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["payee"] != "Employer" {
		t.Fatalf("merchants: %d %s", st, body)
	}

	st, _, body = get(t, c, "/reports/accounts?from=2026-11-01&to=2026-11-30")
	rows = decode(t, body)["data"].([]any)
	// Every user also has the seeded "Cash" account (balance 0).
	if st != 200 || len(rows) != 2 || rows[0].(map[string]any)["balance"].(float64) != 57500 {
		t.Fatalf("accounts: %d %s", st, body)
	}

	st, _, body = get(t, c, "/reports/budgets?month=2026-11")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["spent"].(float64) != 2500 || rows[0].(map[string]any)["level"] != "ok" {
		t.Fatalf("budgets: %d %s", st, body)
	}

	// Defaults (no params) must be accepted.
	for _, p := range []string{"/reports/summary", "/reports/categories", "/reports/cash-flow", "/reports/merchants", "/reports/accounts", "/reports/budgets"} {
		if st, _, body := get(t, c, p); st != 200 {
			t.Fatalf("%s default: %d %s", p, st, body)
		}
	}
}

func TestReportsValidation(t *testing.T) {
	_, c := newReportEnv(t)
	cases := []struct{ path, field string }{
		{"/reports/summary?from=2026-11-30&to=2026-11-01", "to"},
		{"/reports/summary?from=bad&to=2026-11-01", "from"},
		{"/reports/summary?from=2026-11-01", "to"},
		{"/reports/cash-flow?from=2026-11-01&to=2026-11-30&granularity=hour", "granularity"},
		{"/reports/categories?from=2026-11-01&to=2026-11-30&type=transfer", "type"},
		{"/reports/merchants?type=refund", "type"},
		{"/reports/budgets?month=2026-11-01", "month"},
		{"/reports/export?report=nope", "report"},
		{"/reports/export?report=summary&format=xlsx", "format"},
	}
	for _, c2 := range cases {
		st, _, body := get(t, c, c2.path)
		if st != 422 {
			t.Fatalf("%s: want 422 got %d %s", c2.path, st, body)
		}
		e := decode(t, body)["error"].(map[string]any)
		if e["code"] != "validation_error" || e["details"].(map[string]any)[c2.field] == nil {
			t.Fatalf("%s: %s", c2.path, body)
		}
	}
	st, _, body := get(t, c, "/reports/reconciliation?statement_id=missing")
	if st != 404 || decode(t, body)["error"].(map[string]any)["code"] != "not_found" {
		t.Fatalf("reconciliation: %d %s", st, body)
	}
	if st, _, _ := get(t, c, "/reports/export?report=reconciliation&statement_id=missing"); st != 404 {
		t.Fatalf("export reconciliation: %d", st)
	}
}

func TestReportsExport(t *testing.T) {
	_, c := newReportEnv(t)
	st, h, body := get(t, c, "/reports/export?report=cash-flow&format=csv&from=2026-11-01&to=2026-11-02&granularity=day")
	if st != 200 || !strings.HasPrefix(h.Get("Content-Type"), "text/csv") {
		t.Fatalf("csv: %d %v", st, h)
	}
	if cd := h.Get("Content-Disposition"); cd != `attachment; filename="xpensiv-cash-flow-day-2026-11-01_2026-11-02.csv"` {
		t.Fatalf("disposition: %s", cd)
	}
	lines := strings.Split(strings.TrimRight(string(body), "\n"), "\n")
	if lines[0] != "Cash flow (day)" || lines[4] != "Period,Income,Expenses,Net" ||
		lines[5] != "2026-11-01,500.00,0.00,500.00" || lines[6] != "2026-11-02,0.00,25.00,-25.00" {
		t.Fatalf("csv body: %q", lines)
	}

	st, h, body = get(t, c, "/reports/export?report=summary&format=pdf&from=2026-11-01&to=2026-11-30")
	if st != 200 || h.Get("Content-Type") != "application/pdf" || !strings.HasPrefix(string(body), "%PDF-") {
		t.Fatalf("pdf: %d %v %.8s", st, h, body)
	}
	if cd := h.Get("Content-Disposition"); cd != `attachment; filename="xpensiv-summary-2026-11-01_2026-11-30.pdf"` {
		t.Fatalf("disposition: %s", cd)
	}

	// format defaults to csv.
	st, h, _ = get(t, c, "/reports/export?report=budgets&month=2026-11")
	if st != 200 || !strings.HasPrefix(h.Get("Content-Type"), "text/csv") || !strings.Contains(h.Get("Content-Disposition"), "xpensiv-budgets-2026-11.csv") {
		t.Fatalf("default format: %d %v", st, h)
	}
}

func TestReportsRequireSession(t *testing.T) {
	env, _ := newReportEnv(t)
	anon := env.Anon()
	for _, p := range []string{"/reports/summary", "/reports/categories", "/reports/cash-flow", "/reports/merchants",
		"/reports/accounts", "/reports/budgets", "/reports/reconciliation?statement_id=x", "/reports/export?report=summary"} {
		st, _, body := get(t, anon, p)
		if st != 401 || decode(t, body)["error"].(map[string]any)["code"] != "unauthenticated" {
			t.Fatalf("%s anonymous: %d %s", p, st, body)
		}
	}
}

// TestReportsIsolation: a second user with their own account, transactions,
// budget and statement sees only their rows in every report, and the admin's
// numbers do not move when the second user's data is added.
func TestReportsIsolation(t *testing.T) {
	env, admin := newReportEnv(t)
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := env.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	// Admin's statement with one unreconciled bank line.
	var adminAcc string
	if err := env.DB.QueryRow(`SELECT id FROM accounts WHERE user_id = ?`, admin.UserID).Scan(&adminAcc); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO bank_statements (id,user_id,provider,account_id,file_name,file_sha256,file_size,period_start,period_end,opening_balance,closing_balance,imported_at)
		VALUES ('st-a',?,'bob',?,'nov.pdf','abc',10,'2026-11-01','2026-11-30',10000,57500,?)`, admin.UserID, adminAcc, reportTS)
	exec(`INSERT INTO bank_transactions (id,user_id,statement_id,account_id,line_no,transaction_date,description,debit,credit,fingerprint,created_at)
		VALUES ('bt-a',?,'st-a',?,1,'2026-11-02','CAFE',2500,0,'fp-a',?)`, admin.UserID, adminAcc, reportTS)

	bob := env.Register(admin, "Bob", "bob@example.com")
	bobAcc := bob.CreateAccount("Cash", "cash", 500)
	exec(`INSERT INTO transactions (id,user_id,type,amount,account_id,category_id,payee,transaction_date,created_at,updated_at)
		VALUES ('tb1',?,'expense',200,?,?,'Kiosk','2026-11-05',?,?)`, bob.UserID, bobAcc, bob.Category("Eating out"), reportTS, reportTS)
	exec(`INSERT INTO budgets (id,user_id,category_id,amount,created_at,updated_at) VALUES ('bb1',?,?,1000,?,?)`,
		bob.UserID, bob.Category("Eating out"), reportTS, reportTS)
	if bob.Category("Eating out") == admin.Category("Eating out") {
		t.Fatal("users must not share category ids")
	}

	const nov = "from=2026-11-01&to=2026-11-30"
	// Bob's summary: only his cash account and expense; the admin's bank
	// statement and unmatched bank transactions never reach his counts.
	st, _, body := get(t, bob, "/reports/summary?"+nov)
	d := decode(t, body)["data"].(map[string]any)
	if st != 200 || d["income"].(float64) != 0 || d["expenses"].(float64) != 200 || d["net"].(float64) != -200 || d["total_balance"].(float64) != 300 {
		t.Fatalf("bob summary: %d %v", st, d)
	}
	if d["unreconciled_bank_count"].(float64) != 0 || d["unmatched_manual_count"].(float64) != 0 || d["pending_count"].(float64) != 0 {
		t.Fatalf("bob summary counts: %v", d)
	}
	recent := d["recent_transactions"].([]any)
	if len(recent) != 1 || recent[0].(map[string]any)["id"] != "tb1" {
		t.Fatalf("bob recent: %v", recent)
	}
	// Admin's summary is unchanged by Bob's rows, and counts only the admin's bank data.
	st, _, body = get(t, admin, "/reports/summary?"+nov)
	d = decode(t, body)["data"].(map[string]any)
	if st != 200 || d["income"].(float64) != 50000 || d["expenses"].(float64) != 2500 || d["total_balance"].(float64) != 57500 {
		t.Fatalf("admin summary: %d %v", st, d)
	}
	if d["unreconciled_bank_count"].(float64) != 1 || d["unmatched_manual_count"].(float64) != 2 || len(d["recent_transactions"].([]any)) != 2 {
		t.Fatalf("admin summary counts: %v", d)
	}

	st, _, body = get(t, bob, "/reports/categories?"+nov)
	rows := decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["category_id"] != bob.Category("Eating out") || rows[0].(map[string]any)["amount"].(float64) != 200 {
		t.Fatalf("bob categories: %d %s", st, body)
	}

	st, _, body = get(t, bob, "/reports/cash-flow?"+nov+"&granularity=month")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["income"].(float64) != 0 || rows[0].(map[string]any)["expenses"].(float64) != 200 {
		t.Fatalf("bob cash-flow: %d %s", st, body)
	}

	st, _, body = get(t, bob, "/reports/merchants?"+nov)
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["payee"] != "Kiosk" {
		t.Fatalf("bob merchants: %d %s", st, body)
	}
	st, _, body = get(t, bob, "/reports/merchants?"+nov+"&type=income")
	if rows = decode(t, body)["data"].([]any); st != 200 || len(rows) != 0 {
		t.Fatalf("bob income merchants: %d %s", st, body)
	}

	st, _, body = get(t, bob, "/reports/accounts?"+nov)
	rows = decode(t, body)["data"].([]any)
	// Bob's seeded Cash account plus the one created in this test; nothing of the admin's.
	var bobRow map[string]any
	for _, r := range rows {
		if r.(map[string]any)["account_id"] == bobAcc {
			bobRow = r.(map[string]any)
		}
	}
	if st != 200 || len(rows) != 2 || bobRow == nil || bobRow["balance"].(float64) != 300 {
		t.Fatalf("bob accounts: %d %s", st, body)
	}

	st, _, body = get(t, bob, "/reports/budgets?month=2026-11")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["budget_id"] != "bb1" || rows[0].(map[string]any)["spent"].(float64) != 200 || rows[0].(map[string]any)["pct"].(float64) != 20 {
		t.Fatalf("bob budgets: %d %s", st, body)
	}

	// The admin's statement is a 404 for Bob, in both the JSON and export forms.
	st, _, body = get(t, admin, "/reports/reconciliation?statement_id=st-a")
	d = decode(t, body)["data"].(map[string]any)
	if st != 200 || d["statement"].(map[string]any)["file_name"] != "nov.pdf" || len(d["unrecorded_bank"].([]any)) != 1 {
		t.Fatalf("admin reconciliation: %d %s", st, body)
	}
	st, _, body = get(t, bob, "/reports/reconciliation?statement_id=st-a")
	if st != 404 || decode(t, body)["error"].(map[string]any)["code"] != "not_found" {
		t.Fatalf("bob reconciliation of admin statement: %d %s", st, body)
	}
	if st, _, _ := get(t, bob, "/reports/export?report=reconciliation&statement_id=st-a"); st != 404 {
		t.Fatalf("bob export of admin statement: %d", st)
	}
	if st, _, _ := get(t, admin, "/reports/export?report=reconciliation&statement_id=st-a"); st != 200 {
		t.Fatalf("admin export of own statement: %d", st)
	}

	st, _, body = get(t, bob, "/reports/export?report=categories&format=csv&"+nov)
	if st != 200 || !strings.Contains(string(body), "Eating out,1,2.00,100.0") || strings.Contains(string(body), "25.00") {
		t.Fatalf("bob export csv: %d %s", st, body)
	}
	st, _, body = get(t, bob, "/reports/export?report=summary&format=csv&"+nov)
	if st != 200 || !strings.Contains(string(body), "Total balance,3.00") || !strings.Contains(string(body), "Unreconciled bank transactions,0") {
		t.Fatalf("bob summary csv: %d %s", st, body)
	}
}
