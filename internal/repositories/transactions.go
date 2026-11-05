package repositories

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/bugloper/xpenses/internal/dto"
	"github.com/bugloper/xpenses/internal/models"
)

type TransactionRepo struct{}

const txCols = `t.user_id, t.id, t.type, t.amount, t.currency, t.account_id, a.name, t.transfer_account_id, COALESCE(ta.name,''),
	t.category_id, COALESCE(c.name,''), COALESCE(c.icon,''), COALESCE(c.color,''),
	t.description, t.payee, t.transaction_date, t.notes, t.origin, t.status, t.recurring_id,
	t.client_id, t.created_at, t.updated_at, t.attachment_mime,
	t.receipt_bank, t.receipt_reference, t.receipt_payment_type, t.receipt_date, t.receipt_time`

const txFrom = ` FROM transactions t
	JOIN accounts a ON a.id = t.account_id
	LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
	LEFT JOIN categories c ON c.id = t.category_id`

func scanTx(s interface{ Scan(...any) error }) (*models.Transaction, error) {
	var t models.Transaction
	var transferID, catID, recID, clientID sql.NullString
	var rc models.Receipt
	if err := s.Scan(&t.UserID, &t.ID, &t.Type, &t.Amount, &t.Currency, &t.AccountID, &t.AccountName, &transferID, &t.TransferAccountName,
		&catID, &t.CategoryName, &t.CategoryIcon, &t.CategoryColor,
		&t.Description, &t.Payee, &t.TransactionDate, &t.Notes, &t.Origin, &t.Status, &recID,
		&clientID, &t.CreatedAt, &t.UpdatedAt, &t.AttachmentMime,
		&rc.Bank, &rc.Reference, &rc.PaymentType, &rc.Date, &rc.Time); err != nil {
		return nil, err
	}
	t.TransferAccountID = strPtr(transferID)
	t.CategoryID = strPtr(catID)
	t.RecurringID = strPtr(recID)
	t.ClientID = strPtr(clientID)
	t.Tags = []string{}
	t.HasAttachment = t.AttachmentMime != ""
	if !rc.IsEmpty() {
		t.Receipt = &rc
	}
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
		where = append(where, `(LOWER(t.description) LIKE ? OR LOWER(t.payee) LIKE ? OR LOWER(t.notes) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(t.receipt_reference) LIKE ?)`)
		args = append(args, like, like, like, like, like)
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
		// A main category includes its sub-categories.
		where = append(where, `(t.category_id = ? OR t.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = ?))`)
		args = append(args, f.CategoryID, f.CategoryID)
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
		 transaction_date, notes, origin, status, recurring_id, client_id, created_at, updated_at,
		 receipt_bank, receipt_reference, receipt_payment_type, receipt_date, receipt_time)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.UserID, t.ID, t.Type, t.Amount, t.Currency, t.AccountID, nullStr(t.TransferAccountID), nullStr(t.CategoryID),
		t.Description, t.Payee, t.TransactionDate, t.Notes, t.Origin, t.Status, nullStr(t.RecurringID),
		nullStr(t.ClientID), t.CreatedAt, t.UpdatedAt,
		rcField(t.Receipt, 0), rcField(t.Receipt, 1), rcField(t.Receipt, 2), rcField(t.Receipt, 3), rcField(t.Receipt, 4))
	return err
}

func (TransactionRepo) Update(ctx context.Context, db DBTX, t *models.Transaction) error {
	_, err := db.ExecContext(ctx, `UPDATE transactions SET type=?, amount=?, currency=?, account_id=?, transfer_account_id=?,
		category_id=?, description=?, payee=?, transaction_date=?, notes=?, status=?, updated_at=?,
		receipt_bank=?, receipt_reference=?, receipt_payment_type=?, receipt_date=?, receipt_time=? WHERE id=? AND user_id=?`,
		t.Type, t.Amount, t.Currency, t.AccountID, nullStr(t.TransferAccountID), nullStr(t.CategoryID),
		t.Description, t.Payee, t.TransactionDate, t.Notes, t.Status, t.UpdatedAt,
		rcField(t.Receipt, 0), rcField(t.Receipt, 1), rcField(t.Receipt, 2), rcField(t.Receipt, 3), rcField(t.Receipt, 4), t.ID, t.UserID)
	return err
}

// rcField reads one receipt column value, "" for a missing receipt.
func rcField(r *models.Receipt, i int) string {
	if r == nil {
		return ""
	}
	switch i {
	case 0:
		return r.Bank
	case 1:
		return r.Reference
	case 2:
		return r.PaymentType
	case 3:
		return r.Date
	default:
		return r.Time
	}
}

// SetReceipt stores (nil clears) the details read from the attached screenshot.
func (TransactionRepo) SetReceipt(ctx context.Context, db DBTX, userID, id string, r *models.Receipt) error {
	_, err := db.ExecContext(ctx, `UPDATE transactions SET receipt_bank=?, receipt_reference=?, receipt_payment_type=?, receipt_date=?, receipt_time=? WHERE id=? AND user_id=?`,
		rcField(r, 0), rcField(r, 1), rcField(r, 2), rcField(r, 3), rcField(r, 4), id, userID)
	return err
}

// SetAttachmentMime records (or with "" clears) the transaction's attached image type.
func (TransactionRepo) SetAttachmentMime(ctx context.Context, db DBTX, userID, id, mime string) error {
	_, err := db.ExecContext(ctx, `UPDATE transactions SET attachment_mime = ? WHERE id = ? AND user_id = ?`, mime, id, userID)
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
