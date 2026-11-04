package reconciliation

import (
	"math"
	"strings"
	"testing"
)

func TestNormalise(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"POS/AMBIENT CAFE THIMPHU/123456", "ambient cafe thimphu"},
		{"MBOB/TRF/TO/KARMA TSHERING/9876", "karma tshering"},
		{"IMPS REF 12345 NEFT TXN", ""},
		{"  Lunch at the Café  ", "lunch café"},
		{"8ELEVEN", "eleven"},
	}
	for _, c := range cases {
		if got := strings.Join(normalise(c.in), " "); got != c.want {
			t.Errorf("normalise(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestJaroWinkler(t *testing.T) {
	cases := []struct {
		a, b string
		want float64
	}{
		{"martha", "marhta", 0.9611},
		{"dixon", "dicksonx", 0.8133},
		{"same", "same", 1},
		{"", "x", 0},
		{"abc", "xyz", 0},
	}
	for _, c := range cases {
		if got := jaroWinkler(c.a, c.b); math.Abs(got-c.want) > 0.001 {
			t.Errorf("jaroWinkler(%q,%q) = %.4f, want %.4f", c.a, c.b, got, c.want)
		}
	}
}

func TestSimilarity(t *testing.T) {
	cases := []struct {
		manual, bank string
		ok           bool
	}{
		{"Ambient Cafe", "POS/AMBIENT CAFE THIMPHU/123456", true},
		{"Ambient Cafe", "POS/AMBIENT CAFE/123456", true},
		{"Karma Tshering", "MBOB/TRF/TO/KARMA TSHERING/9876", true},
		{"Karma Tshering", "MBOB/TRF/TO/KARMA TSHERNG/9876", true}, // typo, Jaro-Winkler
		{"Ambient Cafe", "MBOB/TRF/TO/KARMA TSHERING/9876", false},
		{"", "POS/AMBIENT CAFE/1", false},
		{"Ambient Cafe", "", false},
		{"Cafe", "POS/AMBIENT CAFE THIMPHU/1", false}, // one of three tokens
	}
	for _, c := range cases {
		ok, strength := similarity(c.manual, c.bank)
		if ok != c.ok {
			t.Errorf("similarity(%q,%q) ok=%v, want %v", c.manual, c.bank, ok, c.ok)
		}
		if strength < 0 || strength > 1 {
			t.Errorf("similarity(%q,%q) strength %v out of range", c.manual, c.bank, strength)
		}
		if !ok && strength != 0 {
			t.Errorf("similarity(%q,%q) strength should be 0 when not ok", c.manual, c.bank)
		}
	}
}

func TestCleanDescription(t *testing.T) {
	cases := map[string]string{
		"MBOB/TRF/TO/ABC STORE/1234567":   "Abc Store",
		"POS/AMBIENT CAFE THIMPHU/123456": "Ambient Cafe Thimphu",
		"IMPS 12345":                      "IMPS 12345",
		"   ":                             "",
	}
	for in, want := range cases {
		if got := CleanDescription(in); got != want {
			t.Errorf("CleanDescription(%q) = %q, want %q", in, got, want)
		}
	}
}
