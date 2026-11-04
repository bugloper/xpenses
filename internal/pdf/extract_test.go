package pdf

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	ltpdf "github.com/ledongthuc/pdf"
)

func extractBytes(t *testing.T, data []byte, pw string) (*Document, error) {
	t.Helper()
	return Extract(bytes.NewReader(data), int64(len(data)), pw)
}

func TestExtractNotPDF(t *testing.T) {
	for _, data := range [][]byte{[]byte("hello world"), {}, []byte("PK\x03\x04 not a pdf")} {
		if _, err := extractBytes(t, data, ""); !errors.Is(err, ErrNotPDF) {
			t.Errorf("%q: want ErrNotPDF got %v", data, err)
		}
	}
}

func TestExtractPlainFixture(t *testing.T) {
	doc, err := extractBytes(t, readFixture(t, "bob_synthetic.pdf"), "")
	if err != nil {
		t.Fatal(err)
	}
	if doc.Source != "go" || !doc.Positioned || len(doc.Pages) != 2 {
		t.Fatalf("source=%s positioned=%v pages=%d", doc.Source, doc.Positioned, len(doc.Pages))
	}
	if doc.Pages[0].Width < 590 || doc.Pages[0].Width > 600 {
		t.Errorf("A4 width expected, got %f", doc.Pages[0].Width)
	}
	joined := strings.Join(doc.Lines(), "\n")
	for _, want := range []string{"BANK OF BHUTAN LIMITED", "Txn Date", "Opening Balance", "Closing Balance", "Page 2 of 2"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in extracted text", want)
		}
	}
	// A header row must come out as one fragment per label.
	var header *Row
	for i := range doc.Pages[0].Rows {
		if strings.HasPrefix(doc.Pages[0].Rows[i].Text(), "Txn Date") {
			header = &doc.Pages[0].Rows[i]
			break
		}
	}
	if header == nil || len(header.Fragments) != 7 {
		t.Fatalf("header row fragments: %+v", header)
	}
	for i := 1; i < len(header.Fragments); i++ {
		if header.Fragments[i].X <= header.Fragments[i-1].Right() {
			t.Errorf("header fragments overlap: %+v", header.Fragments)
		}
	}
}

// TestExtractEncrypted proves the pdfcpu decrypt -> ledongthuc extract path
// for AES-256 and RC4-128 files generated on the fly.
func TestExtractEncrypted(t *testing.T) {
	plain := genBOBFixture(t)
	variants := map[string][]byte{
		"aes256": encryptPDF(t, plain, fixturePassword),
		"rc4":    encryptPDFRC4(t, plain, fixturePassword),
	}
	for name, enc := range variants {
		t.Run(name, func(t *testing.T) {
			if bytes.Contains(enc, []byte("BANK OF BHUTAN")) {
				t.Fatal("encrypted file leaks plaintext")
			}
			if _, err := extractBytes(t, enc, ""); !errors.Is(err, ErrPasswordRequired) {
				t.Errorf("no password: want ErrPasswordRequired got %v", err)
			}
			if _, err := extractBytes(t, enc, "9999"); !errors.Is(err, ErrPasswordIncorrect) {
				t.Errorf("bad password: want ErrPasswordIncorrect got %v", err)
			}
			doc, err := extractBytes(t, enc, fixturePassword)
			if err != nil {
				t.Fatalf("correct password: %v", err)
			}
			if doc.Source != "go" {
				t.Errorf("expected the Go extractor, got %s", doc.Source)
			}
			ps, err := (BOBStatementParser{}).Parse(doc)
			if err != nil {
				t.Fatal(err)
			}
			if len(ps.Transactions) != len(fixtureRows) {
				t.Errorf("want %d rows got %d", len(fixtureRows), len(ps.Transactions))
			}
		})
	}
}

func TestExtractCommittedEncryptedFixture(t *testing.T) {
	enc := readFixture(t, "bob_synthetic_encrypted.pdf")
	if _, err := extractBytes(t, enc, ""); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("want ErrPasswordRequired got %v", err)
	}
	doc, err := extractBytes(t, enc, fixturePassword)
	if err != nil {
		t.Fatal(err)
	}
	ps, err := (BOBStatementParser{}).Parse(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(ps.Transactions) != len(fixtureRows) || Validate(ps).BalanceCheck != "ok" {
		t.Fatalf("encrypted fixture parse: %d rows, %+v", len(ps.Transactions), Validate(ps))
	}
}

func TestExtractNoText(t *testing.T) {
	// An image-only / empty page has nothing to extract: this is where OCR
	// would plug in.
	p := fpdf.New("P", "mm", "A4", "")
	p.AddPage()
	p.SetDrawColor(0, 0, 0)
	p.Rect(10, 10, 100, 100, "D")
	var buf bytes.Buffer
	if err := p.Output(&buf); err != nil {
		t.Fatal(err)
	}
	if _, err := extractBytes(t, buf.Bytes(), ""); !errors.Is(err, ErrNoText) {
		t.Fatalf("want ErrNoText got %v", err)
	}
}

func TestGroupRows(t *testing.T) {
	g := func(s string, x, y, w, size float64) ltpdf.Text {
		return ltpdf.Text{S: s, X: x, Y: y, W: w, FontSize: size}
	}
	texts := []ltpdf.Text{
		// Row 1 (y=700): "AB" then a word gap then "C", then a column gap then "9.00".
		g("A", 10, 700, 5, 10), g("B", 15, 700, 5, 10),
		g("C", 23, 700.5, 5, 10), // gap 3pt = 0.3em -> space inserted
		g("9", 60, 700, 5, 10), g(".", 65, 700, 2, 10), g("0", 67, 700, 5, 10), g("0", 72, 700, 5, 10),
		// Row 2 (y=680): emitted out of order.
		g("Z", 10, 680, 5, 10),
		// Zero-width glyphs (no /Widths): all at the same X.
		g("Q", 100, 680, 0, 10), g("R", 100, 680, 0, 10),
	}
	rows := groupRows(texts)
	if len(rows) != 2 {
		t.Fatalf("want 2 rows got %d: %+v", len(rows), rows)
	}
	r1 := rows[0]
	if r1.Y < 700 || r1.Y > 701 || len(r1.Fragments) != 2 {
		t.Fatalf("row 1: %+v", r1)
	}
	if r1.Fragments[0].Text != "AB C" || r1.Fragments[1].Text != "9.00" {
		t.Errorf("row 1 fragments: %q %q", r1.Fragments[0].Text, r1.Fragments[1].Text)
	}
	if r1.Fragments[0].X != 10 || r1.Fragments[0].Right() != 28 {
		t.Errorf("row 1 fragment extent: %+v", r1.Fragments[0])
	}
	r2 := rows[1]
	if len(r2.Fragments) != 2 || r2.Fragments[0].Text != "Z" || r2.Fragments[1].Text != "QR" {
		t.Errorf("row 2 fragments: %+v", r2.Fragments)
	}
	if r2.Fragments[1].W <= 0 {
		t.Errorf("zero-width glyphs should get an estimated extent: %+v", r2.Fragments[1])
	}
}

func TestSplitLayout(t *testing.T) {
	parts := splitLayout("  01-10-2026  Opening Balance   1,000.00 Cr")
	want := []layoutPart{{2, "01-10-2026"}, {14, "Opening Balance"}, {32, "1,000.00 Cr"}}
	if len(parts) != len(want) {
		t.Fatalf("got %+v", parts)
	}
	for i := range want {
		if parts[i] != want[i] {
			t.Errorf("part %d: got %+v want %+v", i, parts[i], want[i])
		}
	}
	if got := splitLayout("   "); len(got) != 0 {
		t.Errorf("blank line: %+v", got)
	}
}

func TestDocumentFromLines(t *testing.T) {
	doc := DocumentFromLines([][]string{{"a  b", ""}, {"c"}}, "x")
	if doc.Positioned || doc.Source != "x" || len(doc.Pages) != 2 {
		t.Fatalf("%+v", doc)
	}
	if len(doc.Pages[0].Rows) != 1 || len(doc.Pages[0].Rows[0].Fragments) != 2 || doc.Pages[0].Rows[0].Fragments[1].X != 3 {
		t.Errorf("rows: %+v", doc.Pages[0].Rows)
	}
	if !doc.HasText() || len(doc.Lines()) != 3 {
		t.Errorf("lines: %v", doc.Lines())
	}
}
