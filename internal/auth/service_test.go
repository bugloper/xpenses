package auth

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"

	"github.com/bugloper/xpenses/internal/database"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

const testPassword = "correct-horse-battery"

func newService(t *testing.T, db *sql.DB) *Service {
	t.Helper()
	t.Cleanup(func() { db.Close() })
	return NewService(db)
}

// A request works on the user snapshot loaded with its session. Profile and
// password updates must not write that snapshot's role/status/hash back over
// a change an admin (or another session) made in the meantime.
func TestStaleSnapshotCannotUndoAdminChanges(t *testing.T) {
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	svc := newService(t, db)
	ctx := context.Background()
	owner, err := svc.Setup(ctx, "Owner", "owner@example.com", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SetRegistrationOpen(ctx, true); err != nil {
		t.Fatal(err)
	}
	bob, err := svc.Register(ctx, "Bob", "bob@example.com", testPassword, "")
	if err != nil {
		t.Fatal(err)
	}
	admin := models.RoleAdmin
	if _, err := svc.UpdateUserAdmin(ctx, owner, bob.ID, nil, &admin); err != nil {
		t.Fatal(err)
	}
	// Bob's in-flight request holds a snapshot that still says admin...
	snapshot, _ := svc.Repo.GetUser(ctx, db, bob.ID)
	// ...while the owner demotes and disables him.
	user, off := models.RoleUser, false
	if _, err := svc.UpdateUserAdmin(ctx, owner, bob.ID, &off, &user); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateProfile(ctx, snapshot, "Robert"); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.Repo.GetUser(ctx, db, bob.ID)
	if got.Role != models.RoleUser || got.IsActive || got.Name != "Robert" {
		t.Fatalf("profile update restored stale role/status: %+v", got)
	}
	// Same for a password change racing an admin edit: the admin's write must
	// not revert the hash.
	adminSnapshot, _ := svc.Repo.GetUser(ctx, db, bob.ID)
	if err := svc.ChangePassword(ctx, got, "", testPassword, "a-brand-new-secret"); err != nil {
		t.Fatal(err)
	}
	on := true
	_ = adminSnapshot
	if _, err := svc.UpdateUserAdmin(ctx, owner, bob.ID, &on, nil); err != nil {
		t.Fatal(err)
	}
	got, _ = svc.Repo.GetUser(ctx, db, bob.ID)
	if !VerifyPassword(got.PasswordHash, "a-brand-new-secret") {
		t.Fatal("admin update reverted the user's new password")
	}
	if !got.IsActive {
		t.Fatal("admin re-enable lost")
	}
}

// Production runs on a file database with a connection pool, where two
// concurrent read-then-write transactions are not serialised by SQLite but
// resolved by failing one. Setup must still yield exactly one admin and clean
// 409s, never a 500 or a second owner.
func TestConcurrentSetupCreatesExactlyOneOwner(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	svc := newService(t, db)
	const n = 8
	results := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, results[i] = svc.Setup(context.Background(), "Owner", "owner@example.com", testPassword)
		}(i)
	}
	close(start)
	wg.Wait()
	var ok, conflict int
	for _, err := range results {
		switch {
		case err == nil:
			ok++
		default:
			ae, isApp := apperr.As(err)
			if !isApp || ae.Code != "already_set_up" {
				t.Fatalf("unexpected setup error: %v", err)
			}
			conflict++
		}
	}
	if ok != 1 || conflict != n-1 {
		t.Fatalf("want 1 success and %d conflicts, got %d/%d", n-1, ok, conflict)
	}
	var users int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&users)
	if users != 1 {
		t.Fatalf("users after concurrent setup: %d", users)
	}
}

// Two registrations racing for the same invite: one wins, the other gets
// invalid_invite, never a 500 and never two accounts on one invite.
func TestConcurrentInviteUseIsSingleUse(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	svc := newService(t, db)
	ctx := context.Background()
	owner, err := svc.Setup(ctx, "Owner", "owner@example.com", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	inv, err := svc.CreateInvite(ctx, owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	const n = 6
	results := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, results[i] = svc.Register(ctx, "U", "u"+string(rune('a'+i))+"@example.com", testPassword, inv.Token)
		}(i)
	}
	close(start)
	wg.Wait()
	var ok int
	for _, err := range results {
		if err == nil {
			ok++
			continue
		}
		if ae, isApp := apperr.As(err); !isApp || ae.Code != "invalid_invite" {
			t.Fatalf("unexpected register error: %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("invite used %d times", ok)
	}
}
