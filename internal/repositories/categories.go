package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpensiv/internal/models"
)

type CategoryRepo struct{}

const categoryCols = `id, name, icon, color, type, parent_id, is_active, is_system, sort_order, created_at, updated_at`

func scanCategory(s interface{ Scan(...any) error }) (*models.Category, error) {
	var c models.Category
	var parent sql.NullString
	var active, system int
	if err := s.Scan(&c.ID, &c.Name, &c.Icon, &c.Color, &c.Type, &parent, &active, &system, &c.SortOrder, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	c.ParentID = strPtr(parent)
	c.IsActive = active == 1
	c.IsSystem = system == 1
	return &c, nil
}

func (CategoryRepo) List(ctx context.Context, db DBTX, includeInactive bool) ([]models.Category, error) {
	q := `SELECT ` + categoryCols + ` FROM categories`
	if !includeInactive {
		q += ` WHERE is_active = 1`
	}
	q += ` ORDER BY type, sort_order, name`
	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Category{}
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (CategoryRepo) Get(ctx context.Context, db DBTX, id string) (*models.Category, error) {
	c, err := scanCategory(db.QueryRowContext(ctx, `SELECT `+categoryCols+` FROM categories WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

func (CategoryRepo) Insert(ctx context.Context, db DBTX, c *models.Category) error {
	_, err := db.ExecContext(ctx, `INSERT INTO categories
		(id, name, icon, color, type, parent_id, is_active, is_system, sort_order, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		c.ID, c.Name, c.Icon, c.Color, c.Type, nullStr(c.ParentID), boolInt(c.IsActive), boolInt(c.IsSystem), c.SortOrder, c.CreatedAt, c.UpdatedAt)
	return err
}

func (CategoryRepo) Update(ctx context.Context, db DBTX, c *models.Category) error {
	_, err := db.ExecContext(ctx, `UPDATE categories SET name=?, icon=?, color=?, parent_id=?, is_active=?, sort_order=?, updated_at=? WHERE id=?`,
		c.Name, c.Icon, c.Color, nullStr(c.ParentID), boolInt(c.IsActive), c.SortOrder, c.UpdatedAt, c.ID)
	return err
}
