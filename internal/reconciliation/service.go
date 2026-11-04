package reconciliation

import (
	"context"
	"database/sql"
	"strings"

	"github.com/bugloper/xpensiv/internal/dto"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/services"
	"github.com/bugloper/xpensiv/internal/validators"
)

// Service is the DB-backed reconciliation API. It never modifies or deletes
// manual transactions or bank transactions; the only rows it deletes are
// reconciliations. Transactions it creates (via CreateTransaction,
// MarkTransfer and Adjustment) stay in the ledger after Unmatch so the user
// can delete them deliberately through the transactions API.
type Service struct {
	db         *sql.DB
	settings   *services.SettingsService
	repo       Repo
	txRepo     repositories.TransactionRepo
	accounts   repositories.AccountRepo
	categories repositories.CategoryRepo
}

func NewService(db *sql.DB, settings *services.SettingsService) *Service {
	return &Service{db: db, settings: settings}
}

// Statement is a bank statement with reconciliation counts. matched_count
// includes lines reconciled as transfers; the three counts sum to the total.
type Statement struct {
	models.BankStatement
	MatchedCount   int `json:"matched_count"`
	UnmatchedCount int `json:"unmatched_count"`
	IgnoredCount   int `json:"ignored_count"`
}

// BankLine is BankTransactionWithStatus plus suggestions.
type BankLine struct {
	models.BankTransaction
	Status         string                 `json:"status"`
	Reconciliation *models.Reconciliation `json:"reconciliation"`
	Transaction    *models.Transaction    `json:"transaction"`
	Suggestions    []Suggestion           `json:"suggestions"`
}

// ManualLine is a candidate manual transaction with its computed status.
type ManualLine struct {
	models.Transaction
	Status      string `json:"status"`
	DuplicateOf string `json:"duplicate_of,omitempty"`
}

type Summary struct {
	TotalDebits         int64 `json:"total_debits"`
	TotalCredits        int64 `json:"total_credits"`
	ManualExpenses      int64 `json:"manual_expenses"`
	ManualIncome        int64 `json:"manual_income"`
	Matched             int   `json:"matched"`
	UnmatchedManual     int   `json:"unmatched_manual"`
	UnrecordedBank      int   `json:"unrecorded_bank"`
	Ignored             int   `json:"ignored"`
	Transfers           int   `json:"transfers"`
	AmountDiscrepancies int   `json:"amount_discrepancies"`
	BalanceVerified     bool  `json:"balance_verified"`
}

type Workspace struct {
	Statement          Statement      `json:"statement"`
	Account            models.Account `json:"account"`
	DateToleranceDays  int            `json:"date_tolerance_days"`
	BankTransactions   []BankLine     `json:"bank_transactions"`
	ManualTransactions []ManualLine   `json:"manual_transactions"`
	Summary            Summary        `json:"summary"`
}

type Overview struct {
	Statements            []StatementOverview `json:"statements"`
	UnmatchedManualCount  int                 `json:"unmatched_manual_count"`
	UnreconciledBankCount int                 `json:"unreconciled_bank_count"`
}

// Request bodies.
type (
	AutoMatchRequest struct {
		StatementID string `json:"statement_id"`
	}
	MatchRequest struct {
		BankTransactionID string `json:"bank_transaction_id"`
		TransactionID     string `json:"transaction_id"`
		Note              string `json:"note"`
	}
	BankLineRequest struct {
		BankTransactionID string `json:"bank_transaction_id"`
		Note              string `json:"note"`
	}
	TransferRequest struct {
		BankTransactionID string `json:"bank_transaction_id"`
		TransactionID     string `json:"transaction_id"`
		TransferAccountID string `json:"transfer_account_id"`
	}
	CreateTransactionRequest struct {
		BankTransactionID string `json:"bank_transaction_id"`
		CategoryID        string `json:"category_id"`
		Payee             string `json:"payee"`
		Description       string `json:"description"`
		Notes             string `json:"notes"`
	}
)

// Results of the create-style endpoints.
type (
	TransferResult struct {
		Reconciliation *models.Reconciliation `json:"reconciliation"`
		Transaction    *models.Transaction    `json:"transaction"`
	}
	AdjustmentResult struct {
		Reconciliation *models.Reconciliation `json:"reconciliation"`
		Transaction    *models.Transaction    `json:"transaction"`
		Adjustment     *models.Transaction    `json:"adjustment"`
	}
)

func (s *Service) Overview(ctx context.Context) (*Overview, error) {
	statements, err := s.repo.ListOverview(ctx, s.db)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	unmatched, err := s.txRepo.CountUnmatchedManual(ctx, s.db)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	unreconciled, err := s.repo.CountUnreconciledBank(ctx, s.db)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &Overview{Statements: statements, UnmatchedManualCount: unmatched, UnreconciledBankCount: unreconciled}, nil
}

// statementContext is everything loaded for one statement.
type statementContext struct {
	statement  *models.BankStatement
	account    *models.Account
	bank       []models.BankTransaction
	existing   []models.Reconciliation
	candidates []models.Transaction
	tolerance  int
}

// load reads everything for a statement. tol is passed in rather than read
// here because SettingsService queries through its own *sql.DB, which would
// deadlock against a transaction on a single-connection database.
func (s *Service) load(ctx context.Context, db repositories.DBTX, statementID string, tol int) (*statementContext, error) {
	st, err := s.repo.GetStatement(ctx, db, statementID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if st == nil {
		return nil, apperr.NotFound("statement")
	}
	acct, err := s.accounts.Get(ctx, db, st.AccountID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if acct == nil {
		return nil, apperr.NotFound("account")
	}
	bank, err := s.repo.ListBankTransactions(ctx, db, st.ID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	existing, err := s.repo.ListByStatement(ctx, db, st.ID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	candidates, err := s.candidates(ctx, db, st, tol)
	if err != nil {
		return nil, err
	}
	return &statementContext{statement: st, account: acct, bank: bank, existing: existing, candidates: candidates, tolerance: tol}, nil
}

// candidates lists the non-void transactions touching the statement account
// within [period_start − tolerance, period_end + tolerance].
func (s *Service) candidates(ctx context.Context, db repositories.DBTX, st *models.BankStatement, tol int) ([]models.Transaction, error) {
	start, err := models.ParseDate(st.PeriodStart)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	end, err := models.ParseDate(st.PeriodEnd)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	f := dto.TransactionFilter{
		AccountID: st.AccountID,
		DateFrom:  start.AddDate(0, 0, -tol).Format(models.DateLayout),
		DateTo:    end.AddDate(0, 0, tol).Format(models.DateLayout),
		Sort:      "created_at", Order: "asc", Page: 1, PerPage: 200,
	}
	var out []models.Transaction
	for {
		page, total, err := s.txRepo.List(ctx, db, f)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		out = append(out, page...)
		if len(page) == 0 || len(out) >= total {
			return out, nil
		}
		f.Page++
	}
}

func (s *Service) Workspace(ctx context.Context, statementID string) (*Workspace, error) {
	sc, err := s.load(ctx, s.db, statementID, s.settings.DateTolerance(ctx))
	if err != nil {
		return nil, err
	}
	res := Analyse(Input{AccountID: sc.statement.AccountID, Bank: sc.bank, Manual: sc.candidates, Existing: sc.existing, Tolerance: sc.tolerance})

	byTx := map[string]*models.Transaction{}
	for i := range sc.candidates {
		byTx[sc.candidates[i].ID] = &sc.candidates[i]
	}
	byBank := map[string]*models.Reconciliation{}
	for i := range sc.existing {
		byBank[sc.existing[i].BankTransactionID] = &sc.existing[i]
	}

	ws := &Workspace{
		Statement:         Statement{BankStatement: *sc.statement},
		Account:           *sc.account,
		DateToleranceDays: sc.tolerance,
		Summary: Summary{
			TotalDebits: sc.statement.TotalDebits, TotalCredits: sc.statement.TotalCredits,
			BalanceVerified: sc.statement.BalanceVerified,
		},
		BankTransactions:   make([]BankLine, 0, len(sc.bank)),
		ManualTransactions: make([]ManualLine, 0, len(sc.candidates)),
	}
	for _, b := range sc.bank {
		line := BankLine{BankTransaction: b, Status: BankUnrecorded, Suggestions: []Suggestion{}}
		if r := byBank[b.ID]; r != nil {
			line.Status = r.Status
			line.Reconciliation = r
			if r.TransactionID != nil {
				t := byTx[*r.TransactionID]
				if t == nil {
					// Linked transaction sits outside the candidate window (manual match).
					if t, err = s.txRepo.Get(ctx, s.db, *r.TransactionID); err != nil {
						return nil, apperr.Internal(err)
					}
				}
				line.Transaction = t
			}
			switch r.Status {
			case models.ReconMatched:
				ws.Summary.Matched++
				if r.AmountDiff != 0 {
					ws.Summary.AmountDiscrepancies++
				}
			case models.ReconIgnored:
				ws.Summary.Ignored++
			case models.ReconTransfer:
				ws.Summary.Transfers++
			}
		} else {
			ws.Summary.UnrecordedBank++
			if sg := res.Suggestions[b.ID]; sg != nil {
				line.Suggestions = sg
			}
		}
		ws.BankTransactions = append(ws.BankTransactions, line)
	}
	ws.Statement.MatchedCount = ws.Summary.Matched + ws.Summary.Transfers
	ws.Statement.UnmatchedCount = ws.Summary.UnrecordedBank
	ws.Statement.IgnoredCount = ws.Summary.Ignored

	for _, t := range sc.candidates {
		st := res.Manual[t.ID]
		ws.ManualTransactions = append(ws.ManualTransactions, ManualLine{Transaction: t, Status: st.Status, DuplicateOf: st.DuplicateOf})
		if st.Status == ManualUnmatched || st.Status == ManualPossibleDuplicate {
			ws.Summary.UnmatchedManual++
		}
		if t.AccountID == sc.statement.AccountID {
			switch t.Type {
			case models.TxExpense:
				ws.Summary.ManualExpenses += t.Amount
			case models.TxIncome, models.TxRefund:
				ws.Summary.ManualIncome += t.Amount
			}
		}
	}
	return ws, nil
}

// AutoMatch applies every unique rule-1/rule-2 pairing as an automatic match.
func (s *Service) AutoMatch(ctx context.Context, req AutoMatchRequest) (int, error) {
	if req.StatementID == "" {
		return 0, apperr.Validation("validation failed", map[string]string{"statement_id": "is required"})
	}
	n := 0
	tol := s.settings.DateTolerance(ctx)
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		sc, err := s.load(ctx, tx, req.StatementID, tol)
		if err != nil {
			return err
		}
		res := Analyse(Input{AccountID: sc.statement.AccountID, Bank: sc.bank, Manual: sc.candidates, Existing: sc.existing, Tolerance: sc.tolerance})
		for _, m := range res.AutoMatches {
			txID := m.Suggestion.TransactionID
			r := &models.Reconciliation{
				ID: services.NewID(), BankTransactionID: m.BankTransactionID, TransactionID: &txID,
				Status: linkStatus(m.Suggestion.Transaction), MatchType: "auto", Rule: m.Suggestion.Rule, Confidence: m.Suggestion.Confidence,
				AmountDiff: m.Suggestion.AmountDiff, DateDiffDays: m.Suggestion.DateDiffDays, CreatedAt: models.NowUTC(),
			}
			if err := s.repo.Insert(ctx, tx, r); err != nil {
				return apperr.Internal(err)
			}
			n++
		}
		return nil
	})
	return n, err
}

// bankLine loads a bank transaction that has no reconciliation yet.
func (s *Service) bankLine(ctx context.Context, db repositories.DBTX, id string) (*models.BankTransaction, error) {
	if id == "" {
		return nil, apperr.Validation("validation failed", map[string]string{"bank_transaction_id": "is required"})
	}
	b, err := s.repo.GetBankTransaction(ctx, db, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if b == nil {
		return nil, apperr.NotFound("bank transaction")
	}
	r, err := s.repo.GetByBankTransaction(ctx, db, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if r != nil {
		return nil, apperr.Conflict("bank transaction is already reconciled (" + r.Status + "); unmatch it first")
	}
	return b, nil
}

// manualLine loads a manual transaction that is not yet linked to a bank line.
func (s *Service) manualLine(ctx context.Context, db repositories.DBTX, id string) (*models.Transaction, error) {
	if id == "" {
		return nil, apperr.Validation("validation failed", map[string]string{"transaction_id": "is required"})
	}
	t, err := s.txRepo.Get(ctx, db, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if t == nil {
		return nil, apperr.NotFound("transaction")
	}
	if t.Status == models.StatusVoid {
		return nil, apperr.Validation("validation failed", map[string]string{"transaction_id": "transaction is void"})
	}
	r, err := s.repo.GetByTransaction(ctx, db, id)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	if r != nil {
		return nil, apperr.Conflict("transaction is already linked to a bank transaction; unmatch it first")
	}
	return t, nil
}

// linkStatus is the reconciliation status for linking a bank line to t:
// transfer transactions are recorded as transfers, everything else as matched.
func linkStatus(t *models.Transaction) string {
	if t.Type == models.TxTransfer {
		return models.ReconTransfer
	}
	return models.ReconMatched
}

// compatible checks the manual transaction sits on the statement account
// with the same direction as the bank line, returning its side.
func compatible(b *models.BankTransaction, t *models.Transaction) (Side, error) {
	ms, ok := ManualSide(t, b.AccountID)
	if !ok {
		return Side{}, apperr.Validation("validation failed", map[string]string{"transaction_id": "transaction is not on the statement account"})
	}
	if bs := BankSide(b); bs.IsDebit != ms.IsDebit {
		return Side{}, apperr.Validation("validation failed", map[string]string{"transaction_id": "transaction direction does not match the bank transaction"})
	}
	return ms, nil
}

func (s *Service) Match(ctx context.Context, req MatchRequest) (*models.Reconciliation, error) {
	var out *models.Reconciliation
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.bankLine(ctx, tx, req.BankTransactionID)
		if err != nil {
			return err
		}
		t, err := s.manualLine(ctx, tx, req.TransactionID)
		if err != nil {
			return err
		}
		ms, err := compatible(b, t)
		if err != nil {
			return err
		}
		dd, _ := DateDiffDays(b.TransactionDate, t.TransactionDate)
		out = &models.Reconciliation{
			ID: services.NewID(), BankTransactionID: b.ID, TransactionID: &t.ID, Status: linkStatus(t),
			MatchType: "manual", Rule: "manual", Confidence: 100, AmountDiff: BankSide(b).Amount - ms.Amount,
			DateDiffDays: dd, Note: strings.TrimSpace(req.Note), CreatedAt: models.NowUTC(),
		}
		if err := s.repo.Insert(ctx, tx, out); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	return out, err
}

// Unmatch removes the reconciliation of a bank line (match, ignore or
// transfer). It only deletes the reconciliation row; transactions created by
// CreateTransaction/MarkTransfer/Adjustment remain in the ledger.
func (s *Service) Unmatch(ctx context.Context, req BankLineRequest) error {
	if req.BankTransactionID == "" {
		return apperr.Validation("validation failed", map[string]string{"bank_transaction_id": "is required"})
	}
	return repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.repo.GetBankTransaction(ctx, tx, req.BankTransactionID)
		if err != nil {
			return apperr.Internal(err)
		}
		if b == nil {
			return apperr.NotFound("bank transaction")
		}
		if err := s.repo.DeleteByBankTransaction(ctx, tx, b.ID); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
}

func (s *Service) Ignore(ctx context.Context, req BankLineRequest) (*models.Reconciliation, error) {
	var out *models.Reconciliation
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.bankLine(ctx, tx, req.BankTransactionID)
		if err != nil {
			return err
		}
		out = &models.Reconciliation{
			ID: services.NewID(), BankTransactionID: b.ID, Status: models.ReconIgnored, MatchType: "manual",
			Rule: "ignored", Note: strings.TrimSpace(req.Note), CreatedAt: models.NowUTC(),
		}
		if err := s.repo.Insert(ctx, tx, out); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	return out, err
}

// MarkTransfer links a bank line to an existing transfer transaction, or
// creates one between the statement account and transfer_account_id.
func (s *Service) MarkTransfer(ctx context.Context, req TransferRequest) (*TransferResult, error) {
	var txID string
	var out *models.Reconciliation
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.bankLine(ctx, tx, req.BankTransactionID)
		if err != nil {
			return err
		}
		bs := BankSide(b)
		var amountDiff int64
		dd := 0
		if req.TransactionID != "" {
			t, err := s.manualLine(ctx, tx, req.TransactionID)
			if err != nil {
				return err
			}
			if t.Type != models.TxTransfer {
				return apperr.Validation("validation failed", map[string]string{"transaction_id": "transaction is not a transfer"})
			}
			ms, err := compatible(b, t)
			if err != nil {
				return err
			}
			amountDiff = bs.Amount - ms.Amount
			dd, _ = DateDiffDays(b.TransactionDate, t.TransactionDate)
			txID = t.ID
		} else {
			if req.TransferAccountID == "" {
				return apperr.Validation("validation failed", map[string]string{"transfer_account_id": "is required when transaction_id is not given"})
			}
			if req.TransferAccountID == b.AccountID {
				return apperr.Validation("validation failed", map[string]string{"transfer_account_id": "must differ from the statement account"})
			}
			other, err := s.accounts.Get(ctx, tx, req.TransferAccountID)
			if err != nil {
				return apperr.Internal(err)
			}
			if other == nil {
				return apperr.Validation("validation failed", map[string]string{"transfer_account_id": "account not found"})
			}
			stmtAcct, err := s.accounts.Get(ctx, tx, b.AccountID)
			if err != nil {
				return apperr.Internal(err)
			}
			if stmtAcct == nil {
				return apperr.NotFound("account")
			}
			from, to := b.AccountID, req.TransferAccountID
			if !bs.IsDebit {
				from, to = req.TransferAccountID, b.AccountID
			}
			t := s.newImported(b, stmtAcct.Currency)
			t.Type = models.TxTransfer
			t.Amount = bs.Amount
			t.AccountID = from
			t.TransferAccountID = &to
			if err := s.txRepo.Insert(ctx, tx, t); err != nil {
				return apperr.Internal(err)
			}
			txID = t.ID
		}
		out = &models.Reconciliation{
			ID: services.NewID(), BankTransactionID: b.ID, TransactionID: &txID, Status: models.ReconTransfer,
			MatchType: "manual", Rule: "transfer", Confidence: 100, AmountDiff: amountDiff, DateDiffDays: dd, CreatedAt: models.NowUTC(),
		}
		if err := s.repo.Insert(ctx, tx, out); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	t, err := s.txRepo.Get(ctx, s.db, txID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &TransferResult{Reconciliation: out, Transaction: t}, nil
}

// newImported builds the skeleton of a transaction derived from a bank line.
func (s *Service) newImported(b *models.BankTransaction, currency string) *models.Transaction {
	now := models.NowUTC()
	id := b.ID
	return &models.Transaction{
		ID: services.NewID(), Currency: currency, AccountID: b.AccountID, Description: strings.TrimSpace(b.Description),
		Payee: CleanDescription(b.Description), TransactionDate: b.TransactionDate, Origin: models.OriginImported,
		Status: models.StatusCleared, SourceBankTransactionID: &id, CreatedAt: now, UpdatedAt: now,
	}
}

// CreateTransaction records a bank line as a new expense (debit) or income
// (credit) transaction on the statement account and matches it.
func (s *Service) CreateTransaction(ctx context.Context, req CreateTransactionRequest) (*TransferResult, error) {
	v := validators.Errors{}
	v.MaxLen("payee", req.Payee, 200)
	v.MaxLen("description", req.Description, 500)
	v.MaxLen("notes", req.Notes, 2000)
	if err := v.Err(); err != nil {
		return nil, err
	}
	var txID string
	var out *models.Reconciliation
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.bankLine(ctx, tx, req.BankTransactionID)
		if err != nil {
			return err
		}
		bs := BankSide(b)
		if bs.Amount == 0 {
			return apperr.Validation("validation failed", map[string]string{"bank_transaction_id": "bank transaction has no amount"})
		}
		acct, err := s.accounts.Get(ctx, tx, b.AccountID)
		if err != nil {
			return apperr.Internal(err)
		}
		if acct == nil {
			return apperr.NotFound("account")
		}
		t := s.newImported(b, acct.Currency)
		t.Type, t.Amount = models.TxIncome, bs.Amount
		if bs.IsDebit {
			t.Type = models.TxExpense
		}
		if req.CategoryID != "" {
			c, err := s.categories.Get(ctx, tx, req.CategoryID)
			if err != nil {
				return apperr.Internal(err)
			}
			if c == nil {
				return apperr.Validation("validation failed", map[string]string{"category_id": "category not found"})
			}
			want := models.TxIncome
			if bs.IsDebit {
				want = models.TxExpense
			}
			if c.Type != want {
				return apperr.Validation("validation failed", map[string]string{"category_id": "category type does not match transaction type"})
			}
			t.CategoryID = &c.ID
		}
		if p := strings.TrimSpace(req.Payee); p != "" {
			t.Payee = p
		}
		if d := strings.TrimSpace(req.Description); d != "" {
			t.Description = d
		}
		t.Notes = strings.TrimSpace(req.Notes)
		if err := s.txRepo.Insert(ctx, tx, t); err != nil {
			return apperr.Internal(err)
		}
		txID = t.ID
		out = &models.Reconciliation{
			ID: services.NewID(), BankTransactionID: b.ID, TransactionID: &txID, Status: models.ReconMatched,
			MatchType: "manual", Rule: "created", Confidence: 100, CreatedAt: models.NowUTC(),
		}
		if err := s.repo.Insert(ctx, tx, out); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	t, err := s.txRepo.Get(ctx, s.db, txID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &TransferResult{Reconciliation: out, Transaction: t}, nil
}

// Adjustment matches a bank line with a manual transaction whose amount
// differs and books an adjustment on the statement account for the
// difference so the ledger equals the bank. For a debit line the adjustment
// is −(bank − manual): a larger bank debit reduces the balance further; for
// a credit line it is +(bank − manual).
func (s *Service) Adjustment(ctx context.Context, req MatchRequest) (*AdjustmentResult, error) {
	var adjID string
	var out *models.Reconciliation
	err := repositories.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		b, err := s.bankLine(ctx, tx, req.BankTransactionID)
		if err != nil {
			return err
		}
		t, err := s.manualLine(ctx, tx, req.TransactionID)
		if err != nil {
			return err
		}
		ms, err := compatible(b, t)
		if err != nil {
			return err
		}
		bs := BankSide(b)
		diff := bs.Amount - ms.Amount
		if diff == 0 {
			return apperr.Validation("validation failed", map[string]string{"transaction_id": "amounts are equal; use match instead"})
		}
		acct, err := s.accounts.Get(ctx, tx, b.AccountID)
		if err != nil {
			return apperr.Internal(err)
		}
		if acct == nil {
			return apperr.NotFound("account")
		}
		adj := s.newImported(b, acct.Currency)
		adj.Type = models.TxAdjustment
		adj.Origin = models.OriginAdjustment
		adj.Amount = diff
		if bs.IsDebit {
			adj.Amount = -diff
		}
		adj.Payee = t.Payee
		adj.Description = "Reconciliation adjustment"
		adj.Notes = strings.TrimSpace(req.Note)
		if err := s.txRepo.Insert(ctx, tx, adj); err != nil {
			return apperr.Internal(err)
		}
		adjID = adj.ID
		dd, _ := DateDiffDays(b.TransactionDate, t.TransactionDate)
		out = &models.Reconciliation{
			ID: services.NewID(), BankTransactionID: b.ID, TransactionID: &t.ID, Status: models.ReconMatched,
			MatchType: "manual", Rule: "adjustment", Confidence: 100, AmountDiff: diff, DateDiffDays: dd,
			Note: strings.TrimSpace(req.Note), CreatedAt: models.NowUTC(),
		}
		if err := s.repo.Insert(ctx, tx, out); err != nil {
			return apperr.Internal(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	t, err := s.txRepo.Get(ctx, s.db, req.TransactionID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	adj, err := s.txRepo.Get(ctx, s.db, adjID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &AdjustmentResult{Reconciliation: out, Transaction: t, Adjustment: adj}, nil
}
