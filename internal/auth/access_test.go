package auth

import (
	"testing"
	"time"

	"github.com/bugloper/xpenses/internal/models"
)

// The free year runs on Bhutan time (UTC+6) even though production runs in UTC:
// at 19:00 UTC on 9 Nov it is already 10 Nov in Thimphu.
func TestAccessDateIsBhutanTime(t *testing.T) {
	lateUTC := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC) // 01:00 on 10 Nov in Thimphu
	if got := AccessDate(lateUTC); got != "2026-11-10" {
		t.Fatalf("AccessDate: got %s want 2026-11-10", got)
	}
	// Signing up then gives a year to 10 Nov 2027, not a day short.
	if got := accessUntilFrom(lateUTC); got != "2027-11-10" {
		t.Fatalf("accessUntilFrom: got %s want 2027-11-10", got)
	}
	earlyUTC := time.Date(2026, 11, 9, 17, 59, 0, 0, time.UTC) // 23:59 on 9 Nov in Thimphu
	if got := AccessDate(earlyUTC); got != "2026-11-09" {
		t.Fatalf("AccessDate before midnight: got %s want 2026-11-09", got)
	}
}

func TestAccessExpiresAtBhutanMidnight(t *testing.T) {
	u := &models.User{Role: models.RoleUser, AccessUntil: "2026-11-09"}
	if AccessExpired(u, time.Date(2026, 11, 9, 17, 59, 0, 0, time.UTC)) {
		t.Fatal("23:59 on the last day (Thimphu) must still be allowed")
	}
	if !AccessExpired(u, time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)) {
		t.Fatal("00:00 the day after (Thimphu) must be expired, even though it is still 9 Nov in UTC")
	}
	admin := &models.User{Role: models.RoleAdmin, AccessUntil: "2020-01-01"}
	if AccessExpired(admin, time.Now()) {
		t.Fatal("admins are never cut off")
	}
}
