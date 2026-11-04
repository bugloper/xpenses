package handlers_test

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/bugloper/xpensiv/internal/testutil"
)

// A 1×1 PNG; the service sniffs the bytes, so the file name does not matter.
var tinyPNG, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")

func TestTransactionAttachmentLifecycle(t *testing.T) {
	env := testutil.New(t)
	owner := env.Setup("Owner", "owner@example.com")
	other := env.Register(owner, "Other", "other@example.com")
	acc := owner.CreateAccount("Wallet", "cash", 10000)
	st, res := owner.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 1000, "account_id": acc, "category_id": owner.Category("Eating out"), "transaction_date": "2026-11-05"})
	if st != 201 {
		t.Fatalf("create: %d %v", st, res)
	}
	id := testutil.Data(res)["id"].(string)
	if testutil.Data(res)["has_attachment"] != false {
		t.Fatalf("new transaction should have no attachment: %v", res)
	}

	// Not an image: refused.
	if st, res := owner.Multipart("/transactions/"+id+"/attachment", nil, "file", "notes.txt", []byte("hello")); st != 422 {
		t.Fatalf("text upload: %d %v", st, res)
	}
	// An image sticks, via POST or PUT.
	st, res = owner.MultipartMethod("PUT", "/transactions/"+id+"/attachment", nil, "file", "shot.png", tinyPNG)
	if st != 200 || testutil.Data(res)["has_attachment"] != true {
		t.Fatalf("attach: %d %v", st, res)
	}
	st, body, hdr := owner.Get("/transactions/" + id + "/attachment")
	if st != 200 || hdr.Get("Content-Type") != "image/png" || len(body) != len(tinyPNG) {
		t.Fatalf("download: %d %q %d bytes", st, hdr.Get("Content-Type"), len(body))
	}
	if st, res := owner.Do("GET", "/transactions/"+id, nil); st != 200 || testutil.Data(res)["has_attachment"] != true {
		t.Fatalf("get: %d %v", st, res)
	}
	// Another user sees neither the transaction nor its image.
	if st, _, _ := other.Get("/transactions/" + id + "/attachment"); st != 404 {
		t.Fatalf("other user download: %d", st)
	}
	if st, _ := other.MultipartMethod("PUT", "/transactions/"+id+"/attachment", nil, "file", "x.png", tinyPNG); st != 404 {
		t.Fatalf("other user attach: %d", st)
	}
	// Anonymous: 401.
	if st, _, _ := env.Anon().Get("/transactions/" + id + "/attachment"); st != 401 {
		t.Fatalf("anonymous download: %d", st)
	}

	path := filepath.Join(env.Cfg.AttachmentsDir(), owner.UserID, id)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("file should exist at %s: %v", path, err)
	}
	// Removing clears the record and the file.
	if st, _ := owner.Do("DELETE", "/transactions/"+id+"/attachment", nil); st != 204 {
		t.Fatalf("detach: %d", st)
	}
	if st, _, _ := owner.Get("/transactions/" + id + "/attachment"); st != 404 {
		t.Fatalf("after detach: %d", st)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("file should be gone: %v", err)
	}
	// Deleting the transaction removes a fresh attachment with it.
	if st, _ := owner.MultipartMethod("PUT", "/transactions/"+id+"/attachment", nil, "file", "shot.png", tinyPNG); st != 200 {
		t.Fatalf("re-attach: %d", st)
	}
	if st, _ := owner.Do("DELETE", "/transactions/"+id, nil); st != 204 {
		t.Fatalf("delete transaction: %d", st)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("file should go with the transaction: %v", err)
	}
}

func TestDeleteUserRemovesAttachments(t *testing.T) {
	env := testutil.New(t)
	admin := env.Setup("Owner", "owner@example.com")
	bob := env.Register(admin, "Bob", "bob@example.com")
	acc := bob.CreateAccount("Wallet", "cash", 0)
	_, res := bob.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 5, "account_id": acc, "transaction_date": "2026-11-05"})
	id := testutil.Data(res)["id"].(string)
	if st, _ := bob.MultipartMethod("PUT", "/transactions/"+id+"/attachment", nil, "file", "shot.png", tinyPNG); st != 200 {
		t.Fatalf("attach: %d", st)
	}
	dir := filepath.Join(env.Cfg.AttachmentsDir(), bob.UserID)
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("user attachment dir: %v", err)
	}
	if st, _ := admin.Do("DELETE", "/admin/users/"+bob.UserID, nil); st != 204 {
		t.Fatalf("delete user: %d", st)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("attachment dir should be removed with the user: %v", err)
	}
}
