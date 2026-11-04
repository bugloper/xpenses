package reconciliation

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
)

// Repo owns the reconciliations table and runs read-only queries against
// bank_statements and bank_transactions (whose write path belongs to the
// statement import service). Every method takes the signed-in user's id and
// only ever sees that user's rows.
type Repo struct{}

const statementCols = `id, provider, account_id, file_name, file_sha256, file_size, account_number, account_holder,
	period_start, period_end, opening_balance, closing_balance, total_debits, total_credits, transaction_count,
	balance_verified, notes, imported_at`

func scanStatement(s interface{ Scan(...any) error }) (*models.BankStatement, error) {
	var st models.BankStatement
	var opening, closing sql.NullInt64
	var verified int
	if err := s.Scan(&st.ID, &st.Provider, &st.AccountID, &st.FileName, &st.FileSHA256, &st.FileSize, &st.AccountNumber,
		&st.AccountHolder, &st.PeriodStart, &st.PeriodEnd, &opening, &closing, &st.TotalDebits, &st.TotalCredits,
		&st.TransactionCount, &verified, &st.Notes, &st.ImportedAt); err != nil {
		return nil, err
	}
	if opening.Valid {
		v := opening.Int64
		st.OpeningBalance = &v
	}
	if closing.Valid {
		v := closing.Int64
		st.ClosingBalance = &v
	}
	st.BalanceVerified = verified == 1
	return &st, nil
}

func (Repo) GetStatement(ctx context.Context, db repositories.DBTX, userID, id string) (*models.BankStatement, error) {
	st, err := scanStatement(db.QueryRowContext(ctx, `SELECT `+statementCols+` FROM bank_statements WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return st, err
}

const bankTxCols = `id, statement_id, account_id, line_no, transaction_date, value_date, description, reference,
	debit, credit, balance, fingerprint, created_at`

func scanBankTx(s interface{ Scan(...any) error }) (*models.BankTransaction, error) {
	var b models.BankTransaction
	var valueDate sql.NullString
	var balance sql.NullInt64
	if err := s.Scan(&b.ID, &b.StatementID, &b.AccountID, &b.LineNo, &b.TransactionDate, &valueDate, &b.Description,
		&b.Reference, &b.Debit, &b.Credit, &balance, &b.Fingerprint, &b.CreatedAt); err != nil {
		return nil, err
	}
	if valueDate.Valid {
		v := valueDate.String
		b.ValueDate = &v
	}
	if balance.Valid {
		v := balance.Int64
		b.Balance = &v
	}
	return &b, nil
}

func (Repo) GetBankTransaction(ctx context.Context, db repositories.DBTX, userID, id string) (*models.BankTransaction, error) {
	b, err := scanBankTx(db.QueryRowContext(ctx, `SELECT `+bankTxCols+` FROM bank_transactions WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return b, err
}

func (Repo) ListBankTransactions(ctx context.Context, db repositories.DBTX, userID, statementID string) ([]models.BankTransaction, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+bankTxCols+` FROM bank_transactions WHERE statement_id = ? AND user_id = ? ORDER BY line_no, created_at, id`, statementID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.BankTransaction{}
	for rows.Next() {
		b, err := scanBankTx(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// CountUnreconciledBank counts the user's bank transactions with no reconciliation row.
func (Repo) CountUnreconciledBank(ctx context.Context, db repositories.DBTX, userID string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bank_transactions b
		LEFT JOIN reconciliations r ON r.bank_transaction_id = b.id WHERE b.user_id = ? AND r.id IS NULL`, userID).Scan(&n)
	return n, err
}

const reconCols = `id, bank_transaction_id, transaction_id, status, match_type, rule, confidence, amount_diff, date_diff_days, note, created_at`

func scanRecon(s interface{ Scan(...any) error }) (*models.Reconciliation, error) {
	var r models.Reconciliation
	var txID sql.NullString
	if err := s.Scan(&r.ID, &r.BankTransactionID, &txID, &r.Status, &r.MatchType, &r.Rule, &r.Confidence, &r.AmountDiff,
		&r.DateDiffDays, &r.Note, &r.CreatedAt); err != nil {
		return nil, err
	}
	if txID.Valid {
		v := txID.String
		r.TransactionID = &v
	}
	return &r, nil
}

func (Repo) GetByBankTransaction(ctx context.Context, db repositories.DBTX, userID, bankTxID string) (*models.Reconciliation, error) {
	r, err := scanRecon(db.QueryRowContext(ctx, `SELECT `+reconCols+` FROM reconciliations WHERE bank_transaction_id = ? AND user_id = ?`, bankTxID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

func (Repo) GetByTransaction(ctx context.Context, db repositories.DBTX, userID, txID string) (*models.Reconciliation, error) {
	r, err := scanRecon(db.QueryRowContext(ctx, `SELECT `+reconCols+` FROM reconciliations WHERE transaction_id = ? AND user_id = ?`, txID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

func (Repo) ListByStatement(ctx context.Context, db repositories.DBTX, userID, statementID string) ([]models.Reconciliation, error) {
	rows, err := db.QueryContext(ctx, `SELECT r.id, r.bank_transaction_id, r.transaction_id, r.status, r.match_type, r.rule,
		r.confidence, r.amount_diff, r.date_diff_days, r.note, r.created_at FROM reconciliations r
		JOIN bank_transactions b ON b.id = r.bank_transaction_id WHERE b.statement_id = ? AND r.user_id = ? ORDER BY b.line_no`, statementID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Reconciliation{}
	for rows.Next() {
		r, err := scanRecon(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (Repo) Insert(ctx context.Context, db repositories.DBTX, r *models.Reconciliation) error {
	var txID any
	if r.TransactionID != nil && *r.TransactionID != "" {
		txID = *r.TransactionID
	}
	_, err := db.ExecContext(ctx, `INSERT INTO reconciliations
		(user_id, id, bank_transaction_id, transaction_id, status, match_type, rule, confidence, amount_diff, date_diff_days, note, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.UserID, r.ID, r.BankTransactionID, txID, r.Status, r.MatchType, r.Rule, r.Confidence, r.AmountDiff, r.DateDiffDays, r.Note, r.CreatedAt)
	return err
}

func (Repo) DeleteByBankTransaction(ctx context.Context, db repositories.DBTX, userID, bankTxID string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM reconciliations WHERE bank_transaction_id = ? AND user_id = ?`, bankTxID, userID)
	return err
}

// StatementOverview is one row of GET /reconciliation.
type StatementOverview struct {
	StatementID string `json:"statement_id"`
	FileName    string `json:"file_name"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	AccountID   string `json:"account_id"`
	AccountName string `json:"account_name"`
	Total       int    `json:"total"`
	Matched     int    `json:"matched"`
	Unrecorded  int    `json:"unrecorded"`
	Ignored     int    `json:"ignored"`
	Transfer    int    `json:"transfer"`
}

// ListOverview lists the user's statements with their reconciliation tallies.
func (Repo) ListOverview(ctx context.Context, db repositories.DBTX, userID string) ([]StatementOverview, error) {
	rows, err := db.QueryContext(ctx, `SELECT s.id, s.file_name, s.period_start, s.period_end, s.account_id, a.name,
		(SELECT COUNT(*) FROM bank_transactions b WHERE b.statement_id = s.id),
		(SELECT COUNT(*) FROM bank_transactions b JOIN reconciliations r ON r.bank_transaction_id = b.id WHERE b.statement_id = s.id AND r.status = 'matched'),
		(SELECT COUNT(*) FROM bank_transactions b JOIN reconciliations r ON r.bank_transaction_id = b.id WHERE b.statement_id = s.id AND r.status = 'ignored'),
		(SELECT COUNT(*) FROM bank_transactions b JOIN reconciliations r ON r.bank_transaction_id = b.id WHERE b.statement_id = s.id AND r.status = 'transfer')
		FROM bank_statements s JOIN accounts a ON a.id = s.account_id AND a.user_id = s.user_id
		WHERE s.user_id = ?
		ORDER BY s.period_end DESC, s.imported_at DESC, s.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StatementOverview{}
	for rows.Next() {
		var o StatementOverview
		if err := rows.Scan(&o.StatementID, &o.FileName, &o.PeriodStart, &o.PeriodEnd, &o.AccountID, &o.AccountName,
			&o.Total, &o.Matched, &o.Ignored, &o.Transfer); err != nil {
			return nil, err
		}
		o.Unrecorded = o.Total - o.Matched - o.Ignored - o.Transfer
		out = append(out, o)
	}
	return out, rows.Err()
}
