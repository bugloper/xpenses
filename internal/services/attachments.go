package services

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/bugloper/xpensiv/internal/auth"
	apperr "github.com/bugloper/xpensiv/internal/errors"
)

// Image types a transaction attachment may have. The type is sniffed from the
// bytes, never taken from the client.
var attachmentTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

// attachmentPath is where a transaction's image lives: one file per
// transaction, grouped by user so a user's data can be removed as a whole.
func (s *TransactionService) attachmentPath(userID, txID string) string {
	return filepath.Join(s.AttachmentsDir, userID, txID)
}

// AttachFile stores an image on the transaction, replacing any earlier one.
func (s *TransactionService) AttachFile(ctx context.Context, id string, r io.Reader) error {
	t, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if s.AttachmentsDir == "" {
		return apperr.Internal(errors.New("attachments directory not configured"))
	}
	limit := s.MaxUploadBytes
	if limit <= 0 {
		limit = 10 << 20
	}
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return apperr.BadRequest("could not read the uploaded file")
	}
	if int64(len(data)) > limit {
		return apperr.Validation("validation failed", map[string]string{"file": "the image is too large"})
	}
	if len(data) == 0 {
		return apperr.Validation("validation failed", map[string]string{"file": "the file is empty"})
	}
	mime := http.DetectContentType(data)
	if !attachmentTypes[mime] {
		return apperr.Validation("validation failed", map[string]string{"file": "only JPEG, PNG or WebP images can be attached"})
	}
	dir := filepath.Join(s.AttachmentsDir, t.UserID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return apperr.Internal(err)
	}
	final := s.attachmentPath(t.UserID, t.ID)
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return apperr.Internal(err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return apperr.Internal(err)
	}
	if err := s.Repo.SetAttachmentMime(ctx, s.DB, t.UserID, t.ID, mime); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// Attachment returns the stored image's path and media type.
func (s *TransactionService) Attachment(ctx context.Context, id string) (path, mime string, err error) {
	t, err := s.Get(ctx, id)
	if err != nil {
		return "", "", err
	}
	if t.AttachmentMime == "" {
		return "", "", apperr.NotFound("attachment")
	}
	p := s.attachmentPath(t.UserID, t.ID)
	if _, err := os.Stat(p); err != nil {
		return "", "", apperr.NotFound("attachment")
	}
	return p, t.AttachmentMime, nil
}

// RemoveAttachment deletes the image and clears the transaction's record of it.
func (s *TransactionService) RemoveAttachment(ctx context.Context, id string) error {
	t, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if t.AttachmentMime == "" {
		return apperr.NotFound("attachment")
	}
	_ = os.Remove(s.attachmentPath(t.UserID, t.ID))
	if err := s.Repo.SetAttachmentMime(ctx, s.DB, t.UserID, t.ID, ""); err != nil {
		return apperr.Internal(err)
	}
	return nil
}

// removeAttachmentFile drops the file when its transaction goes away.
func (s *TransactionService) removeAttachmentFile(userID, txID string) {
	if s.AttachmentsDir == "" {
		return
	}
	_ = os.Remove(s.attachmentPath(userID, txID))
}

// UserID helper kept close to the attachment code that needs it in handlers.
var _ = auth.UserID
