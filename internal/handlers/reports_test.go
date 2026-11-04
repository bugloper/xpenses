package handlers_test

import (
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/handlers"
	"github.com/bugloper/xpensiv/internal/reports"
)

func newReportServer(t *testing.T) (*httptest.Server, *sql.DB) {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := echo.New()
	e.HTTPErrorHandler = handlers.ErrorHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
	handlers.NewReportHandler(reports.NewService(db)).Register(e.Group("/api/v1"))
	s := httptest.NewServer(e)
	t.Cleanup(s.Close)

	const ts = "2026-11-04T00:00:00Z"
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec(`INSERT INTO accounts (id,name,type,opening_balance,opening_balance_date,created_at,updated_at) VALUES ('acc-1','BOB','bank',10000,'2026-01-01',?,?)`, ts, ts)
	exec(`INSERT INTO transactions (id,type,amount,account_id,category_id,payee,transaction_date,created_at,updated_at) VALUES
		('t1','expense',2500,'acc-1','cat-food','Cafe','2026-11-02',?,?),
		('t2','income',50000,'acc-1','cat-salary','Employer','2026-11-01',?,?)`, ts, ts, ts, ts)
	exec(`INSERT INTO budgets (id,category_id,amount,created_at,updated_at) VALUES ('b1','cat-food',5000,?,?)`, ts, ts)
	return s, db
}

func get(t *testing.T, s *httptest.Server, path string) (int, http.Header, []byte) {
	t.Helper()
	res, err := http.Get(s.URL + "/api/v1" + path)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	return res.StatusCode, res.Header, body
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
	s, _ := newReportServer(t)
	st, _, body := get(t, s, "/reports/summary?from=2026-11-01&to=2026-11-30")
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

	st, _, body = get(t, s, "/reports/categories?from=2026-11-01&to=2026-11-30")
	rows := decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["name"] != "Food" || rows[0].(map[string]any)["pct"].(float64) != 100 {
		t.Fatalf("categories: %d %s", st, body)
	}

	st, _, body = get(t, s, "/reports/cash-flow?from=2026-11-01&to=2026-11-03&granularity=day")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 3 || rows[2].(map[string]any)["period"] != "2026-11-03" || rows[2].(map[string]any)["net"].(float64) != 0 {
		t.Fatalf("cash-flow: %d %s", st, body)
	}

	st, _, body = get(t, s, "/reports/merchants?from=2026-11-01&to=2026-11-30&type=income")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["payee"] != "Employer" {
		t.Fatalf("merchants: %d %s", st, body)
	}

	st, _, body = get(t, s, "/reports/accounts?from=2026-11-01&to=2026-11-30")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["balance"].(float64) != 57500 {
		t.Fatalf("accounts: %d %s", st, body)
	}

	st, _, body = get(t, s, "/reports/budgets?month=2026-11")
	rows = decode(t, body)["data"].([]any)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["spent"].(float64) != 2500 || rows[0].(map[string]any)["level"] != "ok" {
		t.Fatalf("budgets: %d %s", st, body)
	}

	// Defaults (no params) must be accepted.
	for _, p := range []string{"/reports/summary", "/reports/categories", "/reports/cash-flow", "/reports/merchants", "/reports/accounts", "/reports/budgets"} {
		if st, _, body := get(t, s, p); st != 200 {
			t.Fatalf("%s default: %d %s", p, st, body)
		}
	}
}

func TestReportsValidation(t *testing.T) {
	s, _ := newReportServer(t)
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
	for _, c := range cases {
		st, _, body := get(t, s, c.path)
		if st != 422 {
			t.Fatalf("%s: want 422 got %d %s", c.path, st, body)
		}
		e := decode(t, body)["error"].(map[string]any)
		if e["code"] != "validation_error" || e["details"].(map[string]any)[c.field] == nil {
			t.Fatalf("%s: %s", c.path, body)
		}
	}
	st, _, body := get(t, s, "/reports/reconciliation?statement_id=missing")
	if st != 404 || decode(t, body)["error"].(map[string]any)["code"] != "not_found" {
		t.Fatalf("reconciliation: %d %s", st, body)
	}
	if st, _, _ := get(t, s, "/reports/export?report=reconciliation&statement_id=missing"); st != 404 {
		t.Fatalf("export reconciliation: %d", st)
	}
}

func TestReportsExport(t *testing.T) {
	s, _ := newReportServer(t)
	st, h, body := get(t, s, "/reports/export?report=cash-flow&format=csv&from=2026-11-01&to=2026-11-02&granularity=day")
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

	st, h, body = get(t, s, "/reports/export?report=summary&format=pdf&from=2026-11-01&to=2026-11-30")
	if st != 200 || h.Get("Content-Type") != "application/pdf" || !strings.HasPrefix(string(body), "%PDF-") {
		t.Fatalf("pdf: %d %v %.8s", st, h, body)
	}
	if cd := h.Get("Content-Disposition"); cd != `attachment; filename="xpensiv-summary-2026-11-01_2026-11-30.pdf"` {
		t.Fatalf("disposition: %s", cd)
	}

	// format defaults to csv.
	st, h, _ = get(t, s, "/reports/export?report=budgets&month=2026-11")
	if st != 200 || !strings.HasPrefix(h.Get("Content-Type"), "text/csv") || !strings.Contains(h.Get("Content-Disposition"), "xpensiv-budgets-2026-11.csv") {
		t.Fatalf("default format: %d %v", st, h)
	}
}
