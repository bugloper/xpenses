// Package reports computes the aggregate views (summary, categories, cash
// flow, merchants, accounts, budgets) and renders them as
// JSON, CSV or PDF. All amounts are int64 minor units; only percentages are
// floating point.
package reports

import (
	"fmt"
	"time"

	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

// Period is an inclusive range of local calendar dates.
type Period struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Granularities accepted by the cash-flow report.
const (
	GranDay   = "day"
	GranWeek  = "week"
	GranMonth = "month"
)

// Flow types accepted by the categories and merchants reports.
const (
	FlowExpense = "expense"
	FlowIncome  = "income"
)

// CurrentMonth returns the calendar month containing now.
func CurrentMonth(now time.Time) Period {
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1)
	return Period{From: first.Format(models.DateLayout), To: last.Format(models.DateLayout)}
}

// ParsePeriod validates from/to query values. Both empty means the current
// month; otherwise both are required, must be YYYY-MM-DD and from <= to.
func ParsePeriod(from, to string, now time.Time) (Period, error) {
	if from == "" && to == "" {
		return CurrentMonth(now), nil
	}
	details := map[string]string{}
	f, err := models.ParseDate(from)
	if err != nil {
		details["from"] = "must be YYYY-MM-DD"
	}
	t, err := models.ParseDate(to)
	if err != nil {
		details["to"] = "must be YYYY-MM-DD"
	}
	if len(details) == 0 && t.Before(f) {
		details["to"] = "must not be before from"
	}
	if len(details) > 0 {
		return Period{}, apperr.Validation("invalid period", details)
	}
	return Period{From: from, To: to}, nil
}

// ParseMonth validates a YYYY-MM value; empty means the month containing now.
func ParseMonth(s string, now time.Time) (Period, error) {
	if s == "" {
		return CurrentMonth(now), nil
	}
	t, err := time.Parse("2006-01", s)
	if err != nil {
		return Period{}, apperr.Validation("invalid month", map[string]string{"month": "must be YYYY-MM"})
	}
	return CurrentMonth(t), nil
}

// ParseGranularity validates the cash-flow granularity; empty means day.
func ParseGranularity(s string) (string, error) {
	switch s {
	case "":
		return GranDay, nil
	case GranDay, GranWeek, GranMonth:
		return s, nil
	}
	return "", apperr.Validation("invalid granularity", map[string]string{"granularity": "must be day, week or month"})
}

// ParseFlowType validates the categories/merchants type; empty means expense.
func ParseFlowType(s string) (string, error) {
	switch s {
	case "":
		return FlowExpense, nil
	case FlowExpense, FlowIncome:
		return s, nil
	}
	return "", apperr.Validation("invalid type", map[string]string{"type": "must be expense or income"})
}

func (p Period) start() time.Time { t, _ := models.ParseDate(p.From); return t }
func (p Period) end() time.Time   { t, _ := models.ParseDate(p.To); return t }

// Days is the number of calendar days in the period, inclusive.
func (p Period) Days() int {
	return int(p.end().Sub(p.start()).Hours()/24) + 1
}

// Previous returns the period of identical length ending the day before From.
func (p Period) Previous() Period {
	n := p.Days()
	to := p.start().AddDate(0, 0, -1)
	from := to.AddDate(0, 0, -(n - 1))
	return Period{From: from.Format(models.DateLayout), To: to.Format(models.DateLayout)}
}

// String renders the period for titles, e.g. "2026-11-01 to 2026-11-30".
func (p Period) String() string { return p.From + " to " + p.To }

// BucketKey maps a date to its cash-flow bucket label for the granularity:
// day "2026-11-04", ISO week "2026-W45" (weeks start Monday), month "2026-11".
func BucketKey(date time.Time, granularity string) string {
	switch granularity {
	case GranWeek:
		y, w := date.ISOWeek()
		return fmt.Sprintf("%04d-W%02d", y, w)
	case GranMonth:
		return date.Format("2006-01")
	}
	return date.Format(models.DateLayout)
}

// Buckets returns the ordered, de-duplicated bucket labels covering the period.
func (p Period) Buckets(granularity string) []string {
	var out []string
	last := ""
	for d := p.start(); !d.After(p.end()); d = d.AddDate(0, 0, 1) {
		k := BucketKey(d, granularity)
		if k != last {
			out = append(out, k)
			last = k
		}
	}
	return out
}
