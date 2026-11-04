package services

import (
	"testing"
	"time"
)

func TestOccurrence(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	cases := []struct {
		start, freq string
		interval, n int
		want        string
	}{
		{"2026-01-31", "monthly", 1, 1, "2026-02-28"},
		{"2026-01-31", "monthly", 1, 2, "2026-03-31"}, // no drift after clamping
		{"2024-01-31", "monthly", 1, 1, "2024-02-29"},
		{"2026-01-15", "monthly", 2, 1, "2026-03-15"},
		{"2024-02-29", "yearly", 1, 1, "2025-02-28"},
		{"2024-02-29", "yearly", 1, 4, "2028-02-29"},
		{"2026-11-04", "weekly", 1, 1, "2026-11-11"},
		{"2026-11-04", "daily", 3, 2, "2026-11-10"},
		{"2026-11-04", "bogus", 0, 1, "2026-11-05"},
	}
	for _, c := range cases {
		got := Occurrence(d(c.start), c.freq, c.interval, c.n).Format("2006-01-02")
		if got != c.want {
			t.Errorf("%s +%d*%d %s: want %s got %s", c.start, c.interval, c.n, c.freq, c.want, got)
		}
	}
	if got := NextOccurrence(d("2026-01-31"), "monthly", 1, d("2026-02-28")).Format("2006-01-02"); got != "2026-03-31" {
		t.Errorf("NextOccurrence after Feb 28: got %s", got)
	}
}
