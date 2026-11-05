package services

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

type RecurringService struct {
	DB              *sql.DB
	Repo            repositories.RecurringRepo
	Transactions    repositories.TransactionRepo
	Accounts        repositories.AccountRepo
	Categories      repositories.CategoryRepo
	DefaultCurrency string
}

// Occurrence returns the n-th occurrence (n = 0 is the start date) of a
// schedule. Monthly and yearly schedules are computed from the start date so
// that a rule starting on the 31st lands on the last day of shorter months
// without drifting (Jan 31 -> Feb 28 -> Mar 31).
func Occurrence(start time.Time, frequency string, interval, n int) time.Time {
	if interval < 1 {
		interval = 1
	}
	switch frequency {
	case "daily":
		return start.AddDate(0, 0, interval*n)
	case "weekly":
		return start.AddDate(0, 0, 7*interval*n)
	case "monthly":
		return addMonthsClamped(start, interval*n)
	case "yearly":
		return addMonthsClamped(start, 12*interval*n)
	}
	return start.AddDate(0, 0, interval*n)
}

// NextOccurrence returns the first occurrence strictly after the given date.
func NextOccurrence(start time.Time, frequency string, interval int, after time.Time) time.Time {
	for n := 0; n < 100000; n++ {
		occ := Occurrence(start, frequency, interval, n)
		if occ.After(after) {
			return occ
		}
	}
	return after.AddDate(0, 0, 1)
}

func addMonthsClamped(date time.Time, months int) time.Time {
	y, m, d := date.Date()
	first := time.Date(y, m+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	lastDay := first.AddDate(0, 1, -1).Day()
	if d > lastDay {
		d = lastDay
	}
	return time.Date(first.Year(), first.Month(), d, 0, 0, 0, 0, time.UTC)
}

func (s *RecurringService) List(ctx context.Context) ([]models.RecurringTransaction, error) {
	return s.Repo.List(ctx, s.DB, auth.UserID(ctx))
}

func (s *RecurringService) Get(ctx context.Context, id string) (*models.RecurringTransaction, error) {
	r, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if r == nil {
		return nil, apperr.NotFound("recurring transaction")
	}
	return r, nil
}

func (s *RecurringService) validate(ctx context.Context, r *models.RecurringTransaction) error {
	v := validators.Errors{}
	v.Required("name", r.Name)
	v.OneOf("type", r.Type, models.TxExpense, models.TxIncome, models.TxTransfer)
	v.Positive("amount", r.Amount)
	v.Currency("currency", r.Currency)
	v.OneOf("frequency", r.Frequency, "daily", "weekly", "monthly", "yearly")
	if r.Interval < 1 {
		v.Add("interval", "must be at least 1")
	}
	v.Required("start_date", r.StartDate)
	v.Date("start_date", r.StartDate)
	v.Date("next_run_date", r.NextRunDate)
	if r.EndDate != nil {
		v.Date("end_date", *r.EndDate)
	}
	v.OneOf("generate_as", r.GenerateAs, models.StatusCleared, models.StatusPending)
	a, err := s.Accounts.Get(ctx, s.DB, r.UserID, r.AccountID)
	if err != nil {
		return apperr.Internal(err)
	}
	if a == nil {
		v.Add("account_id", "account not found")
	}
	if r.Type == models.TxTransfer {
		if r.TransferAccountID == nil || *r.TransferAccountID == "" || *r.TransferAccountID == r.AccountID {
			v.Add("transfer_account_id", "is required and must differ from the source account")
		}
		r.CategoryID = nil
	} else {
		r.TransferAccountID = nil
		if r.CategoryID != nil && *r.CategoryID != "" {
			c, err := s.Categories.Get(ctx, s.DB, r.UserID, *r.CategoryID)
			if err != nil {
				return apperr.Internal(err)
			}
			if c == nil || c.Type != r.Type {
				v.Add("category_id", "must be an existing category matching the type")
			}
		} else {
			r.CategoryID = nil
		}
	}
	return v.Err()
}

func (s *RecurringService) Create(ctx context.Context, req dto.CreateRecurringRequest) (*models.RecurringTransaction, error) {
	now := models.NowUTC()
	if req.Interval == 0 {
		req.Interval = 1
	}
	if req.Currency == "" {
		req.Currency = s.DefaultCurrency
	}
	if req.GenerateAs == "" {
		req.GenerateAs = models.StatusPending
	}
	r := &models.RecurringTransaction{
		UserID: auth.UserID(ctx), ID: NewID(), Name: strings.TrimSpace(req.Name), Type: req.Type, Amount: req.Amount, Currency: req.Currency,
		AccountID: req.AccountID, TransferAccountID: req.TransferAccountID, CategoryID: req.CategoryID,
		Description: strings.TrimSpace(req.Description), Payee: strings.TrimSpace(req.Payee), Frequency: req.Frequency,
		Interval: req.Interval, StartDate: req.StartDate, EndDate: req.EndDate, NextRunDate: req.StartDate,
		GenerateAs: req.GenerateAs, IsActive: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.validate(ctx, r); err != nil {
		return nil, err
	}
	if err := s.Repo.Insert(ctx, s.DB, r); err != nil {
		return nil, apperr.Internal(err)
	}
	return r, nil
}

func (s *RecurringService) Update(ctx context.Context, id string, req dto.UpdateRecurringRequest) (*models.RecurringTransaction, error) {
	r, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Name != nil {
		r.Name = strings.TrimSpace(*req.Name)
	}
	if req.Amount != nil {
		r.Amount = *req.Amount
	}
	if req.AccountID != nil {
		r.AccountID = *req.AccountID
	}
	if req.TransferAccountID != nil {
		r.TransferAccountID = req.TransferAccountID
	}
	if req.CategoryID != nil {
		r.CategoryID = req.CategoryID
	}
	if req.Description != nil {
		r.Description = strings.TrimSpace(*req.Description)
	}
	if req.Payee != nil {
		r.Payee = strings.TrimSpace(*req.Payee)
	}
	if req.Frequency != nil {
		r.Frequency = *req.Frequency
	}
	if req.Interval != nil {
		r.Interval = *req.Interval
	}
	if req.EndDate != nil {
		if *req.EndDate == "" {
			r.EndDate = nil
		} else {
			r.EndDate = req.EndDate
		}
	}
	if req.NextRunDate != nil {
		r.NextRunDate = *req.NextRunDate
	}
	if req.GenerateAs != nil {
		r.GenerateAs = *req.GenerateAs
	}
	if req.IsActive != nil {
		r.IsActive = *req.IsActive
	}
	if err := s.validate(ctx, r); err != nil {
		return nil, err
	}
	r.UpdatedAt = models.NowUTC()
	if err := s.Repo.Update(ctx, s.DB, r); err != nil {
		return nil, apperr.Internal(err)
	}
	return r, nil
}

func (s *RecurringService) Delete(ctx context.Context, id string) error {
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	if err := s.Repo.Delete(ctx, s.DB, auth.UserID(ctx), id); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// RunResult summarises a generation run.
type RunResult struct {
	Generated int      `json:"generated"`
	Skipped   int      `json:"skipped"`
	IDs       []string `json:"transaction_ids"`
}

// Generate creates every due occurrence up to and including asOf (YYYY-MM-DD)
// for the signed-in user, or for every user when ctx carries no user (the
// background scheduler). The unique index on (recurring_id, transaction_date)
// guarantees an occurrence is never created twice even if two runs overlap.
func (s *RecurringService) Generate(ctx context.Context, asOf string) (*RunResult, error) {
	if asOf == "" {
		asOf = models.Today()
	}
	asOfT, err := models.ParseDate(asOf)
	if err != nil {
		return nil, apperr.BadRequest("as_of must be YYYY-MM-DD")
	}
	due, err := s.Repo.ListDue(ctx, s.DB, auth.UserID(ctx), asOf)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	res := &RunResult{IDs: []string{}}
	for i := range due {
		r := due[i]
		err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
			start, err := models.ParseDate(r.StartDate)
			if err != nil {
				return err
			}
			next, err := models.ParseDate(r.NextRunDate)
			if err != nil {
				return err
			}
			var end *time.Time
			if r.EndDate != nil {
				e, err := models.ParseDate(*r.EndDate)
				if err == nil {
					end = &e
				}
			}
			// Walk occurrences from the start date; skip those before next_run_date.
			for n := 0; n < 100000; n++ {
				occ := Occurrence(start, r.Frequency, r.Interval, n)
				if occ.Before(next) {
					continue
				}
				if occ.After(asOfT) {
					next = occ
					break
				}
				if end != nil && occ.After(*end) {
					r.IsActive = false
					next = occ
					break
				}
				dateStr := occ.Format(models.DateLayout)
				rid := r.ID
				now := models.NowUTC()
				t := &models.Transaction{
					UserID: r.UserID, ID: NewID(), Type: r.Type, Amount: r.Amount, Currency: r.Currency, AccountID: r.AccountID,
					TransferAccountID: r.TransferAccountID, CategoryID: r.CategoryID, Description: r.Description,
					Payee: r.Payee, TransactionDate: dateStr, Origin: models.OriginManual, Status: r.GenerateAs,
					RecurringID: &rid, CreatedAt: now, UpdatedAt: now,
				}
				if err := s.Transactions.Insert(ctx, tx, t); err != nil {
					if strings.Contains(err.Error(), "UNIQUE") {
						res.Skipped++
					} else {
						return err
					}
				} else {
					res.Generated++
					res.IDs = append(res.IDs, t.ID)
				}
				next = Occurrence(start, r.Frequency, r.Interval, n+1)
			}
			r.NextRunDate = next.Format(models.DateLayout)
			r.UpdatedAt = models.NowUTC()
			return s.Repo.Update(ctx, tx, &r)
		})
		if err != nil {
			return nil, apperr.Internal(err)
		}
	}
	return res, nil
}
