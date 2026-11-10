package services

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/bugloper/xpenses/internal/auth"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/repositories"
	"github.com/bugloper/xpenses/internal/validators"
)

// CommunityService holds what users tell Xpenses (feedback, feature requests,
// support questions) and what they say about it (testimonials for the home
// page). Users write; the administrator reads, answers and approves.
type CommunityService struct{ DB *sql.DB }

// ---------------------------------------------------------------- feedback

const maxMessageRunes = 2000

// FeedbackKind is one of the things a user can send, in the order the form offers them.
type FeedbackKind struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

var FeedbackKinds = []FeedbackKind{
	{"feedback", "Feedback"},
	{"feature", "Feature request"},
	{"support", "Support"},
}

func feedbackKindLabel(key string) string {
	for _, k := range FeedbackKinds {
		if k.Key == key {
			return k.Label
		}
	}
	return "Feedback"
}

// Feedback is one message as its sender sees it.
type Feedback struct {
	ID             string  `json:"id"`
	Kind           string  `json:"kind"`
	KindLabel      string  `json:"kind_label"`
	Body           string  `json:"body"`
	Status         string  `json:"status"`
	Reply          string  `json:"reply"`
	CreatedAt      string  `json:"created_at"`
	AcknowledgedAt *string `json:"acknowledged_at"`
	RepliedAt      *string `json:"replied_at"`
}

// Sender is who wrote a message or testimonial, as the administrator sees them.
type Sender struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// AdminFeedback is a message on the administrator's queue.
type AdminFeedback struct {
	Feedback
	From           Sender  `json:"from"`
	ReviewedByName *string `json:"reviewed_by_name"`
}

const feedbackCols = `f.id, f.kind, f.body, f.status, f.reply, f.created_at, f.acknowledged_at, f.replied_at`

func scanFeedback(dst *Feedback, extra ...any) []any {
	return append([]any{&dst.ID, &dst.Kind, &dst.Body, &dst.Status, &dst.Reply, &dst.CreatedAt, &dst.AcknowledgedAt, &dst.RepliedAt}, extra...)
}

// MyFeedback lists what the signed-in user has sent, newest first.
func (s *CommunityService) MyFeedback(ctx context.Context) ([]Feedback, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+feedbackCols+` FROM feedback f WHERE f.user_id = ? ORDER BY f.created_at DESC, f.id DESC LIMIT 200`, auth.UserID(ctx))
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []Feedback{}
	for rows.Next() {
		var f Feedback
		if err := rows.Scan(scanFeedback(&f)...); err != nil {
			return nil, apperr.Internal(err)
		}
		f.KindLabel = feedbackKindLabel(f.Kind)
		out = append(out, f)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// SendFeedback stores a message from the signed-in user.
func (s *CommunityService) SendFeedback(ctx context.Context, kind, body string) (*Feedback, error) {
	body = strings.TrimSpace(body)
	v := validators.Errors{}
	v.OneOf("kind", kind, "feedback", "feature", "support")
	v.Required("body", body)
	if utf8.RuneCountInString(body) > maxMessageRunes {
		v.Add("body", "at most 2000 characters")
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	now := models.NowUTC()
	f := &Feedback{ID: NewID(), Kind: kind, KindLabel: feedbackKindLabel(kind), Body: body, Status: "new", CreatedAt: now}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO feedback (id, user_id, kind, body, status, created_at, updated_at) VALUES (?,?,?,?,'new',?,?)`,
		f.ID, auth.UserID(ctx), kind, body, now, now); err != nil {
		return nil, apperr.Internal(err)
	}
	return f, nil
}

// AdminFeedbackList is the administrator's queue, newest first; status "" or "all" lists everything.
func (s *CommunityService) AdminFeedbackList(ctx context.Context, status string) ([]AdminFeedback, error) {
	if status != "" && status != "all" {
		v := validators.Errors{}
		v.OneOf("status", status, "new", "acknowledged", "replied")
		if err := v.Err(); err != nil {
			return nil, err
		}
	}
	q := `SELECT ` + feedbackCols + `, u.id, u.name, u.email, r.name
		FROM feedback f JOIN users u ON u.id = f.user_id LEFT JOIN users r ON r.id = f.reviewed_by`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE f.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY f.created_at DESC, f.id DESC LIMIT 500`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []AdminFeedback{}
	for rows.Next() {
		var a AdminFeedback
		if err := rows.Scan(scanFeedback(&a.Feedback, &a.From.ID, &a.From.Name, &a.From.Email, &a.ReviewedByName)...); err != nil {
			return nil, apperr.Internal(err)
		}
		a.KindLabel = feedbackKindLabel(a.Kind)
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

func (s *CommunityService) feedbackStatus(ctx context.Context, db repositories.DBTX, id string) (string, error) {
	var status string
	err := db.QueryRowContext(ctx, `SELECT status FROM feedback WHERE id = ?`, id).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return "", apperr.NotFound("message")
	}
	if err != nil {
		return "", apperr.Internal(err)
	}
	return status, nil
}

// AcknowledgeFeedback marks a new message seen. An answered or already seen one is left as it is.
func (s *CommunityService) AcknowledgeFeedback(ctx context.Context, id string) error {
	if _, err := s.feedbackStatus(ctx, s.DB, id); err != nil {
		return err
	}
	now := models.NowUTC()
	if _, err := s.DB.ExecContext(ctx, `UPDATE feedback SET status = 'acknowledged', acknowledged_at = ?, reviewed_by = ?, updated_at = ?
		WHERE id = ? AND status = 'new'`, now, auth.UserID(ctx), now, id); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// ReplyToFeedback answers a message. Each message gets one answer; a second is refused (409).
func (s *CommunityService) ReplyToFeedback(ctx context.Context, id, reply string) error {
	reply = strings.TrimSpace(reply)
	v := validators.Errors{}
	v.Required("reply", reply)
	if utf8.RuneCountInString(reply) > maxMessageRunes {
		v.Add("reply", "at most 2000 characters")
	}
	if err := v.Err(); err != nil {
		return err
	}
	status, err := s.feedbackStatus(ctx, s.DB, id)
	if err != nil {
		return err
	}
	if status == "replied" {
		return apperr.Conflict("this message has already been answered")
	}
	now := models.NowUTC()
	if _, err := s.DB.ExecContext(ctx, `UPDATE feedback SET status = 'replied', reply = ?, replied_at = ?,
		acknowledged_at = COALESCE(acknowledged_at, ?), reviewed_by = ?, updated_at = ? WHERE id = ?`,
		reply, now, now, auth.UserID(ctx), now, id); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// ------------------------------------------------------------- testimonials

const (
	minTestimonialRunes = 20
	maxTestimonialRunes = 300
)

// Testimonial is the user's own, as they see it.
type Testimonial struct {
	ID        string `json:"id"`
	Body      string `json:"body"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updated_at"`
}

// PublicTestimonial is an approved one as the home page shows it.
type PublicTestimonial struct {
	ID   string `json:"id"`
	Body string `json:"body"`
	Name string `json:"name"`
	// The month they started, e.g. "2026-11" ("Using Xpenses since Nov 2026").
	Since string `json:"since"`
}

// AdminTestimonial is one on the administrator's review list.
type AdminTestimonial struct {
	Testimonial
	From           Sender  `json:"from"`
	ReviewedByName *string `json:"reviewed_by_name"`
	ReviewedAt     *string `json:"reviewed_at"`
}

// MyTestimonial is the signed-in user's testimonial, or nil when they have not written one.
func (s *CommunityService) MyTestimonial(ctx context.Context) (*Testimonial, error) {
	var t Testimonial
	err := s.DB.QueryRowContext(ctx, `SELECT id, body, status, updated_at FROM testimonials WHERE user_id = ?`, auth.UserID(ctx)).
		Scan(&t.ID, &t.Body, &t.Status, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &t, nil
}

// SaveTestimonial writes or rewrites the user's testimonial; either way it waits for review.
func (s *CommunityService) SaveTestimonial(ctx context.Context, body string) (*Testimonial, error) {
	body = strings.Join(strings.Fields(body), " ")
	n := utf8.RuneCountInString(body)
	v := validators.Errors{}
	if n < minTestimonialRunes {
		v.Add("body", "say a little more (at least 20 characters)")
	} else if n > maxTestimonialRunes {
		v.Add("body", "keep it short (at most 300 characters)")
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	now := models.NowUTC()
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO testimonials (id, user_id, body, status, created_at, updated_at)
		VALUES (?,?,?,'pending',?,?)
		ON CONFLICT(user_id) DO UPDATE SET body = excluded.body, status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = excluded.updated_at`,
		NewID(), auth.UserID(ctx), body, now, now); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.MyTestimonial(ctx)
}

// DeleteTestimonial removes the user's testimonial (and takes it off the home page).
func (s *CommunityService) DeleteTestimonial(ctx context.Context) error {
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM testimonials WHERE user_id = ?`, auth.UserID(ctx)); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// PublicTestimonials are the approved ones for the home page, newest approval first.
// Only active users' words are shown.
func (s *CommunityService) PublicTestimonials(ctx context.Context) ([]PublicTestimonial, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT t.id, t.body, u.name, substr(u.created_at, 1, 7)
		FROM testimonials t JOIN users u ON u.id = t.user_id
		WHERE t.status = 'approved' AND u.is_active = 1
		ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 12`)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []PublicTestimonial{}
	for rows.Next() {
		var p PublicTestimonial
		if err := rows.Scan(&p.ID, &p.Body, &p.Name, &p.Since); err != nil {
			return nil, apperr.Internal(err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// AdminTestimonials is the review list; status "" or "all" lists everything.
func (s *CommunityService) AdminTestimonials(ctx context.Context, status string) ([]AdminTestimonial, error) {
	if status != "" && status != "all" {
		v := validators.Errors{}
		v.OneOf("status", status, "pending", "approved", "hidden")
		if err := v.Err(); err != nil {
			return nil, err
		}
	}
	q := `SELECT t.id, t.body, t.status, t.updated_at, u.id, u.name, u.email, r.name, t.reviewed_at
		FROM testimonials t JOIN users u ON u.id = t.user_id LEFT JOIN users r ON r.id = t.reviewed_by`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE t.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY t.updated_at DESC, t.id DESC LIMIT 500`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []AdminTestimonial{}
	for rows.Next() {
		var a AdminTestimonial
		if err := rows.Scan(&a.ID, &a.Body, &a.Status, &a.UpdatedAt, &a.From.ID, &a.From.Name, &a.From.Email, &a.ReviewedByName, &a.ReviewedAt); err != nil {
			return nil, apperr.Internal(err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// ReviewTestimonial approves ("approved") or hides ("hidden") a testimonial.
func (s *CommunityService) ReviewTestimonial(ctx context.Context, id, status string) error {
	now := models.NowUTC()
	res, err := s.DB.ExecContext(ctx, `UPDATE testimonials SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
		status, auth.UserID(ctx), now, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return apperr.NotFound("testimonial")
	}
	return nil
}

// CommunityCounts is what waits for the administrator.
type CommunityCounts struct {
	NewFeedback         int `json:"new_feedback"`
	PendingTestimonials int `json:"pending_testimonials"`
}

func (s *CommunityService) Counts(ctx context.Context) (*CommunityCounts, error) {
	var c CommunityCounts
	if err := s.DB.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM feedback WHERE status = 'new'),
		(SELECT COUNT(*) FROM testimonials WHERE status = 'pending')`).Scan(&c.NewFeedback, &c.PendingTestimonials); err != nil {
		return nil, apperr.Internal(err)
	}
	return &c, nil
}
