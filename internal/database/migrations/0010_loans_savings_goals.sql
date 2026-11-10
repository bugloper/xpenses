-- migrate: foreign keys off
-- Loans and savings goals.
--
-- loans: money lent to someone ('given': they owe the user) or borrowed from
-- someone ('received': the user owes them). What is owed is never stored: it
-- is opening_amount (owed before the loan was recorded here, no money moved
-- in the app) plus the cleared loan_given/loan_received transactions, less
-- the cleared repayments.
CREATE TABLE loans (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction      TEXT NOT NULL CHECK (direction IN ('given','received')),
    counterparty   TEXT NOT NULL,
    opening_amount INTEGER NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
    currency       TEXT NOT NULL DEFAULT 'BTN',
    start_date     TEXT NOT NULL,
    due_date       TEXT,
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_loans_user ON loans(user_id, direction);

-- transactions gains four loan types and loan_id. Lending, borrowing and
-- repaying move money between an account and a loan: they change account
-- balances but are never income or expense. Interest on a loan is an
-- ordinary expense or income row that may carry the loan's id. SQLite cannot
-- change a CHECK constraint in place, so the table is rebuilt (same rows,
-- same ids; transaction_tags keeps pointing at it by name).
CREATE TABLE transactions_new (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT NOT NULL CHECK (type IN ('expense','income','transfer','refund','adjustment',
                            'loan_given','loan_received','loan_repayment','loan_repayment_received')),
    -- Positive for every type except 'adjustment', which is signed (negative reduces the balance).
    amount              INTEGER NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'BTN',
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    -- Destination account for transfers (money leaves account_id and arrives here).
    transfer_account_id TEXT REFERENCES accounts(id),
    category_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
    description         TEXT NOT NULL DEFAULT '',
    payee               TEXT NOT NULL DEFAULT '',
    transaction_date    TEXT NOT NULL,
    notes               TEXT NOT NULL DEFAULT '',
    origin              TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','imported','adjustment')),
    status              TEXT NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared','pending','void')),
    recurring_id        TEXT REFERENCES recurring_transactions(id) ON DELETE SET NULL,
    client_id           TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    attachment_mime      TEXT NOT NULL DEFAULT '',
    receipt_bank         TEXT NOT NULL DEFAULT '',
    receipt_reference    TEXT NOT NULL DEFAULT '',
    receipt_payment_type TEXT NOT NULL DEFAULT '',
    receipt_date         TEXT NOT NULL DEFAULT '',
    receipt_time         TEXT NOT NULL DEFAULT '',
    -- The loan this lends, borrows or repays (required for the loan types), or
    -- the loan an interest expense/income belongs to.
    loan_id             TEXT REFERENCES loans(id),
    CHECK (type = 'adjustment' OR amount > 0),
    CHECK (type <> 'transfer' OR (transfer_account_id IS NOT NULL AND transfer_account_id <> account_id)),
    CHECK (type NOT IN ('loan_given','loan_received','loan_repayment','loan_repayment_received') OR loan_id IS NOT NULL)
);
INSERT INTO transactions_new (id, user_id, type, amount, currency, account_id, transfer_account_id, category_id,
    description, payee, transaction_date, notes, origin, status, recurring_id, client_id, created_at, updated_at,
    attachment_mime, receipt_bank, receipt_reference, receipt_payment_type, receipt_date, receipt_time)
SELECT id, user_id, type, amount, currency, account_id, transfer_account_id, category_id,
    description, payee, transaction_date, notes, origin, status, recurring_id, client_id, created_at, updated_at,
    attachment_mime, receipt_bank, receipt_reference, receipt_payment_type, receipt_date, receipt_time
FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_account ON transactions(account_id, transaction_date);
CREATE INDEX idx_transactions_transfer_account ON transactions(transfer_account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_type_status ON transactions(type, status);
CREATE UNIQUE INDEX idx_transactions_recurring_once ON transactions(recurring_id, transaction_date) WHERE recurring_id IS NOT NULL;
CREATE UNIQUE INDEX idx_transactions_client_id ON transactions(user_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_transactions_receipt_reference ON transactions(user_id, receipt_reference);
CREATE INDEX idx_transactions_loan ON transactions(loan_id) WHERE loan_id IS NOT NULL;

-- savings_goals: money set aside for something. A goal holds allocations,
-- not money: contributing to it never changes an account balance or counts
-- as an expense. account_id names where the money is kept, when the user
-- says; a contribution can then also move money there by a transfer.
CREATE TABLE savings_goals (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    target_amount INTEGER NOT NULL CHECK (target_amount > 0),
    target_date   TEXT,
    account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE (user_id, name)
);

-- One contribution (positive) or withdrawal (negative). transaction_id is the
-- transfer that moved the money, when the contribution moved any.
CREATE TABLE savings_goal_entries (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id        TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    amount         INTEGER NOT NULL CHECK (amount <> 0),
    entry_date     TEXT NOT NULL,
    note           TEXT NOT NULL DEFAULT '',
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_savings_goal_entries_goal ON savings_goal_entries(goal_id, entry_date);
