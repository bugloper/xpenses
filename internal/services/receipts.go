package services

import (
	"context"
	"io"
	"os"
	"regexp"
	"strings"

	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/ocr"
	"github.com/bugloper/xpenses/internal/receipts"
)

var (
	reISODate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reHMS     = regexp.MustCompile(`^\d{2}:\d{2}:\d{2}$`)
)

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// cleanReceipt trims and bounds what the client sent; nil when nothing useful.
func cleanReceipt(r *dto.Receipt) *models.Receipt {
	if r == nil {
		return nil
	}
	out := &models.Receipt{
		Bank:        clip(r.Bank, 40),
		Reference:   clip(r.Reference, 60),
		PaymentType: clip(r.PaymentType, 60),
		Date:        clip(r.Date, 10),
		Time:        clip(r.Time, 8),
	}
	if !reISODate.MatchString(out.Date) {
		out.Date = ""
	}
	if !reHMS.MatchString(out.Time) {
		out.Time = ""
	}
	if out.IsEmpty() {
		return nil
	}
	return out
}

func receiptFromParsed(p receipts.Receipt) *models.Receipt {
	if !p.Recognised {
		return nil
	}
	r := &models.Receipt{Bank: p.Bank, Reference: p.JournalNo, PaymentType: p.PaymentType, Date: p.Date, Time: p.Time}
	if r.IsEmpty() {
		return nil
	}
	return r
}

// OCRAvailable reports whether screenshots can be read on this server.
func (s *TransactionService) OCRAvailable() bool {
	return s.OCR != nil && s.OCR.Available()
}

// ScanImage reads a payment screenshot that is not (yet) attached to anything,
// for the add screen to prefill the form. Nothing is persisted.
func (s *TransactionService) ScanImage(ctx context.Context, r io.Reader) (receipts.Receipt, error) {
	if !s.OCRAvailable() {
		return receipts.Receipt{}, apperr.NotImplemented("reading screenshots is not available on this server")
	}
	limit := s.MaxUploadBytes
	if limit <= 0 {
		limit = 10 << 20
	}
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil || len(data) == 0 || int64(len(data)) > limit {
		return receipts.Receipt{}, apperr.Validation("validation failed", map[string]string{"file": "the image is missing or too large"})
	}
	tmp, err := os.CreateTemp("", "xpenses-scan-*")
	if err != nil {
		return receipts.Receipt{}, apperr.Internal(err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return receipts.Receipt{}, apperr.Internal(err)
	}
	tmp.Close()
	text, err := s.OCR.Extract(ctx, tmp.Name())
	if err != nil {
		if err == ocr.ErrUnavailable {
			return receipts.Receipt{}, apperr.NotImplemented("reading screenshots is not available on this server")
		}
		return receipts.Receipt{}, apperr.Validation("validation failed", map[string]string{"file": "the image could not be read"})
	}
	return receipts.Parse(text), nil
}

// ScanAttachment reads the transaction's stored screenshot and saves what it
// says, replacing earlier receipt details. Returns the parsed receipt.
func (s *TransactionService) ScanAttachment(ctx context.Context, id string) (receipts.Receipt, error) {
	path, _, err := s.Attachment(ctx, id)
	if err != nil {
		return receipts.Receipt{}, err
	}
	if !s.OCRAvailable() {
		return receipts.Receipt{}, apperr.NotImplemented("reading screenshots is not available on this server")
	}
	text, err := s.OCR.Extract(ctx, path)
	if err != nil {
		return receipts.Receipt{}, apperr.Validation("validation failed", map[string]string{"file": "the image could not be read"})
	}
	parsed := receipts.Parse(text)
	if rc := receiptFromParsed(parsed); rc != nil {
		if err := s.Repo.SetReceipt(ctx, s.DB, userIDOf(ctx), id, rc); err != nil {
			return receipts.Receipt{}, apperr.Internal(err)
		}
	}
	return parsed, nil
}

// fillReceiptFromImage is the best-effort read after an upload: when OCR is
// available and nothing is known yet, keep what the screen says. Failures are
// silent; the image is attached either way.
func (s *TransactionService) fillReceiptFromImage(ctx context.Context, t *models.Transaction, path string) {
	if !s.OCRAvailable() || t.Receipt != nil {
		return
	}
	text, err := s.OCR.Extract(ctx, path)
	if err != nil {
		return
	}
	if rc := receiptFromParsed(receipts.Parse(text)); rc != nil {
		_ = s.Repo.SetReceipt(ctx, s.DB, t.UserID, t.ID, rc)
	}
}
