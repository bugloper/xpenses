-- The free year used to be stamped from the UTC date of sign-up. Bhutan is
-- six hours ahead (no daylight saving), so anyone who signed up between
-- midnight and 6 am Bhutan time got an end date one day short. Move those
-- dates to a year from the Bhutan date of sign-up, but only where the date is
-- still the one sign-up (or migration 0007) stamped: a date the administrator
-- has set since is left alone. created_at is RFC 3339 in UTC.
UPDATE users
SET access_until = date(created_at, '+6 hours', '+1 year')
WHERE access_until = date(created_at, '+1 year')
  AND date(created_at, '+6 hours') <> date(created_at);
