package repositories

import (
	"context"
	"database/sql"
	"testing"

	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/models"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// Test users; every data row belongs to one of them.
const (
	userA = "user-a"
	userB = "user-b"
)

func seedUser(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	now := models.NowUTC()
	if _, err := db.Exec(`INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
		id, id+"@example.com", id, "x", "user", now, now); err != nil {
		t.Fatal(err)
	}
}

func seedAccount(t *testing.T, db *sql.DB, userID, id string) {
	t.Helper()
	now := models.NowUTC()
	if err := (AccountRepo{}).Insert(context.Background(), db, &models.Account{UserID: userID, ID: id, Name: id, Type: "bank", Currency: "BTN", OpeningBalanceDate: "2026-01-01", IsActive: true, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
}

func stmt(userID, id, account, sha, start, end string) *models.BankStatement {
	return &models.BankStatement{UserID: userID, ID: id, Provider: "bob", AccountID: account, FileName: id + ".pdf", FileSHA256: sha, FileSize: 1,
		PeriodStart: start, PeriodEnd: end, ImportedAt: models.NowUTC()}
}

func bankTx(userID, id, stmtID, account string, line int, fp string) *models.BankTransaction {
	return &models.BankTransaction{UserID: userID, ID: id, StatementID: stmtID, AccountID: account, LineNo: line, TransactionDate: "2026-10-0" + string(rune('1'+line)),
		Description: "row " + id, Debit: 100, Fingerprint: fp, CreatedAt: models.NowUTC()}
}

func manualTx(userID, id, account string) *models.Transaction {
	now := models.NowUTC()
	return &models.Transaction{UserID: userID, ID: id, Type: "expense", Amount: 100, Currency: "BTN", AccountID: account, TransactionDate: "2026-10-02", Origin: "manual", Status: "cleared", CreatedAt: now, UpdatedAt: now}
}

// TestStatementSchema checks the statement tables reference each other with the
// expected cascade chain and that sha256 is not unique (force re-import).
func TestStatementSchema(t *testing.T) {
	db := openDB(t)
	ctx := context.Background()
	fkTargets := func(table string) map[string]bool {
		rows, err := db.Query(`PRAGMA foreign_key_list(` + table + `)`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]bool{}
		for rows.Next() {
			var id, seq int
			var target, from, to, onUpdate, onDelete, match string
			if err := rows.Scan(&id, &seq, &target, &from, &to, &onUpdate, &onDelete, &match); err != nil {
				t.Fatal(err)
			}
			out[target+"."+to+":"+onDelete] = true
		}
		return out
	}
	if fk := fkTargets("bank_transactions"); !fk["bank_statements.id:CASCADE"] || !fk["accounts.id:NO ACTION"] {
		t.Fatalf("bank_transactions FKs: %v", fk)
	}
	if fk := fkTargets("reconciliations"); !fk["bank_transactions.id:CASCADE"] || !fk["transactions.id:CASCADE"] {
		t.Fatalf("reconciliations FKs: %v", fk)
	}
	for _, idx := range []string{"idx_bank_statements_account", "idx_bank_transactions_statement", "idx_bank_transactions_account_date", "idx_reconciliations_transaction"} {
		var n int
		_ = db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, idx).Scan(&n)
		if n != 1 {
			t.Fatalf("index %s missing", idx)
		}
	}

	seedUser(t, db, userA)
	seedAccount(t, db, userA, "acc")
	repo := BankStatementRepo{}
	if err := repo.Insert(ctx, db, stmt(userA, "s1", "acc", "samesha", "2026-10-01", "2026-10-31")); err != nil {
		t.Fatal(err)
	}
	if err := repo.Insert(ctx, db, stmt(userA, "s2", "acc", "samesha", "2026-11-01", "2026-11-30")); err != nil {
		t.Fatalf("same sha256 twice must be allowed: %v", err)
	}
	// Cascade chain: statement -> bank_transactions -> reconciliations, manual transaction untouched.
	if err := (BankTransactionRepo{}).Insert(ctx, db, bankTx(userA, "b1", "s1", "acc", 1, "fp1")); err != nil {
		t.Fatal(err)
	}
	now := models.NowUTC()
	if err := (TransactionRepo{}).Insert(ctx, db, manualTx(userA, "t1", "acc")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reconciliations (user_id, id, bank_transaction_id, transaction_id, status, match_type, created_at) VALUES (?,'r1','b1','t1','matched','manual',?)`, userA, now); err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete(ctx, db, userA, "s1"); err != nil {
		t.Fatal(err)
	}
	count := func(q string) int {
		var n int
		if err := db.QueryRow(q).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count(`SELECT COUNT(*) FROM bank_transactions`) != 0 || count(`SELECT COUNT(*) FROM reconciliations`) != 0 {
		t.Fatal("cascade did not remove bank transactions / reconciliations")
	}
	if count(`SELECT COUNT(*) FROM transactions`) != 1 {
		t.Fatal("manual transaction must survive statement deletion")
	}
	rows, err := db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign_key_check reported violations")
	}
}

func TestBankStatementRepoQueries(t *testing.T) {
	db := openDB(t)
	ctx := context.Background()
	seedUser(t, db, userA)
	seedAccount(t, db, userA, "acc")
	seedAccount(t, db, userA, "other")
	repo := BankStatementRepo{}
	s1 := stmt(userA, "s1", "acc", "sha1", "2026-10-01", "2026-10-31")
	s1.ImportedAt = "2026-11-01T00:00:00Z"
	s2 := stmt(userA, "s2", "acc", "sha2", "2026-11-01", "2026-11-30")
	s2.ImportedAt = "2026-12-01T00:00:00Z"
	s3 := stmt(userA, "s3", "other", "sha3", "2026-10-01", "2026-10-31")
	for _, s := range []*models.BankStatement{s1, s2, s3} {
		if err := repo.Insert(ctx, db, s); err != nil {
			t.Fatal(err)
		}
	}
	txRepo := BankTransactionRepo{}
	for i, fp := range []string{"a", "b", "c"} {
		if err := txRepo.Insert(ctx, db, bankTx(userA, "b"+fp, "s1", "acc", i+1, fp)); err != nil {
			t.Fatal(err)
		}
	}
	now := models.NowUTC()
	if err := (TransactionRepo{}).Insert(ctx, db, manualTx(userA, "t1", "acc")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reconciliations (user_id, id, bank_transaction_id, transaction_id, status, match_type, created_at) VALUES
		(?,'r1','ba','t1','matched','manual',?), (?,'r2','bb',NULL,'ignored','manual',?)`, userA, now, userA, now); err != nil {
		t.Fatal(err)
	}

	got, err := repo.Get(ctx, db, userA, "s1")
	if err != nil || got == nil {
		t.Fatalf("get: %v %v", got, err)
	}
	if got.MatchedCount != 1 || got.IgnoredCount != 1 || got.UnmatchedCount != 1 {
		t.Fatalf("counts: %+v", got)
	}
	empty, _ := repo.Get(ctx, db, userA, "s2")
	if empty.MatchedCount != 0 || empty.UnmatchedCount != 0 || empty.IgnoredCount != 0 {
		t.Fatalf("empty statement counts: %+v", empty)
	}
	if missing, err := repo.Get(ctx, db, userA, "nope"); err != nil || missing != nil {
		t.Fatalf("missing: %v %v", missing, err)
	}
	list, err := repo.List(ctx, db, userA)
	if err != nil || len(list) != 3 || list[0].ID != "s2" {
		t.Fatalf("list: %v %v", list, err)
	}
	if by, _ := repo.GetBySHA256(ctx, db, userA, "sha2"); by == nil || by.ID != "s2" {
		t.Fatalf("by sha: %v", by)
	}
	if by, _ := repo.GetBySHA256(ctx, db, userA, "zzz"); by != nil {
		t.Fatalf("by sha missing: %v", by)
	}
	overlaps := []struct {
		account, start, end, want string
	}{
		{"acc", "2026-10-15", "2026-11-15", "s1"},
		{"acc", "2026-10-31", "2026-11-01", "s1"},
		{"acc", "2026-11-30", "2026-12-31", "s2"},
		{"acc", "2026-12-01", "2026-12-31", ""},
		{"acc", "2026-09-01", "2026-09-30", ""},
		{"other", "2026-10-01", "2026-10-31", "s3"},
		{"nobody", "2026-10-01", "2026-10-31", ""},
	}
	for _, c := range overlaps {
		got, err := repo.FindOverlapping(ctx, db, userA, c.account, c.start, c.end)
		if err != nil {
			t.Fatal(err)
		}
		id := ""
		if got != nil {
			id = got.ID
		}
		if id != c.want {
			t.Errorf("overlap %s %s..%s: got %q want %q", c.account, c.start, c.end, id, c.want)
		}
	}

	fps, err := txRepo.ExistingFingerprints(ctx, db, userA, "acc", []string{"a", "c", "zz"})
	if err != nil || len(fps) != 2 || fps["a"] != "s1" || fps["c"] != "s1" {
		t.Fatalf("fingerprints: %v %v", fps, err)
	}
	if fps, _ := txRepo.ExistingFingerprints(ctx, db, userA, "other", []string{"a"}); len(fps) != 0 {
		t.Fatalf("fingerprints are per account: %v", fps)
	}
	if fps, err := txRepo.ExistingFingerprints(ctx, db, userA, "acc", nil); err != nil || len(fps) != 0 {
		t.Fatalf("empty query: %v %v", fps, err)
	}

	rows, err := txRepo.ListByStatement(ctx, db, userA, "s1")
	if err != nil || len(rows) != 3 {
		t.Fatalf("list rows: %v %v", rows, err)
	}
	if rows[0].Status != "matched" || rows[0].Transaction == nil || rows[0].Transaction.ID != "t1" || rows[0].Reconciliation.ID != "r1" {
		t.Fatalf("row 0: %+v", rows[0])
	}
	if rows[1].Status != "ignored" || rows[1].Transaction != nil || rows[1].Reconciliation == nil {
		t.Fatalf("row 1: %+v", rows[1])
	}
	if rows[2].Status != "unrecorded" || rows[2].Transaction != nil || rows[2].Reconciliation != nil {
		t.Fatalf("row 2: %+v", rows[2])
	}
	// Account+fingerprint uniqueness is enforced by the schema.
	if err := txRepo.Insert(ctx, db, bankTx(userA, "dup", "s2", "acc", 9, "a")); err == nil {
		t.Fatal("duplicate fingerprint on the same account must fail")
	}
	if err := txRepo.Insert(ctx, db, bankTx(userA, "ok", "s3", "other", 9, "a")); err != nil {
		t.Fatalf("same fingerprint on another account must be fine: %v", err)
	}
}

// Every statement query is scoped to the caller: another user's rows are
// invisible, and an attempt to delete them is a no-op.
func TestBankStatementRepoIsolation(t *testing.T) {
	db := openDB(t)
	ctx := context.Background()
	seedUser(t, db, userA)
	seedUser(t, db, userB)
	seedAccount(t, db, userA, "acc-a")
	seedAccount(t, db, userB, "acc-b")
	repo := BankStatementRepo{}
	txRepo := BankTransactionRepo{}
	if err := repo.Insert(ctx, db, stmt(userA, "sa", "acc-a", "sha-a", "2026-10-01", "2026-10-31")); err != nil {
		t.Fatal(err)
	}
	if err := repo.Insert(ctx, db, stmt(userB, "sb", "acc-b", "sha-b", "2026-10-01", "2026-10-31")); err != nil {
		t.Fatal(err)
	}
	if err := txRepo.Insert(ctx, db, bankTx(userA, "ba", "sa", "acc-a", 1, "fp-a")); err != nil {
		t.Fatal(err)
	}
	if err := txRepo.Insert(ctx, db, bankTx(userB, "bb", "sb", "acc-b", 1, "fp-b")); err != nil {
		t.Fatal(err)
	}
	if err := (TransactionRepo{}).Insert(ctx, db, manualTx(userA, "ta", "acc-a")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reconciliations (user_id, id, bank_transaction_id, transaction_id, status, match_type, created_at) VALUES (?,'ra','ba','ta','matched','manual',?)`, userA, models.NowUTC()); err != nil {
		t.Fatal(err)
	}

	if got, err := repo.Get(ctx, db, userB, "sa"); err != nil || got != nil {
		t.Fatalf("B must not read A's statement: %v %v", got, err)
	}
	if got, err := repo.Get(ctx, db, userA, "sa"); err != nil || got == nil || got.UserID != userA || got.MatchedCount != 1 {
		t.Fatalf("A reads own statement: %+v %v", got, err)
	}
	for user, want := range map[string]string{userA: "sa", userB: "sb"} {
		list, err := repo.List(ctx, db, user)
		if err != nil || len(list) != 1 || list[0].ID != want {
			t.Fatalf("list for %s: %v %v", user, list, err)
		}
	}
	if by, _ := repo.GetBySHA256(ctx, db, userB, "sha-a"); by != nil {
		t.Fatalf("B must not see A's sha: %v", by)
	}
	if by, _ := repo.FindOverlapping(ctx, db, userB, "acc-a", "2026-10-01", "2026-10-31"); by != nil {
		t.Fatalf("B must not see A's period: %v", by)
	}
	if fps, _ := txRepo.ExistingFingerprints(ctx, db, userB, "acc-a", []string{"fp-a"}); len(fps) != 0 {
		t.Fatalf("B must not see A's fingerprints: %v", fps)
	}
	if rows, err := txRepo.ListByStatement(ctx, db, userB, "sa"); err != nil || len(rows) != 0 {
		t.Fatalf("B must not list A's rows: %v %v", rows, err)
	}
	if rows, err := txRepo.ListByStatement(ctx, db, userA, "sa"); err != nil || len(rows) != 1 || rows[0].Transaction == nil || rows[0].Transaction.ID != "ta" {
		t.Fatalf("A lists own rows with the linked transaction: %v %v", rows, err)
	}
	if err := repo.Delete(ctx, db, userB, "sa"); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.Get(ctx, db, userA, "sa"); got == nil {
		t.Fatal("B's delete must not remove A's statement")
	}
	if err := repo.Delete(ctx, db, userA, "sa"); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.Get(ctx, db, userA, "sa"); got != nil {
		t.Fatal("A's delete must remove A's statement")
	}
	if got, _ := repo.Get(ctx, db, userB, "sb"); got == nil {
		t.Fatal("A's delete must not touch B's statement")
	}
}
