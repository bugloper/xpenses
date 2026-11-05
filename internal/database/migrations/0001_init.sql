-- Xpenses initial schema. Every data table carries user_id: data is isolated per user.
-- Money is stored as INTEGER minor units (e.g. chhertum for BTN). Never REAL.
-- Timestamps (created_at/updated_at) are UTC RFC3339 strings.
-- Financial dates (transaction_date, period_start, ...) are local calendar dates: 'YYYY-MM-DD'.

CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,          -- stored lower-cased
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,                 -- argon2id PHC string
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    last_login_at TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,               -- sha256(token) hex; the token itself is never stored
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL,                  -- absolute lifetime
    user_agent   TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key          TEXT NOT NULL,                  -- 'email:<email>' or 'ip:<ip>'
    attempted_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_key ON login_attempts(key, attempted_at);

CREATE TABLE invites (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used_at     TEXT,
    used_by     TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Instance-wide settings managed by the admin (per-user settings live in `settings`).
CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
INSERT INTO app_settings (key, value, updated_at) VALUES ('registration_open', '0', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

CREATE TABLE accounts (
    id                   TEXT PRIMARY KEY,
    user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    type                 TEXT NOT NULL CHECK (type IN ('bank','cash','mobile_wallet','credit_card','savings')),
    currency             TEXT NOT NULL DEFAULT 'BTN',
    opening_balance      INTEGER NOT NULL DEFAULT 0,
    opening_balance_date TEXT NOT NULL,
    account_number       TEXT NOT NULL DEFAULT '',
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE TABLE categories (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'circle',
    color      TEXT NOT NULL DEFAULT '#64748b',
    type       TEXT NOT NULL CHECK (type IN ('expense','income')),
    parent_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
    is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    is_system  INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, name, type)
);
CREATE INDEX idx_categories_user ON categories(user_id);

CREATE TABLE recurring_transactions (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
    amount              INTEGER NOT NULL CHECK (amount > 0),
    currency            TEXT NOT NULL DEFAULT 'BTN',
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    transfer_account_id TEXT REFERENCES accounts(id),
    category_id         TEXT REFERENCES categories(id),
    description         TEXT NOT NULL DEFAULT '',
    payee               TEXT NOT NULL DEFAULT '',
    frequency           TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
    interval            INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
    start_date          TEXT NOT NULL,
    end_date            TEXT,
    next_run_date       TEXT NOT NULL,
    -- 'cleared' creates real transactions automatically; 'pending' creates drafts to confirm.
    generate_as         TEXT NOT NULL DEFAULT 'pending' CHECK (generate_as IN ('cleared','pending')),
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE transactions (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT NOT NULL CHECK (type IN ('expense','income','transfer','refund','adjustment')),
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
    -- Set when this transaction was created from an imported bank transaction.
    source_bank_transaction_id TEXT,
    client_id           TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    CHECK (type = 'adjustment' OR amount > 0),
    CHECK (type <> 'transfer' OR (transfer_account_id IS NOT NULL AND transfer_account_id <> account_id))
);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_account ON transactions(account_id, transaction_date);
CREATE INDEX idx_transactions_transfer_account ON transactions(transfer_account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_type_status ON transactions(type, status);
-- Prevents the recurring generator from creating the same occurrence twice.
CREATE UNIQUE INDEX idx_transactions_recurring_once ON transactions(recurring_id, transaction_date) WHERE recurring_id IS NOT NULL;
-- Offline clients send a client-generated id so retried syncs are idempotent.
CREATE UNIQUE INDEX idx_transactions_client_id ON transactions(user_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE tags (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    UNIQUE (user_id, name)
);

CREATE TABLE transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE bank_statements (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    account_id        TEXT NOT NULL REFERENCES accounts(id),
    file_name         TEXT NOT NULL,
    file_sha256       TEXT NOT NULL,
    file_size         INTEGER NOT NULL,
    account_number    TEXT NOT NULL DEFAULT '',
    account_holder    TEXT NOT NULL DEFAULT '',
    period_start      TEXT NOT NULL,
    period_end        TEXT NOT NULL,
    opening_balance   INTEGER,
    closing_balance   INTEGER,
    total_debits      INTEGER NOT NULL DEFAULT 0,
    total_credits     INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    balance_verified  INTEGER NOT NULL DEFAULT 0 CHECK (balance_verified IN (0,1)),
    notes             TEXT NOT NULL DEFAULT '',
    imported_at       TEXT NOT NULL
);
CREATE INDEX idx_bank_statements_account ON bank_statements(account_id, period_start);
-- Not unique: the import endpoint rejects an identical file unless the user forces it.
CREATE INDEX idx_bank_statements_sha ON bank_statements(file_sha256);

CREATE TABLE bank_transactions (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    statement_id     TEXT NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    account_id       TEXT NOT NULL REFERENCES accounts(id),
    line_no          INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,
    value_date       TEXT,
    description      TEXT NOT NULL DEFAULT '',
    reference        TEXT NOT NULL DEFAULT '',
    debit            INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit           INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
    balance          INTEGER,
    fingerprint      TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    CHECK (debit = 0 OR credit = 0),
    UNIQUE (account_id, fingerprint)
);
CREATE INDEX idx_bank_transactions_statement ON bank_transactions(statement_id, line_no);
CREATE INDEX idx_bank_transactions_account_date ON bank_transactions(account_id, transaction_date);

CREATE TABLE reconciliations (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_transaction_id TEXT NOT NULL UNIQUE REFERENCES bank_transactions(id) ON DELETE CASCADE,
    transaction_id      TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    status              TEXT NOT NULL CHECK (status IN ('matched','ignored','transfer')),
    match_type          TEXT NOT NULL CHECK (match_type IN ('auto','manual')),
    rule                TEXT NOT NULL DEFAULT '',
    confidence          INTEGER NOT NULL DEFAULT 0,
    amount_diff         INTEGER NOT NULL DEFAULT 0,
    date_diff_days      INTEGER NOT NULL DEFAULT 0,
    note                TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL,
    CHECK (status <> 'matched' OR transaction_id IS NOT NULL)
);
-- A manual transaction may be matched to at most one bank transaction.
CREATE UNIQUE INDEX idx_reconciliations_transaction ON reconciliations(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE budgets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL CHECK (amount >= 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Per-user settings; defaults are applied in code when a key is absent.
CREATE TABLE settings (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
