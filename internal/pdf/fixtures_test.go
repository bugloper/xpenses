package pdf

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Run `go test ./internal/pdf -run TestGenerateFixtures -update` to regenerate
// the committed fixtures in testdata/statements.
var update = flag.Bool("update", false, "regenerate testdata/statements fixtures")

const (
	fixturePassword = "0101" // "DDMM of your DOB" for the synthetic holder
	fixtureDir      = "../../testdata/statements"
)

// fixtureRow is one synthetic statement line. Amounts are minor units.
type fixtureRow struct {
	date, valueDate, desc, cont, ref string
	debit, credit                    int64
}

// fixtureRows is the deterministic synthetic ledger shared by the generator
// and the assertions. Names and numbers are invented.
var fixtureRows = []fixtureRow{
	{"01-10-2026", "01-10-2026", "SALARY CREDIT OCT 2026 DRUK DEMO", "", "SAL0001", 0, 6500000},
	{"02-10-2026", "02-10-2026", "MBOB/TRF/ TO 2010XXXX0001 RENT", "", "MB100201", 1500000, 0},
	{"03-10-2026", "03-10-2026", "POS PURCHASE EIGHT ELEVEN STORE", "THIMPHU BHUTAN (wrapped line)", "POS77001", 184550, 0},
	{"04-10-2026", "04-10-2026", "ATM WDL BOB ATM NORZIN LAM", "", "ATM55012", 500000, 0},
	{"05-10-2026", "05-10-2026", "BPC ELECTRICITY BILL SEPT", "", "BPC00981", 123475, 0},
	{"06-10-2026", "06-10-2026", "MBOB/TRF/ FROM 2010XXXX0002 LUNCH", "", "MB100345", 0, 45000},
	{"07-10-2026", "07-10-2026", "TASHICELL POSTPAID", "", "TC004411", 99900, 0},
	{"08-10-2026", "08-10-2026", "POS PURCHASE MY MART CHANGZAMTOG", "", "POS77002", 234000, 0},
	{"09-10-2026", "09-10-2026", "INTEREST CREDIT", "", "INT00001", 0, 12345},
	{"10-10-2026", "10-10-2026", "MBOB/QR/ KARMA GENERAL SHOP", "", "QR000123", 65000, 0},
	{"11-10-2026", "11-10-2026", "MBOB/TRF/ TO 1010XXXX0003 SAVINGS", "", "MB100400", 1000000, 0},
	{"12-10-2026", "12-10-2026", "FUEL BOD PUMP OLAKHA", "", "POS77003", 250000, 0},
	{"13-10-2026", "13-10-2026", "MBOB/QR/ AMBIENT CAFE", "", "QR000124", 42000, 0},
	{"14-10-2026", "14-10-2026", "BHUTAN TELECOM BROADBAND", "", "BT000555", 149900, 0},
	{"15-10-2026", "15-10-2026", "MBOB/TRF/ FROM 2010XXXX0004 REFUND", "", "MB100512", 0, 184550},
	{"16-10-2026", "16-10-2026", "POS PURCHASE 8 ELEVEN MOTITHANG", "", "POS77004", 76500, 0},
	{"17-10-2026", "17-10-2026", "MBOB/QR/ ZOMBALA RESTAURANT", "", "QR000125", 58000, 0},
	{"18-10-2026", "18-10-2026", "CHEQUE DEPOSIT 004412", "", "CHQ004412", 0, 350000},
	{"19-10-2026", "19-10-2026", "MBOB/TRF/ TO 2010XXXX0005 TUITION", "", "MB100600", 800000, 0},
	{"20-10-2026", "20-10-2026", "POS PURCHASE DRUK PHARMACY", "", "POS77005", 32000, 0},
	{"21-10-2026", "21-10-2026", "MBOB/QR/ GREEN GROCERS", "", "QR000126", 88800, 0},
	{"22-10-2026", "22-10-2026", "SMS BANKING CHARGES", "", "CHG00001", 2500, 0},
	{"23-10-2026", "23-10-2026", "MBOB/TRF/ FROM 2010XXXX0006 GIFT", "", "MB100777", 0, 500000},
	{"24-10-2026", "24-10-2026", "POS PURCHASE BOOK WORLD", "", "POS77006", 45000, 0},
	{"25-10-2026", "25-10-2026", "MBOB/QR/ FOLK HERITAGE CAFE", "", "QR000127", 36000, 0},
	{"26-10-2026", "26-10-2026", "ATM WDL BOB ATM PARO", "", "ATM55013", 300000, 0},
	{"27-10-2026", "27-10-2026", "MBOB/TRF/ TO 2010XXXX0007 LOAN EMI", "", "MB100801", 1250000, 0},
	{"28-10-2026", "28-10-2026", "POS PURCHASE KARMA FEED", "", "POS77007", 29000, 0},
	{"29-10-2026", "29-10-2026", "MBOB/QR/ CITY BUS RECHARGE", "", "QR000128", 10000, 0},
	{"30-10-2026", "30-10-2026", "MBOB/TRF/ FROM 2010XXXX0008 SPLIT", "", "MB100900", 0, 120000},
	{"31-10-2026", "31-10-2026", "ACCOUNT MAINTENANCE FEE", "", "CHG00002", 5000, 0},
}

const (
	fixtureOpening  int64 = 10000000 // Nu. 100,000.00
	fixtureHolder         = "TASHI WANGMO"
	fixtureAccount        = "201234567890"
	fixturePeriodFr       = "01-10-2026"
	fixturePeriodTo       = "31-10-2026"
)

func fixtureTotals() (debits, credits, closing int64) {
	for _, r := range fixtureRows {
		debits += r.debit
		credits += r.credit
	}
	return debits, credits, fixtureOpening + credits - debits
}

func fmtMinor(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	whole := v / 100
	s := fmt.Sprintf("%d", whole)
	// thousands separators
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	out := fmt.Sprintf("%s.%02d", b.String(), v%100)
	if neg {
		return "-" + out
	}
	return out
}

// genBOBFixture renders a synthetic two-page BOB-like statement with fpdf.
func genBOBFixture(t testing.TB) []byte {
	t.Helper()
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.SetAutoPageBreak(false, 10)
	pdf.AliasNbPages("")

	widths := []float64{20, 20, 62, 22, 20, 20, 26}
	headers := []string{"Txn Date", "Value Date", "Description", "Ref No", "Debit", "Credit", "Balance"}
	aligns := []string{"L", "L", "L", "L", "R", "R", "R"}

	preamble := func() {
		pdf.SetFont("Helvetica", "B", 12)
		pdf.CellFormat(190, 7, "BANK OF BHUTAN LIMITED", "", 1, "C", false, 0, "")
		pdf.SetFont("Helvetica", "", 9)
		pdf.CellFormat(190, 5, "Statement of Account", "", 1, "C", false, 0, "")
		pdf.Ln(2)
		pdf.CellFormat(95, 5, "Account Holder : "+fixtureHolder, "", 0, "L", false, 0, "")
		pdf.CellFormat(95, 5, "Account No : "+fixtureAccount, "", 1, "L", false, 0, "")
		pdf.CellFormat(95, 5, "Currency : Nu.", "", 0, "L", false, 0, "")
		pdf.CellFormat(95, 5, "Statement Period : "+fixturePeriodFr+" to "+fixturePeriodTo, "", 1, "L", false, 0, "")
		pdf.CellFormat(95, 5, "Branch : Thimphu Main (synthetic)", "", 0, "L", false, 0, "")
		pdf.CellFormat(95, 5, "Opening Balance : "+fmtMinor(fixtureOpening), "", 1, "L", false, 0, "")
		pdf.Ln(2)
	}
	header := func() {
		pdf.SetFont("Helvetica", "B", 8)
		for i, h := range headers {
			pdf.CellFormat(widths[i], 6, h, "B", 0, aligns[i], false, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont("Helvetica", "", 8)
	}
	cells := func(vals []string) {
		for i, v := range vals {
			pdf.CellFormat(widths[i], 5, v, "", 0, aligns[i], false, 0, "")
		}
		pdf.Ln(-1)
	}
	footer := func() {
		pdf.SetY(-15)
		pdf.SetFont("Helvetica", "I", 7)
		pdf.CellFormat(190, 5, fmt.Sprintf("Page %d of {nb}", pdf.PageNo()), "", 1, "C", false, 0, "")
		pdf.CellFormat(190, 4, "This is a computer generated statement and does not require a signature.", "", 1, "C", false, 0, "")
	}

	pdf.AddPage()
	preamble()
	header()
	balance := fixtureOpening
	cells([]string{"", "", "Opening Balance", "", "", "", fmtMinor(balance)})
	for i, r := range fixtureRows {
		if i == 18 {
			footer()
			pdf.AddPage()
			preamble()
			header()
		}
		balance += r.credit - r.debit
		deb, cred := "", ""
		if r.debit > 0 {
			deb = fmtMinor(r.debit)
		}
		if r.credit > 0 {
			cred = fmtMinor(r.credit)
		}
		cells([]string{r.date, r.valueDate, r.desc, r.ref, deb, cred, fmtMinor(balance)})
		if r.cont != "" {
			cells([]string{"", "", r.cont, "", "", "", ""})
		}
	}
	debits, credits, closing := fixtureTotals()
	cells([]string{"", "", "Closing Balance", "", "", "", fmtMinor(closing)})
	pdf.SetFont("Helvetica", "B", 8)
	cells([]string{"", "", "Total", "", fmtMinor(debits), fmtMinor(credits), ""})
	footer()

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		t.Fatalf("fpdf: %v", err)
	}
	return buf.Bytes()
}

// encryptPDF encrypts data with AES-256 using pdfcpu (what a modern bank
// export would use).
func encryptPDF(t testing.TB, data []byte, userPW string) []byte {
	t.Helper()
	conf, err := api.LoadConfiguration(api.ConfigurationOptions{Mode: api.ConfigurationModeStateless})
	if err != nil {
		t.Fatal(err)
	}
	conf.UserPW = userPW
	conf.OwnerPW = "owner-" + userPW
	conf.EncryptUsingAES = true
	conf.EncryptKeyLength = 256
	conf.ValidationMode = model.ValidationRelaxed
	var out bytes.Buffer
	if err := api.Encrypt(context.Background(), bytes.NewReader(data), &out, conf); err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	return out.Bytes()
}

// encryptPDFRC4 encrypts with 128-bit RC4 (older exports).
func encryptPDFRC4(t testing.TB, data []byte, userPW string) []byte {
	t.Helper()
	conf, err := api.LoadConfiguration(api.ConfigurationOptions{Mode: api.ConfigurationModeStateless})
	if err != nil {
		t.Fatal(err)
	}
	conf.UserPW = userPW
	conf.OwnerPW = "owner-" + userPW
	conf.EncryptUsingAES = false
	conf.EncryptKeyLength = 128
	var out bytes.Buffer
	if err := api.Encrypt(context.Background(), bytes.NewReader(data), &out, conf); err != nil {
		t.Fatalf("encrypt rc4: %v", err)
	}
	return out.Bytes()
}

func TestGenerateFixtures(t *testing.T) {
	if !*update {
		t.Skip("pass -update to regenerate fixtures")
	}
	plain := genBOBFixture(t)
	if err := os.MkdirAll(fixtureDir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(name string, b []byte) {
		if err := os.WriteFile(filepath.Join(fixtureDir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("bob_synthetic.pdf", plain)
	write("bob_synthetic_encrypted.pdf", encryptPDF(t, plain, fixturePassword))
	doc, err := Extract(bytes.NewReader(plain), int64(len(plain)), "")
	if err != nil {
		t.Fatal(err)
	}
	var txt strings.Builder
	for i, p := range doc.Pages {
		if i > 0 {
			txt.WriteString("\f\n")
		}
		for _, l := range p.Lines {
			txt.WriteString(l)
			txt.WriteByte('\n')
		}
	}
	write("bob_synthetic.txt", []byte(txt.String()))
}

func readFixture(t testing.TB, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(fixtureDir, name))
	if err != nil {
		t.Fatalf("fixture %s missing (run with -update): %v", name, err)
	}
	return b
}
