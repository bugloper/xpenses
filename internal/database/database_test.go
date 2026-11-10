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

// The loans migration rebuilds the transactions table: every row, column and
// tag must survive it, and foreign keys must be back on afterwards.
func TestLoansMigrationKeepsTransactions(t *testing.T) {
	ctx := context.Background()
	db, err := Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	entries, _ := migrationFS.ReadDir("migrations")
	for _, e := range entries {
		if e.Name() >= "0010" {
			break
		}
		body, _ := migrationFS.ReadFile("migrations/" + e.Name())
		if err := apply(ctx, db, e.Name(), string(body)); err != nil {
			t.Fatal(err)
		}
	}
	for _, q := range []string{
		`INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES ('u','u@x','U','x','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, user_id, name, type, opening_balance_date, created_at, updated_at) VALUES ('a','u','A','bank','2026-01-01','t','t'), ('b','u','B','cash','2026-01-01','t','t')`,
		`INSERT INTO transactions (id, user_id, type, amount, account_id, transfer_account_id, transaction_date, created_at, updated_at, attachment_mime, receipt_reference)
			VALUES ('t1','u','expense',500,'a',NULL,'2026-02-01','t','t','image/png','REF1'), ('t2','u','transfer',300,'a','b','2026-02-02','t','t','','')`,
		`INSERT INTO tags (id, user_id, name) VALUES ('g','u','trip')`,
		`INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ('t1','g')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(q, err)
		}
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var n, tags int
	var mime, ref string
	db.QueryRow(`SELECT COUNT(*) FROM transactions`).Scan(&n)
	db.QueryRow(`SELECT COUNT(*) FROM transaction_tags`).Scan(&tags)
	db.QueryRow(`SELECT attachment_mime, receipt_reference FROM transactions WHERE id = 't1'`).Scan(&mime, &ref)
	if n != 2 || tags != 1 || mime != "image/png" || ref != "REF1" {
		t.Fatalf("after migration: %d rows, %d tags, %q %q", n, tags, mime, ref)
	}
	// Foreign keys are on again: deleting a transaction still cascades to its tags.
	if _, err := db.Exec(`DELETE FROM transactions WHERE id = 't1'`); err != nil {
		t.Fatal(err)
	}
	db.QueryRow(`SELECT COUNT(*) FROM transaction_tags`).Scan(&tags)
	if tags != 0 {
		t.Fatal("tags were not cascaded: foreign keys are off")
	}
	if _, err := db.Exec(`INSERT INTO transactions (id, user_id, type, amount, account_id, transaction_date, created_at, updated_at) VALUES ('t3','u','loan_given',5,'a','2026-02-03','t','t')`); err == nil {
		t.Fatal("a loan transaction without a loan was accepted")
	}
}
