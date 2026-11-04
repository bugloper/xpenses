package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/mail"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/validators"
)

const (
	SessionIdle     = 30 * 24 * time.Hour
	SessionAbsolute = 180 * 24 * time.Hour
	touchInterval   = 5 * time.Minute

	attemptWindow   = 15 * time.Minute
	maxEmailFails   = 10
	maxIPFails      = 30
	inviteDefaultHr = 72
	inviteMaxHr     = 720
	maxEmailLen     = 254

	AppSettingRegistrationOpen = "registration_open"
)

// Service implements registration, login, sessions, invites and admin actions.
type Service struct {
	DB   *sql.DB
	Repo Repo
	// DefaultCurrency is used for the seeded Cash account.
	DefaultCurrency string
	// AttachmentsDir holds transaction images; a user's folder goes with the user.
	AttachmentsDir string

	// signup serialises Setup and Register. SQLite resolves two concurrent
	// read-then-write transactions by failing one with SQLITE_BUSY, which would
	// surface as a 500 instead of the proper 409/400; and a single process is
	// the only writer, so a mutex is the simplest correct guard.
	signup sync.Mutex
}

func NewService(db *sql.DB) *Service { return &Service{DB: db} }

func now() time.Time { return time.Now().UTC() }

func fmtTime(t time.Time) string { return t.Format(time.RFC3339) }

func hashToken(tok string) string {
	sum := sha256.Sum256([]byte(tok))
	return hex.EncodeToString(sum[:])
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func normaliseEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// validEmail accepts a bare, already-normalised address only: no display
// name, comments, quoting or whitespace (ParseAddress tolerates all of those
// and would let visually different strings register as distinct accounts), and
// a dotted domain since this is a public-internet service.
func validEmail(email string) bool {
	if email == "" || len(email) > maxEmailLen || strings.ContainsAny(email, " \t\r\n<>()\"") {
		return false
	}
	a, err := mail.ParseAddress(email)
	if err != nil || a.Name != "" || a.Address != email {
		return false
	}
	at := strings.LastIndexByte(email, '@')
	return at > 0 && strings.Contains(email[at+1:], ".")
}

func validateIdentity(name, email, password string) error {
	v := validators.Errors{}
	name = strings.TrimSpace(name)
	v.Required("name", name)
	v.MaxLen("name", name, 100)
	if !validEmail(email) {
		v.Add("email", "must be a valid email address")
	}
	if err := ValidatePassword(password); err != nil {
		v.Add("password", err.Error())
	}
	return v.Err()
}

// Status describes what the client should do before authenticating.
type Status struct {
	SetupRequired    bool `json:"setup_required"`
	RegistrationOpen bool `json:"registration_open"`
	Authenticated    bool `json:"authenticated"`
}

func (s *Service) Status(ctx context.Context, authenticated bool) (*Status, error) {
	n, err := s.Repo.CountUsers(ctx, s.DB)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	open, err := s.Repo.GetAppSetting(ctx, s.DB, AppSettingRegistrationOpen, "0")
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &Status{SetupRequired: n == 0, RegistrationOpen: open == "1", Authenticated: authenticated}, nil
}

func (s *Service) RegistrationOpen(ctx context.Context) (bool, error) {
	open, err := s.Repo.GetAppSetting(ctx, s.DB, AppSettingRegistrationOpen, "0")
	return open == "1", err
}

func (s *Service) SetRegistrationOpen(ctx context.Context, open bool) error {
	v := "0"
	if open {
		v = "1"
	}
	if err := s.Repo.SetAppSetting(ctx, s.DB, AppSettingRegistrationOpen, v); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// Setup creates the first (admin) user. Fails once any user exists.
func (s *Service) Setup(ctx context.Context, name, email, password string) (*models.User, error) {
	email = normaliseEmail(email)
	if err := validateIdentity(name, email, password); err != nil {
		return nil, err
	}
	s.signup.Lock()
	defer s.signup.Unlock()
	var user *models.User
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		n, err := s.Repo.CountUsers(ctx, tx)
		if err != nil {
			return err
		}
		if n > 0 {
			return &apperr.Error{Status: 409, Code: "already_set_up", Message: "the application already has an owner"}
		}
		user, err = s.createUser(ctx, tx, name, email, password, models.RoleAdmin)
		return err
	})
	if err != nil {
		if ae, ok := apperr.As(err); ok {
			return nil, ae
		}
		return nil, apperr.Internal(err)
	}
	return user, nil
}

func (s *Service) createUser(ctx context.Context, tx *sql.Tx, name, email, password, role string) (*models.User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	ts := fmtTime(now())
	u := &models.User{ID: uuid.NewString(), Name: strings.TrimSpace(name), Email: email, PasswordHash: hash, Role: role, IsActive: true, CreatedAt: ts, UpdatedAt: ts}
	if err := s.Repo.InsertUser(ctx, tx, u); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, &apperr.Error{Status: 409, Code: "email_taken", Message: "an account with that email already exists"}
		}
		return nil, err
	}
	if err := SeedDefaultCategories(ctx, tx, u.ID); err != nil {
		return nil, err
	}
	if err := SeedDefaultAccount(ctx, tx, u.ID, s.DefaultCurrency); err != nil {
		return nil, err
	}
	return u, nil
}

// Register creates a user when registration is open or a valid invite is supplied.
func (s *Service) Register(ctx context.Context, name, email, password, inviteToken string) (*models.User, error) {
	email = normaliseEmail(email)
	if err := validateIdentity(name, email, password); err != nil {
		return nil, err
	}
	s.signup.Lock()
	defer s.signup.Unlock()
	var user *models.User
	err := repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		n, err := s.Repo.CountUsers(ctx, tx)
		if err != nil {
			return err
		}
		if n == 0 {
			return &apperr.Error{Status: 403, Code: "setup_required", Message: "the application has not been set up yet"}
		}
		var invite *models.Invite
		if inviteToken != "" {
			invite, err = s.Repo.GetInviteByHash(ctx, tx, hashToken(inviteToken))
			if err != nil {
				return err
			}
			if invite == nil || invite.UsedAt != nil || invite.ExpiresAt < fmtTime(now()) {
				return &apperr.Error{Status: 400, Code: "invalid_invite", Message: "this invite link is invalid, expired or already used"}
			}
			if invite.Email != "" && invite.Email != email {
				return &apperr.Error{Status: 400, Code: "invalid_invite", Message: "this invite was issued for a different email address"}
			}
		} else {
			open, err := s.Repo.GetAppSetting(ctx, tx, AppSettingRegistrationOpen, "0")
			if err != nil {
				return err
			}
			if open != "1" {
				return &apperr.Error{Status: 403, Code: "registration_closed", Message: "registration is closed; ask the owner for an invite"}
			}
		}
		user, err = s.createUser(ctx, tx, name, email, password, models.RoleUser)
		if err != nil {
			return err
		}
		if invite != nil {
			used, err := s.Repo.UseInvite(ctx, tx, invite.ID, user.ID, fmtTime(now()))
			if err != nil {
				return err
			}
			if !used {
				return &apperr.Error{Status: 400, Code: "invalid_invite", Message: "this invite link is invalid, expired or already used"}
			}
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.As(err); ok {
			return nil, ae
		}
		return nil, apperr.Internal(err)
	}
	return user, nil
}

// Login verifies credentials with throttling per email and per IP.
func (s *Service) Login(ctx context.Context, email, password, ip string) (*models.User, error) {
	email = normaliseEmail(email)
	n, err := s.Repo.CountUsers(ctx, s.DB)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if n == 0 {
		return nil, &apperr.Error{Status: 403, Code: "setup_required", Message: "the application has not been set up yet"}
	}
	since := fmtTime(now().Add(-attemptWindow))
	_ = s.Repo.PurgeAttempts(ctx, s.DB, fmtTime(now().Add(-24*time.Hour)))
	emailKey, ipKey := "email:"+email, "ip:"+ip
	ec, err := s.Repo.CountAttempts(ctx, s.DB, emailKey, since)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	ic, err := s.Repo.CountAttempts(ctx, s.DB, ipKey, since)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if ec >= maxEmailFails || ic >= maxIPFails {
		return nil, &apperr.Error{Status: 429, Code: "too_many_attempts", Message: "too many failed sign-in attempts; try again later",
			Details: map[string]string{"retry_after": strconv.Itoa(int(attemptWindow.Seconds()))}}
	}
	u, err := s.Repo.GetUserByEmail(ctx, s.DB, email)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	// Always run the hash to keep timing uniform for unknown emails.
	hash := "$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	if u != nil {
		hash = u.PasswordHash
	}
	if !VerifyPassword(hash, password) || u == nil {
		at := fmtTime(now())
		_ = s.Repo.RecordAttempt(ctx, s.DB, emailKey, at)
		_ = s.Repo.RecordAttempt(ctx, s.DB, ipKey, at)
		return nil, &apperr.Error{Status: 401, Code: "invalid_credentials", Message: "incorrect email or password"}
	}
	if !u.IsActive {
		return nil, &apperr.Error{Status: 403, Code: "account_disabled", Message: "this account has been disabled"}
	}
	_ = s.Repo.ClearAttempts(ctx, s.DB, emailKey)
	ts := fmtTime(now())
	u.LastLoginAt = &ts
	u.UpdatedAt = ts
	if err := s.Repo.UpdateUserLastLogin(ctx, s.DB, u.ID, ts); err != nil {
		return nil, apperr.Internal(err)
	}
	return u, nil
}

// CreateSession issues a new session token for the user. The raw token is
// returned once for the cookie; only its hash is stored.
func (s *Service) CreateSession(ctx context.Context, userID, userAgent, ip string) (string, error) {
	tok, err := newToken()
	if err != nil {
		return "", apperr.Internal(err)
	}
	t := now()
	sess := &models.Session{ID: hashToken(tok), UserID: userID, CreatedAt: fmtTime(t), LastSeenAt: fmtTime(t),
		ExpiresAt: fmtTime(t.Add(SessionAbsolute)), UserAgent: truncate(userAgent, 200), IP: truncate(ip, 64)}
	if err := s.Repo.InsertSession(ctx, s.DB, sess); err != nil {
		return "", apperr.Internal(err)
	}
	return tok, nil
}

// Authenticate resolves a raw session token to its user, enforcing idle and
// absolute expiry and the user's active flag. Returns nil, nil when invalid.
func (s *Service) Authenticate(ctx context.Context, token string) (*models.Session, *models.User, error) {
	if token == "" {
		return nil, nil, nil
	}
	sess, u, err := s.Repo.GetSession(ctx, s.DB, hashToken(token))
	if err != nil {
		return nil, nil, apperr.Internal(err)
	}
	if sess == nil {
		return nil, nil, nil
	}
	t := now()
	last, _ := time.Parse(time.RFC3339, sess.LastSeenAt)
	exp, _ := time.Parse(time.RFC3339, sess.ExpiresAt)
	if t.After(exp) || t.Sub(last) > SessionIdle {
		_ = s.Repo.DeleteSession(ctx, s.DB, sess.ID)
		return nil, nil, nil
	}
	if !u.IsActive {
		return nil, nil, &apperr.Error{Status: 403, Code: "account_disabled", Message: "this account has been disabled"}
	}
	if t.Sub(last) > touchInterval {
		_ = s.Repo.TouchSession(ctx, s.DB, sess.ID, fmtTime(t))
	}
	return sess, u, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	if err := s.Repo.DeleteSession(ctx, s.DB, hashToken(token)); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

func (s *Service) LogoutAll(ctx context.Context, userID string) error {
	if err := s.Repo.DeleteUserSessions(ctx, s.DB, userID, ""); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

func (s *Service) ListSessions(ctx context.Context, userID, currentToken string) ([]models.Session, error) {
	list, err := s.Repo.ListSessions(ctx, s.DB, userID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	cur := hashToken(currentToken)
	for i := range list {
		list[i].Current = list[i].ID == cur
		// Expose only a short opaque id to the client.
		list[i].ID = list[i].ID[:16]
	}
	return list, nil
}

// RevokeSession deletes one of the user's sessions by its short id.
func (s *Service) RevokeSession(ctx context.Context, userID, shortID string) error {
	list, err := s.Repo.ListSessions(ctx, s.DB, userID)
	if err != nil {
		return apperr.Internal(err)
	}
	for _, sess := range list {
		if strings.HasPrefix(sess.ID, shortID) && len(shortID) >= 16 {
			if err := s.Repo.DeleteSession(ctx, s.DB, sess.ID); err != nil {
				return apperr.Internal(err)
			}
			return nil
		}
	}
	return apperr.NotFound("session")
}

func (s *Service) UpdateProfile(ctx context.Context, u *models.User, name string) (*models.User, error) {
	name = strings.TrimSpace(name)
	v := validators.Errors{}
	v.Required("name", name)
	v.MaxLen("name", name, 100)
	if err := v.Err(); err != nil {
		return nil, err
	}
	u.Name = name
	u.UpdatedAt = fmtTime(now())
	if err := s.Repo.UpdateUserName(ctx, s.DB, u.ID, u.Name, u.UpdatedAt); err != nil {
		return nil, apperr.Internal(err)
	}
	return u, nil
}

// ChangePassword verifies the current password, stores the new hash and
// revokes every other session.
func (s *Service) ChangePassword(ctx context.Context, u *models.User, currentToken, current, newPw string) error {
	if !VerifyPassword(u.PasswordHash, current) {
		return &apperr.Error{Status: 401, Code: "invalid_credentials", Message: "current password is incorrect"}
	}
	if err := ValidatePassword(newPw); err != nil {
		return apperr.Validation("validation failed", map[string]string{"new_password": err.Error()})
	}
	hash, err := HashPassword(newPw)
	if err != nil {
		return apperr.Internal(err)
	}
	u.PasswordHash = hash
	u.UpdatedAt = fmtTime(now())
	err = repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := s.Repo.UpdateUserPassword(ctx, tx, u.ID, u.PasswordHash, u.UpdatedAt); err != nil {
			return err
		}
		return s.Repo.DeleteUserSessions(ctx, tx, u.ID, hashToken(currentToken))
	})
	if err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// Admin

type AdminUser struct {
	models.User
	AccountCount     int `json:"account_count"`
	TransactionCount int `json:"transaction_count"`
}

func (s *Service) ListUsers(ctx context.Context) ([]AdminUser, error) {
	users, err := s.Repo.ListUsers(ctx, s.DB)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AdminUser, 0, len(users))
	for _, u := range users {
		au := AdminUser{User: u}
		_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM accounts WHERE user_id = ?`, u.ID).Scan(&au.AccountCount)
		_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions WHERE user_id = ?`, u.ID).Scan(&au.TransactionCount)
		out = append(out, au)
	}
	return out, nil
}

func (s *Service) UpdateUserAdmin(ctx context.Context, actor *models.User, id string, isActive *bool, role *string) (*models.User, error) {
	if id == actor.ID {
		return nil, apperr.Validation("validation failed", map[string]string{"id": "you cannot change your own role or status"})
	}
	u, err := s.Repo.GetUser(ctx, s.DB, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if u == nil {
		return nil, apperr.NotFound("user")
	}
	if role != nil {
		if *role != models.RoleAdmin && *role != models.RoleUser {
			return nil, apperr.Validation("validation failed", map[string]string{"role": "must be admin or user"})
		}
		u.Role = *role
	}
	if isActive != nil {
		u.IsActive = *isActive
	}
	u.UpdatedAt = fmtTime(now())
	err = repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := s.Repo.UpdateUserRoleActive(ctx, tx, u.ID, u.Role, u.IsActive, u.UpdatedAt); err != nil {
			return err
		}
		if !u.IsActive {
			return s.Repo.DeleteUserSessions(ctx, tx, u.ID, "")
		}
		return nil
	})
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return u, nil
}

// DeleteUser removes a user and, through ON DELETE CASCADE, every row they own.
func (s *Service) DeleteUser(ctx context.Context, actor *models.User, id string) error {
	if id == actor.ID {
		return apperr.Validation("validation failed", map[string]string{"id": "you cannot delete your own account"})
	}
	u, err := s.Repo.GetUser(ctx, s.DB, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if u == nil {
		return apperr.NotFound("user")
	}
	err = repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		return s.Repo.DeleteUser(ctx, tx, id)
	})
	if err != nil {
		return apperr.Internal(err)
	}
	// Their attached images live on disk, outside the cascade.
	if s.AttachmentsDir != "" {
		_ = os.RemoveAll(filepath.Join(s.AttachmentsDir, id))
	}
	return nil
}

type CreatedInvite struct {
	models.Invite
	Token        string `json:"token"`
	RegisterPath string `json:"register_path"`
}

func (s *Service) CreateInvite(ctx context.Context, actor *models.User, email string, hours int) (*CreatedInvite, error) {
	email = normaliseEmail(email)
	if email != "" {
		if _, err := mail.ParseAddress(email); err != nil {
			return nil, apperr.Validation("validation failed", map[string]string{"email": "must be a valid email address"})
		}
	}
	if hours <= 0 {
		hours = inviteDefaultHr
	}
	if hours > inviteMaxHr {
		return nil, apperr.Validation("validation failed", map[string]string{"expires_in_hours": "must be at most 720"})
	}
	tok, err := newToken()
	if err != nil {
		return nil, apperr.Internal(err)
	}
	t := now()
	inv := models.Invite{ID: uuid.NewString(), Email: email, CreatedBy: actor.ID, CreatedAt: fmtTime(t), ExpiresAt: fmtTime(t.Add(time.Duration(hours) * time.Hour))}
	if err := s.Repo.InsertInvite(ctx, s.DB, &inv, hashToken(tok)); err != nil {
		return nil, apperr.Internal(err)
	}
	return &CreatedInvite{Invite: inv, Token: tok, RegisterPath: "/register?invite=" + tok}, nil
}

func (s *Service) ListInvites(ctx context.Context) ([]models.Invite, error) {
	list, err := s.Repo.ListInvites(ctx, s.DB)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return list, nil
}

func (s *Service) DeleteInvite(ctx context.Context, id string) error {
	ok, err := s.Repo.DeleteInvite(ctx, s.DB, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if !ok {
		return apperr.NotFound("invite")
	}
	return nil
}

// Housekeeping purges expired sessions and old login attempts.
func (s *Service) Housekeeping(ctx context.Context) {
	t := now()
	_ = s.Repo.PurgeExpiredSessions(ctx, s.DB, fmtTime(t), fmtTime(t.Add(-SessionIdle)))
	_ = s.Repo.PurgeAttempts(ctx, s.DB, fmtTime(t.Add(-24*time.Hour)))
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
