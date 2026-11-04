package reconciliation

import (
	"testing"

	"github.com/bugloper/xpensiv/internal/models"
)

// A manual transaction whose reconciliation belongs to another statement
// (Existing is per statement, but the repository joins the link onto the
// transaction) is reported with that status and never suggested or
// auto-matched.
func TestAnalyseHonoursLinksFromOtherStatements(t *testing.T) {
	linked := mt("tx-oct", models.TxExpense, 5000, acctBank, "2026-10-30", "Netflix", "")
	linked.ReconciliationStatus = models.ReconMatched
	other := "b-oct"
	linked.BankTransactionID = &other
	free := mt("tx-nov", models.TxExpense, 5000, acctBank, "2026-11-01", "Netflix", "")

	res := Analyse(Input{
		AccountID: acctBank,
		Bank:      []models.BankTransaction{bankLine("b-nov", 1, "2026-11-01", "POS/NETFLIX", 5000, 0)},
		Manual:    []models.Transaction{linked, free},
		Tolerance: 3,
	})
	if got := res.Manual["tx-oct"].Status; got != ManualMatched {
		t.Fatalf("linked transaction status want %q got %q", ManualMatched, got)
	}
	for _, s := range res.Suggestions["b-nov"] {
		if s.TransactionID == "tx-oct" {
			t.Fatal("linked transaction must not be suggested")
		}
	}
	// With the linked transaction out of the way the free one is unique in
	// both directions and auto-matches; before the fix both were candidates,
	// neither was unique, and nothing auto-matched.
	if len(res.AutoMatches) != 1 || res.AutoMatches[0].Suggestion.TransactionID != "tx-nov" {
		t.Fatalf("auto-matches: %+v", res.AutoMatches)
	}
	if got := res.Manual["tx-nov"].Status; got != ManualUnmatched {
		t.Fatalf("free transaction status want %q got %q", ManualUnmatched, got)
	}
}
