package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/ocr"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

var txTypes = []string{models.TxExpense, models.TxIncome, models.TxTransfer, models.TxRefund, models.TxAdjustment}

type TransactionService struct {
	DB              *sql.DB
	Repo            repositories.TransactionRepo
	Accounts        repositories.AccountRepo
	Categories      repositories.CategoryRepo
	DefaultCurrency string
	// AttachmentsDir holds one image per transaction (see attachments.go).
	AttachmentsDir string
	MaxUploadBytes int64
	// OCR reads payment screenshots; nil or unavailable means receipts are typed by hand.
	OCR *ocr.Engine
}

func (s *TransactionService) List(ctx context.Context, f dto.TransactionFilter) ([]models.Transaction, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PerPage < 1 || f.PerPage > 200 {
		f.PerPage = 50
	}
	f.UserID = auth.UserID(ctx)
	v := validators.Errors{}
	v.Date("date_from", f.DateFrom)
	v.Date("date_to", f.DateTo)
	if f.Type != "" {
		v.OneOf("type", f.Type, txTypes...)
	}
	if err := v.Err(); err != nil {
		return nil, 0, err
	}
	txs, total, err := s.Repo.List(ctx, s.DB, f)
	if err != nil {
		return nil, 0, apperr.Internal(err)
	}
	return txs, total, nil
}

func (s *TransactionService) Get(ctx context.Context, id string) (*models.Transaction, error) {
	t, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if t == nil {
		return nil, apperr.NotFound("transaction")
	}
	return t, nil
}

// validate enforces the invariants shared by create and update. It checks the
// referenced account/category exist and that the type/category/transfer
// combination is coherent.
func (s *TransactionService) validate(ctx context.Context, db repositories.DBTX, t *models.Transaction) error {
	v := validators.Errors{}
	v.OneOf("type", t.Type, txTypes...)
	v.Date("transaction_date", t.TransactionDate)
	v.Required("transaction_date", t.TransactionDate)
	v.OneOf("status", t.Status, models.StatusCleared, models.StatusPending, models.StatusVoid)
	v.MaxLen("description", t.Description, 500)
	v.MaxLen("payee", t.Payee, 200)
	v.MaxLen("notes", t.Notes, 2000)
	if t.Type == models.TxAdjustment {
		if t.Amount == 0 {
			v.Add("amount", "must not be zero")
		}
	} else {
		v.Positive("amount", t.Amount)
	}
	if t.Currency == "" {
		t.Currency = s.DefaultCurrency
	}
	v.Currency("currency", t.Currency)

	acct, err := s.Accounts.Get(ctx, db, t.UserID, t.AccountID)
	if err != nil {
		return apperr.Internal(err)
	}
	if acct == nil {
		v.Add("account_id", "account not found")
	}

	switch t.Type {
	case models.TxTransfer:
		if t.TransferAccountID == nil || *t.TransferAccountID == "" {
			v.Add("transfer_account_id", "is required for transfers")
		} else if *t.TransferAccountID == t.AccountID {
			v.Add("transfer_account_id", "must differ from the source account")
		} else {
			dest, err := s.Accounts.Get(ctx, db, t.UserID, *t.TransferAccountID)
			if err != nil {
				return apperr.Internal(err)
			}
			if dest == nil {
				v.Add("transfer_account_id", "account not found")
			}
		}
		// Transfers are never categorised: they are neither income nor expense.
		t.CategoryID = nil
	case models.TxAdjustment:
		t.TransferAccountID = nil
		t.CategoryID = nil
	default:
		t.TransferAccountID = nil
		if t.CategoryID != nil && *t.CategoryID != "" {
			c, err := s.Categories.Get(ctx, db, t.UserID, *t.CategoryID)
			if err != nil {
				return apperr.Internal(err)
			}
			if c == nil {
				v.Add("category_id", "category not found")
			} else {
				want := models.TxExpense
				if t.Type == models.TxIncome || t.Type == models.TxRefund {
					want = models.TxIncome
				}
				if c.Type != want {
					v.Add("category_id", "category type does not match transaction type")
				}
			}
		} else {
			t.CategoryID = nil
		}
	}
	return v.Err()
}

func (s *TransactionService) Create(ctx context.Context, req dto.CreateTransactionRequest) (*models.Transaction, bool, error) {
	// Idempotent replay for the offline queue.
	if req.ClientID != nil && *req.ClientID != "" {
		existing, err := s.Repo.GetByClientID(ctx, s.DB, auth.UserID(ctx), *req.ClientID)
		if err != nil {
			return nil, false, apperr.Internal(err)
		}
		if existing != nil {
			full, err := s.Get(ctx, existing.ID)
			return full, false, err
		}
	}
	if req.Status == "" {
		req.Status = models.StatusCleared
	}
	now := models.NowUTC()
	t := &models.Transaction{
		UserID: auth.UserID(ctx), ID: NewID(), Type: req.Type, Amount: req.Amount, Currency: req.Currency, AccountID: req.AccountID,
		TransferAccountID: req.TransferAccountID, CategoryID: req.CategoryID,
		Description: strings.TrimSpace(req.Description), Payee: strings.TrimSpace(req.Payee),
		TransactionDate: req.TransactionDate, Notes: strings.TrimSpace(req.Notes),
		Origin: models.OriginManual, Status: req.Status, ClientID: req.ClientID, CreatedAt: now, UpdatedAt: now,
	}
	if t.Type == models.TxAdjustment {
		t.Origin = models.OriginAdjustment
	}
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := s.validate(ctx, tx, t); err != nil {
			return err
		}
		t.Receipt = cleanReceipt(req.Receipt)
		if err := s.Repo.Insert(ctx, tx, t); err != nil {
			return apperr.Internal(err)
		}
		return s.Repo.SetTags(ctx, tx, t.UserID, t.ID, req.Tags, NewID)
	})
	if err != nil {
		return nil, false, err
	}
	full, err := s.Get(ctx, t.ID)
	return full, true, err
}

func (s *TransactionService) Update(ctx context.Context, id string, req dto.UpdateTransactionRequest) (*models.Transaction, error) {
	t, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Type != nil {
		t.Type = *req.Type
	}
	if req.Amount != nil {
		t.Amount = *req.Amount
	}
	if req.Currency != nil {
		t.Currency = *req.Currency
	}
	if req.AccountID != nil {
		t.AccountID = *req.AccountID
	}
	if req.ClearTransferAccount {
		t.TransferAccountID = nil
	} else if req.TransferAccountID != nil {
		t.TransferAccountID = req.TransferAccountID
	}
	if req.ClearCategory {
		t.CategoryID = nil
	} else if req.CategoryID != nil {
		t.CategoryID = req.CategoryID
	}
	if req.Description != nil {
		t.Description = strings.TrimSpace(*req.Description)
	}
	if req.Payee != nil {
		t.Payee = strings.TrimSpace(*req.Payee)
	}
	if req.TransactionDate != nil {
		t.TransactionDate = *req.TransactionDate
	}
	if req.Notes != nil {
		t.Notes = strings.TrimSpace(*req.Notes)
	}
	if req.Status != nil {
		t.Status = *req.Status
	}
	if req.ClearReceipt {
		t.Receipt = nil
	} else if req.Receipt != nil {
		t.Receipt = cleanReceipt(req.Receipt)
	}
	t.UpdatedAt = models.NowUTC()
	err = repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := s.validate(ctx, tx, t); err != nil {
			return err
		}
		if err := s.Repo.Update(ctx, tx, t); err != nil {
			return apperr.Internal(err)
		}
		if req.Tags != nil {
			return s.Repo.SetTags(ctx, tx, t.UserID, t.ID, *req.Tags, NewID)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *TransactionService) Delete(ctx context.Context, id string) error {
	t, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.Repo.Delete(ctx, s.DB, auth.UserID(ctx), id); err != nil {
		return apperr.Internal(err)
	}
	if t.AttachmentMime != "" {
		s.removeAttachmentFile(t.UserID, t.ID)
	}
	return nil
}

// Duplicate creates a copy of a transaction dated today (or the given date).
func (s *TransactionService) Duplicate(ctx context.Context, id string, date string) (*models.Transaction, error) {
	src, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if date == "" {
		date = models.Today()
	}
	t, _, err := s.Create(ctx, dto.CreateTransactionRequest{
		Type: src.Type, Amount: src.Amount, Currency: src.Currency, AccountID: src.AccountID,
		TransferAccountID: src.TransferAccountID, CategoryID: src.CategoryID, Description: src.Description,
		Payee: src.Payee, TransactionDate: date, Notes: src.Notes, Tags: src.Tags, Status: models.StatusCleared,
	})
	return t, err
}

// MaxBulkDelete caps how many transactions one bulk delete may remove.
const MaxBulkDelete = 500

// DeleteMany removes the given transactions of the signed-in user in one
// database transaction and returns how many were removed. Ids that do not
// exist or belong to someone else are skipped, like a single delete's 404.
func (s *TransactionService) DeleteMany(ctx context.Context, ids []string) (int, error) {
	uniq := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		if id = strings.TrimSpace(id); id != "" && !seen[id] {
			seen[id] = true
			uniq = append(uniq, id)
		}
	}
	if len(uniq) == 0 {
		return 0, apperr.Validation("nothing to delete", map[string]string{"ids": "required"})
	}
	if len(uniq) > MaxBulkDelete {
		return 0, apperr.Validation("too many transactions", map[string]string{"ids": fmt.Sprintf("at most %d at a time", MaxBulkDelete)})
	}
	uid := auth.UserID(ctx)
	var withFile []string
	deleted := 0
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		for _, id := range uniq {
			t, err := s.Repo.Get(ctx, tx, uid, id)
			if err != nil {
				return err
			}
			if t == nil {
				continue
			}
			if err := s.Repo.Delete(ctx, tx, uid, id); err != nil {
				return err
			}
			deleted++
			if t.AttachmentMime != "" {
				withFile = append(withFile, id)
			}
		}
		return nil
	})
	if err != nil {
		return 0, apperr.Internal(err)
	}
	for _, id := range withFile {
		s.removeAttachmentFile(uid, id)
	}
	return deleted, nil
}
