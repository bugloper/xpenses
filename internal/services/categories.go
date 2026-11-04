package services

import (
	"context"
	"database/sql"
	"strings"

	"github.com/bugloper/xpensiv/internal/auth"
	"github.com/bugloper/xpensiv/internal/dto"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/validators"
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
