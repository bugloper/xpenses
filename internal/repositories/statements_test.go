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

func seedAccount(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	now := models.NowUTC()
	if err := (AccountRepo{}).Insert(context.Background(), db, &models.Account{ID: id, Name: id, Type: "bank", Currency: "BTN", OpeningBalanceDate: "2026-01-01", IsActive: true, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
}

func stmt(id, account, sha, start, end string) *models.BankStatement {
	return &models.BankStatement{ID: id, Provider: "bob", AccountID: account, FileName: id + ".pdf", FileSHA256: sha, FileSize: 1,
		PeriodStart: start, PeriodEnd: end, ImportedAt: models.NowUTC()}
}

func bankTx(id, stmtID, account string, line int, fp string) *models.BankTransaction {
	return &models.BankTransaction{ID: id, StatementID: stmtID, AccountID: account, LineNo: line, TransactionDate: "2026-10-0" + string(rune('1'+line)),
		Description: "row " + id, Debit: 100, Fingerprint: fp, CreatedAt: models.NowUTC()}
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

	seedAccount(t, db, "acc")
	repo := BankStatementRepo{}
	if err := repo.Insert(ctx, db, stmt("s1", "acc", "samesha", "2026-10-01", "2026-10-31")); err != nil {
		t.Fatal(err)
	}
	if err := repo.Insert(ctx, db, stmt("s2", "acc", "samesha", "2026-11-01", "2026-11-30")); err != nil {
		t.Fatalf("same sha256 twice must be allowed: %v", err)
	}
	// Cascade chain: statement -> bank_transactions -> reconciliations, manual transaction untouched.
	if err := (BankTransactionRepo{}).Insert(ctx, db, bankTx("b1", "s1", "acc", 1, "fp1")); err != nil {
		t.Fatal(err)
	}
	now := models.NowUTC()
	if err := (TransactionRepo{}).Insert(ctx, db, &models.Transaction{ID: "t1", Type: "expense", Amount: 100, Currency: "BTN", AccountID: "acc", TransactionDate: "2026-10-02", Origin: "manual", Status: "cleared", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reconciliations (id, bank_transaction_id, transaction_id, status, match_type, created_at) VALUES ('r1','b1','t1','matched','manual',?)`, now); err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete(ctx, db, "s1"); err != nil {
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
	seedAccount(t, db, "acc")
	seedAccount(t, db, "other")
	repo := BankStatementRepo{}
	s1 := stmt("s1", "acc", "sha1", "2026-10-01", "2026-10-31")
	s1.ImportedAt = "2026-11-01T00:00:00Z"
	s2 := stmt("s2", "acc", "sha2", "2026-11-01", "2026-11-30")
	s2.ImportedAt = "2026-12-01T00:00:00Z"
	s3 := stmt("s3", "other", "sha3", "2026-10-01", "2026-10-31")
	for _, s := range []*models.BankStatement{s1, s2, s3} {
		if err := repo.Insert(ctx, db, s); err != nil {
			t.Fatal(err)
		}
	}
	txRepo := BankTransactionRepo{}
	for i, fp := range []string{"a", "b", "c"} {
		if err := txRepo.Insert(ctx, db, bankTx("b"+fp, "s1", "acc", i+1, fp)); err != nil {
			t.Fatal(err)
		}
	}
	now := models.NowUTC()
	if err := (TransactionRepo{}).Insert(ctx, db, &models.Transaction{ID: "t1", Type: "expense", Amount: 100, Currency: "BTN", AccountID: "acc", TransactionDate: "2026-10-02", Origin: "manual", Status: "cleared", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reconciliations (id, bank_transaction_id, transaction_id, status, match_type, created_at) VALUES
		('r1','ba','t1','matched','manual',?), ('r2','bb',NULL,'ignored','manual',?)`, now, now); err != nil {
		t.Fatal(err)
	}

	got, err := repo.Get(ctx, db, "s1")
	if err != nil || got == nil {
		t.Fatalf("get: %v %v", got, err)
	}
	if got.MatchedCount != 1 || got.IgnoredCount != 1 || got.UnmatchedCount != 1 {
		t.Fatalf("counts: %+v", got)
	}
	empty, _ := repo.Get(ctx, db, "s2")
	if empty.MatchedCount != 0 || empty.UnmatchedCount != 0 || empty.IgnoredCount != 0 {
		t.Fatalf("empty statement counts: %+v", empty)
	}
	if missing, err := repo.Get(ctx, db, "nope"); err != nil || missing != nil {
		t.Fatalf("missing: %v %v", missing, err)
	}
	list, err := repo.List(ctx, db)
	if err != nil || len(list) != 3 || list[0].ID != "s2" {
		t.Fatalf("list: %v %v", list, err)
	}
	if by, _ := repo.GetBySHA256(ctx, db, "sha2"); by == nil || by.ID != "s2" {
		t.Fatalf("by sha: %v", by)
	}
	if by, _ := repo.GetBySHA256(ctx, db, "zzz"); by != nil {
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
		got, err := repo.FindOverlapping(ctx, db, c.account, c.start, c.end)
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

	fps, err := txRepo.ExistingFingerprints(ctx, db, "acc", []string{"a", "c", "zz"})
	if err != nil || len(fps) != 2 || fps["a"] != "s1" || fps["c"] != "s1" {
		t.Fatalf("fingerprints: %v %v", fps, err)
	}
	if fps, _ := txRepo.ExistingFingerprints(ctx, db, "other", []string{"a"}); len(fps) != 0 {
		t.Fatalf("fingerprints are per account: %v", fps)
	}
	if fps, err := txRepo.ExistingFingerprints(ctx, db, "acc", nil); err != nil || len(fps) != 0 {
		t.Fatalf("empty query: %v %v", fps, err)
	}

	rows, err := txRepo.ListByStatement(ctx, db, "s1")
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
	if err := txRepo.Insert(ctx, db, bankTx("dup", "s2", "acc", 9, "a")); err == nil {
		t.Fatal("duplicate fingerprint on the same account must fail")
	}
	if err := txRepo.Insert(ctx, db, bankTx("ok", "s3", "other", 9, "a")); err != nil {
		t.Fatalf("same fingerprint on another account must be fine: %v", err)
	}
}
