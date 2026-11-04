package auth

import (
	"context"

	"github.com/bugloper/xpensiv/internal/models"
)

type ctxKey struct{}

// WithUser attaches the signed-in user to ctx.
func WithUser(ctx context.Context, u *models.User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

// UserFromContext returns the signed-in user, or nil.
func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(ctxKey{}).(*models.User)
	return u
}

// UserID returns the signed-in user's id. Services call this to scope every
// query; an empty id matches nothing, so a missing user can never widen a query.
func UserID(ctx context.Context) string {
	if u := UserFromContext(ctx); u != nil {
		return u.ID
	}
	return ""
}
