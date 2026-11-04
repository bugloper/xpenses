package handlers_test

import "testing"

// Rows skipped as duplicates are reported, and the stored statement totals
// describe the rows that were actually stored, so the reconciliation workspace
// (which reads the statement totals) and the reconciliation report (which sums
// the lines) agree.
func TestStatementImportTotalsExcludeSkippedRows(t *testing.T) {
	e := newStmtEnv(t, 1<<20)
	plain := readFile(t, fixturePlain)

	st, body := e.upload("a.pdf", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("parse: %d %v", st, body)
	}
	if st, body, _ = e.do("POST", "/statements/import", importBody(data(body), e.account, nil)); st != 201 {
		t.Fatalf("import: %d %v", st, body)
	}

	// Re-upload: every row is a duplicate. Correct one row the way a user
	// would in the preview; the server recomputes its fingerprint so that row
	// is new and the other 30 are skipped.
	st, body = e.upload("a.pdf", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("reparse: %d %v", st, body)
	}
	p := data(body)
	first := p["transactions"].([]any)[0].(map[string]any)
	first["description"] = first["description"].(string) + " (corrected)"
	wantDebit, wantCredit := int64(first["debit"].(float64)), int64(first["credit"].(float64))

	st, body, _ = e.do("POST", "/statements/import", importBody(p, e.account, map[string]any{"force": true}))
	if st != 201 {
		t.Fatalf("forced import: %d %v", st, body)
	}
	s := data(body)
	id := s["id"].(string)
	if s["skipped_duplicates"].(float64) != fixtureRowCount-1 || s["transaction_count"].(float64) != 1 {
		t.Fatalf("skip accounting: %v", s)
	}
	if int64(s["total_debits"].(float64)) != wantDebit || int64(s["total_credits"].(float64)) != wantCredit {
		t.Fatalf("totals must cover stored rows only: want %d/%d got %v/%v", wantDebit, wantCredit, s["total_debits"], s["total_credits"])
	}
	var sumD, sumC int64
	if err := e.db.QueryRow(`SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) FROM bank_transactions WHERE statement_id = ?`, id).Scan(&sumD, &sumC); err != nil {
		t.Fatal(err)
	}
	if sumD != wantDebit || sumC != wantCredit {
		t.Fatalf("stored lines: %d/%d", sumD, sumC)
	}
	// The row-level fingerprint is recomputed server-side: a client-supplied
	// value must not be trusted, so the stored one differs from the preview's.
	var fp string
	if err := e.db.QueryRow(`SELECT fingerprint FROM bank_transactions WHERE statement_id = ?`, id).Scan(&fp); err != nil {
		t.Fatal(err)
	}
	if fp == first["fingerprint"].(string) {
		t.Fatal("fingerprint must be recomputed from the corrected row")
	}
}
