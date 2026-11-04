package receipts

import "testing"

// Text as Tesseract reads the mBoB success screen, including its usual
// quirks: the "mBoB" heading, stray colon spacing, a dash in the journal number.
const mbobText = `1:38 KB/s all 84
mBoB * now
Fund Transfer Via Beneficiary Succe...
MOBILE BANKING

Fund Transfer Via Beneficiary
Successful

Amount : Nu. 10
Jrnl. No : 551-428182
From A/c : 10XXXXX43
To A/c : 30XXXXX34
Payment Type : Personal Transfer
Date : 05 Nov 2026
Time : 01:38:10 AM

OK
Save Share`

func TestParseMBoB(t *testing.T) {
	r := Parse(mbobText)
	want := Receipt{Recognised: true, Bank: "mBoB", Amount: 1000, JournalNo: "551-428182", FromAccount: "10XXXXX43",
		ToAccount: "30XXXXX34", PaymentType: "Personal Transfer", Date: "2026-11-05", Time: "01:38:10"}
	if r != want {
		t.Fatalf("\n got %+v\nwant %+v", r, want)
	}
}

func TestParseMBoBTolerant(t *testing.T) {
	// Decimal amount, no space after the colons, OCR'd en dash, afternoon time.
	r := Parse("mBoB\nAmount:Nu.1,250.50\nJrnl No:551–428182\nPayment Type:Bill Payment\nDate:5 November 2026\nTime:1:05 PM")
	if !r.Recognised || r.Amount != 125050 || r.JournalNo != "551-428182" || r.PaymentType != "Bill Payment" ||
		r.Date != "2026-11-05" || r.Time != "13:05:00" {
		t.Fatalf("tolerant parse: %+v", r)
	}
}

// What Tesseract actually read from the real screenshot: "Jrni" and "O5".
func TestParseMBoBOCRLookalikes(t *testing.T) {
	r := Parse("Fund Transfer Via Beneficiary\nSuccessful\nAmount : Nu. 1O\nJrni. No : 551-428182\nFrom A/c : 10XXXXX43\nTo A/c : 30XXXXX34\nPayment Type : Personal Transfer\nDate : O5 Nov 2026\nTime : 01:38:10 AM")
	if !r.Recognised || r.Amount != 1000 || r.JournalNo != "551-428182" || r.Date != "2026-11-05" || r.Time != "01:38:10" {
		t.Fatalf("lookalikes: %+v", r)
	}
}

func TestParseUnknownScreen(t *testing.T) {
	r := Parse("Groceries\nTotal 450\nThank you for shopping")
	if r.Recognised || r.Bank != "" || r.Amount != 0 {
		t.Fatalf("unknown screen must not be recognised: %+v", r)
	}
}

func TestParseMinor(t *testing.T) {
	for in, want := range map[string]int64{"10": 1000, "1,250": 125000, "85.4": 8540, "85.40": 8540, "0.05": 5, "x": 0} {
		if got := parseMinor(in); got != want {
			t.Errorf("parseMinor(%q) = %d want %d", in, got, want)
		}
	}
}
