package auth

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/bugloper/xpenses/internal/models"
)

// legacyTargets maps the flat default categories of earlier releases to a
// node of the new tree ("Group" or "Group/Sub"). Names that also exist in
// the tree are adopted in place and need no entry here.
var legacyTargets = map[string]string{
	"expense/Food":                "Food & Groceries",
	"expense/Transportation":      "Transportation",
	"expense/Bills":               "Household Expenses",
	"expense/Internet & Telecom":  "Household Expenses/Internet/Wi-Fi",
	"expense/Housing":             "Household Expenses",
	"expense/Health":              "Health & Medical",
	"expense/Entertainment":       "Entertainment & Lifestyle",
	"expense/Personal":            "Personal Expenses",
	"expense/Family":              "Family & Social",
	"expense/Education":           "Education & Professional Development",
	"expense/Travel":              "Entertainment & Lifestyle/Travel and holidays",
	"expense/Loan Repayment":      "Financial Obligations/Loan repayments",
	"expense/Credit Card Payment": "Financial Obligations/Credit card payments",
	"expense/Savings":             "Savings & Investments",
	"expense/Other":               "Miscellaneous",
	"income/Business":             "Business & Freelance/Business income",
	"income/Refund":               "Other Income/Refunds",
}

type existingCategory struct {
	ID, Name, Type string
	ParentID       sql.NullString
	IsSystem       bool
}

// UpgradeCategoryTrees moves every user still on the flat default categories
// of earlier releases onto the two-level tree. It runs at startup and is
// idempotent: a user with any system sub-category is already upgraded.
//
// Old defaults whose name exists in the tree become that node (their
// transactions stay put). The others are mapped by name: their transactions,
// budgets and recurring rules move to the target and the old row is deleted.
// Categories the user created are left as they are.
func UpgradeCategoryTrees(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `SELECT id FROM users u WHERE NOT EXISTS (
		SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.is_system = 1 AND c.parent_id IS NOT NULL)`)
	if err != nil {
		return err
	}
	var users []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		users = append(users, id)
	}
	rows.Close()
	for _, uid := range users {
		if err := upgradeUser(ctx, db, uid); err != nil {
			return fmt.Errorf("upgrade categories for user %s: %w", uid, err)
		}
	}
	return nil
}

func upgradeUser(ctx context.Context, db *sql.DB, userID string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `SELECT id, name, type, parent_id, is_system FROM categories WHERE user_id = ?`, userID)
	if err != nil {
		return err
	}
	var existing []existingCategory
	exists := map[string]string{}
	for rows.Next() {
		var c existingCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.ParentID, &c.IsSystem); err != nil {
			rows.Close()
			return err
		}
		existing = append(existing, c)
		exists[c.Type+"/"+c.Name] = c.ID
	}
	rows.Close()

	// Names present in the new tree, so adopted rows are not treated as legacy below.
	inTree := map[string]bool{}
	ids := map[string]string{} // "Group" and "Group/Sub" -> id
	for _, g := range DefaultCategories {
		inTree[g.Type+"/"+g.Name] = true
		for _, s := range g.Subs {
			inTree[g.Type+"/"+s.Name] = true
		}
		groupID, err := seedGroup(ctx, tx, userID, g, exists)
		if err != nil {
			return err
		}
		ids[g.Name] = groupID
	}
	subIDs, err := tx.QueryContext(ctx, `SELECT c.id, p.name, c.name FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.user_id = ?`, userID)
	if err != nil {
		return err
	}
	for subIDs.Next() {
		var id, group, name string
		if err := subIDs.Scan(&id, &group, &name); err != nil {
			subIDs.Close()
			return err
		}
		ids[group+"/"+name] = id
	}
	subIDs.Close()

	for _, c := range existing {
		if !c.IsSystem || inTree[c.Type+"/"+c.Name] {
			continue
		}
		target, ok := ids[legacyTargets[c.Type+"/"+c.Name]]
		if !ok {
			// Unknown legacy default: keep it, filed under the catch-all group.
			fallback := ids["Miscellaneous"]
			if c.Type == models.TxIncome {
				fallback = ids["Other Income"]
			}
			if _, err := tx.ExecContext(ctx, `UPDATE categories SET parent_id = ?, updated_at = ? WHERE id = ?`, fallback, models.NowUTC(), c.ID); err != nil {
				return err
			}
			continue
		}
		if err := moveCategoryReferences(ctx, tx, c.ID, target); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id = ?`, c.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// moveCategoryReferences repoints everything that references `from` at `to`.
func moveCategoryReferences(ctx context.Context, tx *sql.Tx, from, to string) error {
	for _, q := range []string{
		`UPDATE transactions SET category_id = ? WHERE category_id = ?`,
		`UPDATE recurring_transactions SET category_id = ? WHERE category_id = ?`,
		`UPDATE categories SET parent_id = ? WHERE parent_id = ?`,
		`UPDATE settings SET value = ? WHERE key = 'ui.last_category_id' AND value = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, to, from); err != nil {
			return err
		}
	}
	// One budget per category: keep the target's own budget if it has one.
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM budgets WHERE category_id = ?`, to).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		_, err := tx.ExecContext(ctx, `DELETE FROM budgets WHERE category_id = ?`, from)
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE budgets SET category_id = ? WHERE category_id = ?`, to, from)
	return err
}
