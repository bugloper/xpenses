package pdf

import "testing"

func TestParseDate(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"01-10-2026", "2026-10-01", true},
		{"31/10/2026", "2026-10-31", true},
		{"05-Oct-2026", "2026-10-05", true},
		{"05-OCT-2026", "2026-10-05", true},
		{"5 Oct 2026", "2026-10-05", true},
		{"05 October 2026", "2026-10-05", true},
		{"2026-10-05", "2026-10-05", true},
		{"05.10.2026", "2026-10-05", true},
		{"05-10-26", "2026-10-05", true},
		{"05-Oct-26", "2026-10-05", true},
		{" 01-10-2026 ", "2026-10-01", true},
		{"32-10-2026", "", false},
		{"01-13-2026", "", false},
		{"", "", false},
		{"Opening Balance", "", false},
		{"01-10-1900", "", false},
		{"123456", "", false},
	}
	for _, c := range cases {
		got, ok := ParseDate(c.in)
		if ok != c.ok || got != c.want {
			t.Errorf("ParseDate(%q) = %q,%v want %q,%v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestFindDate(t *testing.T) {
	d, rest, ok := FindDate("01-10-2026 Opening Balance")
	if !ok || d != "2026-10-01" || rest != "Opening Balance" {
		t.Fatalf("got %q %q %v", d, rest, ok)
	}
	if _, _, ok := FindDate("no date here"); ok {
		t.Fatal("expected no date")
	}
}

func TestParseAmount(t *testing.T) {
	cases := []struct {
		in    string
		minor int64
		sign  int
		ok    bool
		trunc bool
	}{
		{"1,234.50", 123450, 0, true, false},
		{"1234.50", 123450, 0, true, false},
		{"1234", 123400, 0, true, false},
		{"0.05", 5, 0, true, false},
		{".50", 50, 0, true, false},
		{"12.5", 1250, 0, true, false},
		{"1,23,456.78", 12345678, 0, true, false}, // Indian grouping
		{"1,234.50 Dr", 123450, -1, true, false},
		{"1,234.50Cr", 123450, 1, true, false},
		{"1,234.50 DR.", 123450, -1, true, false},
		{"(1,234.50)", 123450, -1, true, false},
		{"1,234.50-", 123450, -1, true, false},
		{"-1,234.50", 123450, -1, true, false},
		{"+1,234.50", 123450, 1, true, false},
		{"Nu. 1,234.50", 123450, 0, true, false},
		{"BTN 1,234.50", 123450, 0, true, false},
		{"Nu. -12.00", 1200, -1, true, false},
		{"12.345", 1234, 0, true, true},
		{"12.340", 1234, 0, true, false},
		{"0.00", 0, 0, true, false},
		{"", 0, 0, false, false},
		{"abc", 0, 0, false, false},
		{"12,34a", 0, 0, false, false},
		{"01-10-2026", 0, 0, false, false},
		{"POS77001", 0, 0, false, false},
		{"12345678901234567.00", 0, 0, false, false},
	}
	for _, c := range cases {
		a, ok := ParseAmount(c.in)
		if ok != c.ok {
			t.Errorf("ParseAmount(%q) ok=%v want %v", c.in, ok, c.ok)
			continue
		}
		if !ok {
			continue
		}
		if a.Minor != c.minor || a.Sign != c.sign || a.Truncated != c.trunc {
			t.Errorf("ParseAmount(%q) = %+v want minor=%d sign=%d trunc=%v", c.in, a, c.minor, c.sign, c.trunc)
		}
	}
}

func TestLooksLikeAmount(t *testing.T) {
	for _, s := range []string{"1,234.50", "(12.00)", "12.00 Dr", "Nu. 5.00", "100"} {
		if !LooksLikeAmount(s) {
			t.Errorf("%q should look like an amount", s)
		}
	}
	for _, s := range []string{"", "POS77001", "01-10-2026", "Opening Balance"} {
		if LooksLikeAmount(s) {
			t.Errorf("%q should not look like an amount", s)
		}
	}
}

func TestMaskAccountNumber(t *testing.T) {
	cases := map[string]string{
		"201234567890":  "********7890",
		"2012-3456-789": "*******6789",
		"1234":          "1234",
		"12":            "12",
		"":              "",
	}
	for in, want := range cases {
		if got := MaskAccountNumber(in); got != want {
			t.Errorf("MaskAccountNumber(%q)=%q want %q", in, got, want)
		}
	}
}

func TestNormaliseCurrency(t *testing.T) {
	cases := map[string]string{"Nu.": "BTN", "nu": "BTN", "Ngultrum": "BTN", "BTN": "BTN", "usd": "USD", "": "BTN", "rupees": "BTN"}
	for in, want := range cases {
		if got := NormaliseCurrency(in); got != want {
			t.Errorf("NormaliseCurrency(%q)=%q want %q", in, got, want)
		}
	}
}

func TestNormaliseDescription(t *testing.T) {
	if got := NormaliseDescription("  POS   Purchase\tEIGHT ELEVEN "); got != "pos purchase eight eleven" {
		t.Fatalf("got %q", got)
	}
}
