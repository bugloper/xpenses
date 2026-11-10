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
	"github.com/bugloper/xpenses/internal/reports"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

var txTypes = []string{models.TxExpense, models.TxIncome, models.TxTransfer, models.TxRefund, models.TxAdjustment,
	models.TxLoanGiven, models.TxLoanReceived, models.TxLoanRepayment, models.TxLoanRepaymentReceived}

type TransactionService struct {
	DB              *sql.DB
	Repo            repositories.TransactionRepo
	Accounts        repositories.AccountRepo
	Categories      repositories.CategoryRepo
	Loans           repositories.LoanRepo
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
		v.OneOf("type", f.Type, append([]string{"loan"}, txTypes...)...)
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
		t.LoanID = nil
	case models.TxLoanGiven, models.TxLoanReceived, models.TxLoanRepayment, models.TxLoanRepaymentReceived:
		// Lending, borrowing and repaying are not categorised: they are
		// neither income nor expense.
		t.TransferAccountID = nil
		t.CategoryID = nil
		if err := s.validateLoanMovement(ctx, db, t, v); err != nil {
			return err
		}
	default:
		t.TransferAccountID = nil
		if t.Type == models.TxRefund {
			t.LoanID = nil
		} else if t.LoanID != nil {
			// Interest on a loan is an expense or income that names the loan.
			l, err := s.Loans.Get(ctx, db, t.UserID, *t.LoanID)
			if err != nil {
				return apperr.Internal(err)
			}
			if l == nil {
				v.Add("loan_id", "loan not found")
			}
		}
		if t.CategoryID != nil && *t.CategoryID != "" {
			c, err := s.Categories.Get(ctx, db, t.UserID, *t.CategoryID)
			if err != nil {
				return apperr.Internal(err)
			}
			if c == nil {
				v.Add("category_id", "category not found")
			} else {
				want := models.TxExpense
				if t.Type == models.TxIncome {
					want = models.TxIncome
				}
				// A refund gives back money spent, so it takes the expense
				// category it refunds; refunds recorded before that took an
				// income category and may keep it.
				if c.Type != want && t.Type != models.TxRefund {
					v.Add("category_id", "category type does not match transaction type")
				}
			}
		} else {
			t.CategoryID = nil
		}
	}
	return v.Err()
}

// validateLoanMovement checks a loan transaction against its loan: the loan
// exists and runs the right way (lending and being repaid are loans given;
// borrowing and repaying are loans received), the currencies match, and a
// repayment is no more than is still owed.
func (s *TransactionService) validateLoanMovement(ctx context.Context, db repositories.DBTX, t *models.Transaction, v validators.Errors) error {
	if t.LoanID == nil || *t.LoanID == "" {
		v.Add("loan_id", "is required")
		return nil
	}
	l, err := s.Loans.Get(ctx, db, t.UserID, *t.LoanID)
	if err != nil {
		return apperr.Internal(err)
	}
	if l == nil {
		v.Add("loan_id", "loan not found")
		return nil
	}
	if l.Direction != models.LoanDirectionOf(t.Type) {
		if l.Direction == models.LoanGiven {
			v.Add("loan_id", "is money you lent: record lending more or being paid back")
		} else {
			v.Add("loan_id", "is money you borrowed: record borrowing more or paying it back")
		}
		return nil
	}
	if t.Currency != l.Currency {
		v.Add("currency", "must be the loan's currency ("+l.Currency+")")
	}
	if models.IsLoanRepayment(t.Type) && t.Status == models.StatusCleared && t.Amount > 0 {
		owed, err := s.Loans.Outstanding(ctx, db, t.UserID, l.ID, t.ID)
		if err != nil {
			return apperr.Internal(err)
		}
		if t.Amount > owed {
			v.Add("amount", "is more than the "+reports.FormatMoney(owed)+" still owed")
		}
	}
	return nil
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
	if models.LoanDirectionOf(t.Type) != "" || t.Type == models.TxIncome || t.Type == models.TxExpense {
		t.LoanID = req.LoanID
	}
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := s.startLoan(ctx, tx, t, req.NewLoan); err != nil {
			return err
		}
		if req.Interest < 0 || (req.Interest > 0 && !models.IsLoanRepayment(t.Type)) {
			return apperr.Validation("validation failed", map[string]string{"interest": "goes only with a loan repayment, and must be positive"})
		}
		if err := s.validate(ctx, tx, t); err != nil {
			return err
		}
		t.Receipt = cleanReceipt(req.Receipt)
		if err := s.Repo.Insert(ctx, tx, t); err != nil {
			return apperr.Internal(err)
		}
		if err := s.Repo.SetTags(ctx, tx, t.UserID, t.ID, req.Tags, NewID); err != nil {
			return err
		}
		if req.Interest > 0 {
			return s.insertInterest(ctx, tx, t, req.Interest)
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	full, err := s.Get(ctx, t.ID)
	return full, true, err
}

// startLoan creates the loan a lending or borrowing transaction starts, when
// it names a person instead of an existing loan. The loan begins on the
// transaction's date, in its currency, owing nothing until the transaction
// itself is counted.
func (s *TransactionService) startLoan(ctx context.Context, db repositories.DBTX, t *models.Transaction, nl *dto.NewLoan) error {
	if nl == nil || (t.Type != models.TxLoanGiven && t.Type != models.TxLoanReceived) || (t.LoanID != nil && *t.LoanID != "") {
		return nil
	}
	l := &models.Loan{UserID: t.UserID, ID: NewID(), Direction: models.LoanDirectionOf(t.Type),
		Counterparty: strings.TrimSpace(nl.Counterparty), Currency: t.Currency, StartDate: t.TransactionDate,
		DueDate: nl.DueDate, CreatedAt: t.CreatedAt, UpdatedAt: t.CreatedAt}
	if l.Currency == "" {
		l.Currency = s.DefaultCurrency
	}
	if err := validateLoan(l); err != nil {
		return err
	}
	if err := s.Loans.Insert(ctx, db, l); err != nil {
		return apperr.Internal(err)
	}
	t.LoanID = &l.ID
	return nil
}

// insertInterest records the interest paid or received with a repayment as
// its own expense (paying a loan back) or income (being paid back), filed
// under the default Interest payments / Interest category when the user has
// it, and tied to the loan so the loan shows what it cost or earned.
func (s *TransactionService) insertInterest(ctx context.Context, db repositories.DBTX, principal *models.Transaction, amount int64) error {
	l, err := s.Loans.Get(ctx, db, principal.UserID, *principal.LoanID)
	if err != nil {
		return apperr.Internal(err)
	}
	typ, catName, desc := models.TxExpense, "Interest payments", "Interest to "+l.Counterparty
	if principal.Type == models.TxLoanRepaymentReceived {
		typ, catName, desc = models.TxIncome, "Interest", "Interest from "+l.Counterparty
	}
	in := &models.Transaction{UserID: principal.UserID, ID: NewID(), Type: typ, Amount: amount, Currency: principal.Currency,
		AccountID: principal.AccountID, Description: desc, TransactionDate: principal.TransactionDate,
		Origin: models.OriginManual, Status: principal.Status, LoanID: principal.LoanID,
		CreatedAt: principal.CreatedAt, UpdatedAt: principal.UpdatedAt}
	c, err := s.Categories.FindByName(ctx, db, principal.UserID, catName, typ)
	if err != nil {
		return apperr.Internal(err)
	}
	if c != nil {
		in.CategoryID = &c.ID
	}
	if err := s.validate(ctx, db, in); err != nil {
		return err
	}
	if err := s.Repo.Insert(ctx, db, in); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

func (s *TransactionService) Update(ctx context.Context, id string, req dto.UpdateTransactionRequest) (*models.Transaction, error) {
	t, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Type != nil {
		// A loan movement turned into anything else leaves its loan.
		if models.LoanDirectionOf(t.Type) != "" && models.LoanDirectionOf(*req.Type) == "" {
			t.LoanID = nil
		}
		t.Type = *req.Type
	}
	if req.LoanID != nil {
		t.LoanID = req.LoanID
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
		LoanID: src.LoanID,
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
