package reports

import (
	"context"
	"encoding/csv"
	"io"
	"strconv"
	"time"

	"github.com/go-pdf/fpdf"

	apperr "github.com/bugloper/xpensiv/internal/errors"
)

// Export formats.
const (
	FormatCSV = "csv"
	FormatPDF = "pdf"
)

// Report names accepted by the export endpoint.
var exportReports = map[string]bool{
	"summary": true, "categories": true, "cash-flow": true, "merchants": true,
	"accounts": true, "budgets": true, "reconciliation": true,
}

// ExportRequest carries the already-validated export parameters.
type ExportRequest struct {
	Report      string
	Format      string
	Period      Period
	Granularity string
	Type        string
	Month       Period
	StatementID string
}

// Money marks a cell as a monetary amount so each renderer formats it.
type Money int64

// Section is one table of a document. Cells are string or Money.
type Section struct {
	Heading string
	Columns []string
	Rows    [][]any
}

// Document is the renderer-neutral form of an exported report.
type Document struct {
	Title       string
	Subtitle    string
	GeneratedAt time.Time
	Filename    string // without extension
	Sections    []Section
}

// ParseExportReport validates the report name.
func ParseExportReport(s string) (string, error) {
	if exportReports[s] {
		return s, nil
	}
	return "", apperr.Validation("invalid report", map[string]string{"report": "must be one of summary, categories, cash-flow, merchants, accounts, budgets, reconciliation"})
}

// ParseExportFormat validates the format; empty means csv.
func ParseExportFormat(s string) (string, error) {
	switch s {
	case "":
		return FormatCSV, nil
	case FormatCSV, FormatPDF:
		return s, nil
	}
	return "", apperr.Validation("invalid format", map[string]string{"format": "must be csv or pdf"})
}

// Export builds the document for req.
func (s *Service) Export(ctx context.Context, req ExportRequest) (*Document, error) {
	doc := &Document{GeneratedAt: time.Now(), Subtitle: "Period: " + req.Period.String()}
	switch req.Report {
	case "summary":
		r, err := s.Summary(ctx, req.Period)
		if err != nil {
			return nil, err
		}
		doc.Title = "Summary"
		doc.Filename = "xpensiv-summary-" + req.Period.From + "_" + req.Period.To
		change := "n/a"
		if r.ExpenseChangePct != nil {
			change = strconv.FormatFloat(*r.ExpenseChangePct, 'f', 1, 64) + "%"
		}
		doc.Sections = append(doc.Sections, Section{Heading: "Totals", Columns: []string{"Metric", "Value"}, Rows: [][]any{
			{"Total balance", Money(r.TotalBalance)},
			{"Income", Money(r.Income)},
			{"Expenses", Money(r.Expenses)},
			{"Net", Money(r.Net)},
			{"Previous period", r.Previous.From + " to " + r.Previous.To},
			{"Previous income", Money(r.Previous.Income)},
			{"Previous expenses", Money(r.Previous.Expenses)},
			{"Previous net", Money(r.Previous.Net)},
			{"Expense change", change},
			{"Unreconciled bank transactions", strconv.Itoa(r.UnreconciledBankCount)},
			{"Unmatched manual transactions", strconv.Itoa(r.UnmatchedManualCount)},
			{"Pending transactions", strconv.Itoa(r.PendingCount)},
		}})
		recent := Section{Heading: "Recent transactions", Columns: []string{"Date", "Type", "Account", "Category", "Payee", "Amount"}}
		for _, t := range r.RecentTransactions {
			recent.Rows = append(recent.Rows, []any{t.TransactionDate, t.Type, t.AccountName, t.CategoryName, t.Payee, Money(t.Amount)})
		}
		doc.Sections = append(doc.Sections, recent)
	case "categories":
		rows, err := s.Categories(ctx, req.Period, req.Type)
		if err != nil {
			return nil, err
		}
		doc.Title = "Categories (" + req.Type + ")"
		doc.Filename = "xpensiv-categories-" + req.Type + "-" + req.Period.From + "_" + req.Period.To
		sec := Section{Columns: []string{"Category", "Count", "Amount", "%"}}
		for _, r := range rows {
			sec.Rows = append(sec.Rows, []any{r.Name, strconv.Itoa(r.Count), Money(r.Amount), strconv.FormatFloat(r.Pct, 'f', 1, 64)})
		}
		doc.Sections = append(doc.Sections, sec)
	case "cash-flow":
		rows, err := s.CashFlow(ctx, req.Period, req.Granularity)
		if err != nil {
			return nil, err
		}
		doc.Title = "Cash flow (" + req.Granularity + ")"
		doc.Filename = "xpensiv-cash-flow-" + req.Granularity + "-" + req.Period.From + "_" + req.Period.To
		sec := Section{Columns: []string{"Period", "Income", "Expenses", "Net"}}
		for _, r := range rows {
			sec.Rows = append(sec.Rows, []any{r.Period, Money(r.Income), Money(r.Expenses), Money(r.Net)})
		}
		doc.Sections = append(doc.Sections, sec)
	case "merchants":
		rows, err := s.Merchants(ctx, req.Period, req.Type)
		if err != nil {
			return nil, err
		}
		doc.Title = "Merchants (" + req.Type + ")"
		doc.Filename = "xpensiv-merchants-" + req.Type + "-" + req.Period.From + "_" + req.Period.To
		sec := Section{Columns: []string{"Payee", "Count", "Amount"}}
		for _, r := range rows {
			sec.Rows = append(sec.Rows, []any{r.Payee, strconv.Itoa(r.Count), Money(r.Amount)})
		}
		doc.Sections = append(doc.Sections, sec)
	case "accounts":
		rows, err := s.Accounts(ctx, req.Period)
		if err != nil {
			return nil, err
		}
		doc.Title = "Accounts"
		doc.Filename = "xpensiv-accounts-" + req.Period.From + "_" + req.Period.To
		sec := Section{Columns: []string{"Account", "Type", "Opening", "Income", "Expenses", "Transfers in", "Transfers out", "Balance"}}
		for _, r := range rows {
			sec.Rows = append(sec.Rows, []any{r.Name, r.Type, Money(r.OpeningBalance), Money(r.Income), Money(r.Expenses),
				Money(r.TransfersIn), Money(r.TransfersOut), Money(r.Balance)})
		}
		doc.Sections = append(doc.Sections, sec)
	case "budgets":
		rows, err := s.Budgets(ctx, req.Month)
		if err != nil {
			return nil, err
		}
		month := req.Month.From[:7]
		doc.Title = "Budgets"
		doc.Subtitle = "Month: " + month
		doc.Filename = "xpensiv-budgets-" + month
		sec := Section{Columns: []string{"Category", "Budget", "Spent", "Remaining", "%", "Level"}}
		for _, r := range rows {
			sec.Rows = append(sec.Rows, []any{r.Name, Money(r.Amount), Money(r.Spent), Money(r.Remaining), strconv.Itoa(r.Pct), r.Level})
		}
		doc.Sections = append(doc.Sections, sec)
	case "reconciliation":
		r, err := s.Reconciliation(ctx, req.StatementID)
		if err != nil {
			return nil, err
		}
		doc.Title = "Reconciliation: " + r.Statement.FileName
		doc.Subtitle = "Period: " + r.Statement.PeriodStart + " to " + r.Statement.PeriodEnd
		doc.Filename = "xpensiv-reconciliation-" + r.Statement.PeriodStart + "_" + r.Statement.PeriodEnd
		doc.Sections = append(doc.Sections, Section{Heading: "Totals", Columns: []string{"Metric", "Value"}, Rows: [][]any{
			{"Bank debits", Money(r.TotalDebits)},
			{"Bank credits", Money(r.TotalCredits)},
			{"Manual expenses", Money(r.ManualExpenses)},
			{"Manual income", Money(r.ManualIncome)},
			{"Matched", strconv.Itoa(r.Matched)},
			{"Unmatched manual", strconv.Itoa(len(r.UnmatchedManual))},
			{"Unrecorded bank", strconv.Itoa(len(r.UnrecordedBank))},
			{"Amount discrepancies", strconv.Itoa(len(r.AmountDiscrepancies))},
			{"Opening balance", optMoney(r.Balance.Opening)},
			{"Closing balance", optMoney(r.Balance.Closing)},
			{"Computed closing", optMoney(r.Balance.ComputedClosing)},
			{"Balance verified", strconv.FormatBool(r.Balance.Verified)},
		}})
		um := Section{Heading: "Unmatched manual transactions", Columns: []string{"Date", "Type", "Category", "Payee", "Description", "Amount"}}
		for _, t := range r.UnmatchedManual {
			um.Rows = append(um.Rows, []any{t.TransactionDate, t.Type, t.CategoryName, t.Payee, t.Description, Money(t.Amount)})
		}
		ub := Section{Heading: "Unrecorded bank transactions", Columns: []string{"Date", "Description", "Reference", "Debit", "Credit"}}
		for _, b := range r.UnrecordedBank {
			ub.Rows = append(ub.Rows, []any{b.TransactionDate, b.Description, b.Reference, Money(b.Debit), Money(b.Credit)})
		}
		ad := Section{Heading: "Amount discrepancies", Columns: []string{"Bank date", "Bank description", "Bank amount", "Manual date", "Manual payee", "Manual amount", "Difference"}}
		for _, d := range r.AmountDiscrepancies {
			bank := d.BankTransaction.Debit
			if bank == 0 {
				bank = d.BankTransaction.Credit
			}
			ad.Rows = append(ad.Rows, []any{d.BankTransaction.TransactionDate, d.BankTransaction.Description, Money(bank),
				d.Transaction.TransactionDate, d.Transaction.Payee, Money(d.Transaction.Amount), Money(d.Difference)})
		}
		doc.Sections = append(doc.Sections, um, ub, ad)
	default:
		return nil, apperr.Validation("invalid report", map[string]string{"report": "unknown report"})
	}
	return doc, nil
}

func optMoney(v *int64) any {
	if v == nil {
		return "n/a"
	}
	return Money(*v)
}

func cellCSV(v any) string {
	if m, ok := v.(Money); ok {
		return FormatMinor(int64(m))
	}
	return v.(string)
}

func cellPDF(v any) string {
	if m, ok := v.(Money); ok {
		return FormatMoney(int64(m))
	}
	return v.(string)
}

// WriteCSV streams the document as CSV. Sections are separated by a blank
// line and introduced by their heading when they have one.
func WriteCSV(w io.Writer, doc *Document) error {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{doc.Title})
	_ = cw.Write([]string{doc.Subtitle})
	_ = cw.Write([]string{"Generated: " + doc.GeneratedAt.UTC().Format(time.RFC3339)})
	for _, sec := range doc.Sections {
		_ = cw.Write([]string{})
		if sec.Heading != "" {
			_ = cw.Write([]string{sec.Heading})
		}
		_ = cw.Write(sec.Columns)
		for _, row := range sec.Rows {
			cells := make([]string, len(row))
			for i, v := range row {
				cells[i] = cellCSV(v)
			}
			_ = cw.Write(cells)
		}
	}
	cw.Flush()
	return cw.Error()
}

// WritePDF renders the document as an A4 PDF with one table per section.
// Money cells are right-aligned.
func WritePDF(w io.Writer, doc *Document) error {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.SetAutoPageBreak(true, 15)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 16)
	pdf.CellFormat(0, 9, doc.Title, "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(90, 90, 90)
	pdf.CellFormat(0, 6, doc.Subtitle, "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 6, "Generated "+doc.GeneratedAt.UTC().Format(time.RFC3339), "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.Ln(4)

	pageW, pageH := pdf.GetPageSize()
	left, top, right, bottom := pdf.GetMargins()
	usable := pageW - left - right
	const rowH = 7.0
	for _, sec := range doc.Sections {
		if sec.Heading != "" {
			if pdf.GetY()+rowH*3 > pageH-bottom {
				pdf.AddPage()
			}
			pdf.SetFont("Helvetica", "B", 12)
			pdf.CellFormat(0, 8, sec.Heading, "", 1, "L", false, 0, "")
		}
		money := make([]bool, len(sec.Columns))
		for _, row := range sec.Rows {
			for i, v := range row {
				if _, ok := v.(Money); ok {
					money[i] = true
				}
			}
		}
		widths := columnWidths(usable, money)
		header := func() {
			pdf.SetFont("Helvetica", "B", 9)
			pdf.SetFillColor(230, 234, 240)
			for i, col := range sec.Columns {
				align := "L"
				if money[i] {
					align = "R"
				}
				pdf.CellFormat(widths[i], rowH, truncate(pdf, col, widths[i]-2), "1", 0, align, true, 0, "")
			}
			pdf.Ln(-1)
			pdf.SetFont("Helvetica", "", 9)
		}
		header()
		if len(sec.Rows) == 0 {
			pdf.SetTextColor(120, 120, 120)
			pdf.CellFormat(usable, rowH, "No rows", "1", 1, "L", false, 0, "")
			pdf.SetTextColor(0, 0, 0)
		}
		for _, row := range sec.Rows {
			if pdf.GetY()+rowH > pageH-bottom {
				pdf.AddPage()
				pdf.SetY(top)
				header()
			}
			for i, v := range row {
				align := "L"
				if money[i] {
					align = "R"
				}
				pdf.CellFormat(widths[i], rowH, truncate(pdf, cellPDF(v), widths[i]-2), "1", 0, align, false, 0, "")
			}
			pdf.Ln(-1)
		}
		pdf.Ln(6)
	}
	return pdf.Output(w)
}

// columnWidths gives money columns up to 32mm (shrinking so text columns keep
// at least 24mm) and shares the rest equally among text columns.
func columnWidths(usable float64, money []bool) []float64 {
	const minTextW = 24.0
	n := len(money)
	widths := make([]float64, n)
	moneyCount := 0
	for _, m := range money {
		if m {
			moneyCount++
		}
	}
	if moneyCount == n {
		for i := range widths {
			widths[i] = usable / float64(n)
		}
		return widths
	}
	moneyW := 32.0
	if maxW := (usable - minTextW*float64(n-moneyCount)) / float64(moneyCount); moneyCount > 0 && maxW < moneyW {
		moneyW = maxW
	}
	rest := usable - moneyW*float64(moneyCount)
	textW := rest / float64(n-moneyCount)
	for i, m := range money {
		if m {
			widths[i] = moneyW
		} else {
			widths[i] = textW
		}
	}
	return widths
}

// truncate shortens s with an ellipsis so it fits in width mm.
func truncate(pdf *fpdf.Fpdf, s string, width float64) string {
	if pdf.GetStringWidth(s) <= width {
		return s
	}
	r := []rune(s)
	for len(r) > 0 && pdf.GetStringWidth(string(r)+"...") > width {
		r = r[:len(r)-1]
	}
	return string(r) + "..."
}

// ContentDisposition builds the attachment header value for the document.
func ContentDisposition(doc *Document, format string) string {
	return `attachment; filename="` + doc.Filename + "." + format + `"`
}
