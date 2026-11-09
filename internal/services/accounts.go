// Package services holds business logic. Services take a *sql.DB and use the
// repositories; HTTP concerns never reach this package.
package services

import (
	"context"
	"database/sql"
	"strings"

	"github.com/google/uuid"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

var accountTypes = []string{models.AccountBank, models.AccountCash, models.AccountMobileWallet, models.AccountCreditCard, models.AccountSavings}

type AccountService struct {
	DB              *sql.DB
	Repo            repositories.AccountRepo
	DefaultCurrency string
}

func NewID() string { return uuid.NewString() }

func (s *AccountService) List(ctx context.Context, includeInactive bool) ([]models.Account, error) {
	return s.Repo.List(ctx, s.DB, auth.UserID(ctx), includeInactive)
}

func (s *AccountService) Get(ctx context.Context, id string) (*models.Account, error) {
	a, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if a == nil {
		return nil, apperr.NotFound("account")
	}
	return a, nil
}

func (s *AccountService) Create(ctx context.Context, req dto.CreateAccountRequest) (*models.Account, error) {
	v := validators.Errors{}
	req.Name = strings.TrimSpace(req.Name)
	v.Required("name", req.Name)
	v.MaxLen("name", req.Name, 100)
	v.OneOf("type", req.Type, accountTypes...)
	if req.Currency == "" {
		req.Currency = s.DefaultCurrency
	}
	v.Currency("currency", req.Currency)
	if req.OpeningBalanceDate == "" {
		req.OpeningBalanceDate = models.Today()
	}
	v.Date("opening_balance_date", req.OpeningBalanceDate)
	if err := v.Err(); err != nil {
		return nil, err
	}
	now := models.NowUTC()
	a := &models.Account{
		UserID: auth.UserID(ctx), ID: NewID(), Name: req.Name, Type: req.Type, Currency: req.Currency,
		OpeningBalance: req.OpeningBalance, OpeningBalanceDate: req.OpeningBalanceDate,
		AccountNumber: strings.TrimSpace(req.AccountNumber), IsActive: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.Repo.Insert(ctx, s.DB, a); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, a.ID)
}

func (s *AccountService) Update(ctx context.Context, id string, req dto.UpdateAccountRequest) (*models.Account, error) {
	a, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	v := validators.Errors{}
	if req.Name != nil {
		a.Name = strings.TrimSpace(*req.Name)
		v.Required("name", a.Name)
	}
	if req.Type != nil {
		a.Type = *req.Type
		v.OneOf("type", a.Type, accountTypes...)
	}
	if req.Currency != nil {
		a.Currency = *req.Currency
		v.Currency("currency", a.Currency)
	}
	if req.OpeningBalance != nil {
		a.OpeningBalance = *req.OpeningBalance
	}
	if req.OpeningBalanceDate != nil {
		a.OpeningBalanceDate = *req.OpeningBalanceDate
		v.Date("opening_balance_date", a.OpeningBalanceDate)
	}
	if req.AccountNumber != nil {
		a.AccountNumber = strings.TrimSpace(*req.AccountNumber)
	}
	if req.IsActive != nil {
		a.IsActive = *req.IsActive
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	a.UpdatedAt = models.NowUTC()
	if err := s.Repo.Update(ctx, s.DB, a); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, id)
}

// AccountUsage says what still refers to an account; it can be deleted only
// when nothing does.
type AccountUsage struct {
	Transactions int `json:"transactions"`
	Recurring    int `json:"recurring"`
}

func (s *AccountService) usage(ctx context.Context, db repositories.DBTX, uid, id string) (AccountUsage, error) {
	var u AccountUsage
	err := db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM transactions WHERE user_id = ? AND (account_id = ? OR transfer_account_id = ?)),
		(SELECT COUNT(*) FROM recurring_transactions WHERE user_id = ? AND (account_id = ? OR transfer_account_id = ?))`,
		uid, id, id, uid, id, id).Scan(&u.Transactions, &u.Recurring)
	return u, err
}

// Usage counts the transactions and recurring rules that use the account.
func (s *AccountService) Usage(ctx context.Context, id string) (*AccountUsage, error) {
	if _, err := s.Get(ctx, id); err != nil {
		return nil, err
	}
	u, err := s.usage(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &u, nil
}

// Delete removes an account that nothing refers to. An account with history
// is refused (409): its transactions carry the balance, so it can only be
// deactivated.
func (s *AccountService) Delete(ctx context.Context, id string) error {
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	uid := auth.UserID(ctx)
	var conflict *apperr.Error
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		u, err := s.usage(ctx, tx, uid, id)
		if err != nil {
			return err
		}
		if u.Transactions > 0 || u.Recurring > 0 {
			conflict = apperr.Conflict("this account has transactions or recurring rules; delete those first or deactivate the account")
			return nil
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM accounts WHERE id = ? AND user_id = ?`, id, uid)
		return err
	})
	if err != nil {
		return apperr.Internal(err)
	}
	if conflict != nil {
		return conflict
	}
	return nil
}
