package repositories

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/bugloper/xpensiv/internal/models"
)

// StatementWithCounts is a bank statement plus reconciliation tallies.
// matched_count includes rows reconciled as transfers.
type StatementWithCounts struct {
	models.BankStatement
	MatchedCount   int `json:"matched_count"`
	UnmatchedCount int `json:"unmatched_count"`
	IgnoredCount   int `json:"ignored_count"`
}

// BankTransactionWithStatus is a bank transaction with its reconciliation
// state. Status is "unrecorded" when no reconciliation row exists.
type BankTransactionWithStatus struct {
	models.BankTransaction
	Status         string                 `json:"status"`
	Reconciliation *models.Reconciliation `json:"reconciliation"`
	Transaction    *models.Transaction    `json:"transaction"`
}

type BankStatementRepo struct{}

const stmtCols = `s.user_id, s.id, s.provider, s.account_id, s.file_name, s.file_sha256, s.file_size, s.account_number, s.account_holder,
	s.period_start, s.period_end, s.opening_balance, s.closing_balance, s.total_debits, s.total_credits, s.transaction_count,
	s.balance_verified, s.notes, s.imported_at`

const stmtCountCols = stmtCols + `,
	COALESCE(SUM(CASE WHEN r.status IN ('matched','transfer') THEN 1 ELSE 0 END), 0),
	COALESCE(SUM(CASE WHEN bt.id IS NOT NULL AND r.id IS NULL THEN 1 ELSE 0 END), 0),
	COALESCE(SUM(CASE WHEN r.status = 'ignored' THEN 1 ELSE 0 END), 0)`

const stmtCountFrom = ` FROM bank_statements s
	LEFT JOIN bank_transactions bt ON bt.statement_id = s.id
	LEFT JOIN reconciliations r ON r.bank_transaction_id = bt.id`

func scanStatement(s interface{ Scan(...any) error }, withCounts bool) (*StatementWithCounts, error) {
	var st StatementWithCounts
	var opening, closing sql.NullInt64
	var verified int
	dest := []any{&st.UserID, &st.ID, &st.Provider, &st.AccountID, &st.FileName, &st.FileSHA256, &st.FileSize, &st.AccountNumber, &st.AccountHolder,
		&st.PeriodStart, &st.PeriodEnd, &opening, &closing, &st.TotalDebits, &st.TotalCredits, &st.TransactionCount,
		&verified, &st.Notes, &st.ImportedAt}
	if withCounts {
		dest = append(dest, &st.MatchedCount, &st.UnmatchedCount, &st.IgnoredCount)
	}
	if err := s.Scan(dest...); err != nil {
		return nil, err
	}
	st.OpeningBalance = intPtr(opening)
	st.ClosingBalance = intPtr(closing)
	st.BalanceVerified = verified == 1
	return &st, nil
}

func (BankStatementRepo) Insert(ctx context.Context, db DBTX, s *models.BankStatement) error {
	_, err := db.ExecContext(ctx, `INSERT INTO bank_statements
		(user_id, id, provider, account_id, file_name, file_sha256, file_size, account_number, account_holder, period_start, period_end,
		 opening_balance, closing_balance, total_debits, total_credits, transaction_count, balance_verified, notes, imported_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		s.UserID, s.ID, s.Provider, s.AccountID, s.FileName, s.FileSHA256, s.FileSize, s.AccountNumber, s.AccountHolder, s.PeriodStart, s.PeriodEnd,
		nullInt(s.OpeningBalance), nullInt(s.ClosingBalance), s.TotalDebits, s.TotalCredits, s.TransactionCount, boolInt(s.BalanceVerified), s.Notes, s.ImportedAt)
	return err
}

// Get returns the statement with reconciliation counts, or nil.
func (BankStatementRepo) Get(ctx context.Context, db DBTX, userID, id string) (*StatementWithCounts, error) {
	st, err := scanStatement(db.QueryRowContext(ctx, `SELECT `+stmtCountCols+stmtCountFrom+` WHERE s.id = ? AND s.user_id = ? GROUP BY s.id`, id, userID), true)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return st, err
}

// List returns every statement, newest import first.
func (BankStatementRepo) List(ctx context.Context, db DBTX, userID string) ([]StatementWithCounts, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+stmtCountCols+stmtCountFrom+` WHERE s.user_id = ? GROUP BY s.id ORDER BY s.imported_at DESC, s.period_end DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StatementWithCounts{}
	for rows.Next() {
		st, err := scanStatement(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, *st)
	}
	return out, rows.Err()
}

// GetBySHA256 returns the earliest statement imported from the same bytes.
func (BankStatementRepo) GetBySHA256(ctx context.Context, db DBTX, userID, sha string) (*models.BankStatement, error) {
	st, err := scanStatement(db.QueryRowContext(ctx, `SELECT `+stmtCols+` FROM bank_statements s WHERE s.user_id = ? AND s.file_sha256 = ? ORDER BY s.imported_at LIMIT 1`, userID, sha), false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &st.BankStatement, nil
}

// FindOverlapping returns the first statement for the account whose period
// overlaps [start, end], or nil.
func (BankStatementRepo) FindOverlapping(ctx context.Context, db DBTX, userID, accountID, start, end string) (*models.BankStatement, error) {
	st, err := scanStatement(db.QueryRowContext(ctx, `SELECT `+stmtCols+` FROM bank_statements s
		WHERE s.user_id = ? AND s.account_id = ? AND s.period_start <= ? AND s.period_end >= ? ORDER BY s.period_start LIMIT 1`, userID, accountID, end, start), false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &st.BankStatement, nil
}

func (BankStatementRepo) Delete(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM bank_statements WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

type BankTransactionRepo struct{}

func (BankTransactionRepo) Insert(ctx context.Context, db DBTX, t *models.BankTransaction) error {
	_, err := db.ExecContext(ctx, `INSERT INTO bank_transactions
		(user_id, id, statement_id, account_id, line_no, transaction_date, value_date, description, reference, debit, credit, balance, fingerprint, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.UserID, t.ID, t.StatementID, t.AccountID, t.LineNo, t.TransactionDate, nullStr(t.ValueDate), t.Description, t.Reference,
		t.Debit, t.Credit, nullInt(t.Balance), t.Fingerprint, t.CreatedAt)
	return err
}

// ExistingFingerprints returns, for each fingerprint already stored for the
// account, the statement that holds it.
func (BankTransactionRepo) ExistingFingerprints(ctx context.Context, db DBTX, userID, accountID string, fps []string) (map[string]string, error) {
	out := map[string]string{}
	const chunk = 400
	for start := 0; start < len(fps); start += chunk {
		end := start + chunk
		if end > len(fps) {
			end = len(fps)
		}
		part := fps[start:end]
		placeholders := make([]string, len(part))
		args := make([]any, 0, len(part)+2)
		args = append(args, userID, accountID)
		for i, fp := range part {
			placeholders[i] = "?"
			args = append(args, fp)
		}
		rows, err := db.QueryContext(ctx, `SELECT fingerprint, statement_id FROM bank_transactions
			WHERE user_id = ? AND account_id = ? AND fingerprint IN (`+strings.Join(placeholders, ",")+`)`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var fp, sid string
			if err := rows.Scan(&fp, &sid); err != nil {
				_ = rows.Close()
				return nil, err
			}
			out[fp] = sid
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, err
		}
		_ = rows.Close()
	}
	return out, nil
}

const bankTxCols = `bt.user_id, bt.id, bt.statement_id, bt.account_id, bt.line_no, bt.transaction_date, bt.value_date, bt.description, bt.reference,
	bt.debit, bt.credit, bt.balance, bt.fingerprint, bt.created_at,
	r.id, r.transaction_id, r.status, r.match_type, r.rule, r.confidence, r.amount_diff, r.date_diff_days, r.note, r.created_at`

// ListByStatement returns the statement's rows ordered by line_no with their
// reconciliation state and, when matched, the linked transaction.
func (BankTransactionRepo) ListByStatement(ctx context.Context, db DBTX, userID, statementID string) ([]BankTransactionWithStatus, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+bankTxCols+` FROM bank_transactions bt
		LEFT JOIN reconciliations r ON r.bank_transaction_id = bt.id
		WHERE bt.statement_id = ? AND bt.user_id = ? ORDER BY bt.line_no, bt.created_at`, statementID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BankTransactionWithStatus{}
	for rows.Next() {
		var t BankTransactionWithStatus
		var valueDate sql.NullString
		var balance sql.NullInt64
		var rID, rTxID, rStatus, rMatch, rRule, rNote, rCreated sql.NullString
		var rConf, rAmt, rDays sql.NullInt64
		if err := rows.Scan(&t.UserID, &t.ID, &t.StatementID, &t.AccountID, &t.LineNo, &t.TransactionDate, &valueDate, &t.Description, &t.Reference,
			&t.Debit, &t.Credit, &balance, &t.Fingerprint, &t.CreatedAt,
			&rID, &rTxID, &rStatus, &rMatch, &rRule, &rConf, &rAmt, &rDays, &rNote, &rCreated); err != nil {
			return nil, err
		}
		t.ValueDate = strPtr(valueDate)
		t.Balance = intPtr(balance)
		t.Status = "unrecorded"
		if rID.Valid {
			t.Status = rStatus.String
			t.Reconciliation = &models.Reconciliation{
				ID: rID.String, BankTransactionID: t.ID, TransactionID: strPtr(rTxID), Status: rStatus.String, MatchType: rMatch.String,
				Rule: rRule.String, Confidence: int(rConf.Int64), AmountDiff: rAmt.Int64, DateDiffDays: int(rDays.Int64), Note: rNote.String, CreatedAt: rCreated.String,
			}
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		rec := out[i].Reconciliation
		if rec == nil || rec.TransactionID == nil {
			continue
		}
		tx, err := TransactionRepo{}.Get(ctx, db, userID, *rec.TransactionID)
		if err != nil {
			return nil, err
		}
		out[i].Transaction = tx
	}
	return out, nil
}
