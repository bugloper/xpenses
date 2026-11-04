package handlers_test

import "testing"

// A manual transaction already linked to a line of another statement must not
// be offered again. Adjacent monthly statements overlap through the date
// tolerance window (Nov 1 − 3 days reaches Oct 29), so this is the normal case,
// not an edge case: before the fix auto-match tried to insert a second
// reconciliation for the same transaction and the unique index turned the
// whole call into a 500.
func TestReconciliationCrossStatementLinkIsNotACandidate(t *testing.T) {
	e := newReconEnv(t)
	bank := e.account("BOB", "bank", 100000)
	e.statement("oct", bank, "2026-10-01", "2026-10-31", 5000, 0, 1)
	e.bankTx("b-oct", "oct", bank, 1, "2026-10-30", "POS/NETFLIX", 5000, 0)
	e.statement("nov", bank, "2026-11-01", "2026-11-30", 5000, 0, 1)
	e.bankTx("b-nov", "nov", bank, 1, "2026-11-01", "POS/NETFLIX", 5000, 0)
	octTx := e.tx(map[string]any{"type": "expense", "amount": 5000, "account_id": bank, "payee": "Netflix", "transaction_date": "2026-10-30"})

	if d := obj(e.must(200, "POST", "/reconciliation/auto-match", map[string]any{"statement_id": "oct"}), "data"); num(d, "matched") != 1 {
		t.Fatalf("october auto-match: %v", d)
	}

	ws := obj(e.must(200, "GET", "/reconciliation/nov", nil), "data")
	manual := map[string]map[string]any{}
	for _, m := range list(ws, "manual_transactions") {
		manual[str(m, "id")] = m
	}
	if m := manual[octTx]; m == nil || str(m, "status") != "matched" {
		t.Fatalf("october transaction should appear as matched in the november workspace: %v", m)
	}
	if n := num(obj(ws, "summary"), "unmatched_manual"); n != 0 {
		t.Fatalf("unmatched_manual want 0 got %d", n)
	}
	if s := list(list(ws, "bank_transactions")[0], "suggestions"); len(s) != 0 {
		t.Fatalf("linked transaction must not be suggested: %v", s)
	}

	d := obj(e.must(200, "POST", "/reconciliation/auto-match", map[string]any{"statement_id": "nov"}), "data")
	if num(d, "matched") != 0 || e.recon("b-nov") != nil {
		t.Fatalf("november auto-match must not reuse the october transaction: %v %v", d, e.recon("b-nov"))
	}
	e.must(409, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b-nov", "transaction_id": octTx})
}

// Sign conventions, verified by arithmetic on the ledger: after an adjustment
// the statement account moves by exactly the bank line's signed amount.
//
//	debit line:  adjustment = manual − bank   (9800 − 10000 = −200)
//	credit line: adjustment = bank − manual   (7000 − 7200 = −200)
func TestReconciliationAdjustmentArithmetic(t *testing.T) {
	e := newReconEnv(t)
	bank := e.account("BOB", "bank", 100000)
	e.statement("st", bank, "2026-11-01", "2026-11-30", 10000, 7000, 2)
	e.bankTx("bd", "st", bank, 1, "2026-11-05", "POS/SHOP", 10000, 0)
	e.bankTx("bc", "st", bank, 2, "2026-11-06", "REFUND", 0, 7000)
	m1 := e.tx(map[string]any{"type": "expense", "amount": 9800, "account_id": bank, "transaction_date": "2026-11-05"})
	m2 := e.tx(map[string]any{"type": "income", "amount": 7200, "account_id": bank, "transaction_date": "2026-11-06"})
	if got := e.balance(bank); got != 100000-9800+7200 {
		t.Fatalf("precondition balance: %d", got)
	}

	d := obj(e.must(201, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "bd", "transaction_id": m1}), "data")
	if got := num(obj(d, "adjustment"), "amount"); got != 9800-10000 {
		t.Fatalf("debit adjustment want %d got %d", 9800-10000, got)
	}
	if got := num(obj(d, "reconciliation"), "amount_diff"); got != 10000-9800 {
		t.Fatalf("debit amount_diff (bank − manual) want %d got %d", 10000-9800, got)
	}
	if got := e.balance(bank); got != 100000-10000+7200 {
		t.Fatalf("after debit adjustment the ledger must carry the full bank debit: want %d got %d", 100000-10000+7200, got)
	}

	d = obj(e.must(201, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "bc", "transaction_id": m2}), "data")
	if got := num(obj(d, "adjustment"), "amount"); got != 7000-7200 {
		t.Fatalf("credit adjustment want %d got %d", 7000-7200, got)
	}
	if got := num(obj(d, "reconciliation"), "amount_diff"); got != 7000-7200 {
		t.Fatalf("credit amount_diff (bank − manual) want %d got %d", 7000-7200, got)
	}
	if got := e.balance(bank); got != 100000-10000+7000 {
		t.Fatalf("after both adjustments the ledger must equal the bank: want %d got %d", 100000-10000+7000, got)
	}
	for _, id := range []string{m1, m2} {
		if st := str(obj(e.must(200, "GET", "/transactions/"+id, nil), "data"), "reconciliation_status"); st != "matched" {
			t.Fatalf("%s reconciliation_status want matched got %q", id, st)
		}
	}
}
