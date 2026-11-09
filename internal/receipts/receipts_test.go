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

// Text as Tesseract reads the mPay success screen. The From/To columns come
// out interleaved, so no accounts are expected.
const mpayText = `10:59 @ = koe cuttl C5):
TRANSACTION SUCCESSFUL
Nu.10.0
RRNO : 630911234567
From : Jos
SENDER NAME XXXXX5678
XXXXX1234 RECEIVER NAME
Bank of Bhutan Ltd.
Date : Thursday, 05 November 2026
Time : 10:59:20 AM
Purpose : Personal transfer
Remarks :`

func TestParseMPay(t *testing.T) {
	r := Parse(mpayText)
	want := Receipt{Recognised: true, Bank: "mPay", Amount: 1000, JournalNo: "630911234567",
		PaymentType: "Personal transfer", Date: "2026-11-05", Time: "10:59:20"}
	if r != want {
		t.Fatalf("\n got %+v\nwant %+v", r, want)
	}
}

func TestParseMPayTolerant(t *testing.T) {
	// Thousands separator, OCR'd "O" for zero in the RRNO and day, no weekday, afternoon.
	r := Parse("TRANSACTION SUCCESSFUL\nNu. 1,250.5\nRRNO: 63O911234567\nBank of Bhutan Ltd.\nDate: O5 November 2026\nTime: 3:05 PM\nPurpose: Bill payment\n")
	if !r.Recognised || r.Bank != "mPay" || r.Amount != 125050 || r.JournalNo != "630911234567" ||
		r.PaymentType != "Bill payment" || r.Date != "2026-11-05" || r.Time != "15:05:00" {
		t.Fatalf("tolerant mPay parse: %+v", r)
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

func TestParseOtherBanks(t *testing.T) {
	cases := []struct {
		name, text, bank, ref, date string
		amount                      int64
	}{
		{"BNB", "Bhutan National Bank\nFund Transfer Successful\nAmount: Nu. 2,500.00\nReference No: BNB2611090001\nDate: 09 Nov 2026\nTime: 02:15:30 PM\nRemarks: House rent\n", "BNB", "BNB2611090001", "2026-11-09", 250000},
		{"Druk PNB", "Druk PNB Bank Ltd\nTransaction Successful\nNu. 750\nTransaction ID: 98765432\n09-Nov-2026 10:05 AM\n", "Druk PNB", "98765432", "2026-11-09", 75000},
		{"BDBL", "BDBL mBanking\nPayment completed\nAmount Nu.1,200.50\nTxn ID: TX55512345\nDate: 8 November 2026\n", "BDBL", "TX55512345", "2026-11-08", 120050},
		{"T Bank", "T Bank\nTransfer successful\nBTN 300\nRef: TB7712345\n07 Nov 2026 18:22\n", "T Bank", "TB7712345", "2026-11-07", 30000},
		{"DK Bank", "DK Bank\nPayment Successful\nNu. 99\nReference Number: DK123456789\n06 Nov 2026\n", "DK Bank", "DK123456789", "2026-11-06", 9900},
		{"unnamed app", "Transaction Successful\nAmount: Nu. 1,000\nRef No: 445566778\nDate: 05 Nov 2026\n", "", "445566778", "2026-11-05", 100000},
	}
	for _, c := range cases {
		r := Parse(c.text)
		if !r.Recognised || r.Bank != c.bank || r.Amount != c.amount || r.JournalNo != c.ref || r.Date != c.date {
			t.Errorf("%s: got %+v", c.name, r)
		}
	}
	// The existing templates still win for their own screens.
	if r := Parse(mpayText); r.Bank != "mPay" {
		t.Errorf("mPay screen read as %q", r.Bank)
	}
	// A shop receipt with an amount but no bank and no success word is not a payment.
	if r := Parse("City Mart\nTotal Nu. 450\nThank you"); r.Recognised {
		t.Errorf("shop receipt recognised: %+v", r)
	}
}
