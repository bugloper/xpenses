package handlers_test

import (
	"fmt"
	"sync"
	"testing"

	"github.com/bugloper/xpenses/internal/testutil"
)

// The financial meaning of each kind of transaction: what it does to account
// balances, to income and expense reports, to what is owed on loans and to
// savings goals.

const month = "from=2026-11-01&to=2026-11-30"

type flows struct{ income, expenses int64 }

func summary(t *testing.T, c *testutil.Client) flows {
	t.Helper()
	st, res := c.Do("GET", "/reports/summary?"+month, nil)
	if st != 200 {
		t.Fatalf("summary: %d %v", st, res)
	}
	d := testutil.Data(res)
	return flows{int64(d["income"].(float64)), int64(d["expenses"].(float64))}
}

func create(t *testing.T, c *testutil.Client, body map[string]any) map[string]any {
	t.Helper()
	if body["transaction_date"] == nil {
		body["transaction_date"] = "2026-11-05"
	}
	st, res := c.Do("POST", "/transactions", body)
	if st != 201 {
		t.Fatalf("create %v: %d %v", body, st, res)
	}
	return testutil.Data(res)
}

func loan(t *testing.T, c *testutil.Client, id string) map[string]any {
	t.Helper()
	st, res := c.Do("GET", "/loans/"+id, nil)
	if st != 200 {
		t.Fatalf("loan: %d %v", st, res)
	}
	return testutil.Data(res)
}

func amt(m map[string]any, k string) int64 { return int64(m[k].(float64)) }

func TestIncomeExpenseAndTransferSemantics(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 100000)
	savings := c.CreateAccount("Savings", "savings", 0)

	create(t, c, map[string]any{"type": "income", "amount": 50000, "account_id": bank, "category_id": c.Category("Salary")})
	create(t, c, map[string]any{"type": "expense", "amount": 8000, "account_id": bank, "category_id": c.Category("Groceries")})
	create(t, c, map[string]any{"type": "transfer", "amount": 20000, "account_id": bank, "transfer_account_id": savings})

	if got := c.Balance(bank); got != 100000+50000-8000-20000 {
		t.Fatalf("bank: %d", got)
	}
	if got := c.Balance(savings); got != 20000 {
		t.Fatalf("savings: %d", got)
	}
	// The transfer into savings is neither income nor expense.
	if got := summary(t, c); got != (flows{50000, 8000}) {
		t.Fatalf("flows: %+v", got)
	}
}

func TestRefundReducesSpendingInItsCategory(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 0)
	groceries := c.Category("Groceries")
	create(t, c, map[string]any{"type": "expense", "amount": 5000, "account_id": bank, "category_id": groceries})
	create(t, c, map[string]any{"type": "refund", "amount": 1200, "account_id": bank, "category_id": groceries})

	if got := c.Balance(bank); got != -5000+1200 {
		t.Fatalf("balance: %d", got)
	}
	if got := summary(t, c); got != (flows{0, 3800}) {
		t.Fatalf("a refund is not income; it comes off spending: %+v", got)
	}
	st, res := c.Do("GET", "/reports/categories?type=expense&"+month, nil)
	rows := testutil.List(res)
	if st != 200 || len(rows) != 1 || amt(rows[0].(map[string]any), "amount") != 3800 {
		t.Fatalf("groceries net of the refund: %d %v", st, res)
	}
	if st, res := c.Do("POST", "/budgets", map[string]any{"category_id": groceries, "amount": 10000}); st != 201 {
		t.Fatalf("budget: %d %v", st, res)
	}
	st, res = c.Do("GET", "/reports/budgets?month=2026-11", nil)
	if st != 200 || amt(testutil.List(res)[0].(map[string]any), "spent") != 3800 {
		t.Fatalf("budget spend net of the refund: %d %v", st, res)
	}
}

func TestLoanGivenAndRepaymentsReceived(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 100000)
	cash := c.CreateAccount("Cash", "cash", 0)

	// Lend 10,000: cash goes out, a receivable comes in, nothing is spent.
	lent := create(t, c, map[string]any{"type": "loan_given", "amount": 10000, "account_id": bank,
		"new_loan": map[string]any{"counterparty": "Ugyen Dorji", "due_date": "2026-12-31"}})
	id := lent["loan_id"].(string)
	if lent["loan_counterparty"] != "Ugyen Dorji" {
		t.Fatalf("transaction should name the loan: %v", lent)
	}
	l := loan(t, c, id)
	if l["direction"] != "given" || amt(l, "principal") != 10000 || amt(l, "outstanding") != 10000 || l["status"] != "open" || l["due_date"] != "2026-12-31" {
		t.Fatalf("new loan: %v", l)
	}
	if got := c.Balance(bank); got != 90000 {
		t.Fatalf("bank after lending: %d", got)
	}

	// Partly repaid into cash, with 300 interest: the principal is not income,
	// the interest is, and it is kept apart on the loan.
	create(t, c, map[string]any{"type": "loan_repayment_received", "amount": 4000, "account_id": cash, "loan_id": id, "interest": 300})
	l = loan(t, c, id)
	if amt(l, "repaid") != 4000 || amt(l, "outstanding") != 6000 || amt(l, "interest") != 300 || l["status"] != "open" {
		t.Fatalf("after partial repayment: %v", l)
	}
	if got := c.Balance(cash); got != 4300 {
		t.Fatalf("cash gets principal and interest: %d", got)
	}
	if got := summary(t, c); got != (flows{300, 0}) {
		t.Fatalf("only the interest is income: %+v", got)
	}
	st, res := c.Do("GET", "/transactions?loan_id="+id, nil)
	if st != 200 || len(testutil.List(res)) != 3 {
		t.Fatalf("loan history has the loan, the repayment and the interest: %d %v", st, res)
	}

	// More than is owed is refused; the rest settles it.
	if st, res := c.Do("POST", "/transactions", map[string]any{"type": "loan_repayment_received", "amount": 6001, "account_id": cash, "loan_id": id, "transaction_date": "2026-11-06"}); st != 422 {
		t.Fatalf("overpayment: %d %v", st, res)
	}
	last := create(t, c, map[string]any{"type": "loan_repayment_received", "amount": 6000, "account_id": cash, "loan_id": id})
	if l = loan(t, c, id); amt(l, "outstanding") != 0 || l["status"] != "settled" {
		t.Fatalf("settled: %v", l)
	}

	// Editing and deleting reverse their effects.
	if st, res := c.Do("PATCH", "/transactions/"+last["id"].(string), map[string]any{"amount": 5000}); st != 200 {
		t.Fatalf("edit repayment: %d %v", st, res)
	}
	if l = loan(t, c, id); amt(l, "outstanding") != 1000 || l["status"] != "open" {
		t.Fatalf("after edit: %v", l)
	}
	if st, _ := c.Do("DELETE", "/transactions/"+last["id"].(string), nil); st != 204 {
		t.Fatalf("delete repayment: %d", st)
	}
	if l = loan(t, c, id); amt(l, "outstanding") != 6000 {
		t.Fatalf("after delete: %v", l)
	}
	if got := c.Balance(cash); got != 4300 {
		t.Fatalf("cash after delete: %d", got)
	}

	// A loan given cannot be repaid as if it were borrowed, and a loan with
	// transactions cannot be deleted.
	if st, _ := c.Do("POST", "/transactions", map[string]any{"type": "loan_repayment", "amount": 100, "account_id": bank, "loan_id": id, "transaction_date": "2026-11-06"}); st != 422 {
		t.Fatalf("wrong direction: %d", st)
	}
	if st, _ := c.Do("DELETE", "/loans/"+id, nil); st != 409 {
		t.Fatalf("delete loan with history: %d", st)
	}
}

func TestLoanReceivedAndRepaid(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 0)

	// Borrow 30,000: cash and the liability both go up; it is not income.
	b := create(t, c, map[string]any{"type": "loan_received", "amount": 30000, "account_id": bank,
		"new_loan": map[string]any{"counterparty": "Dorji Khandu"}})
	id := b["loan_id"].(string)
	if got := c.Balance(bank); got != 30000 {
		t.Fatalf("bank after borrowing: %d", got)
	}
	if got := summary(t, c); got != (flows{0, 0}) {
		t.Fatalf("borrowing is not income: %+v", got)
	}

	// Repay 10,000 with 500 interest: the principal is not spending, the
	// interest is, under the default Interest payments category.
	create(t, c, map[string]any{"type": "loan_repayment", "amount": 10000, "account_id": bank, "loan_id": id, "interest": 500})
	l := loan(t, c, id)
	if amt(l, "outstanding") != 20000 || amt(l, "interest") != 500 {
		t.Fatalf("after repayment: %v", l)
	}
	if got := c.Balance(bank); got != 30000-10500 {
		t.Fatalf("bank pays principal and interest: %d", got)
	}
	if got := summary(t, c); got != (flows{0, 500}) {
		t.Fatalf("only the interest is an expense: %+v", got)
	}
	st, res := c.Do("GET", "/reports/categories?type=expense&"+month, nil)
	rows := testutil.List(res)
	if st != 200 || len(rows) != 1 || rows[0].(map[string]any)["name"] != "Interest payments" {
		t.Fatalf("interest category: %d %v", st, res)
	}

	// Accounts report explains the balance with loans in and out.
	st, res = c.Do("GET", "/reports/accounts?"+month, nil)
	row := testutil.List(res)[0].(map[string]any)
	if st != 200 || amt(row, "loans_in") != 30000 || amt(row, "loans_out") != 10000 || amt(row, "expenses") != 500 {
		t.Fatalf("accounts report: %d %v", st, res)
	}

	// Interest only goes with a repayment.
	if st, _ := c.Do("POST", "/transactions", map[string]any{"type": "loan_received", "amount": 100, "account_id": bank, "loan_id": id, "interest": 5, "transaction_date": "2026-11-06"}); st != 422 {
		t.Fatalf("interest on borrowing: %d", st)
	}
	// Turning a repayment into an expense takes it off the loan.
	rep := testutil.List(func() map[string]any { _, r := c.Do("GET", "/transactions?type=loan_repayment", nil); return r }())[0].(map[string]any)
	if st, res := c.Do("PATCH", "/transactions/"+rep["id"].(string), map[string]any{"type": "expense"}); st != 200 || testutil.Data(res)["loan_id"] != nil {
		t.Fatalf("repayment to expense: %d %v", st, res)
	}
	if l = loan(t, c, id); amt(l, "outstanding") != 30000 {
		t.Fatalf("after retyping: %v", l)
	}
}

func TestLoanRecordedWithWhatWasAlreadyOwed(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	other := env.Register(c, "Other", "other@example.com")
	bank := c.CreateAccount("Bank", "bank", 50000)

	// A loan taken before using the app: what is owed today, no money moves.
	st, res := c.Do("POST", "/loans", map[string]any{"direction": "received", "counterparty": "Bank of Bhutan", "opening_amount": 900000, "start_date": "2024-01-01"})
	if st != 201 {
		t.Fatalf("create loan: %d %v", st, res)
	}
	id := testutil.Data(res)["id"].(string)
	if got := c.Balance(bank); got != 50000 {
		t.Fatalf("recording an old loan moves no money: %d", got)
	}
	create(t, c, map[string]any{"type": "loan_repayment", "amount": 24648, "account_id": bank, "loan_id": id})
	if l := loan(t, c, id); amt(l, "outstanding") != 900000-24648 {
		t.Fatalf("outstanding: %v", l)
	}
	// The opening amount cannot drop below what was repaid.
	if st, _ := c.Do("PATCH", "/loans/"+id, map[string]any{"opening_amount": 20000}); st != 422 {
		t.Fatalf("opening below repaid: %d", st)
	}
	if st, res := c.Do("PATCH", "/loans/"+id, map[string]any{"opening_amount": 800000, "counterparty": "BoB"}); st != 200 || amt(testutil.Data(res), "outstanding") != 800000-24648 {
		t.Fatalf("edit opening: %d %v", st, res)
	}
	// Other users can neither see nor use it.
	if st, _ := other.Do("GET", "/loans/"+id, nil); st != 404 {
		t.Fatalf("other user sees the loan: %d", st)
	}
	obank := other.CreateAccount("Theirs", "bank", 0)
	if st, _ := other.Do("POST", "/transactions", map[string]any{"type": "loan_repayment", "amount": 1, "account_id": obank, "loan_id": id, "transaction_date": "2026-11-05"}); st != 422 {
		t.Fatalf("other user repays someone else's loan: %d", st)
	}
	if st, res := other.Do("GET", "/loans", nil); st != 200 || len(testutil.List(res)) != 0 {
		t.Fatalf("other user's loan list: %d %v", st, res)
	}
	// An empty loan can be deleted.
	st, res = c.Do("POST", "/loans", map[string]any{"direction": "given", "counterparty": "Pema", "opening_amount": 500})
	if st != 201 {
		t.Fatalf("second loan: %d %v", st, res)
	}
	if st, _ := c.Do("DELETE", "/loans/"+testutil.Data(res)["id"].(string), nil); st != 204 {
		t.Fatalf("delete empty loan: %d", st)
	}
}

func TestSavingsGoals(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 100000)
	savings := c.CreateAccount("Savings", "savings", 0)

	st, res := c.Do("POST", "/savings-goals", map[string]any{"name": "New phone", "target_amount": 40000, "target_date": "2027-03-01", "account_id": savings})
	if st != 201 {
		t.Fatalf("create goal: %d %v", st, res)
	}
	goal := testutil.Data(res)
	id := goal["id"].(string)

	// Setting money aside within the same account moves no money.
	st, res = c.Do("POST", "/savings-goals/"+id+"/entries", map[string]any{"amount": 10000, "entry_date": "2026-11-05"})
	if st != 201 || amt(testutil.Data(res), "saved") != 10000 || testutil.Data(res)["pct"] != 25.0 {
		t.Fatalf("allocate: %d %v", st, res)
	}
	if c.Balance(bank) != 100000 || c.Balance(savings) != 0 {
		t.Fatal("an allocation changed a balance")
	}
	// A contribution that also moves the money: a transfer, not an expense.
	st, res = c.Do("POST", "/savings-goals/"+id+"/entries", map[string]any{"amount": 30000, "entry_date": "2026-11-06", "from_account_id": bank})
	if st != 201 {
		t.Fatalf("contribute with transfer: %d %v", st, res)
	}
	g := testutil.Data(res)
	if amt(g, "saved") != 40000 || g["reached"] != true || g["pct"] != 100.0 {
		t.Fatalf("goal reached: %v", g)
	}
	if c.Balance(bank) != 70000 || c.Balance(savings) != 30000 {
		t.Fatalf("transfer balances: %d %d", c.Balance(bank), c.Balance(savings))
	}
	if got := summary(t, c); got != (flows{0, 0}) {
		t.Fatalf("saving is not spending: %+v", got)
	}

	// Withdrawing more than the goal holds is refused; withdrawing back to the
	// bank moves the money back.
	if st, _ := c.Do("POST", "/savings-goals/"+id+"/entries", map[string]any{"amount": -40001}); st != 422 {
		t.Fatalf("over-withdrawal: %d", st)
	}
	st, res = c.Do("POST", "/savings-goals/"+id+"/entries", map[string]any{"amount": -5000, "to_account_id": bank})
	if st != 201 || amt(testutil.Data(res), "saved") != 35000 || c.Balance(bank) != 75000 {
		t.Fatalf("withdraw: %d %v", st, res)
	}

	// Removing the contribution reverses its transfer too.
	entries := testutil.Data(res)["entries"].([]any)
	var moved string
	for _, e := range entries {
		if m := e.(map[string]any); amt(m, "amount") == 30000 {
			moved = m["id"].(string)
		}
	}
	if st, _ := c.Do("DELETE", "/savings-goals/"+id+"/entries/"+moved, nil); st != 200 {
		t.Fatalf("remove contribution: %d", st)
	}
	if c.Balance(bank) != 105000 || c.Balance(savings) != -5000 {
		t.Fatalf("after removing the contribution: %d %d", c.Balance(bank), c.Balance(savings))
	}
	// Removing the first allocation would leave the goal below nothing.
	var first string
	st, res = c.Do("GET", "/savings-goals/"+id, nil)
	for _, e := range testutil.Data(res)["entries"].([]any) {
		if m := e.(map[string]any); amt(m, "amount") == 10000 {
			first = m["id"].(string)
		}
	}
	if st, _ := c.Do("DELETE", "/savings-goals/"+id+"/entries/"+first, nil); st != 409 {
		t.Fatalf("remove allocation spent by a withdrawal: %d", st)
	}
	// A goal with no account cannot move money.
	st, res = c.Do("POST", "/savings-goals", map[string]any{"name": "Trip", "target_amount": 1000})
	trip := testutil.Data(res)["id"].(string)
	if st, _ := c.Do("POST", "/savings-goals/"+trip+"/entries", map[string]any{"amount": 100, "from_account_id": bank}); st != 422 {
		t.Fatalf("move without an account: %d", st)
	}
	if st, _ := c.Do("POST", "/savings-goals", map[string]any{"name": "Trip", "target_amount": 1}); st != 422 {
		t.Fatalf("duplicate name: %d", st)
	}
}

// Many repayments at once never pay a loan below zero: each one is checked
// against what is owed inside its own write transaction.
func TestConcurrentRepaymentsStayConsistent(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	bank := c.CreateAccount("Bank", "bank", 0)
	id := create(t, c, map[string]any{"type": "loan_given", "amount": 1000, "account_id": bank,
		"new_loan": map[string]any{"counterparty": "Karma"}})["loan_id"].(string)

	var wg sync.WaitGroup
	codes := make([]int, 20)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i], _ = c.Do("POST", "/transactions", map[string]any{"type": "loan_repayment_received", "amount": 100,
				"account_id": bank, "loan_id": id, "transaction_date": "2026-11-05", "client_id": fmt.Sprintf("00000000-0000-4000-8000-%012d", i)})
		}(i)
	}
	wg.Wait()
	ok := 0
	for _, code := range codes {
		if code == 201 {
			ok++
		}
	}
	if l := loan(t, c, id); ok != 10 || amt(l, "outstanding") != 0 || amt(l, "repaid") != 1000 {
		t.Fatalf("%d repayments accepted, loan %v", ok, l)
	}
	if got := c.Balance(bank); got != 0 {
		t.Fatalf("balance: %d", got)
	}
}

func TestLoanAndSavingsActivityReports(t *testing.T) {
	env := testutil.New(t)
	c := env.Setup("Owner", "owner@example.com")
	other := env.Register(c, "Other", "other@example.com")
	bank := c.CreateAccount("Bank", "bank", 100000)
	id := create(t, c, map[string]any{"type": "loan_given", "amount": 5000, "account_id": bank, "transaction_date": "2026-10-20",
		"new_loan": map[string]any{"counterparty": "Pema"}})["loan_id"].(string)
	create(t, c, map[string]any{"type": "loan_repayment_received", "amount": 2000, "account_id": bank, "loan_id": id, "interest": 100, "transaction_date": "2026-11-03"})
	st, res := c.Do("POST", "/savings-goals", map[string]any{"name": "Trip", "target_amount": 9000})
	goal := testutil.Data(res)["id"].(string)
	c.Do("POST", "/savings-goals/"+goal+"/entries", map[string]any{"amount": 3000, "entry_date": "2026-10-02"})
	c.Do("POST", "/savings-goals/"+goal+"/entries", map[string]any{"amount": -1000, "entry_date": "2026-11-09"})

	st, res = c.Do("GET", "/reports/loans?from=2026-10-01&to=2026-11-30", nil)
	rows := testutil.List(res)
	if st != 200 || len(rows) != 2 {
		t.Fatalf("loans report: %d %v", st, res)
	}
	oct, nov := rows[0].(map[string]any), rows[1].(map[string]any)
	if amt(oct, "lent") != 5000 || amt(nov, "repaid_to_you") != 2000 || amt(nov, "interest_earned") != 100 || amt(oct, "repaid_to_you") != 0 {
		t.Fatalf("loan months: %v %v", oct, nov)
	}
	st, res = c.Do("GET", "/reports/savings?from=2026-10-01&to=2026-11-30", nil)
	rows = testutil.List(res)
	if st != 200 || amt(rows[0].(map[string]any), "added") != 3000 || amt(rows[1].(map[string]any), "taken") != 1000 {
		t.Fatalf("savings report: %d %v", st, res)
	}
	// Scoped to the user.
	_, res = other.Do("GET", "/reports/loans?from=2026-10-01&to=2026-11-30", nil)
	for _, r := range testutil.List(res) {
		if amt(r.(map[string]any), "lent") != 0 {
			t.Fatal("other user sees loan activity")
		}
	}
}
