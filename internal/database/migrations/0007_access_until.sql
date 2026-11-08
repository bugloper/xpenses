-- Every user may use Xpenses free for a year from sign-up; after that the
-- administrator extends their access by hand (there is no payment system).
-- access_until is a date (YYYY-MM-DD); the last day is still allowed.
-- Administrators are never cut off. Existing users get a year from the day
-- they signed up.
ALTER TABLE users ADD COLUMN access_until TEXT NOT NULL DEFAULT '';
UPDATE users SET access_until = date(created_at, '+1 year');
