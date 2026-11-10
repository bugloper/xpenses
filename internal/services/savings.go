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

// SavingsService manages savings goals. A goal holds allocations: adding to
// it never changes an account balance or counts as an expense. When the goal
// names the account its money is kept in, a contribution may also move the
// money there, as an ordinary transfer (and a withdrawal back out of it).
type SavingsService struct {
	DB       *sql.DB
	Repo     repositories.SavingsRepo
	Accounts repositories.AccountRepo
	Txs      *TransactionService
}

// GoalDetail is a goal with its contributions and withdrawals, newest first.
type GoalDetail struct {
	models.SavingsGoal
	Entries []models.SavingsGoalEntry `json:"entries"`
}

func (s *SavingsService) validateGoal(ctx context.Context, db repositories.DBTX, g *models.SavingsGoal) error {
	v := validators.Errors{}
	v.Required("name", g.Name)
	v.MaxLen("name", g.Name, 80)
	v.MaxLen("notes", g.Notes, 1000)
	v.Positive("target_amount", g.TargetAmount)
	if g.TargetDate != nil && *g.TargetDate == "" {
		g.TargetDate = nil
	}
	if g.TargetDate != nil {
		v.Date("target_date", *g.TargetDate)
	}
	if g.AccountID != nil && *g.AccountID == "" {
		g.AccountID = nil
	}
	if g.AccountID != nil {
		a, err := s.Accounts.Get(ctx, db, g.UserID, *g.AccountID)
		if err != nil {
			return apperr.Internal(err)
		}
		if a == nil {
			v.Add("account_id", "account not found")
		}
	}
	if g.Name != "" {
		taken, err := s.Repo.GoalNameTaken(ctx, db, g.UserID, g.Name, g.ID)
		if err != nil {
			return apperr.Internal(err)
		}
		if taken {
			v.Add("name", "you already have a goal with this name")
		}
	}
	return v.Err()
}

func (s *SavingsService) List(ctx context.Context) ([]models.SavingsGoal, error) {
	out, err := s.Repo.ListGoals(ctx, s.DB, auth.UserID(ctx))
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

func (s *SavingsService) Get(ctx context.Context, id string) (*GoalDetail, error) {
	uid := auth.UserID(ctx)
	g, err := s.Repo.GetGoal(ctx, s.DB, uid, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if g == nil {
		return nil, apperr.NotFound("savings goal")
	}
	entries, err := s.Repo.ListEntries(ctx, s.DB, uid, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &GoalDetail{SavingsGoal: *g, Entries: entries}, nil
}

func (s *SavingsService) Create(ctx context.Context, req dto.CreateSavingsGoalRequest) (*GoalDetail, error) {
	now := models.NowUTC()
	g := &models.SavingsGoal{UserID: auth.UserID(ctx), ID: NewID(), Name: strings.TrimSpace(req.Name),
		TargetAmount: req.TargetAmount, TargetDate: req.TargetDate, AccountID: req.AccountID,
		Notes: strings.TrimSpace(req.Notes), CreatedAt: now, UpdatedAt: now}
	if err := s.validateGoal(ctx, s.DB, g); err != nil {
		return nil, err
	}
	if err := s.Repo.InsertGoal(ctx, s.DB, g); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, g.ID)
}

func (s *SavingsService) Update(ctx context.Context, id string, req dto.UpdateSavingsGoalRequest) (*GoalDetail, error) {
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		g, err := s.Repo.GetGoal(ctx, tx, auth.UserID(ctx), id)
		if err != nil {
			return apperr.Internal(err)
		}
		if g == nil {
			return apperr.NotFound("savings goal")
		}
		if req.Name != nil {
			g.Name = strings.TrimSpace(*req.Name)
		}
		if req.TargetAmount != nil {
			g.TargetAmount = *req.TargetAmount
		}
		if req.ClearTargetDate {
			g.TargetDate = nil
		} else if req.TargetDate != nil {
			g.TargetDate = req.TargetDate
		}
		if req.ClearAccount {
			g.AccountID = nil
		} else if req.AccountID != nil {
			g.AccountID = req.AccountID
		}
		if req.Notes != nil {
			g.Notes = strings.TrimSpace(*req.Notes)
		}
		if err := s.validateGoal(ctx, tx, g); err != nil {
			return err
		}
		g.UpdatedAt = models.NowUTC()
		if err := s.Repo.UpdateGoal(ctx, tx, g); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// Delete removes the goal and its allocations. Transfers its contributions
// made stay in the ledger: that money did move.
func (s *SavingsService) Delete(ctx context.Context, id string) error {
	uid := auth.UserID(ctx)
	g, err := s.Repo.GetGoal(ctx, s.DB, uid, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if g == nil {
		return apperr.NotFound("savings goal")
	}
	if err := s.Repo.DeleteGoal(ctx, s.DB, uid, id); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// AddEntry contributes to the goal (positive amount) or withdraws from it
// (negative). A withdrawal may not take out more than the goal holds. With
// from_account_id (contribution) or to_account_id (withdrawal) the money also
// moves by a transfer to or from the goal's account, in the same database
// transaction.
func (s *SavingsService) AddEntry(ctx context.Context, goalID string, req dto.SavingsGoalEntryRequest) (*GoalDetail, error) {
	uid := auth.UserID(ctx)
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		g, err := s.Repo.GetGoal(ctx, tx, uid, goalID)
		if err != nil {
			return apperr.Internal(err)
		}
		if g == nil {
			return apperr.NotFound("savings goal")
		}
		e := &models.SavingsGoalEntry{UserID: uid, ID: NewID(), GoalID: g.ID, Amount: req.Amount,
			EntryDate: req.EntryDate, Note: strings.TrimSpace(req.Note), CreatedAt: models.NowUTC()}
		if e.EntryDate == "" {
			e.EntryDate = models.Today()
		}
		v := validators.Errors{}
		if e.Amount == 0 {
			v.Add("amount", "must not be zero")
		}
		v.Date("entry_date", e.EntryDate)
		v.MaxLen("note", e.Note, 200)
		if e.Amount < 0 && g.Saved+e.Amount < 0 {
			v.Add("amount", "is more than the "+reports.FormatMoney(g.Saved)+" this goal holds")
		}
		moveFrom, moveTo := req.FromAccountID, req.ToAccountID
		if e.Amount > 0 {
			moveTo = nil
		} else {
			moveFrom = nil
		}
		move := (moveFrom != nil && *moveFrom != "") || (moveTo != nil && *moveTo != "")
		if move && g.AccountID == nil {
			v.Add("account", "the goal has no account to move money to or from; set one first")
		}
		if err := v.Err(); err != nil {
			return err
		}
		if move {
			t := &models.Transaction{UserID: uid, ID: NewID(), Type: models.TxTransfer, Amount: abs(e.Amount),
				TransactionDate: e.EntryDate, Origin: models.OriginManual, Status: models.StatusCleared,
				CreatedAt: e.CreatedAt, UpdatedAt: e.CreatedAt}
			if e.Amount > 0 {
				t.AccountID, t.TransferAccountID = *moveFrom, g.AccountID
				t.Description = "Saving for " + g.Name
			} else {
				t.AccountID, t.TransferAccountID = *g.AccountID, moveTo
				t.Description = "Taken from " + g.Name
			}
			if err := s.Txs.validate(ctx, tx, t); err != nil {
				return err
			}
			if err := s.Txs.Repo.Insert(ctx, tx, t); err != nil {
				return apperr.Internal(err)
			}
			e.TransactionID = &t.ID
		}
		if err := s.Repo.InsertEntry(ctx, tx, e); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, goalID)
}

// DeleteEntry reverses a contribution or withdrawal, and the transfer that
// moved its money if there was one. Removing a contribution may not leave the
// goal holding less than nothing.
func (s *SavingsService) DeleteEntry(ctx context.Context, goalID, entryID string) (*GoalDetail, error) {
	uid := auth.UserID(ctx)
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		g, err := s.Repo.GetGoal(ctx, tx, uid, goalID)
		if err != nil {
			return apperr.Internal(err)
		}
		if g == nil {
			return apperr.NotFound("savings goal")
		}
		e, err := s.Repo.GetEntry(ctx, tx, uid, goalID, entryID)
		if err != nil {
			return apperr.Internal(err)
		}
		if e == nil {
			return apperr.NotFound("entry")
		}
		if g.Saved-e.Amount < 0 {
			return apperr.Conflict("withdrawals after this contribution use its money; remove them first")
		}
		if err := s.Repo.DeleteEntry(ctx, tx, uid, e.ID); err != nil {
			return apperr.Internal(err)
		}
		if e.TransactionID != nil {
			if err := s.Txs.Repo.Delete(ctx, tx, uid, *e.TransactionID); err != nil {
				return apperr.Internal(err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, goalID)
}

func abs(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
