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
