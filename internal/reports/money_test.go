package reports

import "testing"

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "Nu. 0.00"},
		{5, "Nu. 0.05"},
		{1250, "Nu. 12.50"},
		{123456, "Nu. 1,234.56"},
		{100000000, "Nu. 1,000,000.00"},
		{-123456, "-Nu. 1,234.56"},
		{-5, "-Nu. 0.05"},
	}
	for _, c := range cases {
		if got := FormatMoney(c.in); got != c.want {
			t.Errorf("FormatMoney(%d) = %q want %q", c.in, got, c.want)
		}
	}
}

func TestFormatMinor(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0.00"},
		{5, "0.05"},
		{123456, "1234.56"},
		{-123456, "-1234.56"},
	}
	for _, c := range cases {
		if got := FormatMinor(c.in); got != c.want {
			t.Errorf("FormatMinor(%d) = %q want %q", c.in, got, c.want)
		}
	}
}

func TestPct(t *testing.T) {
	cases := []struct {
		part, whole int64
		want        float64
	}{
		{4000, 9000, 44.4},
		{2500, 9000, 27.8},
		{1500, 9000, 16.7},
		{1, 0, 0},
		{9000, 9000, 100},
		{1, 8, 12.5},
		{1, 16, 6.3}, // 6.25 rounds half away from zero
	}
	for _, c := range cases {
		if got := pct(c.part, c.whole); got != c.want {
			t.Errorf("pct(%d,%d) = %v want %v", c.part, c.whole, got, c.want)
		}
	}
}

func TestIntPctAndBudgetLevel(t *testing.T) {
	cases := []struct {
		spent, budget int64
		pct           int
		level         string
	}{
		{0, 5000, 0, LevelOK},
		{3749, 5000, 75, LevelWarn75}, // 74.98 rounds to 75
		{3724, 5000, 74, LevelOK},
		{4450, 5000, 89, LevelWarn75},
		{4500, 5000, 90, LevelWarn90},
		{4975, 5000, 100, LevelOver}, // 99.5 rounds to 100
		{4974, 5000, 99, LevelWarn90},
		{8000, 5000, 160, LevelOver},
		{0, 0, 0, LevelOK},
		{1, 0, 100, LevelOver},
	}
	for _, c := range cases {
		p := intPct(c.spent, c.budget)
		if p != c.pct || BudgetLevel(p) != c.level {
			t.Errorf("spent %d of %d: got %d/%s want %d/%s", c.spent, c.budget, p, BudgetLevel(p), c.pct, c.level)
		}
	}
}

func TestExpenseChangePct(t *testing.T) {
	if got := ExpenseChangePct(9000, 0); got != nil {
		t.Fatalf("want nil when previous is 0, got %v", *got)
	}
	cases := []struct {
		cur, prev int64
		want      float64
	}{
		{9000, 8000, 12.5},
		{8000, 9000, -11.1},
		{8000, 8000, 0},
		{0, 8000, -100},
		{10000, 3000, 233.3},
	}
	for _, c := range cases {
		if got := ExpenseChangePct(c.cur, c.prev); got == nil || *got != c.want {
			t.Errorf("change(%d,%d) = %v want %v", c.cur, c.prev, got, c.want)
		}
	}
}
