package pdf

import (
	"bytes"
	"strings"
	"testing"
)

func docFromText(t *testing.T, pages ...string) *Document {
	t.Helper()
	var all [][]string
	for _, p := range pages {
		all = append(all, strings.Split(strings.Trim(p, "\n"), "\n"))
	}
	return DocumentFromLines(all, "test")
}

func parseText(t *testing.T, pages ...string) *ParsedStatement {
	t.Helper()
	ps, err := (BOBStatementParser{}).Parse(docFromText(t, pages...))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return ps
}

func i64(v int64) *int64 { return &v }

func TestDetectHeader(t *testing.T) {
	cases := []struct {
		name string
		line string
		want bool
		kind map[colKind]bool
	}{
		{"finacle style", "Txn Date    Value Date   Description                     Ref No        Debit       Credit      Balance", true,
			map[colKind]bool{colDate: true, colValueDate: true, colDescription: true, colReference: true, colDebit: true, colCredit: true, colBalance: true}},
		{"particulars withdrawal deposit", "Date        Particulars                      Chq/Ref No      Withdrawal     Deposit    Closing Balance", true,
			map[colKind]bool{colDate: true, colDescription: true, colReference: true, colDebit: true, colCredit: true, colBalance: true}},
		{"single amount column", "Transaction Date   Narration                         Amount (Dr/Cr)    Running Balance", true,
			map[colKind]bool{colDate: true, colDescription: true, colAmount: true, colBalance: true}},
		{"amount plus indicator", "Date   Transaction Details        Amount     Dr/Cr     Balance", true,
			map[colKind]bool{colDate: true, colDescription: true, colAmount: true, colIndicator: true, colBalance: true}},
		{"two plain date columns", "Date        Date        Description     Dr      Cr      Balance", true,
			map[colKind]bool{colDate: true, colValueDate: true, colDescription: true, colDebit: true, colCredit: true, colBalance: true}},
		{"glued labels", "Txn Date  Value Date Description  Ref No  Debit  Credit  Balance", true,
			map[colKind]bool{colDate: true, colValueDate: true, colDescription: true, colDebit: true, colCredit: true}},
		{"lower case with units", "txn date   description   debit (nu.)   credit (nu.)   balance (nu.)", true,
			map[colKind]bool{colDate: true, colDescription: true, colDebit: true, colCredit: true, colBalance: true}},
		{"transaction row", "01-10-2026  01-10-2026  SALARY CREDIT   SAL0001   65,000.00   165,000.00", false, nil},
		{"preamble", "Account Holder : TASHI WANGMO     Account No : 201234567890", false, nil},
		{"missing amounts", "Date      Description      Balance", false, nil},
		{"missing description", "Date      Debit     Credit     Balance", false, nil},
		{"description with the word date", "PAYMENT DATE CHANGE        DEBIT NOTE", false, nil},
	}
	for _, c := range cases {
		doc := DocumentFromLines([][]string{{c.line}}, "test")
		row := doc.Pages[0].Rows[0]
		tbl, ok := detectHeader(row)
		if ok != c.want {
			t.Errorf("%s: detected=%v want %v", c.name, ok, c.want)
			continue
		}
		if !ok {
			continue
		}
		for k := range c.kind {
			if !tbl.has(k) {
				t.Errorf("%s: missing column kind %d", c.name, k)
			}
		}
		for i := 1; i < len(tbl.cols); i++ {
			if tbl.cols[i].x0 < tbl.cols[i-1].x0 {
				t.Errorf("%s: columns not ordered", c.name)
			}
		}
	}
}

const textStatement = `
BANK OF BHUTAN LIMITED
Account Holder : TASHI WANGMO                     Account No : 201234567890
Currency : Nu.                                    Statement Period : 01-10-2026 to 31-10-2026
Txn Date    Value Date   Description                       Ref No        Debit        Credit       Balance
                         Opening Balance                                                           1,000.00
01-10-2026  01-10-2026   SALARY CREDIT OCT 2026            SAL0001                    650.00       1,650.00
02-10-2026  02-10-2026   POS PURCHASE EIGHT ELEVEN         POS77001      18.45                     1,631.55
                         THIMPHU BHUTAN
03-10-2026  03-10-2026   ATM WDL NORZIN LAM                ATM55012      50.00                     1,581.55
                                              Page 1 of 2
`

const textStatementPage2 = `
BANK OF BHUTAN LIMITED
Account Holder : TASHI WANGMO                     Account No : 201234567890
Txn Date    Value Date   Description                       Ref No        Debit        Credit       Balance
                         (WRAPPED ACROSS THE PAGE BREAK)
04-10-2026  04-10-2026   MBOB/QR/ AMBIENT CAFE             QR000124      4.20                      1,577.35
                         Closing Balance                                                           1,577.35
                         Total                                            72.65        650.00
                                              Page 2 of 2
`

func TestBOBParseLayoutText(t *testing.T) {
	ps := parseText(t, textStatement, textStatementPage2)
	if ps.AccountNumber != "********7890" {
		t.Errorf("account number %q", ps.AccountNumber)
	}
	if ps.AccountHolder != "TASHI WANGMO" {
		t.Errorf("holder %q", ps.AccountHolder)
	}
	if ps.Currency != "BTN" || ps.PeriodStart != "2026-10-01" || ps.PeriodEnd != "2026-10-31" {
		t.Errorf("meta %+v", ps)
	}
	if ps.OpeningBalance == nil || *ps.OpeningBalance != 100000 {
		t.Errorf("opening %v", ps.OpeningBalance)
	}
	if ps.ClosingBalance == nil || *ps.ClosingBalance != 157735 {
		t.Errorf("closing %v", ps.ClosingBalance)
	}
	if len(ps.Transactions) != 4 {
		t.Fatalf("want 4 transactions, got %d: %+v", len(ps.Transactions), ps.Transactions)
	}
	tx := ps.Transactions[1]
	if tx.Description != "POS PURCHASE EIGHT ELEVEN THIMPHU BHUTAN" {
		t.Errorf("continuation not appended: %q", tx.Description)
	}
	if tx.Debit != 1845 || tx.Credit != 0 || tx.Reference != "POS77001" || tx.Balance == nil || *tx.Balance != 163155 {
		t.Errorf("row 2: %+v", tx)
	}
	if ps.Transactions[0].Credit != 65000 || ps.Transactions[0].ValueDate == nil || *ps.Transactions[0].ValueDate != "2026-10-01" {
		t.Errorf("row 1: %+v", ps.Transactions[0])
	}
	if ps.TotalDebits != 7265 || ps.TotalCredits != 65000 {
		t.Errorf("totals %d %d", ps.TotalDebits, ps.TotalCredits)
	}
	// A text-only table row at the top of page 2 is a wrapped description that
	// crossed the page break, so it attaches to the last row of page 1.
	if !strings.Contains(ps.Transactions[2].Description, "WRAPPED ACROSS") {
		t.Errorf("expected cross-page continuation to attach to previous row: %q", ps.Transactions[2].Description)
	}
	for _, w := range ps.Warnings {
		if strings.Contains(w, "could not be parsed") {
			t.Errorf("unexpected skip warning: %s", w)
		}
	}
	v := Validate(ps)
	if v.BalanceCheck != "ok" || v.Difference != 0 {
		t.Errorf("validation %+v", v)
	}
}

func TestBOBSingleAmountColumn(t *testing.T) {
	text := `
Statement of Account    Account Number: 1122334455    Period: 01/09/2026 - 30/09/2026
Name: DORJI DEMO
Date          Narration                        Amount           Balance
                Balance B/F                                     5,000.00
01/09/2026    SALARY                           2,000.00 Cr      7,000.00
02/09/2026    GROCERY                          150.25 Dr        6,849.75
03/09/2026    UNSIGNED AMOUNT                  100.00           6,749.75
04/09/2026    UNSIGNED CREDIT                  50.00            6,799.75
                Balance C/F                                     6,799.75
`
	ps := parseText(t, text)
	if ps.AccountNumber != "******4455" || ps.AccountHolder != "DORJI DEMO" {
		t.Errorf("meta %q %q", ps.AccountNumber, ps.AccountHolder)
	}
	if ps.PeriodStart != "2026-09-01" || ps.PeriodEnd != "2026-09-30" {
		t.Errorf("period %s %s", ps.PeriodStart, ps.PeriodEnd)
	}
	if len(ps.Transactions) != 4 {
		t.Fatalf("want 4 rows got %d", len(ps.Transactions))
	}
	want := []struct{ d, c int64 }{{0, 200000}, {15025, 0}, {10000, 0}, {0, 5000}}
	for i, w := range want {
		tx := ps.Transactions[i]
		if tx.Debit != w.d || tx.Credit != w.c {
			t.Errorf("row %d: debit=%d credit=%d want %d %d", i, tx.Debit, tx.Credit, w.d, w.c)
		}
	}
	if ps.OpeningBalance == nil || *ps.OpeningBalance != 500000 || ps.ClosingBalance == nil || *ps.ClosingBalance != 679975 {
		t.Errorf("balances %v %v", ps.OpeningBalance, ps.ClosingBalance)
	}
	if v := Validate(ps); v.BalanceCheck != "ok" {
		t.Errorf("validation %+v", v)
	}
}

func TestBOBAlternativeFormats(t *testing.T) {
	text := `
A/C No. 9988776655            Customer Name : PEMA DEMO            Currency : BTN
From 01-Sep-2026 To 30-Sep-2026
Date          Particulars                    Chq No     Withdrawal      Deposit        Balance
01-Sep-2026   OPENING BALANCE                                                         10,000.00
02-Sep-2026   CHEQUE 1234 CLEARED            1234       (1,500.00)                     8,500.00
03-SEP-2026   REFUND FROM MERCHANT                                      200.00-        8,700.00
04 Sep 2026   SERVICE CHARGE                            25.00 Dr                       8,675.00
05-Sep-2026   GARBLED ROW                               abc                            8,675.00
Total Withdrawals: 1,525.00      Total Deposits: 200.00
`
	ps := parseText(t, text)
	if ps.AccountNumber != "******6655" || ps.AccountHolder != "PEMA DEMO" {
		t.Errorf("meta %q %q", ps.AccountNumber, ps.AccountHolder)
	}
	if ps.PeriodStart != "2026-09-01" || ps.PeriodEnd != "2026-09-30" {
		t.Errorf("period %s..%s", ps.PeriodStart, ps.PeriodEnd)
	}
	if ps.OpeningBalance == nil || *ps.OpeningBalance != 1000000 {
		t.Errorf("opening %v", ps.OpeningBalance)
	}
	if len(ps.Transactions) != 4 {
		t.Fatalf("want 4 rows got %d", len(ps.Transactions))
	}
	if ps.Transactions[0].Debit != 150000 || ps.Transactions[1].Credit != 20000 || ps.Transactions[2].Debit != 2500 {
		t.Errorf("amounts: %+v", ps.Transactions[:3])
	}
	if ps.Transactions[2].TransactionDate != "2026-09-04" {
		t.Errorf("date %s", ps.Transactions[2].TransactionDate)
	}
	garbled := ps.Transactions[3]
	if len(garbled.Warnings) == 0 {
		t.Errorf("garbled row should carry warnings: %+v", garbled)
	}
	joined := strings.Join(ps.Warnings, "\n")
	if !strings.Contains(joined, "transaction has warnings") && !strings.Contains(joined, "transactions have warnings") {
		t.Errorf("expected row-warning summary, got %q", joined)
	}
	v := Validate(ps)
	// Closing was taken from the last running balance (8,675.00); the garbled
	// row contributes nothing, so 10,000 - 1,500 + 200 - 25 = 8,675 -> ok.
	if v.BalanceCheck != "ok" {
		t.Errorf("validation %+v", v)
	}
}

func TestBOBUnparsedLinesReported(t *testing.T) {
	text := `
Account No: 1234567890
Txn Date    Description              Debit      Credit     Balance
01-10-2026  ONE                      10.00                 90.00
99-99-2026  BROKEN DATE ROW          10.00                 80.00
02-10-2026  TWO                                 5.00       95.00
`
	ps := parseText(t, text)
	if len(ps.Transactions) != 2 {
		t.Fatalf("want 2 rows got %d", len(ps.Transactions))
	}
	found := false
	for _, w := range ps.Warnings {
		if strings.Contains(w, "1 line could not be parsed") && strings.Contains(w, "lines 4") {
			found = true
		}
	}
	if !found {
		t.Errorf("missing skipped-line warning: %v", ps.Warnings)
	}
	// Opening balance inferred from the first running balance: 90 + 10 = 100.
	if ps.OpeningBalance == nil || *ps.OpeningBalance != 10000 {
		t.Errorf("inferred opening %v", ps.OpeningBalance)
	}
	if ps.PeriodStart != "2026-10-01" || ps.PeriodEnd != "2026-10-02" {
		t.Errorf("period fallback %s..%s", ps.PeriodStart, ps.PeriodEnd)
	}
}

func TestBOBUnrecognised(t *testing.T) {
	_, err := (BOBStatementParser{}).Parse(docFromText(t, "Some random letter\nDear customer, thank you.\n01-10-2026 nothing tabular"))
	if err != ErrUnrecognised {
		t.Fatalf("want ErrUnrecognised got %v", err)
	}
}

func TestBOBDeclaredTotalsMismatchWarns(t *testing.T) {
	text := `
Txn Date    Description              Debit      Credit     Balance
01-10-2026  ONE                      10.00                 90.00
            Total                    99.00      0.00
`
	ps := parseText(t, text)
	joined := strings.Join(ps.Warnings, "\n")
	if !strings.Contains(joined, "total debits (9900) differ") {
		t.Errorf("want totals warning, got %q", joined)
	}
}

func TestValidate(t *testing.T) {
	cases := []struct {
		name  string
		ps    ParsedStatement
		check string
		diff  int64
	}{
		{"ok", ParsedStatement{OpeningBalance: i64(1000), ClosingBalance: i64(1500), Transactions: []ParsedTransaction{{Credit: 700}, {Debit: 200}}}, "ok", 0},
		{"mismatch", ParsedStatement{OpeningBalance: i64(1000), ClosingBalance: i64(1600), Transactions: []ParsedTransaction{{Credit: 700}, {Debit: 200}}}, "mismatch", 100},
		{"no opening", ParsedStatement{ClosingBalance: i64(1600)}, "unavailable", 0},
		{"no closing", ParsedStatement{OpeningBalance: i64(1000), Transactions: []ParsedTransaction{{Credit: 1}}}, "unavailable", 0},
		{"closing from running balance", ParsedStatement{OpeningBalance: i64(1000), Transactions: []ParsedTransaction{{Credit: 700, Balance: i64(1700)}, {Debit: 200, Balance: i64(1500)}}}, "ok", 0},
		{"running balance break", ParsedStatement{OpeningBalance: i64(1000), ClosingBalance: i64(1500), Transactions: []ParsedTransaction{{Credit: 700, Balance: i64(1700)}, {Debit: 200, Balance: i64(1400)}}}, "ok", 0},
	}
	for _, c := range cases {
		v := Validate(&c.ps)
		if v.BalanceCheck != c.check || v.Difference != c.diff {
			t.Errorf("%s: got %+v", c.name, v)
		}
		if c.name == "running balance break" && !strings.Contains(strings.Join(v.Messages, "\n"), "does not follow") {
			t.Errorf("%s: missing continuity message: %v", c.name, v.Messages)
		}
	}
}

// TestBOBParseFixturePDF parses the committed synthetic PDF through the real
// extractor in both positioned and layout-text modes.
func TestBOBParseFixturePDF(t *testing.T) {
	data := readFixture(t, "bob_synthetic.pdf")
	doc, err := Extract(bytes.NewReader(data), int64(len(data)), "")
	if err != nil {
		t.Fatal(err)
	}
	if !doc.Positioned || len(doc.Pages) != 2 {
		t.Fatalf("positioned=%v pages=%d", doc.Positioned, len(doc.Pages))
	}
	var pages [][]string
	for _, p := range doc.Pages {
		pages = append(pages, p.Lines)
	}
	modes := map[string]*Document{"positioned": doc, "layout": DocumentFromLines(pages, "layout")}
	debits, credits, closing := fixtureTotals()
	for name, d := range modes {
		ps, err := (BOBStatementParser{}).Parse(d)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if ps.AccountNumber != "********7890" || ps.AccountHolder != fixtureHolder || ps.Currency != "BTN" {
			t.Errorf("%s: meta %q %q %q", name, ps.AccountNumber, ps.AccountHolder, ps.Currency)
		}
		if ps.PeriodStart != "2026-10-01" || ps.PeriodEnd != "2026-10-31" {
			t.Errorf("%s: period %s..%s", name, ps.PeriodStart, ps.PeriodEnd)
		}
		if len(ps.Transactions) != len(fixtureRows) {
			t.Fatalf("%s: want %d rows got %d; warnings %v", name, len(fixtureRows), len(ps.Transactions), ps.Warnings)
		}
		for i, r := range fixtureRows {
			tx := ps.Transactions[i]
			wantDesc := strings.TrimSpace(r.desc + " " + r.cont)
			if tx.Description != wantDesc || tx.Reference != r.ref || tx.Debit != r.debit || tx.Credit != r.credit {
				t.Errorf("%s row %d: got %+v want %+v", name, i, tx, r)
			}
			if d, _ := ParseDate(r.date); tx.TransactionDate != d {
				t.Errorf("%s row %d: date %s want %s", name, i, tx.TransactionDate, d)
			}
			if len(tx.Warnings) > 0 {
				t.Errorf("%s row %d: unexpected warnings %v", name, i, tx.Warnings)
			}
		}
		if ps.TotalDebits != debits || ps.TotalCredits != credits {
			t.Errorf("%s: totals %d/%d want %d/%d", name, ps.TotalDebits, ps.TotalCredits, debits, credits)
		}
		if ps.OpeningBalance == nil || *ps.OpeningBalance != fixtureOpening || ps.ClosingBalance == nil || *ps.ClosingBalance != closing {
			t.Errorf("%s: balances %v %v", name, ps.OpeningBalance, ps.ClosingBalance)
		}
		if len(ps.Warnings) != 0 {
			t.Errorf("%s: unexpected warnings %v", name, ps.Warnings)
		}
		if v := Validate(ps); v.BalanceCheck != "ok" {
			t.Errorf("%s: validation %+v", name, v)
		}
	}
}

// TestBOBLayoutFixtureMatchesTxt guards the committed .txt fixture so parser
// changes that alter the layout rendering are noticed.
func TestBOBLayoutFixtureMatchesTxt(t *testing.T) {
	data := readFixture(t, "bob_synthetic.pdf")
	doc, err := Extract(bytes.NewReader(data), int64(len(data)), "")
	if err != nil {
		t.Fatal(err)
	}
	var got strings.Builder
	for i, p := range doc.Pages {
		if i > 0 {
			got.WriteString("\f\n")
		}
		for _, l := range p.Lines {
			got.WriteString(l)
			got.WriteByte('\n')
		}
	}
	want := string(readFixture(t, "bob_synthetic.txt"))
	if got.String() != want {
		t.Fatalf("layout text differs from testdata/statements/bob_synthetic.txt (regenerate with -update if intentional)")
	}
}
