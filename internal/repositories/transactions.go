package repositories

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/bugloper/xpensiv/internal/dto"
	"github.com/bugloper/xpensiv/internal/models"
)

type TransactionRepo struct{}

const txCols = `t.user_id, t.id, t.type, t.amount, t.currency, t.account_id, a.name, t.transfer_account_id, COALESCE(ta.name,''),
	t.category_id, COALESCE(c.name,''), COALESCE(c.icon,''), COALESCE(c.color,''),
	t.description, t.payee, t.transaction_date, t.notes, t.origin, t.status, t.recurring_id,
	t.source_bank_transaction_id, t.client_id, t.created_at, t.updated_at,
	r.bank_transaction_id, COALESCE(r.status,'')`

const txFrom = ` FROM transactions t
	JOIN accounts a ON a.id = t.account_id
	LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
	LEFT JOIN categories c ON c.id = t.category_id
	LEFT JOIN reconciliations r ON r.transaction_id = t.id`

func scanTx(s interface{ Scan(...any) error }) (*models.Transaction, error) {
	var t models.Transaction
	var transferID, catID, recID, srcID, clientID, bankTxID sql.NullString
	if err := s.Scan(&t.UserID, &t.ID, &t.Type, &t.Amount, &t.Currency, &t.AccountID, &t.AccountName, &transferID, &t.TransferAccountName,
		&catID, &t.CategoryName, &t.CategoryIcon, &t.CategoryColor,
		&t.Description, &t.Payee, &t.TransactionDate, &t.Notes, &t.Origin, &t.Status, &recID,
		&srcID, &clientID, &t.CreatedAt, &t.UpdatedAt, &bankTxID, &t.ReconciliationStatus); err != nil {
		return nil, err
	}
	t.TransferAccountID = strPtr(transferID)
	t.CategoryID = strPtr(catID)
	t.RecurringID = strPtr(recID)
	t.SourceBankTransactionID = strPtr(srcID)
	t.ClientID = strPtr(clientID)
	t.BankTransactionID = strPtr(bankTxID)
	t.Tags = []string{}
	return &t, nil
}

var sortColumns = map[string]string{
	"date":       "t.transaction_date",
	"amount":     "t.amount",
	"created_at": "t.created_at",
	"payee":      "t.payee",
}

func buildFilter(f dto.TransactionFilter) (string, []any) {
	// user_id is always applied; an empty id matches nothing.
	where := []string{`t.user_id = ?`}
	args := []any{f.UserID}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		where = append(where, `(LOWER(t.description) LIKE ? OR LOWER(t.payee) LIKE ? OR LOWER(t.notes) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ?)`)
		args = append(args, like, like, like, like)
	}
	if f.DateFrom != "" {
		where = append(where, `t.transaction_date >= ?`)
		args = append(args, f.DateFrom)
	}
	if f.DateTo != "" {
		where = append(where, `t.transaction_date <= ?`)
		args = append(args, f.DateTo)
	}
	if f.CategoryID != "" {
		where = append(where, `t.category_id = ?`)
		args = append(args, f.CategoryID)
	}
	if f.AccountID != "" {
		where = append(where, `(t.account_id = ? OR t.transfer_account_id = ?)`)
		args = append(args, f.AccountID, f.AccountID)
	}
	if f.Type != "" {
		where = append(where, `t.type = ?`)
		args = append(args, f.Type)
	}
	if f.Status != "" {
		where = append(where, `t.status = ?`)
		args = append(args, f.Status)
	} else {
		where = append(where, `t.status <> 'void'`)
	}
	if f.Origin != "" {
		where = append(where, `t.origin = ?`)
		args = append(args, f.Origin)
	}
	if f.Unmatched {
		where = append(where, `r.id IS NULL`)
	}
	return " WHERE " + strings.Join(where, " AND "), args
}

func (TransactionRepo) List(ctx context.Context, db DBTX, f dto.TransactionFilter) ([]models.Transaction, int, error) {
	whereSQL, args := buildFilter(f)
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*)`+txFrom+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	col, ok := sortColumns[f.Sort]
	if !ok {
		col = "t.transaction_date"
	}
	order := "DESC"
	if strings.EqualFold(f.Order, "asc") {
		order = "ASC"
	}
	q := `SELECT ` + txCols + txFrom + whereSQL + ` ORDER BY ` + col + ` ` + order + `, t.created_at DESC LIMIT ? OFFSET ?`
	args = append(args, f.PerPage, (f.Page-1)*f.PerPage)
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []models.Transaction{}
	for rows.Next() {
		t, err := scanTx(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := attachTags(ctx, db, out); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

func attachTags(ctx context.Context, db DBTX, txs []models.Transaction) error {
	if len(txs) == 0 {
		return nil
	}
	idx := map[string]int{}
	placeholders := make([]string, len(txs))
	args := make([]any, len(txs))
	for i, t := range txs {
		idx[t.ID] = i
		placeholders[i] = "?"
		args[i] = t.ID
	}
	rows, err := db.QueryContext(ctx, `SELECT tt.transaction_id, g.name FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
		WHERE tt.transaction_id IN (`+strings.Join(placeholders, ",")+`) ORDER BY g.name`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return err
		}
		txs[idx[id]].Tags = append(txs[idx[id]].Tags, name)
	}
	return rows.Err()
}

func (TransactionRepo) Get(ctx context.Context, db DBTX, userID, id string) (*models.Transaction, error) {
	t, err := scanTx(db.QueryRowContext(ctx, `SELECT `+txCols+txFrom+` WHERE t.id = ? AND t.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	one := []models.Transaction{*t}
	if err := attachTags(ctx, db, one); err != nil {
		return nil, err
	}
	return &one[0], nil
}

func (TransactionRepo) GetByClientID(ctx context.Context, db DBTX, userID, clientID string) (*models.Transaction, error) {
	t, err := scanTx(db.QueryRowContext(ctx, `SELECT `+txCols+txFrom+` WHERE t.client_id = ? AND t.user_id = ?`, clientID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return t, err
}

func (TransactionRepo) Insert(ctx context.Context, db DBTX, t *models.Transaction) error {
	_, err := db.ExecContext(ctx, `INSERT INTO transactions
		(user_id, id, type, amount, currency, account_id, transfer_account_id, category_id, description, payee,
		 transaction_date, notes, origin, status, recurring_id, source_bank_transaction_id, client_id, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.UserID, t.ID, t.Type, t.Amount, t.Currency, t.AccountID, nullStr(t.TransferAccountID), nullStr(t.CategoryID),
		t.Description, t.Payee, t.TransactionDate, t.Notes, t.Origin, t.Status, nullStr(t.RecurringID),
		nullStr(t.SourceBankTransactionID), nullStr(t.ClientID), t.CreatedAt, t.UpdatedAt)
	return err
}

func (TransactionRepo) Update(ctx context.Context, db DBTX, t *models.Transaction) error {
	_, err := db.ExecContext(ctx, `UPDATE transactions SET type=?, amount=?, currency=?, account_id=?, transfer_account_id=?,
		category_id=?, description=?, payee=?, transaction_date=?, notes=?, status=?, updated_at=? WHERE id=? AND user_id=?`,
		t.Type, t.Amount, t.Currency, t.AccountID, nullStr(t.TransferAccountID), nullStr(t.CategoryID),
		t.Description, t.Payee, t.TransactionDate, t.Notes, t.Status, t.UpdatedAt, t.ID, t.UserID)
	return err
}

func (TransactionRepo) Delete(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM transactions WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

// SetTags replaces the tag set of a transaction, creating tags as needed.
func (TransactionRepo) SetTags(ctx context.Context, db DBTX, userID, txID string, tags []string, newID func() string) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM transaction_tags WHERE transaction_id = ?`, txID); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, raw := range tags {
		name := strings.TrimSpace(strings.ToLower(raw))
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		var tagID string
		err := db.QueryRowContext(ctx, `SELECT id FROM tags WHERE user_id = ? AND name = ?`, userID, name).Scan(&tagID)
		if errors.Is(err, sql.ErrNoRows) {
			tagID = newID()
			if _, err := db.ExecContext(ctx, `INSERT INTO tags (id, user_id, name) VALUES (?,?,?)`, tagID, userID, name); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?,?)`, txID, tagID); err != nil {
			return err
		}
	}
	return nil
}

// CountUnmatchedManual counts cleared manual transactions on bank-type accounts
// that are not linked to any bank transaction. It feeds the dashboard
// (/reports/summary) and the reconciliation overview, and is deliberately
// narrower than a workspace's summary.unmatched_manual, which is scoped to one
// statement's account and period (± tolerance) and also counts pending drafts
// and imported-origin rows that lost their link. The two numbers are not
// expected to agree.
func (TransactionRepo) CountUnmatchedManual(ctx context.Context, db DBTX, userID string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions t
		JOIN accounts a ON a.id = t.account_id
		LEFT JOIN reconciliations r ON r.transaction_id = t.id
		WHERE t.user_id = ? AND t.status = 'cleared' AND t.origin = 'manual' AND r.id IS NULL
		AND a.type IN ('bank','savings','credit_card')`, userID).Scan(&n)
	return n, err
}
