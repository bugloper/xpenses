-- What users tell Xpenses, and what they say about it.
--
-- feedback: a message from a user's Feedback & support page: general
-- feedback, a feature request, or a support question. The administrator marks
-- it seen and answers it once; the answer shows on the user's page.
--   kind    feedback | feature | support
--   status  new | acknowledged | replied
--
-- testimonials: one per user, written for the public home page. Nothing is
-- shown until the administrator approves it; rewriting it sends it back for
-- review.
--   status  pending | approved | hidden
--
-- Both go with their user (ON DELETE CASCADE); the reviewer is cleared if
-- that administrator is deleted.

CREATE TABLE feedback (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('feedback','feature','support')),
    body            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','replied')),
    reply           TEXT NOT NULL DEFAULT '',
    reviewed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TEXT,
    replied_at      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX idx_feedback_user ON feedback(user_id, created_at);
CREATE INDEX idx_feedback_status ON feedback(status, created_at);

CREATE TABLE testimonials (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden')),
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_testimonials_status ON testimonials(status, reviewed_at);
