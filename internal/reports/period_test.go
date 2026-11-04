package reports

import (
	"reflect"
	"testing"
	"time"

	apperr "github.com/bugloper/xpensiv/internal/errors"
)

func TestParsePeriodDefaultsToCurrentMonth(t *testing.T) {
	now := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	p, err := ParsePeriod("", "", now)
	if err != nil {
		t.Fatal(err)
	}
	if p != (Period{From: "2026-11-01", To: "2026-11-30"}) {
		t.Fatalf("got %+v", p)
	}
	feb, _ := ParsePeriod("", "", time.Date(2024, 2, 10, 0, 0, 0, 0, time.UTC))
	if feb.To != "2024-02-29" {
		t.Fatalf("leap feb: %+v", feb)
	}
}

func TestParsePeriodValidation(t *testing.T) {
	now := time.Now()
	cases := []struct{ from, to, field string }{
		{"2026-11-01", "", "to"},
		{"", "2026-11-01", "from"},
		{"2026/11/01", "2026-11-30", "from"},
		{"2026-11-30", "2026-11-01", "to"},
	}
	for _, c := range cases {
		_, err := ParsePeriod(c.from, c.to, now)
		ae, ok := apperr.As(err)
		if !ok || ae.Code != "validation_error" || ae.Details[c.field] == "" {
			t.Fatalf("%s..%s: want validation error on %s, got %v", c.from, c.to, c.field, err)
		}
	}
	if p, err := ParsePeriod("2026-11-04", "2026-11-04", now); err != nil || p.Days() != 1 {
		t.Fatalf("single day: %+v %v", p, err)
	}
}

func TestParseMonth(t *testing.T) {
	p, err := ParseMonth("2026-02", time.Now())
	if err != nil || p != (Period{From: "2026-02-01", To: "2026-02-28"}) {
		t.Fatalf("%+v %v", p, err)
	}
	if _, err := ParseMonth("2026-13", time.Now()); err == nil {
		t.Fatal("want error for month 13")
	}
	if _, err := ParseMonth("202611", time.Now()); err == nil {
		t.Fatal("want error for bad format")
	}
}

func TestPrevious(t *testing.T) {
	cases := []struct{ p, want Period }{
		{Period{"2026-11-01", "2026-11-30"}, Period{"2026-10-02", "2026-10-31"}},
		{Period{"2026-01-01", "2026-01-31"}, Period{"2025-12-01", "2025-12-31"}},
		{Period{"2026-03-01", "2026-03-01"}, Period{"2026-02-28", "2026-02-28"}},
		{Period{"2026-11-04", "2026-11-10"}, Period{"2026-10-28", "2026-11-03"}},
	}
	for _, c := range cases {
		if got := c.p.Previous(); got != c.want {
			t.Errorf("%v previous: got %v want %v", c.p, got, c.want)
		}
	}
}

func TestBucketKey(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	cases := []struct{ date, gran, want string }{
		{"2026-11-04", GranDay, "2026-11-04"},
		{"2026-11-04", GranMonth, "2026-11"},
		{"2026-11-04", GranWeek, "2026-W45"},
		{"2026-11-01", GranWeek, "2026-W44"}, // Sunday belongs to the Monday-start week before
		{"2026-11-02", GranWeek, "2026-W45"}, // Monday starts W45
		{"2025-12-29", GranWeek, "2026-W01"}, // ISO year rolls forward
		{"2027-01-03", GranWeek, "2026-W53"}, // ISO year rolls back; 2026 has 53 weeks
		{"2021-01-01", GranWeek, "2020-W53"},
	}
	for _, c := range cases {
		if got := BucketKey(d(c.date), c.gran); got != c.want {
			t.Errorf("%s %s: got %s want %s", c.date, c.gran, got, c.want)
		}
	}
}

func TestBuckets(t *testing.T) {
	got := Period{"2026-10-26", "2026-11-08"}.Buckets(GranWeek)
	if want := []string{"2026-W44", "2026-W45"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("week: %v", got)
	}
	got = Period{"2026-12-28", "2027-01-05"}.Buckets(GranWeek)
	if want := []string{"2026-W53", "2027-W01"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("week year boundary: %v", got)
	}
	got = Period{"2026-11-15", "2027-02-01"}.Buckets(GranMonth)
	if want := []string{"2026-11", "2026-12", "2027-01", "2027-02"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("month year boundary: %v", got)
	}
	got = Period{"2026-02-27", "2026-03-02"}.Buckets(GranDay)
	if want := []string{"2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("day: %v", got)
	}
}
