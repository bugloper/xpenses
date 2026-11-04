package pdf

import (
	"regexp"
	"strings"
	"time"
)

// dateLayouts are tried in order. Two-digit years are accepted last so a
// four-digit year never gets truncated.
var dateLayouts = []string{
	"02-01-2006", "02/01/2006", "02.01.2006",
	"02-Jan-2006", "02/Jan/2006", "02 Jan 2006", "02-January-2006", "02 January 2006",
	"2006-01-02", "2006/01/02",
	"02-Jan-06", "02 Jan 06", "02-01-06", "02/01/06",
}

// dateToken matches anything that could be a statement date, used to find
// dates inside free text (statement period lines, merged cells).
var dateToken = regexp.MustCompile(`(?i)\b(\d{1,2}[-/. ](?:\d{1,2}|[a-z]{3,9})[-/. ]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})\b`)

// ParseDate converts the date formats seen on bank statements to YYYY-MM-DD.
func ParseDate(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", false
	}
	s = normaliseMonth(s)
	// Go's "02"/"01" layouts need two digits; pad "5 Oct 2026" / "5/1/2026".
	s = leadDigitRe.ReplaceAllString(s, "0$1$2")
	s = midDigitRe.ReplaceAllString(s, "${1}0$2$3")
	for _, layout := range dateLayouts {
		t, err := time.Parse(layout, s)
		if err != nil {
			continue
		}
		if t.Year() < 1990 || t.Year() > 2100 {
			return "", false
		}
		return t.Format("2006-01-02"), true
	}
	return "", false
}

// normaliseMonth turns "05-OCT-2026" / "05 october 2026" into the Title-case
// month names time.Parse expects.
func normaliseMonth(s string) string {
	return monthRe.ReplaceAllStringFunc(s, func(m string) string {
		lower := strings.ToLower(m)
		if lower == "sept" {
			// Go's "Jan" layout only knows three-letter abbreviations.
			lower = "sep"
		}
		return strings.ToUpper(lower[:1]) + lower[1:]
	})
}

var (
	leadDigitRe = regexp.MustCompile(`^(\d)([-/. ])`)
	midDigitRe  = regexp.MustCompile(`([-/. ])(\d)([-/. ])`)
)

var monthRe = regexp.MustCompile(`(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b`)

// FindDate returns the first date-like token in s normalised to YYYY-MM-DD,
// and the remaining text with that token removed.
func FindDate(s string) (date string, rest string, ok bool) {
	loc := dateToken.FindStringIndex(s)
	if loc == nil {
		return "", s, false
	}
	d, ok := ParseDate(s[loc[0]:loc[1]])
	if !ok {
		return "", s, false
	}
	rest = strings.TrimSpace(s[:loc[0]] + " " + s[loc[1]:])
	return d, rest, true
}

// Amount is a parsed monetary value.
type Amount struct {
	Minor int64 // absolute value in minor units
	// Sign is -1 for debit markers (Dr suffix, parentheses, leading/trailing
	// minus), +1 for an explicit credit marker (Cr suffix, leading plus) and 0
	// when the string carried no sign.
	Sign int
	// Truncated is true when more than two decimal places were present and
	// the extra digits were not all zero.
	Truncated bool
}

var (
	amountCurrencyRe = regexp.MustCompile(`(?i)^(?:nu\.?|btn|inr|rs\.?|usd|₹)\s*`)
	amountSuffixRe   = regexp.MustCompile(`(?i)\s*(dr|cr)\.?$`)
	// The integer part must end in a digit: "1,234," is a fragment split
	// mid-number, not 1234.00.
	amountBodyRe  = regexp.MustCompile(`^(\d(?:[\d,]*\d)?)?(?:\.(\d+))?$`)
	amountLooksRe = regexp.MustCompile(`(?i)^[\(\-\+]?\s*(?:nu\.?|btn|inr|rs\.?|usd|₹)?\s*\d[\d,]*(?:\.\d+)?\s*(?:dr|cr)?\.?\s*[\)\-]?$`)
)

// LooksLikeAmount is a cheap pre-check used when classifying fragments.
func LooksLikeAmount(s string) bool {
	s = strings.TrimSpace(s)
	return s != "" && amountLooksRe.MatchString(s)
}

// ParseAmount parses "1,234.50", "1,234.50 Dr", "(1,234.50)", "1234.50-",
// "-1,234.50", "Nu. 1,234.50", "1,23,456.78" into minor units. Decimal digits
// are parsed exactly (no floating point).
func ParseAmount(s string) (Amount, bool) {
	var a Amount
	s = strings.TrimSpace(s)
	if s == "" {
		return a, false
	}
	// Parentheses negative.
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		a.Sign = -1
		s = strings.TrimSpace(s[1 : len(s)-1])
	}
	// Leading sign.
	switch {
	case strings.HasPrefix(s, "-"):
		a.Sign = -1
		s = strings.TrimSpace(s[1:])
	case strings.HasPrefix(s, "+"):
		a.Sign = 1
		s = strings.TrimSpace(s[1:])
	}
	s = amountCurrencyRe.ReplaceAllString(s, "")
	// Leading sign may also follow the currency ("Nu. -12.00").
	if strings.HasPrefix(s, "-") {
		a.Sign = -1
		s = strings.TrimSpace(s[1:])
	}
	// Trailing minus.
	if strings.HasSuffix(s, "-") {
		a.Sign = -1
		s = strings.TrimSpace(s[:len(s)-1])
	}
	// Dr / Cr suffix.
	if m := amountSuffixRe.FindStringSubmatch(s); m != nil {
		if strings.EqualFold(m[1], "dr") {
			a.Sign = -1
		} else {
			a.Sign = 1
		}
		s = strings.TrimSpace(s[:len(s)-len(m[0])])
	}
	m := amountBodyRe.FindStringSubmatch(s)
	if m == nil || (m[1] == "" && m[2] == "") {
		return Amount{}, false
	}
	intPart := strings.ReplaceAll(m[1], ",", "")
	if len(intPart) > 16 {
		return Amount{}, false
	}
	var v int64
	for _, c := range intPart {
		v = v*10 + int64(c-'0')
	}
	v *= 100
	frac := m[2]
	switch {
	case len(frac) == 0:
	case len(frac) == 1:
		v += int64(frac[0]-'0') * 10
	default:
		v += int64(frac[0]-'0')*10 + int64(frac[1]-'0')
		if strings.Trim(frac[2:], "0") != "" {
			a.Truncated = true
		}
	}
	a.Minor = v
	return a, true
}

// MaskAccountNumber keeps only the last four digits.
func MaskAccountNumber(s string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
	if len(digits) <= 4 {
		return digits
	}
	return strings.Repeat("*", len(digits)-4) + digits[len(digits)-4:]
}

// NormaliseCurrency maps the ways BOB writes its currency to ISO codes.
func NormaliseCurrency(s string) string {
	t := strings.ToUpper(strings.Trim(strings.TrimSpace(s), ".:"))
	switch t {
	case "", "NU", "BTN", "NGULTRUM", "NU.":
		return "BTN"
	}
	if len(t) == 3 {
		return t
	}
	return "BTN"
}

// NormaliseDescription is the canonical form used for fingerprints: lower
// case, single spaces, trimmed.
func NormaliseDescription(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}
