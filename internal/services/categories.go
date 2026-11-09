package services

import (
	"context"
	"database/sql"
	"strings"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

type CategoryService struct {
	DB   *sql.DB
	Repo repositories.CategoryRepo
}

func (s *CategoryService) List(ctx context.Context, includeInactive bool) ([]models.Category, error) {
	return s.Repo.List(ctx, s.DB, auth.UserID(ctx), includeInactive)
}

func (s *CategoryService) Get(ctx context.Context, id string) (*models.Category, error) {
	c, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if c == nil {
		return nil, apperr.NotFound("category")
	}
	return c, nil
}

func (s *CategoryService) Create(ctx context.Context, req dto.CreateCategoryRequest) (*models.Category, error) {
	v := validators.Errors{}
	req.Name = strings.TrimSpace(req.Name)
	v.Required("name", req.Name)
	v.MaxLen("name", req.Name, 60)
	v.OneOf("type", req.Type, models.TxExpense, models.TxIncome)
	v.Color("color", req.Color)
	if req.Color == "" {
		req.Color = "#64748b"
	}
	if req.Icon == "" {
		req.Icon = "circle"
	}
	if req.ParentID != nil && *req.ParentID != "" {
		p, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), *req.ParentID)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if p == nil || p.Type != req.Type {
			v.Add("parent_id", "must reference an existing category of the same type")
		}
	} else {
		req.ParentID = nil
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	now := models.NowUTC()
	c := &models.Category{UserID: auth.UserID(ctx), ID: NewID(), Name: req.Name, Icon: req.Icon, Color: req.Color, Type: req.Type,
		ParentID: req.ParentID, IsActive: true, SortOrder: 100, CreatedAt: now, UpdatedAt: now}
	if err := s.Repo.Insert(ctx, s.DB, c); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, apperr.Conflict("a category with that name already exists")
		}
		return nil, apperr.Internal(err)
	}
	return c, nil
}

func (s *CategoryService) Update(ctx context.Context, id string, req dto.UpdateCategoryRequest) (*models.Category, error) {
	c, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	v := validators.Errors{}
	if req.Name != nil {
		c.Name = strings.TrimSpace(*req.Name)
		v.Required("name", c.Name)
	}
	if req.Icon != nil {
		c.Icon = *req.Icon
	}
	if req.Color != nil {
		c.Color = *req.Color
		v.Color("color", c.Color)
	}
	if req.ParentID != nil {
		if *req.ParentID == "" {
			c.ParentID = nil
		} else if *req.ParentID == id {
			v.Add("parent_id", "cannot be its own parent")
		} else {
			p, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), *req.ParentID)
			if err != nil {
				return nil, apperr.Internal(err)
			}
			if p == nil || p.Type != c.Type {
				v.Add("parent_id", "must reference an existing category of the same type")
			}
			c.ParentID = req.ParentID
		}
	}
	if req.IsActive != nil {
		c.IsActive = *req.IsActive
	}
	if req.SortOrder != nil {
		c.SortOrder = *req.SortOrder
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	c.UpdatedAt = models.NowUTC()
	if err := s.Repo.Update(ctx, s.DB, c); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, apperr.Conflict("a category with that name already exists")
		}
		return nil, apperr.Internal(err)
	}
	return c, nil
}

// CategoryUsage says what deleting a category takes with it: a main category
// goes together with its sub-categories, and every count covers all of them.
type CategoryUsage struct {
	SubCategories int `json:"sub_categories"`
	Transactions  int `json:"transactions"`
	Budgets       int `json:"budgets"`
	Recurring     int `json:"recurring"`
}

// family is the category's id followed by its sub-categories' ids.
func (s *CategoryService) family(ctx context.Context, db repositories.DBTX, uid, id string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT id FROM categories WHERE user_id = ? AND parent_id = ?`, uid, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{id}
	for rows.Next() {
		var sub string
		if err := rows.Scan(&sub); err != nil {
			return nil, err
		}
		ids = append(ids, sub)
	}
	return ids, rows.Err()
}

func placeholders(n int) string { return strings.TrimSuffix(strings.Repeat("?,", n), ",") }

func idArgs(uid string, ids []string) []any {
	args := []any{uid}
	for _, id := range ids {
		args = append(args, id)
	}
	return args
}

func (s *CategoryService) usage(ctx context.Context, db repositories.DBTX, uid string, ids []string) (CategoryUsage, error) {
	u := CategoryUsage{SubCategories: len(ids) - 1}
	in := placeholders(len(ids))
	for _, q := range []struct {
		table string
		dst   *int
	}{{"transactions", &u.Transactions}, {"budgets", &u.Budgets}, {"recurring_transactions", &u.Recurring}} {
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+q.table+` WHERE user_id = ? AND category_id IN (`+in+`)`,
			idArgs(uid, ids)...).Scan(q.dst); err != nil {
			return u, err
		}
	}
	return u, nil
}

// Usage counts what deleting the category would affect.
func (s *CategoryService) Usage(ctx context.Context, id string) (*CategoryUsage, error) {
	if _, err := s.Get(ctx, id); err != nil {
		return nil, err
	}
	uid := auth.UserID(ctx)
	ids, err := s.family(ctx, s.DB, uid, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	u, err := s.usage(ctx, s.DB, uid, ids)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &u, nil
}

// Delete removes the category and, for a main category, its sub-categories.
// Their transactions are kept and become uncategorised, recurring rules lose
// the category, and budgets on them are removed.
func (s *CategoryService) Delete(ctx context.Context, id string) error {
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	uid := auth.UserID(ctx)
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		ids, err := s.family(ctx, tx, uid, id)
		if err != nil {
			return err
		}
		in := placeholders(len(ids))
		now := models.NowUTC()
		if _, err := tx.ExecContext(ctx, `UPDATE transactions SET category_id = NULL, updated_at = ? WHERE user_id = ? AND category_id IN (`+in+`)`,
			append([]any{now}, idArgs(uid, ids)...)...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE recurring_transactions SET category_id = NULL, updated_at = ? WHERE user_id = ? AND category_id IN (`+in+`)`,
			append([]any{now}, idArgs(uid, ids)...)...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM budgets WHERE user_id = ? AND category_id IN (`+in+`)`, idArgs(uid, ids)...); err != nil {
			return err
		}
		// Sub-categories first, so the main row is deleted last.
		for i := len(ids) - 1; i >= 0; i-- {
			if _, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id = ? AND user_id = ?`, ids[i], uid); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return apperr.Internal(err)
	}
	return nil
}
