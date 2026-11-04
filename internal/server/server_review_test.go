package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/bugloper/xpensiv/internal/auth"
)

// Errors raised by Echo itself (unknown route, wrong method, body limit) must
// use the same snake_case codes as application errors (docs/API.md).
func TestEchoErrorsUseContractCodes(t *testing.T) {
	e := newEnv(t)
	code := func(body map[string]any) string {
		eb, _ := body["error"].(map[string]any)
		c, _ := eb["code"].(string)
		return c
	}
	st, body := e.do("GET", "/nope", nil)
	if st != 404 || code(body) != "not_found" {
		t.Fatalf("unknown route: %d %v", st, body)
	}
	st, body = e.do("DELETE", "/accounts/x", nil)
	if st != 405 || code(body) != "method_not_allowed" {
		t.Fatalf("wrong method: %d %v", st, body)
	}
	// BodyLimit is MaxUploadBytes*12 = 12 MiB in newEnv.
	req, _ := http.NewRequest("POST", e.Env.Srv.URL+"/api/v1/transactions", bytes.NewReader(make([]byte, 13<<20)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(auth.ClientHeader, "test")
	res, err := e.HTTP.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 413 || code(out) != "payload_too_large" {
		t.Fatalf("oversized body: %d %v", res.StatusCode, out)
	}
}

func TestTransactionListPerPageBounded(t *testing.T) {
	e := newEnv(t)
	for _, q := range []string{"per_page=500", "per_page=0", "per_page=-1", "per_page=abc", "page=0"} {
		st, body := e.do("GET", "/transactions?"+q, nil)
		if st != 200 {
			t.Fatalf("%s: %d %v", q, st, body)
		}
		meta, _ := body["meta"].(map[string]any)
		pp, _ := meta["per_page"].(float64)
		pg, _ := meta["page"].(float64)
		if pp < 1 || pp > 200 || pg < 1 {
			t.Fatalf("%s: meta %v", q, meta)
		}
	}
}
