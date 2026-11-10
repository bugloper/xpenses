package handlers_test

import (
	"strings"
	"testing"
	"time"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/testutil"
)

func list(res map[string]any) []any {
	d, _ := res["data"].([]any)
	return d
}

func TestFeedbackAndSupport(t *testing.T) {
	env := testutil.New(t)
	admin := env.Setup("Owner", "owner@example.com")
	pema := env.Register(admin, "Pema", "pema@example.com")
	karma := env.Register(admin, "Karma", "karma@example.com")

	// Validation: a known kind and a message.
	if st, _ := pema.Do("POST", "/feedback", map[string]any{"kind": "complaint", "body": "hi"}); st != 422 {
		t.Fatalf("unknown kind: %d", st)
	}
	if st, _ := pema.Do("POST", "/feedback", map[string]any{"kind": "support", "body": "   "}); st != 422 {
		t.Fatalf("blank body: %d", st)
	}
	if st, _ := pema.Do("POST", "/feedback", map[string]any{"kind": "support", "body": strings.Repeat("x", 2001)}); st != 422 {
		t.Fatalf("too long: %d", st)
	}
	st, res := pema.Do("POST", "/feedback", map[string]any{"kind": "support", "body": "  The mPay screenshot was not read.  "})
	if st != 201 || testutil.Data(res)["body"] != "The mPay screenshot was not read." || testutil.Data(res)["status"] != "new" {
		t.Fatalf("send: %d %v", st, res)
	}
	id := testutil.Data(res)["id"].(string)

	// Each user sees only their own messages.
	_, res = pema.Do("GET", "/feedback", nil)
	if msgs := testutil.Data(res)["messages"].([]any); len(msgs) != 1 {
		t.Fatalf("pema's messages: %v", res)
	}
	_, res = karma.Do("GET", "/feedback", nil)
	if msgs := testutil.Data(res)["messages"].([]any); len(msgs) != 0 {
		t.Fatalf("karma sees someone else's message: %v", res)
	}
	// Only the administrator reads the queue and answers.
	if st, _ := pema.Do("GET", "/admin/feedback", nil); st != 403 {
		t.Fatalf("user reads queue: %d", st)
	}
	if st, _ := pema.Do("POST", "/admin/feedback/"+id+"/reply", map[string]any{"reply": "x"}); st != 403 {
		t.Fatalf("user replies: %d", st)
	}
	st, res = admin.Do("GET", "/admin/community", nil)
	if st != 200 || testutil.Data(res)["new_feedback"] != float64(1) {
		t.Fatalf("counts: %d %v", st, res)
	}
	st, res = admin.Do("GET", "/admin/feedback?status=new", nil)
	if st != 200 || len(list(res)) != 1 || list(res)[0].(map[string]any)["from"].(map[string]any)["email"] != "pema@example.com" {
		t.Fatalf("queue: %d %v", st, res)
	}
	if st, _ := admin.Do("POST", "/admin/feedback/"+id+"/acknowledge", nil); st != 204 {
		t.Fatalf("acknowledge: %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/feedback/"+id+"/reply", map[string]any{"reply": " "}); st != 422 {
		t.Fatalf("blank reply: %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/feedback/"+id+"/reply", map[string]any{"reply": "Fixed in today's update."}); st != 204 {
		t.Fatalf("reply: %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/feedback/"+id+"/reply", map[string]any{"reply": "Again"}); st != 409 {
		t.Fatalf("second reply: %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/feedback/nope/acknowledge", nil); st != 404 {
		t.Fatalf("unknown message: %d", st)
	}
	// The answer reaches the sender.
	_, res = pema.Do("GET", "/feedback", nil)
	m := testutil.Data(res)["messages"].([]any)[0].(map[string]any)
	if m["status"] != "replied" || m["reply"] != "Fixed in today's update." || m["acknowledged_at"] == nil || m["replied_at"] == nil {
		t.Fatalf("sender's view: %v", m)
	}

	// A user whose free year has ended can still ask for help, and nothing else.
	yesterday := auth.AccessDate(time.Now().AddDate(0, 0, -1))
	if st, _ := admin.Do("PATCH", "/admin/users/"+karma.UserID, map[string]any{"access_until": yesterday}); st != 200 {
		t.Fatalf("expire: %d", st)
	}
	if st, _ := karma.Do("POST", "/feedback", map[string]any{"kind": "support", "body": "Please extend my access."}); st != 201 {
		t.Fatalf("expired user asks for help: %d", st)
	}
	if st, _ := karma.Do("GET", "/testimonial", nil); st != 403 {
		t.Fatalf("expired user, other routes: %d", st)
	}

	// Messages go with their sender.
	if st, _ := admin.Do("DELETE", "/admin/users/"+pema.UserID, nil); st != 204 {
		t.Fatalf("delete user: %d", st)
	}
	_, res = admin.Do("GET", "/admin/feedback", nil)
	if len(list(res)) != 1 {
		t.Fatalf("deleted user's messages should go: %v", res)
	}
}

func TestTestimonials(t *testing.T) {
	env := testutil.New(t)
	admin := env.Setup("Owner", "owner@example.com")
	pema := env.Register(admin, "Pema Choden", "pema@example.com")
	anon := env.Anon()

	if st, res := pema.Do("GET", "/testimonial", nil); st != 200 || res["data"] != nil {
		t.Fatalf("none yet: %d %v", st, res)
	}
	if st, _ := pema.Do("PUT", "/testimonial", map[string]any{"body": "Great"}); st != 422 {
		t.Fatalf("too short: %d", st)
	}
	if st, _ := pema.Do("PUT", "/testimonial", map[string]any{"body": strings.Repeat("a ", 200)}); st != 422 {
		t.Fatalf("too long: %d", st)
	}
	words := "I share my mBoB screen and   the expense is just there."
	st, res := pema.Do("PUT", "/testimonial", map[string]any{"body": words})
	if st != 200 || testutil.Data(res)["status"] != "pending" || testutil.Data(res)["body"] != "I share my mBoB screen and the expense is just there." {
		t.Fatalf("save: %d %v", st, res)
	}
	id := testutil.Data(res)["id"].(string)

	// Nothing public until approved; the public list needs no session.
	if st, res := anon.Do("GET", "/public/testimonials", nil); st != 200 || len(list(res)) != 0 {
		t.Fatalf("public before approval: %d %v", st, res)
	}
	if st, _ := pema.Do("POST", "/admin/testimonials/"+id+"/approve", nil); st != 403 {
		t.Fatalf("user approves own: %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/testimonials/"+id+"/approve", nil); st != 204 {
		t.Fatalf("approve: %d", st)
	}
	st, res = anon.Do("GET", "/public/testimonials", nil)
	if st != 200 || len(list(res)) != 1 {
		t.Fatalf("public after approval: %d %v", st, res)
	}
	pub := list(res)[0].(map[string]any)
	if pub["name"] != "Pema Choden" || pub["since"] == "" || pub["email"] != nil {
		t.Fatalf("public view exposes the wrong things: %v", pub)
	}

	// Rewriting sends it back for review and off the home page.
	if st, _ := pema.Do("PUT", "/testimonial", map[string]any{"body": "Now I can see where every ngultrum went."}); st != 200 {
		t.Fatalf("rewrite: %d", st)
	}
	if _, res := anon.Do("GET", "/public/testimonials", nil); len(list(res)) != 0 {
		t.Fatalf("rewritten one still public: %v", res)
	}
	_, res = admin.Do("GET", "/admin/testimonials?status=pending", nil)
	if len(list(res)) != 1 {
		t.Fatalf("back in the queue: %v", res)
	}
	if st, _ := admin.Do("POST", "/admin/testimonials/"+id+"/hide", nil); st != 204 {
		t.Fatalf("hide: %d", st)
	}
	if st, _ := admin.Do("GET", "/admin/testimonials?status=bogus", nil); st != 422 {
		t.Fatalf("bad filter: %d", st)
	}
	// The writer can take it down.
	if st, _ := pema.Do("DELETE", "/testimonial", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if _, res := admin.Do("GET", "/admin/testimonials", nil); len(list(res)) != 0 {
		t.Fatalf("deleted one still listed: %v", res)
	}
}
