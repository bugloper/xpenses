package database

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestMigrateRejectsPreReleaseDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// Simulate a database whose 0001 ran before the users table existed.
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
		INSERT INTO schema_migrations VALUES ('0001_init.sql', 'x');
		CREATE TABLE accounts (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	err = Migrate(context.Background(), db)
	if !errors.Is(err, ErrStaleSchema) {
		t.Fatalf("want ErrStaleSchema, got %v", err)
	}
}

func TestMigrateFreshDatabaseIsIdempotent(t *testing.T) {
	db, err := OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		t.Fatal(err)
	}
}

func TestAccessUntilMovesToBhutanDate(t *testing.T) {
	db, err := OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	users := []struct{ id, createdAt, accessUntil, want string }{
		{"early", "2026-03-04T20:30:00Z", "2027-03-04", "2027-03-05"},    // 02:30 Bhutan on the 5th
		{"daytime", "2026-03-04T05:00:00Z", "2027-03-04", "2027-03-04"},  // 11:00 Bhutan, already right
		{"extended", "2026-03-04T20:30:00Z", "2028-01-31", "2028-01-31"}, // set by the administrator
		{"leap", "2028-02-28T19:00:00Z", "2029-02-28", "2029-03-01"},     // Bhutan 29 Feb, as Go's AddDate
	}
	for _, u := range users {
		if _, err := db.Exec(`INSERT INTO users (id, email, name, password_hash, created_at, updated_at, access_until)
			VALUES (?, ?, 'U', 'x', ?, ?, ?)`, u.id, u.id+"@example.com", u.createdAt, u.createdAt, u.accessUntil); err != nil {
			t.Fatal(err)
		}
	}
	fix, err := migrationFS.ReadFile("migrations/0009_access_until_bhutan.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(fix)); err != nil {
		t.Fatal(err)
	}
	for _, u := range users {
		var got string
		if err := db.QueryRow(`SELECT access_until FROM users WHERE id = ?`, u.id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != u.want {
			t.Errorf("%s: access_until = %s, want %s", u.id, got, u.want)
		}
	}
}
