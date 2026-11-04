package models

import "time"

// NowUTC returns the current time formatted as RFC3339 in UTC, the format used
// for every created_at/updated_at column.
func NowUTC() string { return time.Now().UTC().Format(time.RFC3339) }

// DateLayout is the storage format for financial (local) dates.
const DateLayout = "2006-01-02"

// ParseDate validates a YYYY-MM-DD string.
func ParseDate(s string) (time.Time, error) { return time.Parse(DateLayout, s) }

// Today returns the local calendar date.
func Today() string { return time.Now().Format(DateLayout) }
