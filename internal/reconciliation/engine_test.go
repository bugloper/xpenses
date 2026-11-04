package reconciliation

import (
	"fmt"
	"testing"

	"github.com/bugloper/xpensiv/internal/models"
)

const (
	acctBank = "acct-bank"
	acctCash = "acct-cash"
	acctCC   = "acct-cc"
)

func bankLine(id string, line int, date, desc string, debit, credit int64) models.BankTransaction {
	return models.BankTransaction{ID: id, StatementID: "st", AccountID: acctBank, LineNo: line, TransactionDate: date, Description: desc, Debit: debit, Credit: credit}
}

// mt builds a manual transaction; created_at is derived from id so ordering is deterministic.
func mt(id, typ string, amount int64, acct, date, payee, desc string) models.Transaction {
	return models.Transaction{ID: id, Type: typ, Amount: amount, AccountID: acct, TransactionDate: date, Payee: payee, Description: desc,
		Status: models.StatusCleared, Origin: models.OriginManual, CreatedAt: "2026-11-01T00:00:00Z"}
}

func transfer(id string, amount int64, from, to, date string) models.Transaction {
	t := mt(id, models.TxTransfer, amount, from, date, "", "")
	t.TransferAccountID = &to
	return t
}

func existing(bankID, txID, status string) models.Reconciliation {
	r := models.Reconciliation{ID: "r-" + bankID, BankTransactionID: bankID, Status: status, MatchType: "manual"}
	if txID != "" {
		r.TransactionID = &txID
	}
	return r
}

type wantSugg struct {
	bank    string
	rule    string // "" means no suggestions at all
	tx      string // expected top suggestion
	minConf int
	maxConf int
	count   int // expected number of suggestions (0 = don't check)
}

func TestAnalyse(t *testing.T) {
	cafe := "POS/AMBIENT CAFE THIMPHU/123456"
	cases := []struct {
		name     string
		tol      int
		bank     []models.BankTransaction
		manual   []models.Transaction
		existing []models.Reconciliation
		suggs    []wantSugg
		auto     []string          // "bank:tx"
		manualSt map[string]string // tx id -> status
		dupOf    map[string]string
	}{
		{
			name:   "rule 1 exact date and amount",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "Ambient Cafe", "Lunch")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", minConf: 95, maxConf: 100, count: 1}},
			auto:   []string{"b1:m1"},
		},
		{
			name:   "rule 1 without any text similarity is still 95",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "IMPS REF 998877", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", minConf: 95, maxConf: 95}},
			auto:   []string{"b1:m1"},
		},
		{
			name:   "rule 2 within tolerance decreases with distance",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "IMPS 1", 1250, 0), bankLine("b2", 2, "2026-11-10", "IMPS 2", 700, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-02", "", ""), mt("m2", models.TxExpense, 700, acctBank, "2026-11-13", "", "")},
			suggs: []wantSugg{
				{bank: "b1", rule: RuleDateTolerance, tx: "m1", minConf: 85, maxConf: 85},
				{bank: "b2", rule: RuleDateTolerance, tx: "m2", minConf: 80, maxConf: 80},
			},
			auto: []string{"b1:m1", "b2:m2"},
		},
		{
			name:   "bank date differs from manual date beyond tolerance with no text match",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "IMPS 1", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-09", "Karma", "Rent")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
		{
			name:   "rule 3 payee similarity within 2x tolerance",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-09", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleMerchant, tx: "m1", minConf: 60, maxConf: 79}},
		},
		{
			name:   "rule 3 payee typo handled by Jaro-Winkler",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "MBOB/TRF/TO/KARMA TSHERING/9876", 5000, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 5000, acctBank, "2026-11-08", "Karma Tshernig", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleMerchant, tx: "m1", minConf: 60, maxConf: 79}},
		},
		{
			name:   "rule 3 beyond 2x tolerance gives nothing",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-11", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
		{
			name:   "rule 4 description similarity when payee differs",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-09", "Sonam", "Lunch Ambient Cafe")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleDescription, tx: "m1", minConf: 40, maxConf: 59}},
		},
		{
			name:   "description differing from payee and bank narration gives nothing",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-09", "Sonam", "Taxi fare")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
		{
			name:   "amount alone never suggests",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-12-04", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
		{
			name: "identical amounts to the same merchant on different days are not auto-matched",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-01", cafe, 500, 0), bankLine("b2", 2, "2026-11-03", cafe, 500, 0)},
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 500, acctBank, "2026-11-01", "Ambient Cafe", ""),
				mt("m2", models.TxExpense, 500, acctBank, "2026-11-03", "Ambient Cafe", ""),
			},
			suggs: []wantSugg{
				{bank: "b1", rule: RuleExactDate, tx: "m1", minConf: 95, maxConf: 100, count: 2},
				{bank: "b2", rule: RuleExactDate, tx: "m2", minConf: 95, maxConf: 100, count: 2},
			},
			auto: nil,
		},
		{
			name:   "two candidates for one bank line block auto-match",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "IMPS", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""), mt("m2", models.TxExpense, 1250, acctBank, "2026-11-05", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", count: 2}},
			auto:   nil,
		},
		{
			name:   "one candidate for two bank lines blocks auto-match",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "IMPS", 1250, 0), bankLine("b2", 2, "2026-11-05", "IMPS", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1"}, {bank: "b2", rule: RuleDateTolerance, tx: "m1"}},
			auto:   nil,
		},
		{
			name: "rule 3 candidate does not spoil uniqueness of a rule 1 pair",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""),
				mt("m2", models.TxExpense, 1250, acctBank, "2026-11-09", "Ambient Cafe", ""),
			},
			suggs: []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", count: 2}},
			auto:  []string{"b1:m1"},
		},
		{
			name:   "transfer out of the statement account matches a debit only",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "MBOB/TRF/TO/WALLET", 0, 20000), bankLine("b2", 2, "2026-11-04", "MBOB/TRF/TO/WALLET", 20000, 0)},
			manual: []models.Transaction{transfer("m1", 20000, acctBank, acctCash, "2026-11-04")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}, {bank: "b2", rule: RuleExactDate, tx: "m1"}},
			auto:   []string{"b2:m1"},
		},
		{
			name:   "transfer into the statement account matches a credit only",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "MBOB/TRF/FROM/WALLET", 0, 20000), bankLine("b2", 2, "2026-11-04", "MBOB/TRF/FROM/WALLET", 20000, 0)},
			manual: []models.Transaction{transfer("m1", 20000, acctCash, acctBank, "2026-11-04")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1"}, {bank: "b2", rule: ""}},
			auto:   []string{"b1:m1"},
		},
		{
			name:   "credit card payment recorded as transfer matches the bank debit",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-05", "CC PAYMENT 4111", 45000, 0)},
			manual: []models.Transaction{transfer("m1", 45000, acctBank, acctCC, "2026-11-04")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleDateTolerance, tx: "m1", minConf: 90, maxConf: 90}},
			auto:   []string{"b1:m1"},
		},
		{
			name:   "cash transactions are never candidates",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctCash, "2026-11-04", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
		{
			name:   "expense never matches a credit, income never matches a debit",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 0, 1250), bankLine("b2", 2, "2026-11-04", "Y", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""), mt("m2", models.TxIncome, 1250, acctBank, "2026-11-04", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m2", count: 1}, {bank: "b2", rule: RuleExactDate, tx: "m1", count: 1}},
			auto:   []string{"b1:m2", "b2:m1"},
		},
		{
			name:   "refund matches a credit",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "REFUND AMAZON", 0, 3000)},
			manual: []models.Transaction{mt("m1", models.TxRefund, 3000, acctBank, "2026-11-04", "Amazon", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1"}},
			auto:   []string{"b1:m1"},
		},
		{
			name:   "negative adjustment matches a debit, positive a credit",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "FEE", 50, 0), bankLine("b2", 2, "2026-11-04", "INTEREST", 0, 75)},
			manual: []models.Transaction{mt("m1", models.TxAdjustment, -50, acctBank, "2026-11-04", "", ""), mt("m2", models.TxAdjustment, 75, acctBank, "2026-11-04", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", count: 1}, {bank: "b2", rule: RuleExactDate, tx: "m2", count: 1}},
			auto:   []string{"b1:m1", "b2:m2"},
		},
		{
			name:   "near amount within 2 percent is flagged but never auto-matched",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 10000, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 10150, acctBank, "2026-11-04", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleAmountMismatch, tx: "m1", minConf: 1, maxConf: 30}},
			auto:   nil,
		},
		{
			name:   "near amount within Nu. 5 on a small amount",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1000, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1400, acctBank, "2026-11-05", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: RuleAmountMismatch, tx: "m1", minConf: 1, maxConf: 30}},
		},
		{
			name:   "near amount outside window or tolerance gives nothing",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 100000, 0), bankLine("b2", 2, "2026-11-04", "Y", 10000, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 103000, acctBank, "2026-11-04", "", ""), mt("m2", models.TxExpense, 10100, acctBank, "2026-11-10", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}, {bank: "b2", rule: ""}},
		},
		{
			name: "exact match ranks above near amount",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 10000, 0)},
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 10100, acctBank, "2026-11-04", "", ""),
				mt("m2", models.TxExpense, 10000, acctBank, "2026-11-04", "", ""),
			},
			suggs: []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m2", count: 2}},
			auto:  []string{"b1:m2"},
		},
		{
			name: "duplicate manual entries are flagged and block auto-match",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0)},
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "Ambient Cafe", ""),
				mt("m2", models.TxExpense, 1250, acctBank, "2026-11-05", "Ambient Cafe", ""),
			},
			suggs:    []wantSugg{{bank: "b1", rule: RuleExactDate, tx: "m1", count: 2}},
			auto:     nil,
			manualSt: map[string]string{"m1": ManualPossibleDuplicate, "m2": ManualPossibleDuplicate},
			dupOf:    map[string]string{"m1": "m2", "m2": "m1"},
		},
		{
			name: "same amount but different type or account is not a duplicate",
			tol:  3,
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""),
				mt("m2", models.TxIncome, 1250, acctBank, "2026-11-04", "", ""),
				mt("m3", models.TxExpense, 1250, acctBank, "2026-11-07", "", ""),
			},
			manualSt: map[string]string{"m1": ManualUnmatched, "m2": ManualUnmatched, "m3": ManualUnmatched},
		},
		{
			name:   "tolerance 0 only accepts the exact date",
			tol:    0,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", cafe, 1250, 0), bankLine("b2", 2, "2026-11-04", cafe, 50000, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-05", "Ambient Cafe", ""), mt("m2", models.TxExpense, 50000, acctBank, "2026-11-04", "Ambient Cafe", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}, {bank: "b2", rule: RuleExactDate, tx: "m2"}},
			auto:   []string{"b2:m2"},
		},
		{
			name:     "existing reconciliations set statuses and remove both sides from matching",
			tol:      3,
			bank:     []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1250, 0), bankLine("b2", 2, "2026-11-04", "Y", 1250, 0), bankLine("b3", 3, "2026-11-04", "Z", 20000, 0)},
			manual:   []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""), mt("m2", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""), transfer("m3", 20000, acctBank, acctCash, "2026-11-04")},
			existing: []models.Reconciliation{existing("b1", "m1", models.ReconMatched), existing("b3", "m3", models.ReconTransfer)},
			suggs:    []wantSugg{{bank: "b1", rule: ""}, {bank: "b2", rule: RuleExactDate, tx: "m2", count: 1}, {bank: "b3", rule: ""}},
			auto:     []string{"b2:m2"},
			manualSt: map[string]string{"m1": ManualMatched, "m2": ManualUnmatched, "m3": ManualTransfer},
		},
		{
			name: "ignored bank line gets no suggestions",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1250, 0)},
			manual: []models.Transaction{
				mt("m1", models.TxExpense, 1250, acctBank, "2026-11-04", "", ""),
			},
			existing: []models.Reconciliation{existing("b1", "", models.ReconIgnored)},
			suggs:    []wantSugg{{bank: "b1", rule: ""}},
			manualSt: map[string]string{"m1": ManualUnmatched},
		},
		{
			name: "transaction derived from a reconciled bank line counts as matched",
			tol:  3,
			bank: []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1250, 0), bankLine("b2", 2, "2026-11-04", "FEE", 50, 0)},
			manual: func() []models.Transaction {
				m1 := mt("m1", models.TxExpense, 1200, acctBank, "2026-11-04", "", "")
				adj := mt("adj", models.TxAdjustment, -50, acctBank, "2026-11-04", "", "")
				src := "b1"
				adj.SourceBankTransactionID = &src
				adj.Origin = models.OriginAdjustment
				return []models.Transaction{m1, adj}
			}(),
			existing: []models.Reconciliation{existing("b1", "m1", models.ReconMatched)},
			suggs:    []wantSugg{{bank: "b2", rule: ""}},
			manualSt: map[string]string{"m1": ManualMatched, "adj": ManualMatched},
		},
		{
			name:   "void or malformed dates never match",
			tol:    3,
			bank:   []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1250, 0)},
			manual: []models.Transaction{mt("m1", models.TxExpense, 1250, acctBank, "04/11/2026", "", "")},
			suggs:  []wantSugg{{bank: "b1", rule: ""}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := Analyse(Input{AccountID: acctBank, Bank: tc.bank, Manual: tc.manual, Existing: tc.existing, Tolerance: tc.tol})
			for _, w := range tc.suggs {
				got := res.Suggestions[w.bank]
				if w.rule == "" {
					if len(got) != 0 {
						t.Errorf("%s: want no suggestions, got %+v", w.bank, got)
					}
					continue
				}
				if len(got) == 0 {
					t.Fatalf("%s: want rule %s, got none", w.bank, w.rule)
				}
				top := got[0]
				if top.Rule != w.rule || top.TransactionID != w.tx {
					t.Errorf("%s: want top %s/%s, got %s/%s (%d)", w.bank, w.rule, w.tx, top.Rule, top.TransactionID, top.Confidence)
				}
				if w.maxConf > 0 && (top.Confidence < w.minConf || top.Confidence > w.maxConf) {
					t.Errorf("%s: confidence %d outside [%d,%d]", w.bank, top.Confidence, w.minConf, w.maxConf)
				}
				if w.count > 0 && len(got) != w.count {
					t.Errorf("%s: want %d suggestions, got %d", w.bank, w.count, len(got))
				}
				if top.Rule == RuleAmountMismatch && top.AmountDiff == 0 {
					t.Errorf("%s: amount_mismatch with zero diff", w.bank)
				}
				if top.Transaction == nil || top.Reason == "" {
					t.Errorf("%s: suggestion missing transaction or reason", w.bank)
				}
			}
			var auto []string
			for _, m := range res.AutoMatches {
				auto = append(auto, m.BankTransactionID+":"+m.Suggestion.TransactionID)
				if m.Suggestion.Rule != RuleExactDate && m.Suggestion.Rule != RuleDateTolerance {
					t.Errorf("auto-match with rule %s", m.Suggestion.Rule)
				}
			}
			if fmt.Sprint(auto) != fmt.Sprint(tc.auto) {
				t.Errorf("auto-matches: want %v got %v", tc.auto, auto)
			}
			for id, want := range tc.manualSt {
				if got := res.Manual[id].Status; got != want {
					t.Errorf("manual %s: want status %s got %s", id, want, got)
				}
			}
			for id, want := range tc.dupOf {
				if got := res.Manual[id].DuplicateOf; got != want {
					t.Errorf("manual %s: want duplicate_of %s got %s", id, want, got)
				}
			}
		})
	}
}

func TestAnalyseDeterministicOrdering(t *testing.T) {
	// Equal confidence and date diff: older created_at first, then id.
	bank := []models.BankTransaction{bankLine("b1", 1, "2026-11-04", "X", 1250, 0)}
	newer := mt("m-z", models.TxExpense, 1250, acctBank, "2026-11-04", "", "")
	newer.CreatedAt = "2026-11-02T00:00:00Z"
	older := mt("m-a", models.TxExpense, 1250, acctBank, "2026-11-04", "", "")
	older.CreatedAt = "2026-11-01T00:00:00Z"
	for _, order := range [][]models.Transaction{{newer, older}, {older, newer}} {
		res := Analyse(Input{AccountID: acctBank, Bank: bank, Manual: order, Tolerance: 3})
		s := res.Suggestions["b1"]
		if len(s) != 2 || s[0].TransactionID != "m-a" || s[1].TransactionID != "m-z" {
			t.Fatalf("want [m-a m-z], got %+v", s)
		}
		if len(res.AutoMatches) != 0 {
			t.Fatalf("ambiguous pair must not auto-match")
		}
	}
}

func TestAutoMatchOrderIsStableByLine(t *testing.T) {
	bank := []models.BankTransaction{
		bankLine("b3", 3, "2026-11-04", "X", 300, 0),
		bankLine("b1", 1, "2026-11-04", "X", 100, 0),
		bankLine("b2", 2, "2026-11-06", "X", 200, 0),
	}
	manual := []models.Transaction{
		mt("m2", models.TxExpense, 200, acctBank, "2026-11-04", "", ""),
		mt("m1", models.TxExpense, 100, acctBank, "2026-11-04", "", ""),
		mt("m3", models.TxExpense, 300, acctBank, "2026-11-04", "", ""),
	}
	res := Analyse(Input{AccountID: acctBank, Bank: bank, Manual: manual, Tolerance: 3})
	var got []string
	for _, m := range res.AutoMatches {
		got = append(got, m.BankTransactionID)
	}
	// Exact (95) lines first by line_no, then the tolerance match.
	if fmt.Sprint(got) != "[b1 b3 b2]" {
		t.Fatalf("want [b1 b3 b2], got %v", got)
	}
}

func TestDateDiffDays(t *testing.T) {
	if d, ok := DateDiffDays("2026-11-04", "2026-11-01"); !ok || d != 3 {
		t.Fatalf("got %d %v", d, ok)
	}
	if d, ok := DateDiffDays("2026-11-01", "2026-11-04"); !ok || d != 3 {
		t.Fatalf("got %d %v", d, ok)
	}
	if _, ok := DateDiffDays("nope", "2026-11-04"); ok {
		t.Fatal("expected parse failure")
	}
}
