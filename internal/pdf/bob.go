package pdf

// BOBStatementParser parses Bank of Bhutan account statements (the mBoB /
// online-banking export, filename pattern
// AMONLI_014_OUT_GBOBLBTNOU_<yyyymmdd>_<hhmmss>_<n>.PDF).
//
// ASSUMPTIONS — no real statement was available while writing this, so the
// parser is deliberately header-driven rather than tied to one layout. It is
// written for a Finacle-style tabular export and expects:
//
//   - A table header row containing, in any order, a date column ("Txn Date",
//     "Transaction Date", "Date"), a description column ("Description",
//     "Particulars", "Narration", "Transaction Details"), and either
//     Debit/Credit ("Debit"/"Withdrawal"/"Dr", "Credit"/"Deposit"/"Cr") or a
//     single signed/suffixed "Amount" column. "Value Date", a reference column
//     ("Ref", "Cheque", "Chq", "Instrument", "Txn Id") and a running "Balance"
//     column are optional. Column boundaries are derived from the header
//     fragment positions (PDF points when positioned text is available,
//     character columns for layout text).
//   - The header is repeated on every page; rows above it are page preamble
//     (bank name, account holder, account number, period, opening balance)
//     and are only scanned for metadata.
//   - Each transaction row starts with a parsable date. Rows without a date
//     but with description text are wrapped descriptions and are appended to
//     the previous transaction.
//   - "Opening Balance" / "Balance B/F" / "Closing Balance" / "Balance C/F"
//     and "Total" rows are captured but never emitted as transactions.
//   - Amounts may carry thousands separators, "Dr"/"Cr" suffixes, parentheses
//     or a trailing minus. Currency is BTN unless the statement says otherwise.
//
// The real layout MUST be validated against an actual statement through the
// import preview screen; anything the parser cannot classify is reported in
// Warnings (with line numbers) instead of being dropped silently.

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// BOBStatementParser implements StatementParser for Bank of Bhutan.
type BOBStatementParser struct{}

// Provider returns the provider key used in the API.
func (BOBStatementParser) Provider() string { return "bob" }

type colKind int

const (
	colNone colKind = iota
	colDate
	colValueDate
	colDescription
	colReference
	colDebit
	colCredit
	colAmount
	colIndicator
	colBalance
)

// headerKeywords maps a normalised header fragment to a column kind.
var headerKeywords = map[string]colKind{
	"value date": colValueDate, "val date": colValueDate, "value dt": colValueDate, "val dt": colValueDate,

	"date": colDate, "txn date": colDate, "transaction date": colDate, "tran date": colDate, "trans date": colDate,
	"posting date": colDate, "post date": colDate, "txn dt": colDate, "tran dt": colDate, "trn date": colDate, "booking date": colDate,

	"description": colDescription, "particulars": colDescription, "narration": colDescription, "transaction details": colDescription,
	"details": colDescription, "remarks": colDescription, "transaction description": colDescription, "narrative": colDescription,
	"transaction particulars": colDescription, "txn details": colDescription, "txn description": colDescription,

	"ref": colReference, "ref no": colReference, "reference": colReference, "reference no": colReference, "cheque": colReference,
	"cheque no": colReference, "chq": colReference, "chq no": colReference, "chq ref no": colReference, "instrument": colReference,
	"instrument no": colReference, "tran id": colReference, "transaction id": colReference, "txn id": colReference, "utr": colReference,
	"ref id": colReference, "cheque ref no": colReference, "instrument id": colReference, "txn ref": colReference, "ref num": colReference,

	"debit": colDebit, "withdrawal": colDebit, "withdrawals": colDebit, "dr": colDebit, "debit amount": colDebit, "withdrawal amt": colDebit,
	"withdrawal amount": colDebit, "paid out": colDebit, "debits": colDebit, "dr amount": colDebit, "debit amt": colDebit,

	"credit": colCredit, "deposit": colCredit, "deposits": colCredit, "cr": colCredit, "credit amount": colCredit, "deposit amt": colCredit,
	"deposit amount": colCredit, "paid in": colCredit, "credits": colCredit, "cr amount": colCredit, "credit amt": colCredit,

	"amount": colAmount, "txn amount": colAmount, "transaction amount": colAmount, "amt": colAmount,

	"dr cr": colIndicator, "cr dr": colIndicator, "d c": colIndicator, "type": colIndicator, "txn type": colIndicator, "indicator": colIndicator,

	"balance": colBalance, "closing balance": colBalance, "running balance": colBalance, "available balance": colBalance, "bal": colBalance,
	"running bal": colBalance, "balance amount": colBalance,
}

var (
	parenRe      = regexp.MustCompile(`\([^)]*\)`)
	nonWordRe    = regexp.MustCompile(`[^a-z0-9]+`)
	openingRe    = regexp.MustCompile(`(?i)\b(opening\s*balance|balance\s*b\s*/?\s*f\b|brought\s*forward|opening\s*bal\b|b\s*/\s*f\b)`)
	closingRe    = regexp.MustCompile(`(?i)\b(closing\s*balance|balance\s*c\s*/?\s*f\b|carried\s*forward|closing\s*bal\b|c\s*/\s*f\b)`)
	totalsRe     = regexp.MustCompile(`(?i)^\s*(grand\s*)?totals?\b|\btotal\s*(debits?|credits?|withdrawals?|deposits?)\b`)
	totalDebRe   = regexp.MustCompile(`(?i)\btotal\s*(debits?|withdrawals?)\s*[:\-]?\s*(.+)$`)
	totalCredRe  = regexp.MustCompile(`(?i)\btotal\s*(credits?|deposits?)\s*[:\-]?\s*(.+)$`)
	acctNoRe     = regexp.MustCompile(`(?i)\b(?:a/c|account|acct|acc)\s*(?:no|number|num|#)?\s*\.?\s*[:\-]?\s*(\d[\d\- ]{5,}\d)`)
	holderRe     = regexp.MustCompile(`(?i)\b(?:account\s*holder(?:'s)?(?:\s*name)?|customer\s*name|account\s*name|holder\s*name|name\s*of\s*(?:the\s*)?(?:account\s*)?holder|customer|name)\s*[:\-]\s*(\S.*)$`)
	currencyRe   = regexp.MustCompile(`(?i)\bcurrency\s*[:\-]?\s*([A-Za-z.]{2,9})`)
	currencyHint = regexp.MustCompile(`(?i)\b(nu\.|btn|ngultrum)\b`)
	periodRe     = regexp.MustCompile(`(?i)\b(statement\s*period|period|from\s*date|from)\b`)
	noiseRe      = regexp.MustCompile(`(?i)^\s*(page\s*\d+(\s*of\s*\d+)?|continued.*|\.{3,}|-{3,}|_{3,}|\*{3,}|\**\s*end\s*of\s*statement\s*\**|.*computer\s*generated.*|.*system\s*generated.*|.*does\s*not\s*require\s*(a\s*)?signature.*)\s*$`)
)

func normaliseHeader(s string) string {
	s = strings.ToLower(s)
	s = parenRe.ReplaceAllString(s, " ")
	s = nonWordRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

type column struct {
	kind   colKind
	x0, x1 float64
}

type table struct {
	cols   []column
	bounds []float64 // bounds[i] separates cols[i] and cols[i+1]
}

func (t *table) has(k colKind) bool {
	for _, c := range t.cols {
		if c.kind == k {
			return true
		}
	}
	return false
}

// detectHeader reports whether row is a statement table header and, if so,
// derives the column layout from the fragment positions.
func detectHeader(row Row) (*table, bool) {
	var cols []column
	seen := map[colKind]bool{}
	for _, f := range row.Fragments {
		for _, c := range headerColumns(f) {
			k := c.kind
			if k == colDate && seen[colDate] && !seen[colValueDate] {
				k = colValueDate // second plain "Date" column is the value date
			}
			if seen[k] {
				continue
			}
			seen[k] = true
			c.kind = k
			cols = append(cols, c)
		}
	}
	if !seen[colDate] || !seen[colDescription] || !(seen[colDebit] || seen[colCredit] || seen[colAmount]) {
		return nil, false
	}
	// A real header is short labels only: no digits anywhere.
	if strings.ContainsAny(row.Text(), "0123456789") {
		return nil, false
	}
	sort.SliceStable(cols, func(i, j int) bool { return cols[i].x0 < cols[j].x0 })
	t := &table{cols: cols}
	for i := 0; i+1 < len(cols); i++ {
		t.bounds = append(t.bounds, (cols[i].x1+cols[i+1].x0)/2)
	}
	return t, true
}

// headerColumns maps a header fragment to columns. A fragment is normally one
// label, but tight layouts (and layout text) can glue neighbouring labels
// together ("Value Date Description"), so unmatched fragments are split into
// the longest known phrases, each positioned proportionally inside the
// fragment.
func headerColumns(f Fragment) []column {
	norm := normaliseHeader(f.Text)
	if k, ok := headerKeywords[norm]; ok {
		return []column{{kind: k, x0: f.X, x1: f.Right()}}
	}
	words := strings.Fields(norm)
	if len(words) < 2 {
		return nil
	}
	total := 0
	for _, w := range words {
		total += len(w) + 1
	}
	scale := f.W / float64(total)
	var out []column
	offset := 0
	for i := 0; i < len(words); {
		matched := false
		for n := 3; n >= 1; n-- {
			if i+n > len(words) {
				continue
			}
			phrase := strings.Join(words[i:i+n], " ")
			if k, ok := headerKeywords[phrase]; ok {
				x0 := f.X + float64(offset)*scale
				out = append(out, column{kind: k, x0: x0, x1: x0 + float64(len(phrase))*scale})
				for _, w := range words[i : i+n] {
					offset += len(w) + 1
				}
				i += n
				matched = true
				break
			}
		}
		if !matched {
			offset += len(words[i]) + 1
			i++
		}
	}
	return out
}

// cells assigns each fragment of row to the column whose span contains the
// fragment's centre and joins the texts per column.
func (t *table) cells(row Row) map[colKind]string {
	out := map[colKind]string{}
	for _, f := range row.Fragments {
		idx := sort.SearchFloat64s(t.bounds, f.Center())
		// SearchFloat64s returns the first bound >= centre; a centre exactly on
		// a bound belongs to the right-hand column, which is what we want.
		if idx < len(t.bounds) && t.bounds[idx] == f.Center() {
			idx++
		}
		if idx >= len(t.cols) {
			idx = len(t.cols) - 1
		}
		k := t.cols[idx].kind
		if out[k] != "" {
			out[k] += " "
		}
		out[k] += f.Text
	}
	return out
}

// metaText joins fragments with two spaces so label/value pairs on one row
// can be separated the same way in positioned and layout text.
func metaText(row Row) string {
	parts := make([]string, 0, len(row.Fragments))
	for _, f := range row.Fragments {
		parts = append(parts, strings.TrimSpace(f.Text))
	}
	return strings.Join(parts, "  ")
}

// cutField returns the text up to the first run of two or more spaces.
func cutField(s string) string {
	if i := strings.Index(s, "  "); i >= 0 {
		s = s[:i]
	}
	return strings.TrimSpace(s)
}

// trailingAmount parses the last amount-like token(s) of s.
func trailingAmount(s string) (Amount, bool) {
	fields := strings.Fields(s)
	for n := 1; n <= 3 && n <= len(fields); n++ {
		cand := strings.Join(fields[len(fields)-n:], " ")
		if a, ok := ParseAmount(cand); ok {
			return a, true
		}
	}
	return Amount{}, false
}

type bobState struct {
	ps          *ParsedStatement
	tbl         *table
	inTable     bool
	cur         *ParsedTransaction // last emitted transaction (for continuations)
	prevBalance *int64
	unparsed    []int
	declDebits  *int64
	declCredits *int64
	fullAcctNo  string
}

// Parse implements StatementParser.
func (p BOBStatementParser) Parse(doc *Document) (*ParsedStatement, error) {
	st := &bobState{ps: &ParsedStatement{Provider: p.Provider(), Currency: "BTN", Warnings: []string{}}}
	lineNo := 0
	for _, page := range doc.Pages {
		st.inTable = false
		for _, row := range page.Rows {
			lineNo++
			text := row.Text()
			if strings.TrimSpace(text) == "" {
				continue
			}
			if t, ok := detectHeader(row); ok {
				st.tbl = t
				st.inTable = true
				continue
			}
			if noiseRe.MatchString(text) {
				continue
			}
			if !st.inTable {
				st.scanMeta(row)
				continue
			}
			st.tableRow(row, lineNo)
		}
	}
	if st.tbl == nil {
		return nil, ErrUnrecognised
	}
	st.finish()
	return st.ps, nil
}

// scanMeta looks for account / period / balance metadata on a non-table row.
func (st *bobState) scanMeta(row Row) {
	ps := st.ps
	text := metaText(row)
	if st.fullAcctNo == "" {
		if m := acctNoRe.FindStringSubmatch(text); m != nil {
			st.fullAcctNo = strings.Map(func(r rune) rune {
				if r >= '0' && r <= '9' {
					return r
				}
				return -1
			}, m[1])
			ps.AccountNumber = MaskAccountNumber(st.fullAcctNo)
		}
	}
	if ps.AccountHolder == "" {
		if m := holderRe.FindStringSubmatch(text); m != nil {
			if v := cutField(m[1]); v != "" && !strings.ContainsAny(v, "0123456789") {
				ps.AccountHolder = v
			}
		}
	}
	if m := currencyRe.FindStringSubmatch(text); m != nil {
		ps.Currency = NormaliseCurrency(m[1])
	} else if currencyHint.MatchString(text) {
		ps.Currency = "BTN"
	}
	if ps.PeriodStart == "" && periodRe.MatchString(text) {
		var dates []string
		for _, m := range dateToken.FindAllString(text, -1) {
			if d, ok := ParseDate(m); ok {
				dates = append(dates, d)
			}
		}
		if len(dates) >= 2 {
			ps.PeriodStart, ps.PeriodEnd = dates[0], dates[1]
		}
	}
	if ps.OpeningBalance == nil && openingRe.MatchString(text) {
		if a, ok := trailingAmount(text); ok {
			ps.OpeningBalance = signedBalance(a)
		}
	}
	if ps.ClosingBalance == nil && closingRe.MatchString(text) {
		if a, ok := trailingAmount(text); ok {
			ps.ClosingBalance = signedBalance(a)
		}
	}
	if st.declDebits == nil {
		if m := totalDebRe.FindStringSubmatch(text); m != nil {
			if a, ok := leadingAmount(m[2]); ok {
				st.declDebits = &a.Minor
			}
		}
	}
	if st.declCredits == nil {
		if m := totalCredRe.FindStringSubmatch(text); m != nil {
			if a, ok := leadingAmount(m[2]); ok {
				st.declCredits = &a.Minor
			}
		}
	}
}

// leadingAmount parses the first amount-like token(s) of s.
func leadingAmount(s string) (Amount, bool) {
	fields := strings.Fields(s)
	for n := 1; n <= 3 && n <= len(fields); n++ {
		if a, ok := ParseAmount(strings.Join(fields[:n], " ")); ok {
			return a, true
		}
	}
	return Amount{}, false
}

func signedBalance(a Amount) *int64 {
	v := a.Minor
	if a.Sign < 0 {
		v = -v
	}
	return &v
}

func (st *bobState) tableRow(row Row, lineNo int) {
	ps := st.ps
	cells := st.tbl.cells(row)
	text := row.Text()
	date, rest, hasDate := FindDate(cells[colDate])
	desc := strings.TrimSpace(strings.Join(strings.Fields(rest+" "+cells[colDescription]), " "))

	// Balance rows and totals are captured, never emitted.
	hasMoney := st.hasMoney(cells)
	switch {
	case openingRe.MatchString(desc) || (!hasDate && openingRe.MatchString(text)):
		if ps.OpeningBalance == nil {
			ps.OpeningBalance = st.rowBalance(cells, text)
			st.prevBalance = ps.OpeningBalance
		}
		return
	case closingRe.MatchString(desc) || (!hasDate && closingRe.MatchString(text)):
		if ps.ClosingBalance == nil {
			ps.ClosingBalance = st.rowBalance(cells, text)
		}
		st.captureTotals(cells)
		st.inTable = false // anything after the closing row is footer
		return
	case !hasDate && totalsRe.MatchString(text):
		st.captureTotals(cells)
		return
	}

	if !hasDate {
		dateCell := strings.TrimSpace(cells[colDate])
		if st.cur != nil && !hasMoney && !strings.ContainsAny(dateCell, "0123456789") && (desc != "" || cells[colReference] != "") {
			// Wrapped description / reference.
			if desc != "" {
				st.cur.Description = strings.TrimSpace(st.cur.Description + " " + desc)
			}
			if r := strings.TrimSpace(cells[colReference]); r != "" {
				st.cur.Reference = strings.TrimSpace(st.cur.Reference + " " + r)
			}
			return
		}
		st.unparsed = append(st.unparsed, lineNo)
		return
	}

	tx := ParsedTransaction{LineNo: lineNo, TransactionDate: date, Description: desc, Reference: strings.TrimSpace(cells[colReference]), Warnings: []string{}}
	if vd := strings.TrimSpace(cells[colValueDate]); vd != "" {
		if d, ok := ParseDate(vd); ok {
			tx.ValueDate = &d
		} else {
			tx.Warnings = append(tx.Warnings, "value date not understood: "+vd)
		}
	}
	if b := strings.TrimSpace(cells[colBalance]); b != "" {
		if a, ok := ParseAmount(b); ok {
			tx.Balance = signedBalance(a)
		} else {
			tx.Warnings = append(tx.Warnings, "balance not understood: "+b)
		}
	}
	if st.tbl.has(colDebit) || st.tbl.has(colCredit) {
		if d := strings.TrimSpace(cells[colDebit]); d != "" {
			if a, ok := ParseAmount(d); ok {
				tx.Debit = a.Minor
				if a.Truncated {
					tx.Warnings = append(tx.Warnings, "debit had more than two decimals; truncated")
				}
			} else {
				tx.Warnings = append(tx.Warnings, "debit not understood: "+d)
			}
		}
		if c := strings.TrimSpace(cells[colCredit]); c != "" {
			if a, ok := ParseAmount(c); ok {
				tx.Credit = a.Minor
				if a.Truncated {
					tx.Warnings = append(tx.Warnings, "credit had more than two decimals; truncated")
				}
			} else {
				tx.Warnings = append(tx.Warnings, "credit not understood: "+c)
			}
		}
	}
	if st.tbl.has(colAmount) && tx.Debit == 0 && tx.Credit == 0 {
		if s := strings.TrimSpace(cells[colAmount]); s != "" {
			a, ok := ParseAmount(s)
			if !ok {
				tx.Warnings = append(tx.Warnings, "amount not understood: "+s)
			} else {
				sign := a.Sign
				if ind := strings.ToUpper(strings.TrimSpace(cells[colIndicator])); ind != "" {
					switch ind {
					case "DR", "D", "DEBIT":
						sign = -1
					case "CR", "C", "CREDIT":
						sign = 1
					}
				}
				if sign == 0 && st.prevBalance != nil && tx.Balance != nil {
					switch *tx.Balance - *st.prevBalance {
					case -a.Minor:
						sign = -1
					case a.Minor:
						sign = 1
					}
				}
				switch sign {
				case -1:
					tx.Debit = a.Minor
				case 1:
					tx.Credit = a.Minor
				default:
					tx.Credit = a.Minor
					tx.Warnings = append(tx.Warnings, "amount carries no Dr/Cr marker; assumed credit")
				}
			}
		}
	}
	if tx.Debit > 0 && tx.Credit > 0 {
		tx.Warnings = append(tx.Warnings, "both debit and credit are set")
	}
	if tx.Debit == 0 && tx.Credit == 0 {
		tx.Warnings = append(tx.Warnings, "no amount found on this row")
	}
	if tx.Balance != nil && st.prevBalance != nil && *st.prevBalance+tx.Credit-tx.Debit != *tx.Balance {
		tx.Warnings = append(tx.Warnings, "running balance does not follow from the previous row")
	}
	if tx.Balance != nil {
		st.prevBalance = tx.Balance
	}
	ps.TotalDebits += tx.Debit
	ps.TotalCredits += tx.Credit
	ps.Transactions = append(ps.Transactions, tx)
	st.cur = &ps.Transactions[len(ps.Transactions)-1]
}

func (st *bobState) hasMoney(cells map[colKind]string) bool {
	for _, k := range []colKind{colDebit, colCredit, colAmount, colBalance} {
		if LooksLikeAmount(cells[k]) {
			return true
		}
	}
	return false
}

// rowBalance returns the balance stated on an opening/closing row: the
// balance column when the table has one, else the last amount on the row.
func (st *bobState) rowBalance(cells map[colKind]string, text string) *int64 {
	if b := strings.TrimSpace(cells[colBalance]); b != "" {
		if a, ok := ParseAmount(b); ok {
			return signedBalance(a)
		}
	}
	if a, ok := trailingAmount(text); ok {
		return signedBalance(a)
	}
	return nil
}

func (st *bobState) captureTotals(cells map[colKind]string) {
	if st.declDebits == nil {
		if a, ok := ParseAmount(cells[colDebit]); ok {
			st.declDebits = &a.Minor
		}
	}
	if st.declCredits == nil {
		if a, ok := ParseAmount(cells[colCredit]); ok {
			st.declCredits = &a.Minor
		}
	}
}

func (st *bobState) finish() {
	ps := st.ps
	warn := func(s string) { ps.Warnings = append(ps.Warnings, s) }
	n := len(ps.Transactions)
	if n == 0 {
		warn("no transactions were found in the statement table")
	}
	if ps.PeriodStart == "" && n > 0 {
		ps.PeriodStart, ps.PeriodEnd = ps.Transactions[0].TransactionDate, ps.Transactions[0].TransactionDate
		for _, t := range ps.Transactions {
			if t.TransactionDate < ps.PeriodStart {
				ps.PeriodStart = t.TransactionDate
			}
			if t.TransactionDate > ps.PeriodEnd {
				ps.PeriodEnd = t.TransactionDate
			}
		}
		warn("statement period not found; using the first and last transaction dates")
	}
	if ps.OpeningBalance == nil && n > 0 && ps.Transactions[0].Balance != nil {
		first := ps.Transactions[0]
		v := *first.Balance - first.Credit + first.Debit
		ps.OpeningBalance = &v
		warn("opening balance not stated; inferred from the first running balance")
	}
	if ps.ClosingBalance == nil && n > 0 && ps.Transactions[n-1].Balance != nil {
		v := *ps.Transactions[n-1].Balance
		ps.ClosingBalance = &v
		warn("closing balance not stated; taken from the last running balance")
	}
	if st.declDebits != nil && *st.declDebits != ps.TotalDebits {
		warn(fmt.Sprintf("statement total debits (%d) differ from the sum of parsed rows (%d)", *st.declDebits, ps.TotalDebits))
	}
	if st.declCredits != nil && *st.declCredits != ps.TotalCredits {
		warn(fmt.Sprintf("statement total credits (%d) differ from the sum of parsed rows (%d)", *st.declCredits, ps.TotalCredits))
	}
	if len(st.unparsed) > 0 {
		lines := make([]string, len(st.unparsed))
		for i, l := range st.unparsed {
			lines[i] = fmt.Sprint(l)
		}
		warn(fmt.Sprintf("%s could not be parsed and were skipped (lines %s)", plural(len(st.unparsed), "line", "lines"), strings.Join(lines, ", ")))
	}
	rowWarnings := 0
	for _, t := range ps.Transactions {
		if len(t.Warnings) > 0 {
			rowWarnings++
		}
	}
	if rowWarnings > 0 {
		warn(plural(rowWarnings, "transaction has warnings; review it before importing", "transactions have warnings; review them before importing"))
	}
}

// Parsers lists the available statement parsers keyed by provider.
func Parsers() map[string]StatementParser {
	return map[string]StatementParser{"bob": BOBStatementParser{}}
}
