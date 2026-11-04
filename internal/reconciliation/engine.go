// Package reconciliation matches imported bank transactions against the
// manual ledger. engine.go is the pure, deterministic matching core; it never
// touches the database.
package reconciliation

import (
	"fmt"
	"math"
	"sort"

	"github.com/bugloper/xpensiv/internal/models"
)

// Matching rules, in priority order.
const (
	RuleExactDate      = "exact_date"
	RuleDateTolerance  = "date_tolerance"
	RuleMerchant       = "merchant_similarity"
	RuleDescription    = "description_similarity"
	RuleAmountMismatch = "amount_mismatch"
)

// Manual-side statuses shown in the workspace.
const (
	ManualMatched           = models.ReconMatched
	ManualTransfer          = models.ReconTransfer
	ManualIgnored           = models.ReconIgnored
	ManualUnmatched         = "unmatched"
	ManualPossibleDuplicate = "possible_duplicate"
)

// Bank-side status for a line with no reconciliation.
const BankUnrecorded = "unrecorded"

// Near-amount window for amount_mismatch candidates: within 2% or Nu. 5.
const (
	nearAmountPct   = 0.02
	nearAmountMinor = 500
)

// Suggestion is a ranked manual transaction proposed for a bank line.
type Suggestion struct {
	TransactionID string              `json:"transaction_id"`
	Transaction   *models.Transaction `json:"transaction"`
	Rule          string              `json:"rule"`
	Confidence    int                 `json:"confidence"`
	AmountDiff    int64               `json:"amount_diff"`
	DateDiffDays  int                 `json:"date_diff_days"`
	Reason        string              `json:"reason"`
}

// Input is everything the engine needs for one statement.
type Input struct {
	AccountID string // the statement account
	Bank      []models.BankTransaction
	Manual    []models.Transaction // candidate manual transactions (see docs/API.md)
	Existing  []models.Reconciliation
	Tolerance int // date tolerance in days
}

// ManualStatus is the computed status of a manual transaction.
type ManualStatus struct {
	Status      string
	DuplicateOf string
}

// AutoMatch is a unique rule-1/rule-2 pairing safe to apply automatically.
type AutoMatch struct {
	BankTransactionID string
	Suggestion        Suggestion
}

// Result is the engine output.
type Result struct {
	// Suggestions by bank transaction id, best first. Reconciled lines have none.
	Suggestions map[string][]Suggestion
	// AutoMatches in deterministic application order.
	AutoMatches []AutoMatch
	// Manual status by transaction id.
	Manual map[string]ManualStatus
}

// Side describes how a manual transaction appears on the statement account.
type Side struct {
	Amount  int64 // absolute amount
	IsDebit bool  // money leaving the statement account
}

// ManualSide reports how t shows up on the statement account, or ok=false if
// t does not touch that account.
func ManualSide(t *models.Transaction, accountID string) (s Side, ok bool) {
	onAccount := t.AccountID == accountID
	switch t.Type {
	case models.TxExpense:
		return Side{Amount: t.Amount, IsDebit: true}, onAccount
	case models.TxIncome, models.TxRefund:
		return Side{Amount: t.Amount, IsDebit: false}, onAccount
	case models.TxTransfer:
		if onAccount {
			return Side{Amount: t.Amount, IsDebit: true}, true
		}
		if t.TransferAccountID != nil && *t.TransferAccountID == accountID {
			return Side{Amount: t.Amount, IsDebit: false}, true
		}
		return Side{}, false
	case models.TxAdjustment:
		if t.Amount < 0 {
			return Side{Amount: -t.Amount, IsDebit: true}, onAccount
		}
		return Side{Amount: t.Amount, IsDebit: false}, onAccount
	}
	return Side{}, false
}

// BankSide returns the amount and direction of a bank line.
func BankSide(b *models.BankTransaction) Side {
	if b.Debit > 0 {
		return Side{Amount: b.Debit, IsDebit: true}
	}
	return Side{Amount: b.Credit, IsDebit: false}
}

// DateDiffDays returns |a − b| in calendar days; ok=false if either is unparsable.
func DateDiffDays(a, b string) (int, bool) {
	ta, err := models.ParseDate(a)
	if err != nil {
		return 0, false
	}
	tb, err := models.ParseDate(b)
	if err != nil {
		return 0, false
	}
	d := int(math.Round(ta.Sub(tb).Hours() / 24))
	if d < 0 {
		d = -d
	}
	return d, true
}

// Analyse runs the matching rules and returns suggestions, auto-match pairs
// and manual statuses. It is pure and deterministic.
func Analyse(in Input) Result {
	res := Result{Suggestions: map[string][]Suggestion{}, Manual: map[string]ManualStatus{}}
	byBank := map[string]models.Reconciliation{}
	byTx := map[string]models.Reconciliation{}
	for _, r := range in.Existing {
		byBank[r.BankTransactionID] = r
		if r.TransactionID != nil {
			byTx[*r.TransactionID] = r
		}
	}

	// Manual statuses from existing reconciliations.
	manual := make([]*models.Transaction, 0, len(in.Manual))
	for i := range in.Manual {
		t := &in.Manual[i]
		st := ManualStatus{Status: ManualUnmatched}
		if r, ok := byTx[t.ID]; ok {
			st.Status = r.Status
		} else if t.ReconciliationStatus != "" {
			// Linked to a bank line of another statement. Adjacent statements
			// always overlap through the tolerance window, and periods may
			// overlap outright; the link is in the reconciliations table either
			// way (the repository joins it), so the transaction is spoken for
			// and must not become a candidate again.
			st.Status = t.ReconciliationStatus
		} else if t.SourceBankTransactionID != nil {
			// Transactions derived from a bank line (created-from-bank, adjustments)
			// are accounted for as long as that line is still reconciled.
			if _, ok := byBank[*t.SourceBankTransactionID]; ok {
				st.Status = ManualMatched
			}
		}
		res.Manual[t.ID] = st
		manual = append(manual, t)
	}
	sort.SliceStable(manual, func(i, j int) bool {
		if manual[i].CreatedAt != manual[j].CreatedAt {
			return manual[i].CreatedAt < manual[j].CreatedAt
		}
		return manual[i].ID < manual[j].ID
	})
	markDuplicates(manual, res.Manual)

	var candidates []*models.Transaction
	for _, t := range manual {
		if st := res.Manual[t.ID].Status; st == ManualUnmatched || st == ManualPossibleDuplicate {
			candidates = append(candidates, t)
		}
	}

	// Suggestions per unreconciled bank line.
	type edge struct {
		bank   *models.BankTransaction
		sugg   Suggestion
		txDate string
	}
	var edges []edge
	for i := range in.Bank {
		b := &in.Bank[i]
		if _, ok := byBank[b.ID]; ok {
			continue
		}
		var suggs []Suggestion
		for _, t := range candidates {
			if s, ok := suggest(b, t, in.AccountID, in.Tolerance); ok {
				suggs = append(suggs, s)
			}
		}
		created := map[string]string{}
		for _, t := range candidates {
			created[t.ID] = t.CreatedAt
		}
		sort.SliceStable(suggs, func(i, j int) bool {
			a, c := suggs[i], suggs[j]
			if a.Confidence != c.Confidence {
				return a.Confidence > c.Confidence
			}
			if a.DateDiffDays != c.DateDiffDays {
				return a.DateDiffDays < c.DateDiffDays
			}
			if created[a.TransactionID] != created[c.TransactionID] {
				return created[a.TransactionID] < created[c.TransactionID]
			}
			return a.TransactionID < c.TransactionID
		})
		res.Suggestions[b.ID] = suggs
		for _, s := range suggs {
			if s.Rule == RuleExactDate || s.Rule == RuleDateTolerance {
				edges = append(edges, edge{bank: b, sugg: s, txDate: created[s.TransactionID]})
			}
		}
	}

	// Auto-match: only pairings that are unique in both directions, applied
	// greedily by confidence desc, then line_no asc.
	bankDegree := map[string]int{}
	txDegree := map[string]int{}
	for _, e := range edges {
		bankDegree[e.bank.ID]++
		txDegree[e.sugg.TransactionID]++
	}
	sort.SliceStable(edges, func(i, j int) bool {
		a, b := edges[i], edges[j]
		if a.sugg.Confidence != b.sugg.Confidence {
			return a.sugg.Confidence > b.sugg.Confidence
		}
		if a.bank.LineNo != b.bank.LineNo {
			return a.bank.LineNo < b.bank.LineNo
		}
		return a.bank.ID < b.bank.ID
	})
	usedBank := map[string]bool{}
	usedTx := map[string]bool{}
	for _, e := range edges {
		if bankDegree[e.bank.ID] != 1 || txDegree[e.sugg.TransactionID] != 1 {
			continue
		}
		if usedBank[e.bank.ID] || usedTx[e.sugg.TransactionID] {
			continue
		}
		usedBank[e.bank.ID], usedTx[e.sugg.TransactionID] = true, true
		res.AutoMatches = append(res.AutoMatches, AutoMatch{BankTransactionID: e.bank.ID, Suggestion: e.sugg})
	}
	return res
}

// markDuplicates flags pairs of unmatched manual transactions with the same
// account(s), type and amount dated within one day of each other. manual must
// be sorted by created_at so duplicate_of points at the older entry first.
func markDuplicates(manual []*models.Transaction, status map[string]ManualStatus) {
	for i := 0; i < len(manual); i++ {
		a := manual[i]
		if status[a.ID].Status != ManualUnmatched && status[a.ID].Status != ManualPossibleDuplicate {
			continue
		}
		for j := i + 1; j < len(manual); j++ {
			b := manual[j]
			if status[b.ID].Status != ManualUnmatched && status[b.ID].Status != ManualPossibleDuplicate {
				continue
			}
			if a.Type != b.Type || a.Amount != b.Amount || a.AccountID != b.AccountID || !ptrEq(a.TransferAccountID, b.TransferAccountID) {
				continue
			}
			d, ok := DateDiffDays(a.TransactionDate, b.TransactionDate)
			if !ok || d > 1 {
				continue
			}
			sa, sb := status[a.ID], status[b.ID]
			sa.Status, sb.Status = ManualPossibleDuplicate, ManualPossibleDuplicate
			if sa.DuplicateOf == "" {
				sa.DuplicateOf = b.ID
			}
			if sb.DuplicateOf == "" {
				sb.DuplicateOf = a.ID
			}
			status[a.ID], status[b.ID] = sa, sb
		}
	}
}

func ptrEq(a, b *string) bool {
	switch {
	case a == nil && b == nil:
		return true
	case a == nil || b == nil:
		return false
	}
	return *a == *b
}

// suggest evaluates one bank/manual pair against the rules. Rules are tried
// in priority order; the first that applies wins. Amount alone never matches.
func suggest(b *models.BankTransaction, t *models.Transaction, accountID string, tol int) (Suggestion, bool) {
	ms, ok := ManualSide(t, accountID)
	if !ok {
		return Suggestion{}, false
	}
	bs := BankSide(b)
	if bs.Amount == 0 || ms.IsDebit != bs.IsDebit {
		return Suggestion{}, false
	}
	dd, ok := DateDiffDays(b.TransactionDate, t.TransactionDate)
	if !ok {
		return Suggestion{}, false
	}
	diff := bs.Amount - ms.Amount
	s := Suggestion{TransactionID: t.ID, Transaction: t, AmountDiff: diff, DateDiffDays: dd}

	payeeOK, payeeStrength := similarity(t.Payee, b.Description)
	descOK, descStrength := similarity(t.Description, b.Description)
	textStrength := 0.0
	if payeeOK {
		textStrength = payeeStrength
	}
	if descOK {
		textStrength = max(textStrength, descStrength)
	}

	if diff == 0 {
		switch {
		case dd == 0:
			s.Rule = RuleExactDate
			s.Confidence = 95 + round(5*textStrength)
			s.Reason = "Same amount and date"
			return s, true
		case dd <= tol:
			s.Rule = RuleDateTolerance
			s.Confidence = 90
			if tol > 1 {
				s.Confidence = 90 - round(10*float64(dd-1)/float64(tol-1))
			}
			s.Reason = fmt.Sprintf("Same amount, %s apart", days(dd))
			return s, true
		case dd <= 2*tol && payeeOK:
			s.Rule = RuleMerchant
			s.Confidence = 60 + round(19*payeeStrength)
			s.Reason = fmt.Sprintf("Same amount and payee matches the bank description, %s apart", days(dd))
			return s, true
		case dd <= 2*tol && descOK:
			s.Rule = RuleDescription
			s.Confidence = 40 + round(19*descStrength)
			s.Reason = fmt.Sprintf("Same amount and description matches the bank description, %s apart", days(dd))
			return s, true
		}
		return Suggestion{}, false
	}

	// Near-amount candidate: never auto-matched, confidence capped at 30.
	window := max(int64(math.Ceil(float64(bs.Amount)*nearAmountPct)), nearAmountMinor)
	absDiff := diff
	if absDiff < 0 {
		absDiff = -absDiff
	}
	if absDiff <= window && dd <= tol {
		s.Rule = RuleAmountMismatch
		rel := float64(absDiff) / float64(max(bs.Amount, 1))
		conf := 30 - round(10*rel/nearAmountPct) - dd
		s.Confidence = max(5, min(30, conf))
		s.Reason = fmt.Sprintf("Amount differs by %.2f%%, %s apart", rel*100, days(dd))
		return s, true
	}
	return Suggestion{}, false
}

func round(f float64) int { return int(math.Round(f)) }

func days(n int) string {
	if n == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", n)
}
