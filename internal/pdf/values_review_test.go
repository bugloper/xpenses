package pdf

import "testing"

func TestParseAmountEdgeCases(t *testing.T) {
	cases := []struct {
		in    string
		minor int64
		sign  int
		ok    bool
	}{
		{"1,234.5", 123450, 0, true},
		{".50", 50, 0, true},
		{"1234", 123400, 0, true},
		{"12.", 0, 0, false}, // a bare trailing point is more likely a split fragment than 12.00
		{"(12.00)", 1200, -1, true},
		{"12.00-", 1200, -1, true},
		{"12.00 Dr", 1200, -1, true},
		{"12.00 Cr", 1200, 1, true},
		{"Nu. 1,000.00", 100000, 0, true},
		{"Nu.1,000.00", 100000, 0, true},
		{"(Nu. 12.00)", 1200, -1, true},
		{"9999999999999999.99", 999999999999999999, 0, true}, // 16 integer digits: the ceiling
		{"10000000000000000.00", 0, 0, false},                // 17 digits: rejected rather than overflowed
		{"1.234,56", 0, 0, false},                            // European grouping is rejected, never misread as 1.23
		{"1,234,", 0, 0, false},
		{",234.00", 0, 0, false},
		{".", 0, 0, false},
		{"-", 0, 0, false},
		{"()", 0, 0, false},
		{"1 234.00", 0, 0, false},
		{"12.00 Dr Cr", 0, 0, false},
		{"1e3", 0, 0, false},
		{"0x10", 0, 0, false},
	}
	for _, c := range cases {
		a, ok := ParseAmount(c.in)
		if ok != c.ok {
			t.Errorf("ParseAmount(%q) ok=%v want %v (%+v)", c.in, ok, c.ok, a)
			continue
		}
		if ok && (a.Minor != c.minor || a.Sign != c.sign) {
			t.Errorf("ParseAmount(%q) = %+v want minor=%d sign=%d", c.in, a, c.minor, c.sign)
		}
	}
}

func TestParseDateRejectsImpossibleDays(t *testing.T) {
	bad := []string{"31-02-2026", "30/02/2026", "29-02-2026", "2026-02-30", "31-04-2026", "31 Apr 2026", "00-10-2026", "31-11-26", "2026-13-01", "01-00-2026"}
	for _, s := range bad {
		if got, ok := ParseDate(s); ok {
			t.Errorf("ParseDate(%q) = %q, want failure", s, got)
		}
	}
	good := map[string]string{
		"29-02-2024": "2024-02-29", "29 Feb 2024": "2024-02-29", "31-12-2026": "2026-12-31", "1/1/2026": "2026-01-01",
		"05-SEPT-2026": "2026-09-05", "05 September 2026": "2026-09-05", "2026/10/05": "2026-10-05", "01-10-99": "1999-10-01",
	}
	for in, want := range good {
		if got, ok := ParseDate(in); !ok || got != want {
			t.Errorf("ParseDate(%q) = %q,%v want %q", in, got, ok, want)
		}
	}
}
