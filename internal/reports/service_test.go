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

	"github.com/bugloper/xpensiv/internal/database"
	apperr "github.com/bugloper/xpensiv/internal/errors"
)

const ts = "2026-11-04T00:00:00Z"

func exec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

// seed builds a ledger whose expected totals are worked out by hand in the
// tests below. Reporting period under test: 2026-11-01..2026-11-30, so the
// "previous" period is 2026-10-02..2026-10-31.
func seed(t *testing.T) *Service {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	acct := func(id, name, typ string, opening int64, active int) {
		exec(t, db, `INSERT INTO accounts (id,name,type,currency,opening_balance,opening_balance_date,is_active,created_at,updated_at)
			VALUES (?,?,?,'BTN',?,'2026-01-01',?,?,?)`, id, name, typ, opening, active, ts, ts)
	}
	acct("acc-bank", "BOB", "bank", 100000, 1)
	acct("acc-cash", "Wallet", "cash", 5000, 1)
	acct("acc-old", "Closed", "bank", 777, 0)

	exec(t, db, `INSERT INTO categories (id,name,icon,color,type,parent_id,created_at,updated_at)
		VALUES ('cat-coffee','Coffee','coffee','#000000','expense','cat-food',?,?)`, ts, ts)

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
		{"tx1", "expense", 2500, "acc-bank", nil, "cat-food", "Ambient Cafe", "2026-11-01", "manual", "cleared", "2026-11-01T01:00:00Z"},
		{"tx2", "expense", 1500, "acc-bank", nil, "cat-coffee", "Ambient Cafe", "2026-11-03", "manual", "cleared", "2026-11-03T01:00:00Z"},
		{"tx3", "expense", 4000, "acc-bank", nil, "cat-groceries", "8 Eleven", "2026-11-05", "manual", "cleared", "2026-11-05T01:00:00Z"},
		{"tx4", "expense", 1000, "acc-cash", nil, nil, "", "2026-11-10", "manual", "cleared", "2026-11-10T01:00:00Z"},
		{"tx5", "income", 50000, "acc-bank", nil, "cat-salary", "Employer", "2026-11-01", "manual", "cleared", "2026-11-01T02:00:00Z"},
		{"tx6", "refund", 500, "acc-bank", nil, "cat-refund", "Ambient Cafe", "2026-11-02", "manual", "cleared", "2026-11-02T01:00:00Z"},
		{"tx7", "transfer", 10000, "acc-bank", "acc-cash", nil, "", "2026-11-02", "manual", "cleared", "2026-11-02T02:00:00Z"},
		{"tx8", "adjustment", -300, "acc-cash", nil, nil, "", "2026-11-03", "adjustment", "cleared", "2026-11-03T02:00:00Z"},
		{"tx9", "adjustment", 200, "acc-bank", nil, nil, "", "2026-11-04", "adjustment", "cleared", "2026-11-04T01:00:00Z"},
		{"tx10", "expense", 99999, "acc-cash", nil, "cat-food", "Draft", "2026-11-03", "manual", "pending", "2026-11-03T03:00:00Z"},
		{"tx11", "expense", 99999, "acc-bank", nil, "cat-food", "Void", "2026-11-03", "manual", "void", "2026-11-03T04:00:00Z"},
		{"tx12", "expense", 8000, "acc-bank", nil, "cat-food", "Ambient Cafe", "2026-10-15", "manual", "cleared", "2026-10-15T01:00:00Z"},
		{"tx13", "expense", 700, "acc-bank", nil, "cat-food", "Ambient Cafe", "2026-10-01", "manual", "cleared", "2026-10-01T01:00:00Z"},
		{"tx14", "expense", 300, "acc-bank", nil, "cat-food", "Ambient Cafe", "2026-12-01", "manual", "cleared", "2026-12-01T01:00:00Z"},
	}
	for _, r := range rows {
		exec(t, db, `INSERT INTO transactions (id,type,amount,currency,account_id,transfer_account_id,category_id,payee,transaction_date,origin,status,created_at,updated_at)
			VALUES (?,?,?,'BTN',?,?,?,?,?,?,?,?,?)`, r.id, r.typ, r.amount, r.acct, r.transfer, r.cat, r.payee, r.date, r.origin, r.status, r.createdAt, r.createdAt)
	}

	exec(t, db, `INSERT INTO budgets (id,category_id,amount,created_at,updated_at) VALUES
		('b-food','cat-food',5000,?,?), ('b-groc','cat-groceries',4000,?,?), ('b-trans','cat-transport',1000,?,?)`, ts, ts, ts, ts, ts, ts)

	exec(t, db, `INSERT INTO bank_statements (id,provider,account_id,file_name,file_sha256,file_size,period_start,period_end,
		opening_balance,closing_balance,total_debits,total_credits,transaction_count,imported_at)
		VALUES ('st-1','bob','acc-bank','nov.pdf','abc',10,'2026-11-01','2026-11-30',100000,144911,5099,50010,5,?)`, ts)
	bt := func(id string, line int, date, desc string, debit, credit int64) {
		exec(t, db, `INSERT INTO bank_transactions (id,statement_id,account_id,line_no,transaction_date,description,debit,credit,fingerprint,created_at)
			VALUES (?,'st-1','acc-bank',?,?,?,?,?,?,?)`, id, line, date, desc, debit, credit, "fp-"+id, ts)
	}
	bt("bt-1", 1, "2026-11-01", "AMBIENT CAFE", 2500, 0)
	bt("bt-2", 2, "2026-11-03", "AMBIENT CAFE", 1600, 0)
	bt("bt-3", 3, "2026-11-01", "SALARY", 0, 50000)
	bt("bt-4", 4, "2026-11-07", "ATM FEE", 999, 0)
	bt("bt-5", 5, "2026-11-08", "INTEREST", 0, 10)
	rec := func(id, btID string, txID any, status string, diff int64) {
		exec(t, db, `INSERT INTO reconciliations (id,bank_transaction_id,transaction_id,status,match_type,amount_diff,created_at)
			VALUES (?,?,?,?,'manual',?,?)`, id, btID, txID, status, diff, ts)
	}
	rec("r-1", "bt-1", "tx1", "matched", 0)
	rec("r-2", "bt-2", "tx2", "matched", 100)
	rec("r-3", "bt-3", "tx5", "matched", 0)
	rec("r-5", "bt-5", nil, "ignored", 0)
	return NewService(db)
}

var nov = Period{From: "2026-11-01", To: "2026-11-30"}

func TestSummary(t *testing.T) {
	s := seed(t)
	got, err := s.Summary(context.Background(), nov)
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
	if got.UnreconciledBankCount != 1 || got.UnmatchedManualCount != 6 || got.PendingCount != 1 {
		t.Fatalf("counts: %+v", got)
	}
	if len(got.RecentTransactions) != 10 || got.RecentTransactions[0].ID != "tx14" {
		t.Fatalf("recent: %d first=%s", len(got.RecentTransactions), got.RecentTransactions[0].ID)
	}
	for _, r := range got.RecentTransactions {
		if r.Status == "void" {
			t.Fatal("void transaction in recent list")
		}
	}

	// October's previous window (Sep 2..Oct 1) catches the Oct 1 row only.
	got, err = s.Summary(context.Background(), Period{From: "2026-10-02", To: "2026-10-31"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Expenses != 8000 || got.Previous.Expenses != 700 || got.ExpenseChangePct == nil || *got.ExpenseChangePct != 1042.9 {
		t.Fatalf("october: expenses=%d previous=%+v change=%v", got.Expenses, got.Previous, got.ExpenseChangePct)
	}
	// A period with nothing before it has no change percentage.
	got, err = s.Summary(context.Background(), Period{From: "2026-09-01", To: "2026-09-30"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Expenses != 0 || got.Previous.Expenses != 0 || got.ExpenseChangePct != nil {
		t.Fatalf("september: expenses=%d previous=%+v change=%v", got.Expenses, got.Previous, got.ExpenseChangePct)
	}
}

func TestCategories(t *testing.T) {
	s := seed(t)
	got, err := s.Categories(context.Background(), nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	want := []CategoryRow{
		{CategoryID: ptr("cat-groceries"), Name: "Groceries", Icon: "shopping-basket", Color: "#22c55e", Amount: 4000, Count: 1, Pct: 44.4},
		{CategoryID: ptr("cat-food"), Name: "Food", Icon: "utensils", Color: "#f97316", Amount: 2500, Count: 1, Pct: 27.8},
		{CategoryID: ptr("cat-coffee"), Name: "Coffee", Icon: "coffee", Color: "#000000", Amount: 1500, Count: 1, Pct: 16.7},
		{CategoryID: nil, Name: "Uncategorised", Icon: "circle", Color: "#64748b", Amount: 1000, Count: 1, Pct: 11.1},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expense:\n got %s\nwant %s", dump(got), dump(want))
	}
	got, err = s.Categories(context.Background(), nov, FlowIncome)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "Salary" || got[0].Amount != 50000 || got[0].Pct != 99.0 ||
		got[1].Name != "Refund" || got[1].Amount != 500 || got[1].Pct != 1.0 {
		t.Fatalf("income: %s", dump(got))
	}
	empty, err := s.Categories(context.Background(), Period{From: "2020-01-01", To: "2020-01-31"}, FlowExpense)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty: %v %v", empty, err)
	}
}

func TestCashFlow(t *testing.T) {
	s := seed(t)
	ctx := context.Background()
	got, err := s.CashFlow(ctx, nov, GranMonth)
	if err != nil {
		t.Fatal(err)
	}
	if want := []CashFlowRow{{"2026-11", 50500, 9000, 41500}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("month: %+v", got)
	}
	got, err = s.CashFlow(ctx, Period{From: "2026-11-01", To: "2026-11-05"}, GranDay)
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
	got, err = s.CashFlow(ctx, Period{From: "2026-10-26", To: "2026-11-08"}, GranWeek)
	if err != nil {
		t.Fatal(err)
	}
	want = []CashFlowRow{{"2026-W44", 50000, 2500, 47500}, {"2026-W45", 500, 5500, -5000}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("week: %+v", got)
	}
	got, err = s.CashFlow(ctx, Period{From: "2026-09-01", To: "2026-12-31"}, GranMonth)
	if err != nil {
		t.Fatal(err)
	}
	want = []CashFlowRow{{"2026-09", 0, 0, 0}, {"2026-10", 0, 8700, -8700}, {"2026-11", 50500, 9000, 41500}, {"2026-12", 0, 300, -300}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("months zero-filled: %+v", got)
	}
}

func TestMerchants(t *testing.T) {
	s := seed(t)
	got, err := s.Merchants(context.Background(), nov, FlowExpense)
	if err != nil {
		t.Fatal(err)
	}
	want := []MerchantRow{{"8 Eleven", 4000, 1}, {"Ambient Cafe", 4000, 2}, {"(no payee)", 1000, 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expense: %+v", got)
	}
	got, err = s.Merchants(context.Background(), nov, FlowIncome)
	if err != nil {
		t.Fatal(err)
	}
	want = []MerchantRow{{"Employer", 50000, 1}, {"Ambient Cafe", 500, 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("income: %+v", got)
	}
}

func TestAccounts(t *testing.T) {
	s := seed(t)
	got, err := s.Accounts(context.Background(), nov)
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
	s := seed(t)
	got, err := s.Budgets(context.Background(), nov)
	if err != nil {
		t.Fatal(err)
	}
	want := []BudgetRow{
		{BudgetID: "b-food", CategoryID: "cat-food", Name: "Food", Icon: "utensils", Color: "#f97316", Amount: 5000, Spent: 4000, Remaining: 1000, Pct: 80, Level: LevelWarn75},
		{BudgetID: "b-groc", CategoryID: "cat-groceries", Name: "Groceries", Icon: "shopping-basket", Color: "#22c55e", Amount: 4000, Spent: 4000, Remaining: 0, Pct: 100, Level: LevelOver},
		{BudgetID: "b-trans", CategoryID: "cat-transport", Name: "Transportation", Icon: "car", Color: "#3b82f6", Amount: 1000, Spent: 0, Remaining: 1000, Pct: 0, Level: LevelOK},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %s\nwant %s", dump(got), dump(want))
	}
	oct, err := s.Budgets(context.Background(), Period{From: "2026-10-01", To: "2026-10-31"})
	if err != nil {
		t.Fatal(err)
	}
	if oct[0].Spent != 8700 || oct[0].Pct != 174 || oct[0].Level != LevelOver {
		t.Fatalf("october food: %+v", oct[0])
	}
}

func TestReconciliation(t *testing.T) {
	s := seed(t)
	got, err := s.Reconciliation(context.Background(), "st-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Statement.ID != "st-1" || got.Statement.FileName != "nov.pdf" {
		t.Fatalf("statement: %+v", got.Statement)
	}
	if got.TotalDebits != 5099 || got.TotalCredits != 50010 {
		t.Fatalf("bank totals: %d %d", got.TotalDebits, got.TotalCredits)
	}
	if got.ManualExpenses != 8000 || got.ManualIncome != 50500 {
		t.Fatalf("manual totals: %d %d", got.ManualExpenses, got.ManualIncome)
	}
	if got.Matched != 3 {
		t.Fatalf("matched: %d", got.Matched)
	}
	ids := func(n int, f func(int) string) []string {
		out := make([]string, n)
		for i := range out {
			out[i] = f(i)
		}
		return out
	}
	um := ids(len(got.UnmatchedManual), func(i int) string { return got.UnmatchedManual[i].ID })
	if !reflect.DeepEqual(um, []string{"tx7", "tx6", "tx9", "tx3"}) {
		t.Fatalf("unmatched manual: %v", um)
	}
	ub := ids(len(got.UnrecordedBank), func(i int) string { return got.UnrecordedBank[i].ID })
	if !reflect.DeepEqual(ub, []string{"bt-4"}) {
		t.Fatalf("unrecorded bank: %v", ub)
	}
	if len(got.AmountDiscrepancies) != 1 {
		t.Fatalf("discrepancies: %+v", got.AmountDiscrepancies)
	}
	d := got.AmountDiscrepancies[0]
	if d.BankTransaction.ID != "bt-2" || d.Transaction.ID != "tx2" || d.Difference != 100 {
		t.Fatalf("discrepancy: %+v", d)
	}
	b := got.Balance
	if b.Opening == nil || *b.Opening != 100000 || b.Closing == nil || *b.Closing != 144911 ||
		b.ComputedClosing == nil || *b.ComputedClosing != 144911 || !b.Verified {
		t.Fatalf("balance: %+v", b)
	}

	_, err = s.Reconciliation(context.Background(), "nope")
	if ae, ok := apperr.As(err); !ok || ae.Status != 404 {
		t.Fatalf("want 404, got %v", err)
	}
}

func TestReconciliationUnverifiedWhenOpeningUnknown(t *testing.T) {
	s := seed(t)
	exec(t, s.db, `UPDATE bank_statements SET opening_balance = NULL WHERE id = 'st-1'`)
	got, err := s.Reconciliation(context.Background(), "st-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Balance.Opening != nil || got.Balance.ComputedClosing != nil || got.Balance.Verified {
		t.Fatalf("balance: %+v", got.Balance)
	}
}

func TestExportCSV(t *testing.T) {
	s := seed(t)
	doc, err := s.Export(context.Background(), ExportRequest{Report: "categories", Period: nov, Type: FlowExpense})
	if err != nil {
		t.Fatal(err)
	}
	if doc.Filename != "xpensiv-categories-expense-2026-11-01_2026-11-30" {
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
	want := []string{"", "Category,Count,Amount,%", "Groceries,1,40.00,44.4", "Food,1,25.00,27.8", "Coffee,1,15.00,16.7", "Uncategorised,1,10.00,11.1"}
	if !reflect.DeepEqual(lines[3:], want) {
		t.Fatalf("body: %q", lines[3:])
	}
	records, err := csv.NewReader(strings.NewReader(buf.String())).Read()
	if err != nil || records[0] != "Categories (expense)" {
		t.Fatalf("not parseable csv: %v", err)
	}

	doc, err = s.Export(context.Background(), ExportRequest{Report: "reconciliation", StatementID: "st-1"})
	if err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	if err := WriteCSV(&buf, doc); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, needle := range []string{"Reconciliation: nov.pdf", "Bank debits,50.99", "Computed closing,1449.11", "Balance verified,true",
		"Unrecorded bank transactions\n", "2026-11-07,ATM FEE,,9.99,0.00", "2026-11-03,AMBIENT CAFE,16.00,2026-11-03,Ambient Cafe,15.00,1.00"} {
		if !strings.Contains(out, needle) {
			t.Fatalf("csv missing %q in:\n%s", needle, out)
		}
	}
	doc, err = s.Export(context.Background(), ExportRequest{Report: "budgets", Month: nov})
	if err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	_ = WriteCSV(&buf, doc)
	if doc.Filename != "xpensiv-budgets-2026-11" || !strings.Contains(buf.String(), "Food,50.00,40.00,10.00,80,warn75") {
		t.Fatalf("budgets csv: %s\n%s", doc.Filename, buf.String())
	}
}

func TestExportPDF(t *testing.T) {
	s := seed(t)
	for _, report := range []string{"summary", "categories", "cash-flow", "merchants", "accounts", "budgets", "reconciliation"} {
		doc, err := s.Export(context.Background(), ExportRequest{Report: report, Period: nov, Type: FlowExpense, Granularity: GranDay, Month: nov, StatementID: "st-1"})
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
