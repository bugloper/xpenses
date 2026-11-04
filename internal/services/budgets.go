package services

import (
	"context"
	"database/sql"
	"strings"

	"github.com/bugloper/xpensiv/internal/dto"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/validators"
)

type BudgetService struct {
	DB         *sql.DB
	Repo       repositories.BudgetRepo
	Categories repositories.CategoryRepo
}

func (s *BudgetService) List(ctx context.Context) ([]models.Budget, error) {
	return s.Repo.List(ctx, s.DB)
}

func (s *BudgetService) Create(ctx context.Context, req dto.CreateBudgetRequest) (*models.Budget, error) {
	v := validators.Errors{}
	v.Required("category_id", req.CategoryID)
	if req.Amount < 0 {
		v.Add("amount", "must not be negative")
	}
	if req.CategoryID != "" {
		c, err := s.Categories.Get(ctx, s.DB, req.CategoryID)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if c == nil {
			v.Add("category_id", "category not found")
		} else if c.Type != models.TxExpense {
			v.Add("category_id", "budgets apply to expense categories only")
		}
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	now := models.NowUTC()
	b := &models.Budget{ID: NewID(), CategoryID: req.CategoryID, Amount: req.Amount, CreatedAt: now, UpdatedAt: now}
	if err := s.Repo.Insert(ctx, s.DB, b); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, apperr.Conflict("a budget already exists for this category")
		}
		return nil, apperr.Internal(err)
	}
	return b, nil
}

func (s *BudgetService) Update(ctx context.Context, id string, req dto.UpdateBudgetRequest) (*models.Budget, error) {
	b, err := s.Repo.Get(ctx, s.DB, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if b == nil {
		return nil, apperr.NotFound("budget")
	}
	if req.Amount != nil {
		if *req.Amount < 0 {
			return nil, apperr.Validation("validation failed", map[string]string{"amount": "must not be negative"})
		}
		b.Amount = *req.Amount
	}
	b.UpdatedAt = models.NowUTC()
	if err := s.Repo.Update(ctx, s.DB, b); err != nil {
		return nil, apperr.Internal(err)
	}
	return b, nil
}

func (s *BudgetService) Delete(ctx context.Context, id string) error {
	b, err := s.Repo.Get(ctx, s.DB, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if b == nil {
		return apperr.NotFound("budget")
	}
	if err := s.Repo.Delete(ctx, s.DB, id); err != nil {
		return apperr.Internal(err)
	}
	return nil
}
