package auth

import (
	"context"

	"github.com/google/uuid"

	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
)

type defaultCategory struct {
	Name, Icon, Color, Type string
}

// DefaultCategories is copied into every new user's workspace.
var DefaultCategories = []defaultCategory{
	{"Food", "utensils", "#f97316", "expense"},
	{"Groceries", "shopping-basket", "#22c55e", "expense"},
	{"Transportation", "car", "#3b82f6", "expense"},
	{"Fuel", "fuel", "#eab308", "expense"},
	{"Shopping", "shopping-bag", "#a855f7", "expense"},
	{"Bills", "receipt", "#ef4444", "expense"},
	{"Internet & Telecom", "wifi", "#06b6d4", "expense"},
	{"Housing", "home", "#8b5cf6", "expense"},
	{"Health", "heart-pulse", "#ec4899", "expense"},
	{"Entertainment", "clapperboard", "#f43f5e", "expense"},
	{"Personal", "user", "#14b8a6", "expense"},
	{"Family", "users", "#f59e0b", "expense"},
	{"Education", "graduation-cap", "#6366f1", "expense"},
	{"Travel", "plane", "#0ea5e9", "expense"},
	{"Loan Repayment", "landmark", "#b91c1c", "expense"},
	{"Credit Card Payment", "credit-card", "#7c3aed", "expense"},
	{"Savings", "piggy-bank", "#10b981", "expense"},
	{"Other", "circle-dashed", "#64748b", "expense"},
	{"Salary", "briefcase", "#22c55e", "income"},
	{"Freelance", "laptop", "#3b82f6", "income"},
	{"Business", "building-2", "#8b5cf6", "income"},
	{"Interest", "percent", "#14b8a6", "income"},
	{"Refund", "undo-2", "#f59e0b", "income"},
	{"Other Income", "coins", "#64748b", "income"},
}

// SeedDefaultAccount gives a new user a Cash account so quick-add works
// immediately; they add bank accounts themselves.
func SeedDefaultAccount(ctx context.Context, db repositories.DBTX, userID, currency string) error {
	now := models.NowUTC()
	_, err := db.ExecContext(ctx, `INSERT INTO accounts (user_id, id, name, type, currency, opening_balance, opening_balance_date, account_number, is_active, created_at, updated_at)
		VALUES (?,?,?,?,?,0,?,'',1,?,?)`, userID, uuid.NewString(), "Cash", models.AccountCash, currency, models.Today(), now, now)
	return err
}

// SeedDefaultCategories inserts the default categories for a user.
func SeedDefaultCategories(ctx context.Context, db repositories.DBTX, userID string) error {
	now := models.NowUTC()
	sort := map[string]int{}
	for _, c := range DefaultCategories {
		sort[c.Type]++
		if _, err := db.ExecContext(ctx, `INSERT INTO categories (id, user_id, name, icon, color, type, is_active, is_system, sort_order, created_at, updated_at)
			VALUES (?,?,?,?,?,?,1,1,?,?,?)`, uuid.NewString(), userID, c.Name, c.Icon, c.Color, c.Type, sort[c.Type], now, now); err != nil {
			return err
		}
	}
	return nil
}
