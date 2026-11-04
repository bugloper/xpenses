-- The bank statement import and reconciliation feature was removed.
-- Drop its tables and the column that linked transactions to bank lines.
DROP INDEX IF EXISTS idx_reconciliations_transaction;
DROP TABLE IF EXISTS reconciliations;
DROP INDEX IF EXISTS idx_bank_transactions_statement;
DROP INDEX IF EXISTS idx_bank_transactions_account_date;
DROP TABLE IF EXISTS bank_transactions;
DROP INDEX IF EXISTS idx_bank_statements_account;
DROP INDEX IF EXISTS idx_bank_statements_sha;
DROP TABLE IF EXISTS bank_statements;
ALTER TABLE transactions DROP COLUMN source_bank_transaction_id;
DELETE FROM settings WHERE key = 'reconciliation.date_tolerance_days';
