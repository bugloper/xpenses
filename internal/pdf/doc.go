// Package pdf extracts text from bank statement PDFs and parses it into
// transactions. Extraction is pure Go (pdfcpu for decryption, ledongthuc/pdf
// for positioned text); parsers are header-driven so they tolerate layout
// drift between statement exports.
package pdf

import (
	"errors"
	"sort"
	"strconv"
	"strings"
)

// Sentinel errors returned by Extract and parsers. Handlers map them to the
// error codes in docs/API.md.
var (
	// ErrNotPDF means the bytes do not start with a PDF header.
	ErrNotPDF = errors.New("pdf: not a PDF file")
	// ErrPasswordRequired means the file is encrypted and no password was given.
	ErrPasswordRequired = errors.New("pdf: password required")
	// ErrPasswordIncorrect means the file is encrypted and the password did not open it.
	ErrPasswordIncorrect = errors.New("pdf: password incorrect")
	// ErrNoText means no extractable text was found (scanned/image-only PDF).
	ErrNoText = errors.New("pdf: no extractable text (scanned PDF?)")
	// ErrUnrecognised means a parser could not find the statement table.
	ErrUnrecognised = errors.New("pdf: statement layout not recognised")
)

// Fragment is a run of text on a row. X is the left edge, W the width and Y
// the baseline. When Document.Positioned is true the units are PDF points;
// otherwise they are character columns of a layout-text line.
type Fragment struct {
	X    float64
	Y    float64
	W    float64
	Text string
}

// Right returns the fragment's right edge.
func (f Fragment) Right() float64 { return f.X + f.W }

// Center returns the fragment's horizontal midpoint.
func (f Fragment) Center() float64 { return f.X + f.W/2 }

// Row is one visual line of text: fragments ordered left to right.
type Row struct {
	Y         float64
	Fragments []Fragment
}

// Text joins the fragments with single spaces.
func (r Row) Text() string {
	parts := make([]string, 0, len(r.Fragments))
	for _, f := range r.Fragments {
		if t := strings.TrimSpace(f.Text); t != "" {
			parts = append(parts, t)
		}
	}
	return strings.Join(parts, " ")
}

// Page holds the rows of one page (top to bottom) and the equivalent layout
// text lines (what `pdftotext -layout` would print).
type Page struct {
	Number int
	Width  float64
	Height float64
	Rows   []Row
	Lines  []string
}

// Document is the extracted text of a PDF.
type Document struct {
	Pages []Page
	// Positioned is true when fragment coordinates are real PDF points. It is
	// false for the layout-text fallback, where X is a character column.
	Positioned bool
	// Source names the extractor that produced the text ("go" or "pdftotext").
	Source string
}

// Lines returns every layout line of every page in order.
func (d *Document) Lines() []string {
	var out []string
	for _, p := range d.Pages {
		out = append(out, p.Lines...)
	}
	return out
}

// HasText reports whether any non-blank text was extracted.
func (d *Document) HasText() bool {
	for _, p := range d.Pages {
		for _, r := range p.Rows {
			if strings.TrimSpace(r.Text()) != "" {
				return true
			}
		}
	}
	return false
}

// ParsedTransaction is one statement row. Money is in minor units.
type ParsedTransaction struct {
	LineNo          int
	TransactionDate string // YYYY-MM-DD
	ValueDate       *string
	Description     string
	Reference       string
	Debit           int64
	Credit          int64
	Balance         *int64
	Warnings        []string
}

// ParsedStatement is the result of parsing a statement document.
type ParsedStatement struct {
	Provider       string
	AccountNumber  string // masked: all but the last 4 digits replaced by '*'
	AccountHolder  string
	Currency       string
	PeriodStart    string
	PeriodEnd      string
	OpeningBalance *int64
	ClosingBalance *int64
	TotalDebits    int64 // sum of parsed rows
	TotalCredits   int64
	Transactions   []ParsedTransaction
	Warnings       []string
}

// StatementParser turns an extracted Document into a ParsedStatement.
type StatementParser interface {
	Provider() string
	Parse(doc *Document) (*ParsedStatement, error)
}

// Validation is the balance check block returned to the client.
type Validation struct {
	BalanceCheck    string   `json:"balance_check"` // ok | mismatch | unavailable
	ComputedClosing *int64   `json:"computed_closing"`
	Difference      int64    `json:"difference"`
	Messages        []string `json:"messages"`
}

// Validate recomputes the closing balance from the opening balance and the
// parsed rows and compares it with the stated closing balance and, when
// present, the last row of the running-balance column.
func Validate(ps *ParsedStatement) Validation {
	v := Validation{BalanceCheck: "unavailable", Messages: []string{}}
	var debits, credits int64
	var lastBalance *int64
	continuityBreaks := 0
	var prev *int64
	for i := range ps.Transactions {
		t := &ps.Transactions[i]
		debits += t.Debit
		credits += t.Credit
		if t.Balance != nil {
			if prev != nil && *prev+t.Credit-t.Debit != *t.Balance {
				continuityBreaks++
			}
			prev = t.Balance
			lastBalance = t.Balance
		}
	}
	if continuityBreaks > 0 {
		v.Messages = append(v.Messages, plural(continuityBreaks, "row where the running balance does not follow from the previous row", "rows where the running balance does not follow from the previous row"))
	}
	if ps.OpeningBalance == nil {
		v.Messages = append(v.Messages, "opening balance not found; cannot verify the closing balance")
		return v
	}
	computed := *ps.OpeningBalance + credits - debits
	v.ComputedClosing = &computed
	stated := ps.ClosingBalance
	if stated == nil && lastBalance != nil {
		stated = lastBalance
		v.Messages = append(v.Messages, "closing balance taken from the last row of the balance column")
	}
	if stated == nil {
		v.Messages = append(v.Messages, "closing balance not found; cannot verify the computed closing balance")
		return v
	}
	v.Difference = *stated - computed
	if v.Difference == 0 {
		v.BalanceCheck = "ok"
	} else {
		v.BalanceCheck = "mismatch"
		v.Messages = append(v.Messages, "stated closing balance differs from opening + credits - debits")
	}
	if ps.ClosingBalance != nil && lastBalance != nil && *ps.ClosingBalance != *lastBalance {
		v.Messages = append(v.Messages, "stated closing balance differs from the last running balance")
	}
	return v
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}

// sortRows orders rows top to bottom (descending Y in PDF space) and
// fragments left to right.
func sortRows(rows []Row) {
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Y > rows[j].Y })
	for i := range rows {
		fr := rows[i].Fragments
		sort.SliceStable(fr, func(a, b int) bool { return fr[a].X < fr[b].X })
	}
}
