package reports

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/database"
	"github.com/bugloper/xpenses/internal/models"
)

const ts = "2026-11-04T00:00:00Z"

func exec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

// newUser inserts a user row (the hash is never verified by the reports
// service) and seeds the default categories exactly as registration does.
func newUser(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	exec(t, db, `INSERT INTO users (id,email,name,password_hash,role,is_active,created_at,updated_at)
		VALUES (?,?,?,'$argon2id$v=19$m=65536,t=3,p=1$test$test','user',1,?,?)`, id, id+"@example.com", id, ts, ts)
	if err := auth.SeedDefaultCategories(context.Background(), db, id); err != nil {
		t.Fatal(err)
	}
}

// userCtx is the context the auth middleware would hand the service.
func userCtx(id string) context.Context {
	return auth.WithUser(context.Background(), &models.User{ID: id})
}

// categoryIDs maps a user's category names to their (per-user, random) ids.
func categoryIDs(t *testing.T, db *sql.DB, userID string) map[string]string {
	t.Helper()
	rows, err := db.Query(`SELECT name, id FROM categories WHERE user_id = ?`, userID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var name, id string
		if err := rows.Scan(&name, &id); err != nil {
			t.Fatal(err)
		}
		out[name] = id
	}
	return out
}

// fixture is one user's view of the shared test database.
type fixture struct {
	svc    *Service
	db     *sql.DB
	ctx    context.Context
	userID string
	cat    map[string]string
}

// Decoy user whose ledger shares every table, period, payee and category name
// with the user under test. Every exact assertion below therefore doubles as
// an isolation check: a query missing its user predicate changes the totals.
const otherUser = "u-b"

// seed builds a ledger whose expected totals are worked out by hand in the
// tests below. Reporting period under test: 2026-11-01..2026-11-30, so the
// "previous" period is 2026-10-02..2026-10-31. The same database also holds
// otherUser's ledger (see seedOther).
func seed(t *testing.T) *fixture {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	const uid = "u-a"
	newUser(t, db, uid)
	cat := categoryIDs(t, db, uid)

	acct := func(id, name, typ string, opening int64, active int) {
		exec(t, db, `INSERT INTO accounts (id,user_id,name,type,currency,opening_balance,opening_balance_date,is_active,created_at,updated_at)
			VALUES (?,?,?,?,'BTN',?,'2026-01-01',?,?,?)`, id, uid, name, typ, opening, active, ts, ts)
	}
	acct("acc-bank", "BOB", "bank", 100000, 1)
	acct("acc-cash", "Wallet", "cash", 5000, 1)
	acct("acc-old", "Closed", "bank", 777, 0)

	exec(t, db, `INSERT INTO categories (id,user_id,name,icon,color,type,parent_id,created_at,updated_at)
		VALUES ('cat-coffee',?,'Coffee','coffee','#000000','expense',?,?,?)`, uid, cat["Eating out"], ts, ts)
	cat["Coffee"] = "cat-coffee"

	type tx struct {
		id, typ   string
		amount    int64
		acct      string
		transfer  any
		cat       any
		payee     string
		date      string
		origin    string
		status    string
		createdAt string
	}
	rows := []tx{
		{"tx1", "expense", 2500, "acc-bank", nil, cat["Eating out"], "Ambient Cafe", "2026-11-01", "manual", "cleared", "2026-11-01T01:00:00Z"},
		{"tx2", "expense", 1500, "acc-bank", nil, cat["Coffee"], "Ambient Cafe", "2026-11-03", "manual", "cleared", "2026-11-03T01:00:00Z"},
		{"tx3", "expense", 4000, "acc-bank", nil, cat["Groceries"], "8 Eleven", "2026-11-05", "manual", "cleared", "2026-11-05T01:00:00Z"},
		{"tx4", "expense", 1000, "acc-cash", nil, nil, "", "2026-11-10", "manual", "cleared", "2026-11-10T01:00:00Z"},
		{"tx5", "income", 50000, "acc-bank", nil, cat["Salary"], "Employer", "2026-11-01", "manual", "cleared", "2026-11-01T02:00:00Z"},
		{"tx6", "refund", 500, "acc-bank", nil, cat["Refunds"], "Ambient Cafe", "2026-11-02", "manual", "cleared", "2026-11-02T01:00:00Z"},
		{"tx7", "transfer", 10000, "acc-bank", "acc-cash", nil, "", "2026-11-02", "manual", "cleared", "2026-11-02T02:00:00Z"},
		{"tx8", "adjustment", -300, "acc-cash", nil, nil, "", "2026-11-03", "adjustment", "cleared", "2026-11-03T02:00:00Z"},
		{"tx9", "adjustment", 200, "acc-bank", nil, nil, "", "2026-11-04", "adjustment", "cleared", "2026-11-04T01:00:00Z"},
		{"tx10", "expense", 99999, "acc-cash", nil, cat["Eating out"], "Draft", "2026-11-03", "manual", "pending", "2026-11-03T03:00:00Z"},
		{"tx11", "expense", 99999, "acc-bank", nil, cat["Eating out"], "Void", "2026-11-03", "manual", "void", "2026-11-03T04:00:00Z"},
		{"tx12", "expense", 8000, "acc-bank", nil, cat["Eating out"], "Ambient Cafe", "2026-10-15", "manual", "cleared", "2026-10-15T01:00:00Z"},
		{"tx13", "expense", 700, "acc-bank", nil, cat["Eating out"], "Ambient Cafe", "2026-10-01", "manual", "cleared", "2026-10-01T01:00:00Z"},
		{"tx14", "expense", 300, "acc-bank", nil, cat["Eating out"], "Ambient Cafe", "2026-12-01", "manual", "cleared", "2026-12-01T01:00:00Z"},
	}
	for _, r := range rows {
		exec(t, db, `INSERT INTO transactions (id,user_id,type,amount,currency,account_id,transfer_account_id,category_id,payee,transaction_date,origin,status,created_at,updated_at)
			VALUES (?,?,?,?,'BTN',?,?,?,?,?,?,?,?,?)`, r.id, uid, r.typ, r.amount, r.acct, r.transfer, r.cat, r.payee, r.date, r.origin, r.status, r.createdAt, r.createdAt)
	}

	exec(t, db, `INSERT INTO budgets (id,user_id,category_id,amount,created_at,updated_at) VALUES
		('b-food',?,?,5000,?,?), ('b-groc',?,?,4000,?,?), ('b-trans',?,?,1000,?,?)`,
		uid, cat["Eating out"], ts, ts, uid, cat["Groceries"], ts, ts, uid, cat["Transportation"], ts, ts)

	seedOther(t, db)
	return &fixture{svc: NewService(db), db: db, ctx: userCtx(uid), userID: uid, cat: cat}
}

// seedOther gives otherUser a small ledger in the same periods. Expected
// numbers (used by TestIsolation): November income 7000, expenses 1000,
// previous-period expenses 600, balance 20000+7000-1000-600 = 25400.
func seedOther(t *testing.T, db *sql.DB) *fixture {
	t.Helper()
	const uid = otherUser
	newUser(t, db, uid)
	cat := categoryIDs(t, db, uid)
	exec(t, db, `INSERT INTO accounts (id,user_id,name,type,currency,opening_balance,opening_balance_date,is_active,created_at,updated_at)
		VALUES ('acc-b-bank',?,'BOB','bank','BTN',20000,'2026-01-01',1,?,?)`, uid, ts, ts)
	tx := func(id, typ string, amount int64, catID any, payee, date, status, createdAt string) {
		exec(t, db, `INSERT INTO transactions (id,user_id,type,amount,currency,account_id,category_id,payee,transaction_date,origin,status,created_at,updated_at)
			VALUES (?,?,?,?,'BTN','acc-b-bank',?,?,?,'manual',?,?,?)`, id, uid, typ, amount, catID, payee, date, status, createdAt, createdAt)
	}
	tx("bx1", "expense", 1000, cat["Eating out"], "Ambient Cafe", "2026-11-02", "cleared", "2026-11-02T01:00:00Z")
	tx("bx2", "income", 7000, cat["Salary"], "Employer B", "2026-11-01", "cleared", "2026-11-01T01:00:00Z")
	tx("bx3", "expense", 600, cat["Groceries"], "8 Eleven", "2026-10-10", "cleared", "2026-10-10T01:00:00Z")
	tx("bx4", "expense", 5, cat["Eating out"], "Draft B", "2026-12-02", "pending", "2026-12-02T01:00:00Z")
	exec(t, db, `INSERT INTO budgets (id,user_id,category_id,amount,created_at,updated_at) VALUES ('b-b-food',?,?,2000,?,?)`, uid, cat["Eating out"], ts, ts)
	return &fixture{svc: NewService(db), db: db, ctx: userCtx(uid), userID: uid, cat: cat}
}

var nov = Period{From: "2026-11-01", To: "2026-11-30"}

func TestSummary(t *testing.T) {
	f := seed(t)
	got, err := f.svc.Summary(f.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	if got.Income != 50500 || got.Expenses != 9000 || got.Net != 41500 {
		t.Fatalf("totals: %+v", got)
	}
	if got.Previous != (PeriodTotals{From: "2026-10-02", To: "2026-10-31", Income: 0, Expenses: 8000, Net: -8000}) {
		t.Fatalf("previous: %+v", got.Previous)
	}
	if got.ExpenseChangePct == nil || *got.ExpenseChangePct != 12.5 {
		t.Fatalf("change pct: %v", got.ExpenseChangePct)
	}
	if got.TotalBalance != 137400 {
		t.Fatalf("total balance: %d", got.TotalBalance)
	}
	if got.PendingCount != 1 {
		t.Fatalf("counts: %+v", got)
	}
	if len(got.RecentTransactions) != 10 || got.RecentTransactions[0].ID != "tx14" {
		t.Fatalf("recent: %d first=%s", len(got.RecentTransactions), got.RecentTransactions[0].ID)
	}
	for _, r := range got.RecentTransactions {
		if r.Status == "void" {
			t.Fatal("void transaction in recent list")
		}
		if r.UserID != f.userID {
			t.Fatalf("recent transaction %s belongs to %s", r.ID, r.UserID)
		}
	}

	// October's previous window (Sep 2..Oct 1) catches the Oct 1 row only.
	got, err = f.svc.Summary(f.ctx, Period{From: "2026-10-02", To: "2026-10-31"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Expenses != 8000 || got.Previous.Expenses != 700 || got.ExpenseChangePct == nil || *got.ExpenseChangePct != 1042.9 {
		t.Fatalf("october: expenses=%d previous=%+v change=%v", got.Expenses, got.Previous, got.ExpenseChangePct)
	}
	// A period with nothing before it has no change percentage.
	got, err = f.svc.Summary(f.ctx, Period{From: "2026-09-01", To: "2026-09-30"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Expenses != 0 || got.Previous.Expenses != 0 || got.ExpenseChangePct != nil {
		t.Fatalf("september: expenses=%d previous=%+v change=%v", got.Expenses, got.Previous, got.ExpenseChangePct)
	}
}

func TestCategories(t *testing.T) {
	f := seed(t)
	got, err := f.svc.Categories(f.ctx, nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	want := []CategoryRow{
		{CategoryID: ptr(f.cat["Groceries"]), Name: "Groceries", Icon: "shopping-basket", Color: "#f97316", ParentID: ptr(f.cat["Food & Groceries"]), ParentName: "Food & Groceries", Amount: 4000, Count: 1, Pct: 44.4},
		{CategoryID: ptr(f.cat["Eating out"]), Name: "Eating out", Icon: "utensils", Color: "#f97316", ParentID: ptr(f.cat["Food & Groceries"]), ParentName: "Food & Groceries", Amount: 2500, Count: 1, Pct: 27.8},
		{CategoryID: ptr(f.cat["Coffee"]), Name: "Coffee", Icon: "coffee", Color: "#000000", ParentID: ptr(f.cat["Eating out"]), ParentName: "Eating out", Amount: 1500, Count: 1, Pct: 16.7},
		{CategoryID: nil, Name: "Uncategorised", Icon: "circle", Color: "#64748b", Amount: 1000, Count: 1, Pct: 11.1},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expense:\n got %s\nwant %s", dump(got), dump(want))
	}
	got, err = f.svc.Categories(f.ctx, nov, FlowIncome)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "Salary" || got[0].Amount != 50000 || got[0].Pct != 99.0 ||
		got[1].Name != "Refunds" || got[1].Amount != 500 || got[1].Pct != 1.0 {
		t.Fatalf("income: %s", dump(got))
	}
	empty, err := f.svc.Categories(f.ctx, Period{From: "2020-01-01", To: "2020-01-31"}, FlowExpense)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty: %v %v", empty, err)
	}
}

func TestCashFlow(t *testing.T) {
	f := seed(t)
	got, err := f.svc.CashFlow(f.ctx, nov, GranMonth)
	if err != nil {
		t.Fatal(err)
	}
	if want := []CashFlowRow{{"2026-11", 50500, 9000, 41500}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("month: %+v", got)
	}
	got, err = f.svc.CashFlow(f.ctx, Period{From: "2026-11-01", To: "2026-11-05"}, GranDay)
	if err != nil {
		t.Fatal(err)
	}
	want := []CashFlowRow{
		{"2026-11-01", 50000, 2500, 47500},
		{"2026-11-02", 500, 0, 500},
		{"2026-11-03", 0, 1500, -1500},
		{"2026-11-04", 0, 0, 0},
		{"2026-11-05", 0, 4000, -4000},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("day: %+v", got)
	}
	got, err = f.svc.CashFlow(f.ctx, Period{From: "2026-10-26", To: "2026-11-08"}, GranWeek)
	if err != nil {
		t.Fatal(err)
	}
	want = []CashFlowRow{{"2026-W44", 50000, 2500, 47500}, {"2026-W45", 500, 5500, -5000}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("week: %+v", got)
	}
	got, err = f.svc.CashFlow(f.ctx, Period{From: "2026-09-01", To: "2026-12-31"}, GranMonth)
	if err != nil {
		t.Fatal(err)
	}
	want = []CashFlowRow{{"2026-09", 0, 0, 0}, {"2026-10", 0, 8700, -8700}, {"2026-11", 50500, 9000, 41500}, {"2026-12", 0, 300, -300}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("months zero-filled: %+v", got)
	}
}

func TestMerchants(t *testing.T) {
	f := seed(t)
	got, err := f.svc.Merchants(f.ctx, nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	want := []MerchantRow{{"8 Eleven", 4000, 1}, {"Ambient Cafe", 4000, 2}, {"(no payee)", 1000, 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expense: %+v", got)
	}
	got, err = f.svc.Merchants(f.ctx, nov, FlowIncome)
	if err != nil {
		t.Fatal(err)
	}
	want = []MerchantRow{{"Employer", 50000, 1}, {"Ambient Cafe", 500, 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("income: %+v", got)
	}
}

func TestAccounts(t *testing.T) {
	f := seed(t)
	got, err := f.svc.Accounts(f.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	want := []AccountRow{
		{AccountID: "acc-bank", Name: "BOB", Type: "bank", Currency: "BTN", OpeningBalance: 100000, Balance: 123700,
			Income: 50700, Expenses: 8000, TransfersIn: 0, TransfersOut: 10000},
		{AccountID: "acc-cash", Name: "Wallet", Type: "cash", Currency: "BTN", OpeningBalance: 5000, Balance: 13700,
			Income: 0, Expenses: 1300, TransfersIn: 10000, TransfersOut: 0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %s\nwant %s", dump(got), dump(want))
	}
}

func TestBudgets(t *testing.T) {
	f := seed(t)
	got, err := f.svc.Budgets(f.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	want := []BudgetRow{
		{BudgetID: "b-groc", CategoryID: f.cat["Groceries"], Name: "Groceries", Icon: "shopping-basket", Color: "#f97316", Amount: 4000, Spent: 4000, Remaining: 0, Pct: 100, Level: LevelOver},
		{BudgetID: "b-food", CategoryID: f.cat["Eating out"], Name: "Eating out", Icon: "utensils", Color: "#f97316", Amount: 5000, Spent: 4000, Remaining: 1000, Pct: 80, Level: LevelWarn75},
		{BudgetID: "b-trans", CategoryID: f.cat["Transportation"], Name: "Transportation", Icon: "car", Color: "#3b82f6", Amount: 1000, Spent: 0, Remaining: 1000, Pct: 0, Level: LevelOK},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %s\nwant %s", dump(got), dump(want))
	}
	oct, err := f.svc.Budgets(f.ctx, Period{From: "2026-10-01", To: "2026-10-31"})
	if err != nil {
		t.Fatal(err)
	}
	// Rows come back in category order (Groceries before Eating out); the
	// food budget rolls up its Coffee sub-category.
	var food BudgetRow
	for _, b := range oct {
		if b.BudgetID == "b-food" {
			food = b
		}
	}
	if food.Spent != 8700 || food.Pct != 174 || food.Level != LevelOver {
		t.Fatalf("october food: %+v", food)
	}
}

func TestExportCSV(t *testing.T) {
	f := seed(t)
	doc, err := f.svc.Export(f.ctx, ExportRequest{Report: "categories", Period: nov, Type: FlowExpense})
	if err != nil {
		t.Fatal(err)
	}
	if doc.Filename != "xpenses-categories-expense-2026-11-01_2026-11-30" {
		t.Fatalf("filename: %s", doc.Filename)
	}
	var buf bytes.Buffer
	if err := WriteCSV(&buf, doc); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(buf.String(), "\n"), "\n")
	if lines[0] != "Categories (expense)" || lines[1] != "Period: 2026-11-01 to 2026-11-30" || !strings.HasPrefix(lines[2], "Generated: ") {
		t.Fatalf("header: %q", lines[:3])
	}
	want := []string{"", "Category,Count,Amount,%", "Groceries,1,40.00,44.4", "Eating out,1,25.00,27.8", "Coffee,1,15.00,16.7", "Uncategorised,1,10.00,11.1"}
	if !reflect.DeepEqual(lines[3:], want) {
		t.Fatalf("body: %q", lines[3:])
	}
	records, err := csv.NewReader(strings.NewReader(buf.String())).Read()
	if err != nil || records[0] != "Categories (expense)" {
		t.Fatalf("not parseable csv: %v", err)
	}

	doc, err = f.svc.Export(f.ctx, ExportRequest{Report: "budgets", Month: nov})
	if err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	_ = WriteCSV(&buf, doc)
	if doc.Filename != "xpenses-budgets-2026-11" || !strings.Contains(buf.String(), "Eating out,50.00,40.00,10.00,80,warn75") {
		t.Fatalf("budgets csv: %s\n%s", doc.Filename, buf.String())
	}
}

func TestExportPDF(t *testing.T) {
	f := seed(t)
	for _, report := range []string{"summary", "categories", "cash-flow", "merchants", "accounts", "budgets"} {
		doc, err := f.svc.Export(f.ctx, ExportRequest{Report: report, Period: nov, Type: FlowExpense, Granularity: GranDay, Month: nov})
		if err != nil {
			t.Fatalf("%s: %v", report, err)
		}
		var buf bytes.Buffer
		if err := WritePDF(&buf, doc); err != nil {
			t.Fatalf("%s: %v", report, err)
		}
		if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF-")) || !bytes.Contains(buf.Bytes(), []byte("%%EOF")) {
			t.Fatalf("%s: not a pdf (%d bytes)", report, buf.Len())
		}
	}
}

func TestExportValidation(t *testing.T) {
	if _, err := ParseExportReport("nope"); err == nil {
		t.Fatal("want error")
	}
	if _, err := ParseExportFormat("xlsx"); err == nil {
		t.Fatal("want error")
	}
	if f, _ := ParseExportFormat(""); f != FormatCSV {
		t.Fatal("default format should be csv")
	}
}

// TestIsolation runs every report as otherUser, whose ledger shares the
// database with the much larger ledger of seed(). Every number must come from
// otherUser's rows alone (see seedOther for the hand-computed expectations).
func TestIsolation(t *testing.T) {
	a := seed(t)
	b := &fixture{svc: a.svc, db: a.db, ctx: userCtx(otherUser), userID: otherUser, cat: categoryIDs(t, a.db, otherUser)}

	sum, err := b.svc.Summary(b.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Income != 7000 || sum.Expenses != 1000 || sum.Net != 6000 || sum.TotalBalance != 25400 {
		t.Fatalf("summary: %+v", sum)
	}
	if sum.Previous.Expenses != 600 || sum.ExpenseChangePct == nil || *sum.ExpenseChangePct != 66.7 {
		t.Fatalf("summary previous: %+v change=%v", sum.Previous, sum.ExpenseChangePct)
	}
	if sum.PendingCount != 1 {
		t.Fatalf("summary counts: %+v", sum)
	}
	if len(sum.RecentTransactions) != 4 {
		t.Fatalf("recent: %d", len(sum.RecentTransactions))
	}
	for _, r := range sum.RecentTransactions {
		if r.UserID != otherUser {
			t.Fatalf("recent transaction %s belongs to %s", r.ID, r.UserID)
		}
	}

	cats, err := b.svc.Categories(b.ctx, nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	want := []CategoryRow{{CategoryID: ptr(b.cat["Eating out"]), Name: "Eating out", Icon: "utensils", Color: "#f97316", ParentID: ptr(b.cat["Food & Groceries"]), ParentName: "Food & Groceries", Amount: 1000, Count: 1, Pct: 100}}
	if !reflect.DeepEqual(cats, want) {
		t.Fatalf("categories:\n got %s\nwant %s", dump(cats), dump(want))
	}
	if b.cat["Eating out"] == a.cat["Eating out"] {
		t.Fatal("users must not share category ids")
	}
	inc, err := b.svc.Categories(b.ctx, nov, FlowIncome)
	if err != nil || len(inc) != 1 || inc[0].Name != "Salary" || inc[0].Amount != 7000 {
		t.Fatalf("income categories: %s %v", dump(inc), err)
	}

	flow, err := b.svc.CashFlow(b.ctx, Period{From: "2026-10-01", To: "2026-11-30"}, GranMonth)
	if err != nil {
		t.Fatal(err)
	}
	if wantFlow := []CashFlowRow{{"2026-10", 0, 600, -600}, {"2026-11", 7000, 1000, 6000}}; !reflect.DeepEqual(flow, wantFlow) {
		t.Fatalf("cash flow: %+v", flow)
	}

	merch, err := b.svc.Merchants(b.ctx, nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	if wantMerch := []MerchantRow{{"Ambient Cafe", 1000, 1}}; !reflect.DeepEqual(merch, wantMerch) {
		t.Fatalf("merchants: %+v", merch)
	}

	accts, err := b.svc.Accounts(b.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	wantAccts := []AccountRow{{AccountID: "acc-b-bank", Name: "BOB", Type: "bank", Currency: "BTN", OpeningBalance: 20000, Balance: 25400, Income: 7000, Expenses: 1000}}
	if !reflect.DeepEqual(accts, wantAccts) {
		t.Fatalf("accounts:\n got %s\nwant %s", dump(accts), dump(wantAccts))
	}

	budgets, err := b.svc.Budgets(b.ctx, nov)
	if err != nil {
		t.Fatal(err)
	}
	wantBudgets := []BudgetRow{{BudgetID: "b-b-food", CategoryID: b.cat["Eating out"], Name: "Eating out", Icon: "utensils", Color: "#f97316", Amount: 2000, Spent: 1000, Remaining: 1000, Pct: 50, Level: LevelOK}}
	if !reflect.DeepEqual(budgets, wantBudgets) {
		t.Fatalf("budgets:\n got %s\nwant %s", dump(budgets), dump(wantBudgets))
	}

	doc, err := b.svc.Export(b.ctx, ExportRequest{Report: "categories", Period: nov, Type: FlowExpense})
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := WriteCSV(&buf, doc); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(buf.String(), "\n"), "\n")
	if wantLines := []string{"", "Category,Count,Amount,%", "Eating out,1,10.00,100.0"}; !reflect.DeepEqual(lines[3:], wantLines) {
		t.Fatalf("export csv: %q", lines[3:])
	}
	doc, err = b.svc.Export(b.ctx, ExportRequest{Report: "summary", Period: nov})
	if err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	_ = WriteCSV(&buf, doc)
	for _, needle := range []string{"Total balance,254.00", "Pending transactions,1"} {
		if !strings.Contains(buf.String(), needle) {
			t.Fatalf("summary csv missing %q:\n%s", needle, buf.String())
		}
	}
	// A context without a user sees an empty ledger, never a merged one.
	empty, err := b.svc.Summary(context.Background(), nov)
	if err != nil {
		t.Fatal(err)
	}
	if empty.Income != 0 || empty.Expenses != 0 || empty.TotalBalance != 0 ||
		empty.PendingCount != 0 || len(empty.RecentTransactions) != 0 {
		t.Fatalf("anonymous summary: %+v", empty)
	}
}

func ptr(s string) *string { return &s }

// dump prints a slice of report rows one per line, dereferencing *string ids.
func dump(v any) string {
	var b strings.Builder
	rv := reflect.ValueOf(v)
	for i := 0; i < rv.Len(); i++ {
		row := rv.Index(i).Interface()
		if c, ok := row.(CategoryRow); ok && c.CategoryID != nil {
			b.WriteString(fmt.Sprintf("\n  {%s %+v}", *c.CategoryID, c))
			continue
		}
		b.WriteString(fmt.Sprintf("\n  %+v", row))
	}
	return b.String()
}
