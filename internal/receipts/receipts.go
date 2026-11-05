// Package receipts turns the OCR text of a payment-app success screen into
// the fields worth keeping on a transaction. One template per app (mBoB and
// mPay); a screen that matches none yields a Receipt with Recognised=false.
package receipts

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Receipt is what a success screen tells us. Amount is in minor units and 0
// when the screen did not show one (or OCR could not read it).
type Receipt struct {
	Recognised  bool   `json:"recognised"`
	Bank        string `json:"bank"`
	Amount      int64  `json:"amount"`
	JournalNo   string `json:"journal_no"` // mBoB's "Jrnl. No", mPay's "RRNO"
	FromAccount string `json:"from_account"`
	ToAccount   string `json:"to_account"`
	PaymentType string `json:"payment_type"`
	Date        string `json:"date"` // YYYY-MM-DD
	Time        string `json:"time"` // HH:MM:SS, 24h
}

// Parse recognises the app from the text and extracts its fields.
func Parse(text string) Receipt {
	norm := normalise(text)
	switch {
	case isMPay(norm):
		return parseMPay(norm)
	case isMBoB(norm):
		return parseMBoB(norm)
	default:
		return Receipt{}
	}
}

// normalise flattens OCR output: one space between tokens, ASCII colons for
// the lookalikes OCR produces, and the common "0"/"O" confusions in labels left
// alone (the regexes tolerate them).
func normalise(s string) string {
	s = strings.ReplaceAll(s, "：", ":")
	s = strings.ReplaceAll(s, "¦", "|")
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.Join(strings.Fields(l), " ")
		if l != "" {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}

// ---- mBoB (Bank of Bhutan mobile banking) ----------------------------------

var (
	// OCR swaps look-alikes freely: "Jrnl" reads as "Jrni", "05" as "O5". The
	// label patterns and the digit captures allow for that; fixDigits repairs
	// the captured numbers.
	reMBoB     = regexp.MustCompile(`(?i)\bm\s?bob\b|mobile banking|jrn[li1]\.?\s*no|fund transfer`)
	reAmount   = regexp.MustCompile(`(?i)amount\s*[:;]?\s*(?:nu\.?\s*)?([0-9OoIl][0-9OoIl,]*(?:\.[0-9OoIl]{1,2})?)`)
	reJournal  = regexp.MustCompile(`(?i)jrn[li1]\.?\s*no\.?\s*[:;]?\s*([0-9OoIl]{2,4}\s?[-–—]\s?[0-9OoIl]{4,8})`)
	reFromAcct = regexp.MustCompile(`(?i)from\s*a/?c\s*[:;]?\s*([0-9xX*]{6,})`)
	reToAcct   = regexp.MustCompile(`(?i)to\s*a/?c\s*[:;]?\s*([0-9xX*]{6,})`)
	rePayType  = regexp.MustCompile(`(?i)payment\s*type\s*[:;]?\s*([A-Za-z][A-Za-z /&-]{2,40}?)\s*(?:\n|$)`)
	// The date may carry a weekday ("Thursday, 05 November 2026"); only the
	// day, month and year are captured.
	reDate      = regexp.MustCompile(`(?i)date\s*[:;]?\s*(?:[A-Za-z]{3,9},?\s+)?([0-9OoIl]{1,2}\s+[A-Za-z]{3,9},?\s+[0-9OoIl]{4})`)
	reTime      = regexp.MustCompile(`(?i)time\s*[:;]?\s*([0-9OoIl]{1,2}:[0-9OoIl]{2}(?::[0-9OoIl]{2})?\s*(?:[AP]\.?M\.?)?)`)
	reSpacesAll = regexp.MustCompile(`\s+`)
)

func isMBoB(text string) bool { return reMBoB.MatchString(text) }

// fixDigits repairs OCR look-alikes inside a token that must be numeric:
// O/o → 0, I/l → 1. Letters stay letters elsewhere (month names, labels).
func fixDigits(s string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case 'O', 'o':
			return '0'
		case 'I', 'l':
			return '1'
		}
		return r
	}, s)
}

// fixDigitsInNumbers applies fixDigits to the numeric-looking words of a
// date such as "O5 Nov 2O26", leaving the month name alone.
func fixDigitsInNumbers(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) <= 4 && strings.IndexFunc(w, func(r rune) bool { return r >= '0' && r <= '9' }) >= 0 {
			words[i] = fixDigits(w)
		}
	}
	return strings.Join(words, " ")
}

func parseMBoB(text string) Receipt {
	r := Receipt{Recognised: true, Bank: "mBoB"}
	if m := reAmount.FindStringSubmatch(text); m != nil {
		r.Amount = parseMinor(fixDigits(m[1]))
	}
	if m := reJournal.FindStringSubmatch(text); m != nil {
		r.JournalNo = fixDigits(reSpacesAll.ReplaceAllString(strings.NewReplacer("–", "-", "—", "-").Replace(m[1]), ""))
	}
	if m := reFromAcct.FindStringSubmatch(text); m != nil {
		r.FromAccount = strings.ToUpper(m[1])
	}
	if m := reToAcct.FindStringSubmatch(text); m != nil {
		r.ToAccount = strings.ToUpper(m[1])
	}
	if m := rePayType.FindStringSubmatch(text); m != nil {
		r.PaymentType = strings.TrimSpace(m[1])
	}
	if m := reDate.FindStringSubmatch(text); m != nil {
		r.Date = parseDate(fixDigitsInNumbers(m[1]))
	}
	if m := reTime.FindStringSubmatch(text); m != nil {
		r.Time = parseTime(fixDigits(m[1]))
	}
	return r
}

// ---- mPay (Bank of Bhutan's mPay app) --------------------------------------

var (
	// The mPay success screen has no "Amount" label: the amount stands alone
	// as "Nu.10.0" under "TRANSACTION SUCCESSFUL", and the reference is an
	// "RRNO". The sender and receiver are two columns, which OCR interleaves,
	// so the accounts are not taken from this screen.
	reMPay       = regexp.MustCompile(`(?i)\brr\s?no\b|bank of bhutan ltd|\bm\s?pay\b`)
	reMPayAmount = regexp.MustCompile(`(?i)\bnu\.?\s*([0-9OoIl][0-9OoIl,]*(?:\.[0-9OoIl]{1,2})?)\b`)
	reRRNO       = regexp.MustCompile(`(?i)\brr\s?no\.?\s*[:;]?\s*([0-9OoIl]{8,16})\b`)
	rePurpose    = regexp.MustCompile(`(?i)purpose\s*[:;]?\s*([A-Za-z][A-Za-z /&-]{2,40}?)\s*(?:\n|$)`)
)

func isMPay(text string) bool { return reMPay.MatchString(text) }

func parseMPay(text string) Receipt {
	r := Receipt{Recognised: true, Bank: "mPay"}
	if m := reMPayAmount.FindStringSubmatch(text); m != nil {
		r.Amount = parseMinor(fixDigits(m[1]))
	}
	if m := reRRNO.FindStringSubmatch(text); m != nil {
		r.JournalNo = fixDigits(m[1])
	}
	if m := rePurpose.FindStringSubmatch(text); m != nil {
		r.PaymentType = strings.TrimSpace(m[1])
	}
	if m := reDate.FindStringSubmatch(text); m != nil {
		r.Date = parseDate(fixDigitsInNumbers(strings.ReplaceAll(m[1], ",", "")))
	}
	if m := reTime.FindStringSubmatch(text); m != nil {
		r.Time = parseTime(fixDigits(m[1]))
	}
	return r
}

// parseMinor turns "1,250.50" into 125050 with integer arithmetic only.
func parseMinor(s string) int64 {
	s = strings.ReplaceAll(s, ",", "")
	whole, frac, _ := strings.Cut(s, ".")
	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0
	}
	switch len(frac) {
	case 0:
		return w * 100
	case 1:
		f, _ := strconv.ParseInt(frac, 10, 64)
		return w*100 + f*10
	default:
		f, _ := strconv.ParseInt(frac[:2], 10, 64)
		return w*100 + f
	}
}

// parseDate accepts "05 Nov 2026" / "5 November 2026" and returns YYYY-MM-DD.
func parseDate(s string) string {
	s = reSpacesAll.ReplaceAllString(strings.TrimSpace(s), " ")
	for _, layout := range []string{"2 Jan 2006", "2 January 2006"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Format("2006-01-02")
		}
	}
	return ""
}

// parseTime accepts "01:38:10 AM", "1:38 PM" or "13:38:10" and returns HH:MM:SS.
func parseTime(s string) string {
	s = strings.ToUpper(reSpacesAll.ReplaceAllString(strings.TrimSpace(s), " "))
	s = strings.NewReplacer("A.M.", "AM", "P.M.", "PM").Replace(s)
	for _, layout := range []string{"3:04:05 PM", "3:04 PM", "15:04:05", "15:04"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Format("15:04:05")
		}
	}
	return ""
}
