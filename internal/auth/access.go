package auth

import (
	"time"
	// The runtime image (alpine) ships no zoneinfo; embed it so Asia/Thimphu loads.
	_ "time/tzdata"
)

// accessZone is the calendar the free year runs on. Xpenses serves people in
// Bhutan, so a day of access starts and ends at midnight Bhutan time, whatever
// the server's clock is set to (production runs in UTC). The web app counts
// days left on the same calendar.
var accessZone = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Thimphu")
	if err != nil {
		panic("load Asia/Thimphu: " + err.Error())
	}
	return loc
}()

// AccessDate is t's calendar date (YYYY-MM-DD) in Bhutan.
func AccessDate(t time.Time) string { return t.In(accessZone).Format("2006-01-02") }

// accessUntilFrom is the last day of a free year that starts at t: the same
// date one year on, counted in Bhutan.
func accessUntilFrom(t time.Time) string { return AccessDate(t.In(accessZone).AddDate(1, 0, 0)) }
