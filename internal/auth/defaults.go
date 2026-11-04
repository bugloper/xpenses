package auth

import (
	"context"

	"github.com/google/uuid"

	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
)

// DefaultSub is a sub-category seeded under a default group. It shares the
// group's colour and gets its own icon.
type DefaultSub struct {
	Name, Icon string
}

// DefaultGroup is a main category seeded for every new user with its
// sub-categories.
type DefaultGroup struct {
	Name, Icon, Color, Type string
	Subs                    []DefaultSub
}

// DefaultCategories is the two-level category tree copied into every new
// user's workspace. A transaction may be filed under a group directly or
// under one of its sub-categories.
var DefaultCategories = []DefaultGroup{
	{"Household Expenses", "home", "#8b5cf6", "expense", []DefaultSub{
		{"Rent", "home"}, {"Electricity bills", "zap"}, {"Water bills", "lightbulb"}, {"Gas & cooking fuel", "zap"},
		{"Internet/Wi-Fi", "wifi"}, {"Cleaning expenses", "sparkles"}, {"Household maintenance", "wrench"},
		{"Furniture & appliances", "home"}, {"Domestic help", "user"},
	}},
	{"Food & Groceries", "utensils", "#f97316", "expense", []DefaultSub{
		{"Groceries", "shopping-basket"}, {"Vegetables and fruits", "shopping-basket"}, {"Meat and fish", "utensils"},
		{"Eating out", "utensils"}, {"Snacks and beverages", "coffee"}, {"Food delivery", "shopping-bag"},
		{"Tea & coffee", "coffee"}, {"Drinks & alcohol", "wine"},
	}},
	{"Transportation", "car", "#3b82f6", "expense", []DefaultSub{
		{"Fuel", "fuel"}, {"Taxi", "car"}, {"Bus fare", "bus"}, {"Vehicle maintenance", "wrench"},
		{"Parking fees", "car"}, {"Vehicle insurance", "car"}, {"Tolls & road tax", "receipt"}, {"Two-wheeler", "bike"},
	}},
	{"Personal Expenses", "user", "#14b8a6", "expense", []DefaultSub{
		{"Clothing", "shirt"}, {"Shoes and accessories", "shopping-bag"}, {"Skincare and cosmetics", "sparkles"},
		{"Haircuts and salon", "scissors"}, {"Personal care products", "sparkles"}, {"Gym & fitness", "dumbbell"},
		{"Laundry", "shirt"},
	}},
	{"Health & Medical", "heart-pulse", "#ec4899", "expense", []DefaultSub{
		{"Doctor consultations", "stethoscope"}, {"Medicines", "pill"}, {"Medical tests", "stethoscope"},
		{"Dental care", "heart-pulse"}, {"Eye care", "heart-pulse"}, {"Hospital & emergencies", "heart-pulse"},
		{"Health insurance", "heart-pulse"},
	}},
	{"Communication & Technology", "smartphone", "#06b6d4", "expense", []DefaultSub{
		{"Mobile recharge", "smartphone"}, {"Mobile data", "wifi"}, {"Phone bills", "receipt"},
		{"Gadgets and accessories", "laptop"}, {"Software subscriptions", "laptop"}, {"Device repairs", "wrench"},
	}},
	{"Education & Professional Development", "graduation-cap", "#6366f1", "expense", []DefaultSub{
		{"Tuition fees", "graduation-cap"}, {"Books and stationery", "book-open"}, {"School supplies & uniforms", "book-open"},
		{"Online courses", "laptop"}, {"Certifications", "graduation-cap"}, {"Training expenses", "book-open"},
		{"Exam fees", "receipt"},
	}},
	{"Entertainment & Lifestyle", "clapperboard", "#f43f5e", "expense", []DefaultSub{
		{"Movies", "clapperboard"}, {"Streaming subscriptions", "clapperboard"}, {"Shopping", "shopping-bag"},
		{"Travel and holidays", "plane"}, {"Hobbies", "music"}, {"Games", "gamepad-2"}, {"Sports", "dumbbell"},
		{"Events and outings", "ticket"},
	}},
	{"Financial Obligations", "landmark", "#b91c1c", "expense", []DefaultSub{
		{"Loan repayments", "landmark"}, {"Credit card payments", "credit-card"}, {"Bank charges", "banknote"},
		{"Interest payments", "percent"}, {"Insurance premiums", "receipt"}, {"Taxes & government fees", "receipt"},
	}},
	{"Savings & Investments", "piggy-bank", "#10b981", "expense", []DefaultSub{
		{"Emergency fund", "piggy-bank"}, {"Fixed deposits", "landmark"}, {"Recurring deposits", "coins"},
		{"Investments", "trending-up"}, {"Retirement savings", "piggy-bank"}, {"Gold & jewellery", "sparkles"},
		{"Lending to others", "hand-coins"},
	}},
	{"Family & Social", "users", "#f59e0b", "expense", []DefaultSub{
		{"Family support", "users"}, {"Children & baby", "baby"}, {"Gifts", "gift"}, {"Donations", "hand-coins"},
		{"Religious offerings", "hand-coins"}, {"Birthday celebrations", "cake"}, {"Weddings & ceremonies", "gift"},
		{"Social gatherings", "users"}, {"Pets", "paw-print"},
	}},
	{"Miscellaneous", "circle-dashed", "#64748b", "expense", []DefaultSub{
		{"Unexpected expenses", "circle-dashed"}, {"Repairs", "wrench"}, {"Fees & fines", "receipt"},
		{"Other unplanned spending", "circle-dashed"},
	}},

	{"Employment", "briefcase", "#22c55e", "income", []DefaultSub{
		{"Salary", "briefcase"}, {"Bonus", "coins"}, {"Allowances", "wallet"}, {"Overtime", "briefcase"},
	}},
	{"Business & Freelance", "building-2", "#3b82f6", "income", []DefaultSub{
		{"Business income", "building-2"}, {"Freelance", "laptop"}, {"Sales", "shopping-bag"}, {"Commissions", "hand-coins"},
	}},
	{"Investments & Savings", "trending-up", "#14b8a6", "income", []DefaultSub{
		{"Interest", "percent"}, {"Dividends", "trending-up"}, {"Rental income", "home"}, {"Matured deposits", "landmark"},
	}},
	{"Other Income", "coins", "#64748b", "income", []DefaultSub{
		{"Gifts received", "gift"}, {"Refunds", "undo-2"}, {"Reimbursements", "receipt"}, {"Loan received", "hand-coins"},
		{"Other income", "coins"},
	}},
}

// DefaultCategoryCount is the number of rows SeedDefaultCategories inserts.
func DefaultCategoryCount() int {
	n := 0
	for _, g := range DefaultCategories {
		n += 1 + len(g.Subs)
	}
	return n
}

// SeedDefaultAccount gives a new user a Cash account so quick-add works
// immediately; they add bank accounts themselves.
func SeedDefaultAccount(ctx context.Context, db repositories.DBTX, userID, currency string) error {
	now := models.NowUTC()
	_, err := db.ExecContext(ctx, `INSERT INTO accounts (user_id, id, name, type, currency, opening_balance, opening_balance_date, account_number, is_active, created_at, updated_at)
		VALUES (?,?,?,?,?,0,?,'',1,?,?)`, userID, uuid.NewString(), "Cash", models.AccountCash, currency, models.Today(), now, now)
	return err
}

// SeedDefaultCategories inserts the default category tree for a new user.
func SeedDefaultCategories(ctx context.Context, db repositories.DBTX, userID string) error {
	for _, g := range DefaultCategories {
		if _, err := seedGroup(ctx, db, userID, g, nil); err != nil {
			return err
		}
	}
	return nil
}

const insertCategory = `INSERT INTO categories (id, user_id, name, icon, color, type, parent_id, is_active, is_system, sort_order, created_at, updated_at)
	VALUES (?,?,?,?,?,?,?,1,1,?,?,?)`

// seedGroup inserts a group and its sub-categories. `exists` maps "type/name"
// to the id of a category the user already has; those rows are adopted into
// the tree instead of inserted (see UpgradeCategoryTrees).
func seedGroup(ctx context.Context, db repositories.DBTX, userID string, g DefaultGroup, exists map[string]string) (string, error) {
	now := models.NowUTC()
	order := groupOrder(g.Name)
	groupID, ok := exists[g.Type+"/"+g.Name]
	if ok {
		if _, err := db.ExecContext(ctx, `UPDATE categories SET icon = ?, color = ?, parent_id = NULL, is_system = 1, sort_order = ?, updated_at = ? WHERE id = ?`,
			g.Icon, g.Color, order, now, groupID); err != nil {
			return "", err
		}
	} else {
		groupID = uuid.NewString()
		if _, err := db.ExecContext(ctx, insertCategory, groupID, userID, g.Name, g.Icon, g.Color, g.Type, nil, order, now, now); err != nil {
			return "", err
		}
	}
	for i, s := range g.Subs {
		if id, ok := exists[g.Type+"/"+s.Name]; ok {
			if _, err := db.ExecContext(ctx, `UPDATE categories SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
				groupID, order+i+1, now, id); err != nil {
				return "", err
			}
			continue
		}
		if _, err := db.ExecContext(ctx, insertCategory, uuid.NewString(), userID, s.Name, s.Icon, g.Color, g.Type, groupID, order+i+1, now, now); err != nil {
			return "", err
		}
	}
	return groupID, nil
}

func groupOrder(name string) int {
	for i, g := range DefaultCategories {
		if g.Name == name {
			return (i + 1) * 100
		}
	}
	return 10000
}
