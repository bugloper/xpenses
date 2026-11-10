package services

import (
	"context"
	"database/sql"
	"strings"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/reports"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

// LoanService manages loans. Money only moves through transactions (see
// TransactionService); a loan created here directly carries what was owed
// before it was recorded, as its opening amount.
type LoanService struct {
	DB              *sql.DB
	Repo            repositories.LoanRepo
	DefaultCurrency string
}

func validateLoan(l *models.Loan) error {
	v := validators.Errors{}
	v.OneOf("direction", l.Direction, models.LoanGiven, models.LoanReceived)
	v.Required("counterparty", l.Counterparty)
	v.MaxLen("counterparty", l.Counterparty, 120)
	v.MaxLen("notes", l.Notes, 1000)
	v.Date("start_date", l.StartDate)
	v.Required("start_date", l.StartDate)
	v.Currency("currency", l.Currency)
	if l.OpeningAmount < 0 {
		v.Add("opening_amount", "must not be negative")
	}
	if l.DueDate != nil && *l.DueDate == "" {
		l.DueDate = nil
	}
	if l.DueDate != nil {
		v.Date("due_date", *l.DueDate)
		if *l.DueDate < l.StartDate {
			v.Add("due_date", "must not be before the loan starts")
		}
	}
	return v.Err()
}

func (s *LoanService) List(ctx context.Context) ([]models.Loan, error) {
	out, err := s.Repo.List(ctx, s.DB, auth.UserID(ctx))
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

func (s *LoanService) Get(ctx context.Context, id string) (*models.Loan, error) {
	l, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if l == nil {
		return nil, apperr.NotFound("loan")
	}
	return l, nil
}

// Create records a loan that already exists outside the app: what is owed on
// it today is its opening amount, and no account balance changes.
func (s *LoanService) Create(ctx context.Context, req dto.CreateLoanRequest) (*models.Loan, error) {
	now := models.NowUTC()
	l := &models.Loan{UserID: auth.UserID(ctx), ID: NewID(), Direction: req.Direction,
		Counterparty: strings.TrimSpace(req.Counterparty), OpeningAmount: req.OpeningAmount, Currency: req.Currency,
		StartDate: req.StartDate, DueDate: req.DueDate, Notes: strings.TrimSpace(req.Notes), CreatedAt: now, UpdatedAt: now}
	if l.Currency == "" {
		l.Currency = s.DefaultCurrency
	}
	if l.StartDate == "" {
		l.StartDate = models.Today()
	}
	if err := validateLoan(l); err != nil {
		return nil, err
	}
	if l.OpeningAmount <= 0 {
		return nil, apperr.Validation("validation failed", map[string]string{"opening_amount": "must be positive: record new lending or borrowing as a transaction"})
	}
	if err := s.Repo.Insert(ctx, s.DB, l); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, l.ID)
}

// Update changes the loan's details. Its direction and currency stay: its
// transactions were recorded against them. Lowering the opening amount may
// not leave more repaid than was ever owed.
func (s *LoanService) Update(ctx context.Context, id string, req dto.UpdateLoanRequest) (*models.Loan, error) {
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		l, err := s.Repo.Get(ctx, tx, auth.UserID(ctx), id)
		if err != nil {
			return apperr.Internal(err)
		}
		if l == nil {
			return apperr.NotFound("loan")
		}
		if req.Counterparty != nil {
			l.Counterparty = strings.TrimSpace(*req.Counterparty)
		}
		if req.OpeningAmount != nil {
			// Principal counts the opening amount: swap the old one for the new.
			l.Principal += *req.OpeningAmount - l.OpeningAmount
			l.OpeningAmount = *req.OpeningAmount
		}
		if req.StartDate != nil {
			l.StartDate = *req.StartDate
		}
		if req.ClearDueDate {
			l.DueDate = nil
		} else if req.DueDate != nil {
			l.DueDate = req.DueDate
		}
		if req.Notes != nil {
			l.Notes = strings.TrimSpace(*req.Notes)
		}
		if err := validateLoan(l); err != nil {
			return err
		}
		if owed := l.Principal - l.Repaid; req.OpeningAmount != nil && owed < 0 {
			return apperr.Validation("validation failed", map[string]string{"opening_amount": "would leave " +
				reports.FormatMoney(-owed) + " more repaid than was owed"})
		}
		l.UpdatedAt = models.NowUTC()
		if err := s.Repo.Update(ctx, tx, l); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// Delete removes a loan nothing has been recorded against. A loan with
// transactions keeps them: they moved real money, so they go first.
func (s *LoanService) Delete(ctx context.Context, id string) error {
	return repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		uid := auth.UserID(ctx)
		l, err := s.Repo.Get(ctx, tx, uid, id)
		if err != nil {
			return apperr.Internal(err)
		}
		if l == nil {
			return apperr.NotFound("loan")
		}
		n, err := s.Repo.CountTransactions(ctx, tx, uid, id)
		if err != nil {
			return apperr.Internal(err)
		}
		if n > 0 {
			return apperr.Conflict("this loan has transactions; delete them first")
		}
		if err := s.Repo.Delete(ctx, tx, uid, id); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
}
