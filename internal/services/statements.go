package services

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/pdf"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/validators"
)

// pendingTTL is how long an uploaded PDF waits for its import call.
const pendingTTL = 30 * time.Minute

// PreviewStatement is the statement-level block of an import preview.
type PreviewStatement struct {
	AccountNumber    string `json:"account_number"`
	AccountHolder    string `json:"account_holder"`
	Currency         string `json:"currency"`
	PeriodStart      string `json:"period_start"`
	PeriodEnd        string `json:"period_end"`
	OpeningBalance   *int64 `json:"opening_balance"`
	ClosingBalance   *int64 `json:"closing_balance"`
	TotalDebits      int64  `json:"total_debits"`
	TotalCredits     int64  `json:"total_credits"`
	TransactionCount int    `json:"transaction_count"`
}

// PreviewTransaction is one parsed row of an import preview.
type PreviewTransaction struct {
	LineNo          int      `json:"line_no"`
	TransactionDate string   `json:"transaction_date"`
	ValueDate       *string  `json:"value_date"`
	Description     string   `json:"description"`
	Reference       string   `json:"reference"`
	Debit           int64    `json:"debit"`
	Credit          int64    `json:"credit"`
	Balance         *int64   `json:"balance"`
	Fingerprint     string   `json:"fingerprint"`
	IsDuplicate     bool     `json:"is_duplicate"`
	Warnings        []string `json:"warnings"`
}

// DuplicateStatement points at an already-imported statement.
type DuplicateStatement struct {
	ID         string `json:"id"`
	FileName   string `json:"file_name"`
	ImportedAt string `json:"imported_at"`
	Reason     string `json:"reason"` // sha256 | period | fingerprints
}

// ImportPreview is the response of POST /statements/parse.
type ImportPreview struct {
	UploadToken        string               `json:"upload_token"`
	FileName           string               `json:"file_name"`
	FileSHA256         string               `json:"file_sha256"`
	FileSize           int64                `json:"file_size"`
	Provider           string               `json:"provider"`
	AccountID          string               `json:"account_id"`
	TextExtraction     string               `json:"text_extraction"` // text | none
	Statement          PreviewStatement     `json:"statement"`
	Transactions       []PreviewTransaction `json:"transactions"`
	Validation         pdf.Validation       `json:"validation"`
	DuplicateStatement *DuplicateStatement  `json:"duplicate_statement"`
	Warnings           []string             `json:"warnings"`
}

// ImportRequest is the body of POST /statements/import.
type ImportRequest struct {
	UploadToken    string               `json:"upload_token"`
	AccountID      string               `json:"account_id"`
	Force          bool                 `json:"force"`
	SkipDuplicates *bool                `json:"skip_duplicates"`
	Statement      PreviewStatement     `json:"statement"`
	Transactions   []PreviewTransaction `json:"transactions"`
}

// ImportResult is the imported statement plus how many rows were skipped as
// duplicates.
type ImportResult struct {
	repositories.StatementWithCounts
	SkippedDuplicates int `json:"skipped_duplicates"`
}

// ParseInput is what the handler hands to Parse.
type ParseInput struct {
	AccountID string
	Provider  string
	Password  string
	FileName  string
	Data      []byte
}

// pendingMeta is the sidecar stored next to a pending upload.
type pendingMeta struct {
	FileName  string `json:"file_name"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Provider  string `json:"provider"`
	AccountID string `json:"account_id"`
	CreatedAt string `json:"created_at"`
}

var tokenRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

type StatementService struct {
	DB         *sql.DB
	Dir        string
	Statements repositories.BankStatementRepo
	BankTxs    repositories.BankTransactionRepo
	Accounts   repositories.AccountRepo
	parsers    map[string]pdf.StatementParser
	now        func() time.Time
}

// NewStatementService builds the service; statementsDir receives the audit
// copies (<id>.pdf) and pending uploads (pending/<token>.pdf).
func NewStatementService(db *sql.DB, statementsDir string) *StatementService {
	return &StatementService{DB: db, Dir: statementsDir, parsers: pdf.Parsers(), now: time.Now}
}

func codeErr(status int, code, msg string) *apperr.Error {
	return &apperr.Error{Status: status, Code: code, Message: msg}
}

// Fingerprint identifies a bank row: sha256 of
// account|date|normalised description|debit|credit|balance, first 32 hex chars.
func Fingerprint(accountID, date, description string, debit, credit int64, balance *int64) string {
	bal := ""
	if balance != nil {
		bal = fmt.Sprint(*balance)
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%s|%d|%d|%s", accountID, date, pdf.NormaliseDescription(description), debit, credit, bal)))
	return hex.EncodeToString(sum[:])[:32]
}

func (s *StatementService) pendingDir() string { return filepath.Join(s.Dir, "pending") }

func (s *StatementService) pendingPaths(token string) (pdfPath, metaPath string) {
	return filepath.Join(s.pendingDir(), token+".pdf"), filepath.Join(s.pendingDir(), token+".json")
}

func (s *StatementService) filePath(id string) string { return filepath.Join(s.Dir, id+".pdf") }

// purgePending removes pending uploads older than pendingTTL.
func (s *StatementService) purgePending() {
	entries, err := os.ReadDir(s.pendingDir())
	if err != nil {
		return
	}
	cutoff := s.now().Add(-pendingTTL)
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || info.IsDir() {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(s.pendingDir(), e.Name()))
		}
	}
}

func newToken() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func (s *StatementService) requireAccount(ctx context.Context, db repositories.DBTX, id string) (*models.Account, error) {
	v := validators.Errors{}
	v.Required("account_id", id)
	if err := v.Err(); err != nil {
		return nil, err
	}
	acct, err := s.Accounts.Get(ctx, db, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if acct == nil {
		v.Add("account_id", "account not found")
		return nil, v.Err()
	}
	return acct, nil
}

// Parse extracts and parses an uploaded PDF and caches it for Import.
// Nothing is written to the database. Statement contents are never logged.
func (s *StatementService) Parse(ctx context.Context, in ParseInput) (*ImportPreview, error) {
	if in.Provider == "" {
		in.Provider = "bob"
	}
	parser, ok := s.parsers[in.Provider]
	if !ok {
		return nil, apperr.Validation("validation failed", map[string]string{"provider": "unsupported provider"})
	}
	if _, err := s.requireAccount(ctx, s.DB, in.AccountID); err != nil {
		return nil, err
	}
	if !pdf.IsPDF(in.Data) {
		return nil, codeErr(http.StatusBadRequest, "invalid_file", "the uploaded file is not a PDF")
	}
	s.purgePending()

	doc, err := pdf.Extract(bytes.NewReader(in.Data), int64(len(in.Data)), in.Password)
	switch {
	case errors.Is(err, pdf.ErrNotPDF):
		return nil, codeErr(http.StatusBadRequest, "invalid_file", "the uploaded file is not a PDF")
	case errors.Is(err, pdf.ErrPasswordRequired):
		return nil, codeErr(http.StatusBadRequest, "pdf_password_required", "this statement is password-protected; enter the password (DDMM of your date of birth)")
	case errors.Is(err, pdf.ErrPasswordIncorrect):
		return nil, codeErr(http.StatusBadRequest, "pdf_password_incorrect", "the password did not open this statement")
	case errors.Is(err, pdf.ErrNoText):
		return nil, codeErr(http.StatusUnprocessableEntity, "pdf_no_text", "no text could be extracted; scanned statements need OCR which is not supported yet")
	case err != nil:
		return nil, codeErr(http.StatusBadRequest, "invalid_file", "the PDF could not be read").WithCause(err)
	}
	ps, err := parser.Parse(doc)
	if errors.Is(err, pdf.ErrUnrecognised) {
		return nil, codeErr(http.StatusUnprocessableEntity, "pdf_unrecognised", "could not find a statement table in this PDF")
	}
	if err != nil {
		return nil, apperr.Internal(err)
	}

	sum := sha256.Sum256(in.Data)
	sha := hex.EncodeToString(sum[:])

	rows := make([]PreviewTransaction, 0, len(ps.Transactions))
	fps := make([]string, 0, len(ps.Transactions))
	for _, t := range ps.Transactions {
		fp := Fingerprint(in.AccountID, t.TransactionDate, t.Description, t.Debit, t.Credit, t.Balance)
		fps = append(fps, fp)
		w := t.Warnings
		if w == nil {
			w = []string{}
		}
		rows = append(rows, PreviewTransaction{LineNo: t.LineNo, TransactionDate: t.TransactionDate, ValueDate: t.ValueDate, Description: t.Description,
			Reference: t.Reference, Debit: t.Debit, Credit: t.Credit, Balance: t.Balance, Fingerprint: fp, Warnings: w})
	}
	existing, err := s.BankTxs.ExistingFingerprints(ctx, s.DB, in.AccountID, fps)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	for i := range rows {
		_, rows[i].IsDuplicate = existing[rows[i].Fingerprint]
	}
	dup, err := s.detectDuplicate(ctx, in.AccountID, sha, ps.PeriodStart, ps.PeriodEnd, len(rows), existing)
	if err != nil {
		return nil, err
	}

	token, err := s.storePending(in, sha)
	if err != nil {
		return nil, apperr.Internal(err)
	}

	return &ImportPreview{
		UploadToken: token, FileName: in.FileName, FileSHA256: sha, FileSize: int64(len(in.Data)), Provider: in.Provider,
		AccountID: in.AccountID, TextExtraction: "text",
		Statement: PreviewStatement{
			AccountNumber: ps.AccountNumber, AccountHolder: ps.AccountHolder, Currency: ps.Currency,
			PeriodStart: ps.PeriodStart, PeriodEnd: ps.PeriodEnd, OpeningBalance: ps.OpeningBalance, ClosingBalance: ps.ClosingBalance,
			TotalDebits: ps.TotalDebits, TotalCredits: ps.TotalCredits, TransactionCount: len(rows),
		},
		Transactions:       rows,
		Validation:         pdf.Validate(ps),
		DuplicateStatement: dup,
		Warnings:           ps.Warnings,
	}, nil
}

// detectDuplicate checks, in order: identical bytes, overlapping period on
// the same account, and >= 80% of the rows already imported.
func (s *StatementService) detectDuplicate(ctx context.Context, accountID, sha, start, end string, total int, existing map[string]string) (*DuplicateStatement, error) {
	if st, err := s.Statements.GetBySHA256(ctx, s.DB, sha); err != nil {
		return nil, apperr.Internal(err)
	} else if st != nil {
		return &DuplicateStatement{ID: st.ID, FileName: st.FileName, ImportedAt: st.ImportedAt, Reason: "sha256"}, nil
	}
	if start != "" && end != "" {
		if st, err := s.Statements.FindOverlapping(ctx, s.DB, accountID, start, end); err != nil {
			return nil, apperr.Internal(err)
		} else if st != nil {
			return &DuplicateStatement{ID: st.ID, FileName: st.FileName, ImportedAt: st.ImportedAt, Reason: "period"}, nil
		}
	}
	if total > 0 && len(existing)*5 >= total*4 {
		// Point at the statement holding most of the duplicates.
		counts := map[string]int{}
		best := ""
		for _, sid := range existing {
			counts[sid]++
			if best == "" || counts[sid] > counts[best] {
				best = sid
			}
		}
		st, err := s.Statements.Get(ctx, s.DB, best)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if st != nil {
			return &DuplicateStatement{ID: st.ID, FileName: st.FileName, ImportedAt: st.ImportedAt, Reason: "fingerprints"}, nil
		}
	}
	return nil, nil
}

func (s *StatementService) storePending(in ParseInput, sha string) (string, error) {
	if err := os.MkdirAll(s.pendingDir(), 0o700); err != nil {
		return "", err
	}
	token, err := newToken()
	if err != nil {
		return "", err
	}
	pdfPath, metaPath := s.pendingPaths(token)
	if err := os.WriteFile(pdfPath, in.Data, 0o600); err != nil {
		return "", err
	}
	meta, _ := json.Marshal(pendingMeta{FileName: in.FileName, SHA256: sha, Size: int64(len(in.Data)), Provider: in.Provider, AccountID: in.AccountID, CreatedAt: s.now().UTC().Format(time.RFC3339)})
	if err := os.WriteFile(metaPath, meta, 0o600); err != nil {
		_ = os.Remove(pdfPath)
		return "", err
	}
	return token, nil
}

func (s *StatementService) loadPending(token string) (*pendingMeta, string, error) {
	if !tokenRe.MatchString(token) {
		return nil, "", apperr.Validation("validation failed", map[string]string{"upload_token": "is invalid"})
	}
	pdfPath, metaPath := s.pendingPaths(token)
	raw, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, "", apperr.BadRequest("upload token is unknown or has expired; upload the PDF again")
	}
	var meta pendingMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, "", apperr.BadRequest("upload token is unknown or has expired; upload the PDF again")
	}
	if _, err := os.Stat(pdfPath); err != nil {
		return nil, "", apperr.BadRequest("upload token is unknown or has expired; upload the PDF again")
	}
	return &meta, pdfPath, nil
}

func validateImport(req *ImportRequest) error {
	v := validators.Errors{}
	v.Required("upload_token", req.UploadToken)
	v.Required("statement.period_start", req.Statement.PeriodStart)
	v.Required("statement.period_end", req.Statement.PeriodEnd)
	v.Date("statement.period_start", req.Statement.PeriodStart)
	v.Date("statement.period_end", req.Statement.PeriodEnd)
	if req.Statement.PeriodStart != "" && req.Statement.PeriodEnd != "" && req.Statement.PeriodStart > req.Statement.PeriodEnd {
		v.Add("statement.period_end", "must not be before period_start")
	}
	if req.Statement.Currency == "" {
		req.Statement.Currency = "BTN"
	}
	v.Currency("statement.currency", req.Statement.Currency)
	v.MaxLen("statement.account_holder", req.Statement.AccountHolder, 200)
	v.MaxLen("statement.account_number", req.Statement.AccountNumber, 64)
	if len(req.Transactions) == 0 {
		v.Add("transactions", "at least one transaction is required")
	}
	for i := range req.Transactions {
		t := &req.Transactions[i]
		key := fmt.Sprintf("transactions[%d].", i)
		t.Description = strings.TrimSpace(t.Description)
		t.Reference = strings.TrimSpace(t.Reference)
		v.Required(key+"transaction_date", t.TransactionDate)
		v.Date(key+"transaction_date", t.TransactionDate)
		if t.ValueDate != nil && *t.ValueDate != "" {
			v.Date(key+"value_date", *t.ValueDate)
		}
		if t.Debit < 0 {
			v.Add(key+"debit", "must not be negative")
		}
		if t.Credit < 0 {
			v.Add(key+"credit", "must not be negative")
		}
		if t.Debit > 0 && t.Credit > 0 {
			v.Add(key+"credit", "a row cannot have both a debit and a credit")
		}
		if t.Debit == 0 && t.Credit == 0 {
			v.Add(key+"debit", "a row needs a debit or a credit")
		}
		v.MaxLen(key+"description", t.Description, 500)
		v.MaxLen(key+"reference", t.Reference, 100)
	}
	return v.Err()
}

// Import persists the user-corrected preview in one transaction and moves the
// cached PDF into place.
func (s *StatementService) Import(ctx context.Context, req ImportRequest) (*ImportResult, error) {
	if err := validateImport(&req); err != nil {
		return nil, err
	}
	meta, pendingPath, err := s.loadPending(req.UploadToken)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireAccount(ctx, s.DB, req.AccountID); err != nil {
		return nil, err
	}
	skip := req.SkipDuplicates == nil || *req.SkipDuplicates

	if st, err := s.Statements.GetBySHA256(ctx, s.DB, meta.SHA256); err != nil {
		return nil, apperr.Internal(err)
	} else if st != nil && !req.Force {
		return nil, codeErr(http.StatusConflict, "duplicate_statement", "this file was already imported as statement "+st.ID+" (send force:true to import it again)")
	}

	// Recompute everything the client could have edited.
	ps := &pdf.ParsedStatement{OpeningBalance: req.Statement.OpeningBalance, ClosingBalance: req.Statement.ClosingBalance}
	fps := make([]string, len(req.Transactions))
	for i, t := range req.Transactions {
		fps[i] = Fingerprint(req.AccountID, t.TransactionDate, t.Description, t.Debit, t.Credit, t.Balance)
		ps.Transactions = append(ps.Transactions, pdf.ParsedTransaction{Debit: t.Debit, Credit: t.Credit, Balance: t.Balance})
	}
	// The balance check is a property of the document, so it runs over every
	// submitted row, including rows skipped below as duplicates.
	validation := pdf.Validate(ps)

	existing, err := s.BankTxs.ExistingFingerprints(ctx, s.DB, req.AccountID, fps)
	if err != nil {
		return nil, apperr.Internal(err)
	}

	now := models.NowUTC()
	st := &models.BankStatement{
		ID: NewID(), Provider: meta.Provider, AccountID: req.AccountID, FileName: meta.FileName, FileSHA256: meta.SHA256, FileSize: meta.Size,
		AccountNumber: strings.TrimSpace(req.Statement.AccountNumber), AccountHolder: strings.TrimSpace(req.Statement.AccountHolder),
		PeriodStart: req.Statement.PeriodStart, PeriodEnd: req.Statement.PeriodEnd,
		OpeningBalance: req.Statement.OpeningBalance, ClosingBalance: req.Statement.ClosingBalance,
		BalanceVerified: validation.BalanceCheck == "ok", ImportedAt: now,
	}
	skipped := 0
	err = repositories.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		seen := map[string]bool{}
		var inserts []models.BankTransaction
		for i, t := range req.Transactions {
			fp := fps[i]
			if _, dup := existing[fp]; dup || seen[fp] {
				if !skip {
					return codeErr(http.StatusConflict, "duplicate_bank_transaction",
						fmt.Sprintf("transactions[%d] already exists for this account; enable skip_duplicates", i))
				}
				skipped++
				continue
			}
			seen[fp] = true
			lineNo := t.LineNo
			if lineNo <= 0 {
				lineNo = i + 1
			}
			var valueDate *string
			if t.ValueDate != nil && *t.ValueDate != "" {
				vd := *t.ValueDate
				valueDate = &vd
			}
			inserts = append(inserts, models.BankTransaction{
				ID: NewID(), StatementID: st.ID, AccountID: req.AccountID, LineNo: lineNo, TransactionDate: t.TransactionDate, ValueDate: valueDate,
				Description: t.Description, Reference: t.Reference, Debit: t.Debit, Credit: t.Credit, Balance: t.Balance, Fingerprint: fp, CreatedAt: now,
			})
		}
		// Counts and totals describe the rows this statement actually holds,
		// so the workspace summary (statement totals) and the reconciliation
		// report (sum of lines) agree. Skipped rows belong to the statement
		// that imported them first.
		st.TransactionCount = len(inserts)
		st.TotalDebits, st.TotalCredits = 0, 0
		for i := range inserts {
			st.TotalDebits += inserts[i].Debit
			st.TotalCredits += inserts[i].Credit
		}
		if skipped > 0 {
			st.Notes = fmt.Sprintf("%d duplicate row(s) skipped at import", skipped)
		}
		if err := s.Statements.Insert(ctx, tx, st); err != nil {
			return apperr.Internal(err)
		}
		for i := range inserts {
			if err := s.BankTxs.Insert(ctx, tx, &inserts[i]); err != nil {
				return apperr.Internal(err)
			}
		}
		if err := os.MkdirAll(s.Dir, 0o700); err != nil {
			return apperr.Internal(err)
		}
		if err := os.Rename(pendingPath, s.filePath(st.ID)); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	_, metaPath := s.pendingPaths(req.UploadToken)
	_ = os.Remove(metaPath)
	full, err := s.Get(ctx, st.ID)
	if err != nil {
		return nil, err
	}
	return &ImportResult{StatementWithCounts: *full, SkippedDuplicates: skipped}, nil
}

func (s *StatementService) List(ctx context.Context) ([]repositories.StatementWithCounts, error) {
	out, err := s.Statements.List(ctx, s.DB)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

func (s *StatementService) Get(ctx context.Context, id string) (*repositories.StatementWithCounts, error) {
	st, err := s.Statements.Get(ctx, s.DB, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if st == nil {
		return nil, apperr.NotFound("statement")
	}
	return st, nil
}

func (s *StatementService) Transactions(ctx context.Context, id string) ([]repositories.BankTransactionWithStatus, error) {
	if _, err := s.Get(ctx, id); err != nil {
		return nil, err
	}
	out, err := s.BankTxs.ListByStatement(ctx, s.DB, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// FilePath returns the audit copy's path and original file name.
func (s *StatementService) FilePath(ctx context.Context, id string) (path, name string, err error) {
	st, err := s.Get(ctx, id)
	if err != nil {
		return "", "", err
	}
	p := s.filePath(st.ID)
	if _, err := os.Stat(p); err != nil {
		return "", "", apperr.NotFound("statement file")
	}
	return p, st.FileName, nil
}

// Delete removes the statement, its bank transactions and reconciliations
// (cascade) and the audit PDF. Manual transactions are never touched.
func (s *StatementService) Delete(ctx context.Context, id string) error {
	if _, err := s.Get(ctx, id); err != nil {
		return err
	}
	if err := s.Statements.Delete(ctx, s.DB, id); err != nil {
		return apperr.Internal(err)
	}
	_ = os.Remove(s.filePath(id))
	return nil
}
