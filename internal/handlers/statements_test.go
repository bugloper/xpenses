package handlers_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/handlers"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
	"github.com/bugloper/xpensiv/internal/services"
)

const (
	fixturePlain     = "../../testdata/statements/bob_synthetic.pdf"
	fixtureEncrypted = "../../testdata/statements/bob_synthetic_encrypted.pdf"
	fixturePassword  = "0101"
	fixtureRowCount  = 31
)

type stmtEnv struct {
	t       *testing.T
	db      *sql.DB
	srv     *httptest.Server
	dir     string
	account string
}

func newStmtEnv(t *testing.T, maxUpload int64) *stmtEnv {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	dir := filepath.Join(t.TempDir(), "statements")
	e := echo.New()
	e.HTTPErrorHandler = handlers.ErrorHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
	api := e.Group("/api/v1")
	handlers.NewStatementHandler(services.NewStatementService(db, dir), maxUpload).Register(api)
	(&handlers.TransactionHandler{Svc: &services.TransactionService{DB: db, DefaultCurrency: "BTN"}}).Register(api)
	srv := httptest.NewServer(e)
	t.Cleanup(srv.Close)

	now := models.NowUTC()
	acct := &models.Account{ID: services.NewID(), Name: "BOB Savings", Type: "bank", Currency: "BTN", OpeningBalanceDate: "2026-01-01", IsActive: true, CreatedAt: now, UpdatedAt: now}
	if err := (repositories.AccountRepo{}).Insert(context.Background(), db, acct); err != nil {
		t.Fatal(err)
	}
	return &stmtEnv{t: t, db: db, srv: srv, dir: dir, account: acct.ID}
}

func (e *stmtEnv) upload(fileName string, content []byte, fields map[string]string) (int, map[string]any) {
	e.t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if content != nil {
		part, err := w.CreateFormFile("file", fileName)
		if err != nil {
			e.t.Fatal(err)
		}
		_, _ = part.Write(content)
	}
	_ = w.Close()
	req, _ := http.NewRequest(http.MethodPost, e.srv.URL+"/api/v1/statements/parse", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			e.t.Fatalf("bad json: %s", raw)
		}
	}
	return res.StatusCode, out
}

func (e *stmtEnv) do(method, path string, body any) (int, map[string]any, []byte) {
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
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	if bytes.HasPrefix(bytes.TrimSpace(raw), []byte("{")) {
		_ = json.Unmarshal(raw, &out)
	}
	return res.StatusCode, out, raw
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("fixture %s: %v", path, err)
	}
	return b
}

func data(m map[string]any) map[string]any { d, _ := m["data"].(map[string]any); return d }
func errCode(m map[string]any) string {
	e, _ := m["error"].(map[string]any)
	c, _ := e["code"].(string)
	return c
}

var tokenRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// importBody turns a preview into an ImportRequest body.
func importBody(preview map[string]any, account string, extra map[string]any) map[string]any {
	body := map[string]any{
		"upload_token": preview["upload_token"],
		"account_id":   account,
		"statement":    preview["statement"],
		"transactions": preview["transactions"],
	}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

func TestStatementParseImportFlow(t *testing.T) {
	e := newStmtEnv(t, 1<<20)
	plain := readFile(t, fixturePlain)

	// Parse.
	st, body := e.upload("AMONLI_014_OUT_GBOBLBTNOU_20261101_083000_1.PDF", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("parse: %d %v", st, body)
	}
	p := data(body)
	if !tokenRe.MatchString(p["upload_token"].(string)) || p["provider"] != "bob" || p["text_extraction"] != "text" || p["account_id"] != e.account {
		t.Fatalf("preview head: %v", p)
	}
	if p["duplicate_statement"] != nil {
		t.Fatalf("unexpected duplicate: %v", p["duplicate_statement"])
	}
	stmt := p["statement"].(map[string]any)
	if stmt["account_number"] != "********7890" || stmt["account_holder"] != "TASHI WANGMO" || stmt["currency"] != "BTN" ||
		stmt["period_start"] != "2026-10-01" || stmt["period_end"] != "2026-10-31" || stmt["transaction_count"].(float64) != fixtureRowCount {
		t.Fatalf("preview statement: %v", stmt)
	}
	if stmt["opening_balance"].(float64) != 10000000 {
		t.Fatalf("opening balance: %v", stmt["opening_balance"])
	}
	val := p["validation"].(map[string]any)
	if val["balance_check"] != "ok" || val["difference"].(float64) != 0 {
		t.Fatalf("validation: %v", val)
	}
	rows := p["transactions"].([]any)
	if len(rows) != fixtureRowCount {
		t.Fatalf("rows: %d", len(rows))
	}
	for _, r := range rows {
		row := r.(map[string]any)
		if row["is_duplicate"].(bool) || !tokenRe.MatchString(row["fingerprint"].(string)) {
			t.Fatalf("row: %v", row)
		}
	}
	if len(p["warnings"].([]any)) != 0 {
		t.Fatalf("warnings: %v", p["warnings"])
	}
	pending, _ := filepath.Glob(filepath.Join(e.dir, "pending", "*.pdf"))
	if len(pending) != 1 {
		t.Fatalf("pending files: %v", pending)
	}
	if info, _ := os.Stat(pending[0]); info.Mode().Perm() != 0o600 {
		t.Fatalf("pending file mode %v", info.Mode())
	}

	// Import.
	st, body, _ = e.do("POST", "/statements/import", importBody(p, e.account, nil))
	if st != 201 {
		t.Fatalf("import: %d %v", st, body)
	}
	imported := data(body)
	id := imported["id"].(string)
	if imported["transaction_count"].(float64) != fixtureRowCount || imported["balance_verified"] != true ||
		imported["unmatched_count"].(float64) != fixtureRowCount || imported["matched_count"].(float64) != 0 || imported["skipped_duplicates"].(float64) != 0 {
		t.Fatalf("imported: %v", imported)
	}
	if imported["file_sha256"] != p["file_sha256"] || imported["file_name"] != p["file_name"] || imported["account_number"] != "********7890" {
		t.Fatalf("imported meta: %v", imported)
	}
	if _, err := os.Stat(filepath.Join(e.dir, id+".pdf")); err != nil {
		t.Fatalf("audit copy missing: %v", err)
	}
	if left, _ := filepath.Glob(filepath.Join(e.dir, "pending", "*")); len(left) != 0 {
		t.Fatalf("pending not cleaned: %v", left)
	}

	// Reads.
	st, body, _ = e.do("GET", "/statements", nil)
	if st != 200 || len(body["data"].([]any)) != 1 {
		t.Fatalf("list: %d %v", st, body)
	}
	st, body, _ = e.do("GET", "/statements/"+id, nil)
	if st != 200 || data(body)["id"] != id {
		t.Fatalf("get: %d %v", st, body)
	}
	st, body, _ = e.do("GET", "/statements/"+id+"/transactions", nil)
	if st != 200 {
		t.Fatalf("transactions: %d %v", st, body)
	}
	txs := body["data"].([]any)
	if len(txs) != fixtureRowCount {
		t.Fatalf("transactions: %d", len(txs))
	}
	prevLine := 0.0
	for _, x := range txs {
		row := x.(map[string]any)
		if row["status"] != "unrecorded" || row["transaction"] != nil || row["reconciliation"] != nil {
			t.Fatalf("row status: %v", row)
		}
		if row["line_no"].(float64) <= prevLine {
			t.Fatalf("rows not ordered by line_no")
		}
		prevLine = row["line_no"].(float64)
	}
	first := txs[0].(map[string]any)
	if first["description"] != "SALARY CREDIT OCT 2026 DRUK DEMO" || first["credit"].(float64) != 6500000 || first["reference"] != "SAL0001" {
		t.Fatalf("first row: %v", first)
	}
	req, _ := http.NewRequest(http.MethodGet, e.srv.URL+"/api/v1/statements/"+id+"/file", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "application/pdf" || !bytes.Equal(raw, plain) {
		t.Fatalf("file: %d %s len=%d", res.StatusCode, res.Header.Get("Content-Type"), len(raw))
	}

	// Same bytes again -> sha256 duplicate and every row flagged.
	st, body = e.upload("again.pdf", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("reparse: %d %v", st, body)
	}
	p2 := data(body)
	dup, _ := p2["duplicate_statement"].(map[string]any)
	if dup == nil || dup["reason"] != "sha256" || dup["id"] != id {
		t.Fatalf("duplicate: %v", p2["duplicate_statement"])
	}
	for _, r := range p2["transactions"].([]any) {
		if !r.(map[string]any)["is_duplicate"].(bool) {
			t.Fatalf("row should be duplicate: %v", r)
		}
	}
	st, body, _ = e.do("POST", "/statements/import", importBody(p2, e.account, nil))
	if st != 409 || errCode(body) != "duplicate_statement" {
		t.Fatalf("import dup: %d %v", st, body)
	}
	// skip_duplicates=false with existing rows is refused before anything is written.
	st, body, _ = e.do("POST", "/statements/import", importBody(p2, e.account, map[string]any{"force": true, "skip_duplicates": false}))
	if st != 409 || errCode(body) != "duplicate_bank_transaction" {
		t.Fatalf("import no-skip: %d %v", st, body)
	}
	st, body, _ = e.do("GET", "/statements", nil)
	if len(body["data"].([]any)) != 1 {
		t.Fatalf("refused import must not persist: %v", body)
	}
	// force -> second statement, all rows skipped.
	st, body, _ = e.do("POST", "/statements/import", importBody(p2, e.account, map[string]any{"force": true}))
	if st != 201 {
		t.Fatalf("import force: %d %v", st, body)
	}
	forced := data(body)
	if forced["skipped_duplicates"].(float64) != fixtureRowCount || forced["transaction_count"].(float64) != 0 || forced["file_sha256"] != p["file_sha256"] {
		t.Fatalf("forced: %v", forced)
	}
	if _, err := os.Stat(filepath.Join(e.dir, forced["id"].(string)+".pdf")); err != nil {
		t.Fatalf("forced audit copy missing: %v", err)
	}

	// Different bytes, same content (the encrypted copy): period overlap.
	enc := readFile(t, fixtureEncrypted)
	st, body = e.upload("enc.pdf", enc, map[string]string{"account_id": e.account, "password": fixturePassword})
	if st != 200 {
		t.Fatalf("parse enc: %d %v", st, body)
	}
	dup, _ = data(body)["duplicate_statement"].(map[string]any)
	if dup == nil || dup["reason"] != "period" {
		t.Fatalf("period duplicate: %v", data(body)["duplicate_statement"])
	}
	// Move the imported periods away: now only the fingerprints give it away.
	if _, err := e.db.Exec(`UPDATE bank_statements SET period_start = '2025-01-01', period_end = '2025-01-31'`); err != nil {
		t.Fatal(err)
	}
	st, body = e.upload("enc.pdf", enc, map[string]string{"account_id": e.account, "password": fixturePassword})
	if st != 200 {
		t.Fatalf("parse enc 2: %d %v", st, body)
	}
	dup, _ = data(body)["duplicate_statement"].(map[string]any)
	if dup == nil || dup["reason"] != "fingerprints" || dup["id"] != id {
		t.Fatalf("fingerprint duplicate: %v", data(body)["duplicate_statement"])
	}

	// Delete the first statement: its rows and file go, nothing else does.
	st, _, _ = e.do("DELETE", "/statements/"+id, nil)
	if st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if _, err := os.Stat(filepath.Join(e.dir, id+".pdf")); !os.IsNotExist(err) {
		t.Fatalf("audit copy should be removed: %v", err)
	}
	st, _, _ = e.do("GET", "/statements/"+id+"/transactions", nil)
	if st != 404 {
		t.Fatalf("transactions after delete: %d", st)
	}
	st, _, _ = e.do("DELETE", "/statements/"+id, nil)
	if st != 404 {
		t.Fatalf("second delete: %d", st)
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM bank_transactions`).Scan(&n)
	if n != 0 {
		t.Fatalf("bank transactions left: %d", n)
	}
	st, body, _ = e.do("GET", "/statements", nil)
	if len(body["data"].([]any)) != 1 {
		t.Fatalf("forced statement should remain: %v", body)
	}
}

func TestStatementParseErrors(t *testing.T) {
	e := newStmtEnv(t, 1<<20)
	plain := readFile(t, fixturePlain)
	enc := readFile(t, fixtureEncrypted)

	cases := []struct {
		name   string
		file   []byte
		fields map[string]string
		status int
		code   string
	}{
		{"password required", enc, map[string]string{"account_id": e.account}, 400, "pdf_password_required"},
		{"password incorrect", enc, map[string]string{"account_id": e.account, "password": "9999"}, 400, "pdf_password_incorrect"},
		{"not a pdf", []byte("hello, this is text"), map[string]string{"account_id": e.account}, 400, "invalid_file"},
		{"missing file", nil, map[string]string{"account_id": e.account}, 400, "invalid_file"},
		{"unknown account", plain, map[string]string{"account_id": "nope"}, 422, "validation_error"},
		{"missing account", plain, map[string]string{}, 422, "validation_error"},
		{"unsupported provider", plain, map[string]string{"account_id": e.account, "provider": "xyz"}, 422, "validation_error"},
		{"no table", pdfWithoutTable(t), map[string]string{"account_id": e.account}, 422, "pdf_unrecognised"},
	}
	for _, c := range cases {
		st, body := e.upload("f.pdf", c.file, c.fields)
		if st != c.status || errCode(body) != c.code {
			t.Errorf("%s: got %d %v want %d %s", c.name, st, body, c.status, c.code)
		}
	}
	if left, _ := filepath.Glob(filepath.Join(e.dir, "pending", "*")); len(left) != 0 {
		t.Fatalf("failed parses must not leave pending files: %v", left)
	}
	if enc[0] != '%' {
		t.Fatal("sanity")
	}
}

func TestStatementParseTooLarge(t *testing.T) {
	e := newStmtEnv(t, 1024)
	plain := readFile(t, fixturePlain)
	st, body := e.upload("f.pdf", plain, map[string]string{"account_id": e.account})
	if st != 413 || errCode(body) != "payload_too_large" {
		t.Fatalf("got %d %v", st, body)
	}
	big := append([]byte("%PDF-1.4\n"), bytes.Repeat([]byte("x"), 200<<10)...)
	st, body = e.upload("f.pdf", big, map[string]string{"account_id": e.account})
	if st != 413 || errCode(body) != "payload_too_large" {
		t.Fatalf("big body: got %d %v", st, body)
	}
}

func TestStatementImportValidation(t *testing.T) {
	e := newStmtEnv(t, 1<<20)
	plain := readFile(t, fixturePlain)
	st, body := e.upload("f.pdf", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("parse: %d %v", st, body)
	}
	p := data(body)

	st, body, _ = e.do("POST", "/statements/import", map[string]any{"upload_token": "zzz", "account_id": e.account, "statement": p["statement"], "transactions": p["transactions"]})
	if st != 422 || errCode(body) != "validation_error" {
		t.Fatalf("bad token: %d %v", st, body)
	}
	st, body, _ = e.do("POST", "/statements/import", map[string]any{"upload_token": "0123456789abcdef0123456789abcdef", "account_id": e.account, "statement": p["statement"], "transactions": p["transactions"]})
	if st != 400 {
		t.Fatalf("unknown token: %d %v", st, body)
	}
	st, body, _ = e.do("POST", "/statements/import", "not json")
	if st != 400 {
		t.Fatalf("bad json: %d %v", st, body)
	}

	rows := p["transactions"].([]any)
	bad := rows[0].(map[string]any)
	bad["debit"] = 100
	bad["credit"] = 100
	rows[1].(map[string]any)["transaction_date"] = "31-10-2026"
	rows[2].(map[string]any)["debit"] = -5
	st, body, _ = e.do("POST", "/statements/import", importBody(p, e.account, nil))
	if st != 422 {
		t.Fatalf("bad rows: %d %v", st, body)
	}
	details := body["error"].(map[string]any)["details"].(map[string]any)
	for _, k := range []string{"transactions[0].credit", "transactions[1].transaction_date", "transactions[2].debit"} {
		if _, ok := details[k]; !ok {
			t.Errorf("missing detail %s in %v", k, details)
		}
	}
	// Nothing was written and the token is still usable.
	st, body, _ = e.do("GET", "/statements", nil)
	if len(body["data"].([]any)) != 0 {
		t.Fatalf("statements written on failed import: %v", body)
	}

	// Edited rows are accepted and fingerprints recomputed server-side.
	st, body = e.upload("f.pdf", plain, map[string]string{"account_id": e.account})
	p = data(body)
	rows = p["transactions"].([]any)
	edited := rows[0].(map[string]any)
	edited["description"] = "EDITED DESCRIPTION"
	oldFP := edited["fingerprint"].(string)
	st, body, _ = e.do("POST", "/statements/import", importBody(p, e.account, map[string]any{"skip_duplicates": false}))
	if st != 201 {
		t.Fatalf("import edited: %d %v", st, body)
	}
	id := data(body)["id"].(string)
	st, body, _ = e.do("GET", "/statements/"+id+"/transactions", nil)
	first := body["data"].([]any)[0].(map[string]any)
	if first["description"] != "EDITED DESCRIPTION" || first["fingerprint"] == oldFP {
		t.Fatalf("fingerprint not recomputed: %v", first)
	}
}

func TestStatementTransactionsShowMatches(t *testing.T) {
	e := newStmtEnv(t, 1<<20)
	plain := readFile(t, fixturePlain)
	st, body := e.upload("f.pdf", plain, map[string]string{"account_id": e.account})
	if st != 200 {
		t.Fatalf("parse: %d %v", st, body)
	}
	st, body, _ = e.do("POST", "/statements/import", importBody(data(body), e.account, nil))
	if st != 201 {
		t.Fatalf("import: %d %v", st, body)
	}
	id := data(body)["id"].(string)

	// A manual transaction, matched to the first bank row by the (future)
	// reconciliation domain; plus one ignored row.
	st, body, _ = e.do("POST", "/transactions", map[string]any{"type": "income", "amount": 6500000, "account_id": e.account, "category_id": "cat-salary", "transaction_date": "2026-10-01", "description": "Salary"})
	if st != 201 {
		t.Fatalf("create tx: %d %v", st, body)
	}
	txID := data(body)["id"].(string)
	var bank1, bank2 string
	rows, err := e.db.Query(`SELECT id FROM bank_transactions WHERE statement_id = ? ORDER BY line_no LIMIT 2`, id)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; rows.Next(); i++ {
		if i == 0 {
			_ = rows.Scan(&bank1)
		} else {
			_ = rows.Scan(&bank2)
		}
	}
	rows.Close()
	now := models.NowUTC()
	if _, err := e.db.Exec(`INSERT INTO reconciliations (id, bank_transaction_id, transaction_id, status, match_type, rule, confidence, created_at) VALUES (?,?,?,?,?,?,?,?)`,
		services.NewID(), bank1, txID, "matched", "auto", "exact_date", 100, now); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec(`INSERT INTO reconciliations (id, bank_transaction_id, transaction_id, status, match_type, note, created_at) VALUES (?,?,NULL,?,?,?,?)`,
		services.NewID(), bank2, "ignored", "manual", "bank fee", now); err != nil {
		t.Fatal(err)
	}

	st, body, _ = e.do("GET", "/statements/"+id, nil)
	s := data(body)
	if s["matched_count"].(float64) != 1 || s["ignored_count"].(float64) != 1 || s["unmatched_count"].(float64) != fixtureRowCount-2 {
		t.Fatalf("counts: %v", s)
	}
	st, body, _ = e.do("GET", "/statements/"+id+"/transactions", nil)
	list := body["data"].([]any)
	r0 := list[0].(map[string]any)
	if r0["status"] != "matched" || r0["transaction"] == nil || r0["transaction"].(map[string]any)["id"] != txID || r0["reconciliation"].(map[string]any)["rule"] != "exact_date" {
		t.Fatalf("matched row: %v", r0)
	}
	r1 := list[1].(map[string]any)
	if r1["status"] != "ignored" || r1["transaction"] != nil || r1["reconciliation"].(map[string]any)["note"] != "bank fee" {
		t.Fatalf("ignored row: %v", r1)
	}

	// Deleting the statement cascades the reconciliation but keeps the manual transaction.
	st, _, _ = e.do("DELETE", "/statements/"+id, nil)
	if st != 204 {
		t.Fatalf("delete: %d", st)
	}
	st, body, _ = e.do("GET", "/transactions/"+txID, nil)
	if st != 200 || data(body)["reconciliation_status"] != nil { // omitempty: absent when unmatched
		t.Fatalf("manual transaction after delete: %d %v", st, body)
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM reconciliations`).Scan(&n)
	if n != 0 {
		t.Fatalf("reconciliations left: %d", n)
	}
}

// pdfWithoutTable is a minimal single-page PDF whose only text is prose.
func pdfWithoutTable(t *testing.T) []byte {
	t.Helper()
	content := "BT /F1 12 Tf 72 720 Td (Dear customer, thank you for banking with us.) Tj ET"
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		"<< /Length " + itoa(len(content)) + " >>\nstream\n" + content + "\nendstream",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs)+1)
	for i, o := range objs {
		offsets[i+1] = b.Len()
		b.WriteString(itoa(i+1) + " 0 obj\n" + o + "\nendobj\n")
	}
	xref := b.Len()
	b.WriteString("xref\n0 " + itoa(len(objs)+1) + "\n0000000000 65535 f \n")
	for i := 1; i <= len(objs); i++ {
		off := itoa(offsets[i])
		for len(off) < 10 {
			off = "0" + off
		}
		b.WriteString(off + " 00000 n \n")
	}
	b.WriteString("trailer\n<< /Size " + itoa(len(objs)+1) + " /Root 1 0 R >>\nstartxref\n" + itoa(xref) + "\n%%EOF\n")
	return b.Bytes()
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
