package handlers_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/handlers"
	"github.com/bugloper/xpensiv/internal/reconciliation"
	"github.com/bugloper/xpensiv/internal/server"
)

type reconEnv struct {
	t   *testing.T
	db  *sql.DB
	srv *httptest.Server
}

func newReconEnv(t *testing.T) *reconEnv {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{DefaultCurrency: "BTN", MaxUploadBytes: 1 << 20, DataDir: t.TempDir()}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	deps := server.NewDeps(cfg, db)
	e := server.New(cfg, log, deps, handlers.NewReconciliationHandler(reconciliation.NewService(db, deps.Settings)))
	s := httptest.NewServer(e)
	t.Cleanup(s.Close)
	return &reconEnv{t: t, db: db, srv: s}
}

func (e *reconEnv) do(method, path string, body any) (int, map[string]any) {
	e.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.srv.URL+"/api/v1"+path, r)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	out := map[string]any{}
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			e.t.Fatalf("bad json %s: %s", path, raw)
		}
	}
	return res.StatusCode, out
}

func (e *reconEnv) must(status int, method, path string, body any) map[string]any {
	e.t.Helper()
	st, out := e.do(method, path, body)
	if st != status {
		e.t.Fatalf("%s %s: want %d got %d: %v", method, path, status, st, out)
	}
	return out
}

func obj(m map[string]any, key string) map[string]any { d, _ := m[key].(map[string]any); return d }
func num(m map[string]any, key string) int64          { f, _ := m[key].(float64); return int64(f) }
func str(m map[string]any, key string) string         { s, _ := m[key].(string); return s }
func list(m map[string]any, key string) []map[string]any {
	raw, _ := m[key].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, v := range raw {
		out = append(out, v.(map[string]any))
	}
	return out
}

func (e *reconEnv) account(name, typ string, opening int64) string {
	e.t.Helper()
	body := e.must(201, "POST", "/accounts", map[string]any{"name": name, "type": typ, "opening_balance": opening, "opening_balance_date": "2026-01-01"})
	return str(obj(body, "data"), "id")
}

func (e *reconEnv) balance(id string) int64 {
	e.t.Helper()
	return num(obj(e.must(200, "GET", "/accounts/"+id, nil), "data"), "current_balance")
}

func (e *reconEnv) tx(body map[string]any) string {
	e.t.Helper()
	return str(obj(e.must(201, "POST", "/transactions", body), "data"), "id")
}

func (e *reconEnv) statement(id, account, start, end string, debits, credits int64, n int) {
	e.t.Helper()
	_, err := e.db.Exec(`INSERT INTO bank_statements (id, provider, account_id, file_name, file_sha256, file_size, period_start, period_end,
		opening_balance, closing_balance, total_debits, total_credits, transaction_count, balance_verified, imported_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, "bob", account, id+".pdf", "sha-"+id, 1000, start, end, 100000, 100000-debits+credits, debits, credits, n, 1, "2026-12-01T00:00:00Z")
	if err != nil {
		e.t.Fatal(err)
	}
}

func (e *reconEnv) bankTx(id, stmt, account string, line int, date, desc string, debit, credit int64) {
	e.t.Helper()
	_, err := e.db.Exec(`INSERT INTO bank_transactions (id, statement_id, account_id, line_no, transaction_date, description, reference, debit, credit, fingerprint, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, stmt, account, line, date, desc, "", debit, credit, "fp-"+id, "2026-12-01T00:00:00Z")
	if err != nil {
		e.t.Fatal(err)
	}
}

func (e *reconEnv) recon(bankID string) map[string]any {
	e.t.Helper()
	var status, matchType, rule string
	var txID sql.NullString
	var amountDiff int64
	err := e.db.QueryRow(`SELECT status, match_type, rule, transaction_id, amount_diff FROM reconciliations WHERE bank_transaction_id = ?`, bankID).
		Scan(&status, &matchType, &rule, &txID, &amountDiff)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		e.t.Fatal(err)
	}
	return map[string]any{"status": status, "match_type": matchType, "rule": rule, "transaction_id": txID.String, "amount_diff": float64(amountDiff)}
}

func TestReconciliationFlow(t *testing.T) {
	e := newReconEnv(t)
	bank := e.account("BOB", "bank", 100000)
	cash := e.account("Wallet", "cash", 5000)
	cc := e.account("Card", "credit_card", 0)

	e.statement("st1", bank, "2026-11-01", "2026-11-30", 79300, 50000, 8)
	e.bankTx("b1", "st1", bank, 1, "2026-11-04", "POS/AMBIENT CAFE THIMPHU/1", 1250, 0)
	e.bankTx("b2", "st1", bank, 2, "2026-11-10", "MBOB/TRF/TO/WALLET", 20000, 0)
	e.bankTx("b3", "st1", bank, 3, "2026-11-12", "SALARY NOV", 0, 50000)
	e.bankTx("b4", "st1", bank, 4, "2026-11-15", "SMS CHARGES", 50, 0)
	e.bankTx("b5", "st1", bank, 5, "2026-11-18", "CC PAYMENT 4111", 45000, 0)
	e.bankTx("b6", "st1", bank, 6, "2026-11-20", "POS/ABC STORE/2", 10000, 0)
	e.bankTx("b7", "st1", bank, 7, "2026-11-22", "POS/XYZ/3", 3000, 0)
	e.bankTx("b8", "st1", bank, 8, "2026-11-23", "POS/XYZ/4", 3000, 0)

	m1 := e.tx(map[string]any{"type": "expense", "amount": 1250, "account_id": bank, "category_id": "cat-food", "payee": "Ambient Cafe", "transaction_date": "2026-11-04"})
	m2 := e.tx(map[string]any{"type": "transfer", "amount": 20000, "account_id": bank, "transfer_account_id": cash, "transaction_date": "2026-11-09"})
	m3 := e.tx(map[string]any{"type": "expense", "amount": 9800, "account_id": bank, "payee": "ABC Store", "transaction_date": "2026-11-20"})
	m4 := e.tx(map[string]any{"type": "expense", "amount": 3000, "account_id": bank, "payee": "XYZ", "transaction_date": "2026-11-22"})
	m5 := e.tx(map[string]any{"type": "expense", "amount": 3000, "account_id": bank, "payee": "XYZ", "transaction_date": "2026-11-23"})
	cashTx := e.tx(map[string]any{"type": "expense", "amount": 3000, "account_id": cash, "transaction_date": "2026-11-22"})
	income := e.tx(map[string]any{"type": "income", "amount": 3000, "account_id": bank, "transaction_date": "2026-11-22"})

	t.Run("overview before", func(t *testing.T) {
		d := obj(e.must(200, "GET", "/reconciliation", nil), "data")
		sts := list(d, "statements")
		if len(sts) != 1 || str(sts[0], "statement_id") != "st1" || num(sts[0], "total") != 8 || num(sts[0], "unrecorded") != 8 || str(sts[0], "account_name") != "BOB" {
			t.Fatalf("overview statements: %v", sts)
		}
		// m1..m5 + income on the bank account; the cash expense is not on a bank-type account.
		if num(d, "unmatched_manual_count") != 6 || num(d, "unreconciled_bank_count") != 8 {
			t.Fatalf("overview counts: %v", d)
		}
	})

	t.Run("workspace before", func(t *testing.T) {
		e.must(404, "GET", "/reconciliation/nope", nil)
		d := obj(e.must(200, "GET", "/reconciliation/st1", nil), "data")
		if num(d, "date_tolerance_days") != 3 || str(obj(d, "account"), "id") != bank {
			t.Fatalf("workspace header: %v", d)
		}
		lines := list(d, "bank_transactions")
		if len(lines) != 8 || str(lines[0], "status") != "unrecorded" {
			t.Fatalf("bank lines: %v", lines)
		}
		s1 := list(lines[0], "suggestions")
		if len(s1) != 1 || str(s1[0], "rule") != "exact_date" || str(s1[0], "transaction_id") != m1 {
			t.Fatalf("b1 suggestions: %v", s1)
		}
		s2 := list(lines[1], "suggestions")
		if len(s2) != 1 || str(s2[0], "rule") != "date_tolerance" || str(s2[0], "transaction_id") != m2 {
			t.Fatalf("b2 suggestions: %v", s2)
		}
		s6 := list(lines[5], "suggestions")
		if len(s6) != 1 || str(s6[0], "rule") != "amount_mismatch" || num(s6[0], "amount_diff") != 200 || num(s6[0], "confidence") > 30 {
			t.Fatalf("b6 suggestions: %v", s6)
		}
		if s7 := list(lines[6], "suggestions"); len(s7) != 2 {
			t.Fatalf("b7 suggestions: %v", s7)
		}
		manual := map[string]map[string]any{}
		for _, m := range list(d, "manual_transactions") {
			manual[str(m, "id")] = m
		}
		if _, ok := manual[cashTx]; ok {
			t.Fatal("cash transaction must not be a candidate")
		}
		if str(manual[m4], "status") != "possible_duplicate" || str(manual[m4], "duplicate_of") != m5 || str(manual[m5], "duplicate_of") != m4 {
			t.Fatalf("duplicates: %v %v", manual[m4], manual[m5])
		}
		if str(manual[m1], "status") != "unmatched" {
			t.Fatalf("m1 status: %v", manual[m1])
		}
		sum := obj(d, "summary")
		if num(sum, "unrecorded_bank") != 8 || num(sum, "unmatched_manual") != 6 || num(sum, "manual_expenses") != 17050 || num(sum, "manual_income") != 3000 || num(sum, "total_debits") != 79300 || sum["balance_verified"] != true {
			t.Fatalf("summary: %v", sum)
		}
	})

	t.Run("auto-match", func(t *testing.T) {
		e.must(422, "POST", "/reconciliation/auto-match", map[string]any{})
		e.must(404, "POST", "/reconciliation/auto-match", map[string]any{"statement_id": "nope"})
		d := obj(e.must(200, "POST", "/reconciliation/auto-match", map[string]any{"statement_id": "st1"}), "data")
		if num(d, "matched") != 2 {
			t.Fatalf("auto-match: %v", d)
		}
		r1 := e.recon("b1")
		if r1["status"] != "matched" || r1["match_type"] != "auto" || r1["rule"] != "exact_date" || r1["transaction_id"] != m1 {
			t.Fatalf("b1 reconciliation: %v", r1)
		}
		r2 := e.recon("b2")
		if r2["status"] != "transfer" || r2["match_type"] != "auto" || r2["rule"] != "date_tolerance" || r2["transaction_id"] != m2 {
			t.Fatalf("b2 reconciliation: %v", r2)
		}
		for _, b := range []string{"b3", "b4", "b5", "b6", "b7", "b8"} {
			if e.recon(b) != nil {
				t.Fatalf("%s must not be auto-matched", b)
			}
		}
		// Idempotent.
		if d := obj(e.must(200, "POST", "/reconciliation/auto-match", map[string]any{"statement_id": "st1"}), "data"); num(d, "matched") != 0 {
			t.Fatalf("second auto-match: %v", d)
		}
	})

	t.Run("create-transaction", func(t *testing.T) {
		before := e.balance(bank)
		e.must(422, "POST", "/reconciliation/create-transaction", map[string]any{"bank_transaction_id": "b3", "category_id": "cat-food"})
		e.must(422, "POST", "/reconciliation/create-transaction", map[string]any{"bank_transaction_id": "b3", "category_id": "nope"})
		e.must(404, "POST", "/reconciliation/create-transaction", map[string]any{"bank_transaction_id": "nope"})
		d := obj(e.must(201, "POST", "/reconciliation/create-transaction", map[string]any{"bank_transaction_id": "b3", "category_id": "cat-salary", "notes": "nov"}), "data")
		tx := obj(d, "transaction")
		if str(tx, "type") != "income" || num(tx, "amount") != 50000 || str(tx, "origin") != "imported" || str(tx, "status") != "cleared" ||
			str(tx, "source_bank_transaction_id") != "b3" || str(tx, "transaction_date") != "2026-11-12" || str(tx, "payee") != "Salary Nov" ||
			str(tx, "account_id") != bank || str(tx, "category_id") != "cat-salary" || str(tx, "reconciliation_status") != "matched" {
			t.Fatalf("created transaction: %v", tx)
		}
		if r := obj(d, "reconciliation"); str(r, "status") != "matched" || str(r, "rule") != "created" {
			t.Fatalf("reconciliation: %v", r)
		}
		if got := e.balance(bank); got != before+50000 {
			t.Fatalf("balance want %d got %d", before+50000, got)
		}
		e.must(409, "POST", "/reconciliation/create-transaction", map[string]any{"bank_transaction_id": "b3"})
	})

	t.Run("ignore", func(t *testing.T) {
		d := obj(e.must(201, "POST", "/reconciliation/ignore", map[string]any{"bank_transaction_id": "b4", "note": "bank fee"}), "data")
		if str(d, "status") != "ignored" || str(d, "note") != "bank fee" || d["transaction_id"] != nil {
			t.Fatalf("ignore: %v", d)
		}
		e.must(409, "POST", "/reconciliation/ignore", map[string]any{"bank_transaction_id": "b4"})
		e.must(404, "POST", "/reconciliation/ignore", map[string]any{"bank_transaction_id": "nope"})
	})

	var transferTx string
	t.Run("transfer create", func(t *testing.T) {
		bankBefore, ccBefore := e.balance(bank), e.balance(cc)
		e.must(422, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5"})
		e.must(422, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5", "transfer_account_id": bank})
		e.must(422, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5", "transfer_account_id": "nope"})
		e.must(422, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5", "transaction_id": m3})
		d := obj(e.must(201, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5", "transfer_account_id": cc}), "data")
		tx := obj(d, "transaction")
		transferTx = str(tx, "id")
		if str(tx, "type") != "transfer" || str(tx, "account_id") != bank || str(tx, "transfer_account_id") != cc || num(tx, "amount") != 45000 ||
			str(tx, "origin") != "imported" || str(tx, "source_bank_transaction_id") != "b5" || str(tx, "reconciliation_status") != "transfer" {
			t.Fatalf("transfer transaction: %v", tx)
		}
		if str(obj(d, "reconciliation"), "status") != "transfer" {
			t.Fatalf("reconciliation: %v", d)
		}
		if e.balance(bank) != bankBefore-45000 || e.balance(cc) != ccBefore+45000 {
			t.Fatalf("balances after transfer: bank %d cc %d", e.balance(bank), e.balance(cc))
		}
	})

	t.Run("adjustment", func(t *testing.T) {
		before := e.balance(bank)
		e.must(422, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "b7", "transaction_id": m4}) // equal amounts
		e.must(422, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "b6", "transaction_id": cashTx})
		d := obj(e.must(201, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "b6", "transaction_id": m3, "note": "rounding"}), "data")
		adj := obj(d, "adjustment")
		if str(adj, "type") != "adjustment" || num(adj, "amount") != -200 || str(adj, "origin") != "adjustment" || str(adj, "account_id") != bank ||
			str(adj, "source_bank_transaction_id") != "b6" || str(adj, "transaction_date") != "2026-11-20" {
			t.Fatalf("adjustment transaction: %v", adj)
		}
		if str(obj(d, "transaction"), "id") != m3 {
			t.Fatalf("matched transaction: %v", d)
		}
		r := obj(d, "reconciliation")
		if str(r, "status") != "matched" || num(r, "amount_diff") != 200 || str(r, "rule") != "adjustment" || str(r, "note") != "rounding" {
			t.Fatalf("reconciliation: %v", r)
		}
		// Ledger now equals the bank: manual 9800 + adjustment 200 = bank debit 10000.
		if got := e.balance(bank); got != before-200 {
			t.Fatalf("balance want %d got %d", before-200, got)
		}
		e.must(409, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "b6", "transaction_id": m4})
	})

	t.Run("match validation and conflicts", func(t *testing.T) {
		e.must(422, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7"})
		e.must(404, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": "nope"})
		e.must(404, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "nope", "transaction_id": m4})
		e.must(422, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": cashTx}) // other account
		e.must(422, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": income}) // wrong direction
		e.must(409, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": m1})     // tx already matched
		e.must(409, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b1", "transaction_id": m4})     // bank already matched
		d := obj(e.must(201, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": m4, "note": "ok"}), "data")
		if str(d, "status") != "matched" || str(d, "match_type") != "manual" || str(d, "transaction_id") != m4 || num(d, "amount_diff") != 0 {
			t.Fatalf("match: %v", d)
		}
		e.must(409, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": m5})
		e.must(409, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b8", "transaction_id": m4})
		e.must(201, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b8", "transaction_id": m5})
	})

	t.Run("workspace after", func(t *testing.T) {
		d := obj(e.must(200, "GET", "/reconciliation/st1", nil), "data")
		st := obj(d, "statement")
		if num(st, "matched_count") != 7 || num(st, "unmatched_count") != 0 || num(st, "ignored_count") != 1 {
			t.Fatalf("statement counts: %v", st)
		}
		sum := obj(d, "summary")
		if num(sum, "matched") != 5 || num(sum, "transfers") != 2 || num(sum, "ignored") != 1 || num(sum, "unrecorded_bank") != 0 ||
			num(sum, "amount_discrepancies") != 1 || num(sum, "unmatched_manual") != 1 {
			t.Fatalf("summary: %v", sum)
		}
		lines := list(d, "bank_transactions")
		if str(lines[0], "status") != "matched" || str(obj(lines[0], "transaction"), "id") != m1 || obj(lines[0], "reconciliation") == nil || len(list(lines[0], "suggestions")) != 0 {
			t.Fatalf("b1 line: %v", lines[0])
		}
		if str(lines[3], "status") != "ignored" || lines[3]["transaction"] != nil {
			t.Fatalf("b4 line: %v", lines[3])
		}
		if str(lines[4], "status") != "transfer" || str(obj(lines[4], "transaction"), "id") != transferTx {
			t.Fatalf("b5 line: %v", lines[4])
		}
		manual := map[string]string{}
		for _, m := range list(d, "manual_transactions") {
			manual[str(m, "id")] = str(m, "status")
		}
		if manual[m1] != "matched" || manual[m2] != "transfer" || manual[m3] != "matched" || manual[m4] != "matched" || manual[m5] != "matched" || manual[income] != "unmatched" || manual[transferTx] != "transfer" {
			t.Fatalf("manual statuses: %v", manual)
		}
		ov := obj(e.must(200, "GET", "/reconciliation", nil), "data")
		s := list(ov, "statements")[0]
		if num(s, "matched") != 5 || num(s, "transfer") != 2 || num(s, "ignored") != 1 || num(s, "unrecorded") != 0 || num(ov, "unreconciled_bank_count") != 0 || num(ov, "unmatched_manual_count") != 1 {
			t.Fatalf("overview after: %v", ov)
		}
	})

	t.Run("unmatch is reversible and never deletes transactions", func(t *testing.T) {
		e.must(404, "POST", "/reconciliation/unmatch", map[string]any{"bank_transaction_id": "nope"})
		e.must(422, "POST", "/reconciliation/unmatch", map[string]any{})
		bankBefore := e.balance(bank)
		e.must(204, "POST", "/reconciliation/unmatch", map[string]any{"bank_transaction_id": "b5"})
		if e.recon("b5") != nil {
			t.Fatal("b5 reconciliation still present")
		}
		e.must(200, "GET", "/transactions/"+transferTx, nil)
		if e.balance(bank) != bankBefore {
			t.Fatal("unmatch must not change balances")
		}
		// Un-ignore and re-match flows.
		e.must(204, "POST", "/reconciliation/unmatch", map[string]any{"bank_transaction_id": "b4"})
		e.must(204, "POST", "/reconciliation/unmatch", map[string]any{"bank_transaction_id": "b7"})
		e.must(204, "POST", "/reconciliation/unmatch", map[string]any{"bank_transaction_id": "b7"}) // idempotent
		e.must(201, "POST", "/reconciliation/match", map[string]any{"bank_transaction_id": "b7", "transaction_id": m4})
		// Linking the created transfer back by id works through /transfer.
		d := obj(e.must(201, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b5", "transaction_id": transferTx}), "data")
		if str(obj(d, "reconciliation"), "status") != "transfer" || str(obj(d, "transaction"), "id") != transferTx {
			t.Fatalf("relink transfer: %v", d)
		}
		var n int
		if err := e.db.QueryRow(`SELECT COUNT(*) FROM transactions`).Scan(&n); err != nil || n != 10 {
			t.Fatalf("transactions count want 10 got %d (%v)", n, err)
		}
	})
}

func TestReconciliationTransferCredit(t *testing.T) {
	e := newReconEnv(t)
	bank := e.account("BOB", "bank", 100000)
	savings := e.account("Savings", "savings", 500000)
	e.statement("st1", bank, "2026-11-01", "2026-11-30", 0, 25000, 1)
	e.bankTx("b1", "st1", bank, 1, "2026-11-05", "MBOB/TRF/FROM/SAVINGS", 0, 25000)

	d := obj(e.must(201, "POST", "/reconciliation/transfer", map[string]any{"bank_transaction_id": "b1", "transfer_account_id": savings}), "data")
	tx := obj(d, "transaction")
	if str(tx, "account_id") != savings || str(tx, "transfer_account_id") != bank || num(tx, "amount") != 25000 {
		t.Fatalf("credit transfer direction: %v", tx)
	}
	if e.balance(bank) != 125000 || e.balance(savings) != 475000 {
		t.Fatalf("balances: bank %d savings %d", e.balance(bank), e.balance(savings))
	}
}

func TestReconciliationAdjustmentCredit(t *testing.T) {
	e := newReconEnv(t)
	bank := e.account("BOB", "bank", 100000)
	e.statement("st1", bank, "2026-11-01", "2026-11-30", 0, 5100, 1)
	e.bankTx("b1", "st1", bank, 1, "2026-11-05", "INTEREST", 0, 5100)
	inc := e.tx(map[string]any{"type": "income", "amount": 5000, "account_id": bank, "transaction_date": "2026-11-05"})

	d := obj(e.must(201, "POST", "/reconciliation/adjustment", map[string]any{"bank_transaction_id": "b1", "transaction_id": inc}), "data")
	if adj := obj(d, "adjustment"); num(adj, "amount") != 100 {
		t.Fatalf("credit adjustment should be +100: %v", adj)
	}
	// 100000 + 5000 + 100 = bank credit applied in full.
	if got := e.balance(bank); got != 105100 {
		t.Fatalf("balance want 105100 got %d", got)
	}
}
