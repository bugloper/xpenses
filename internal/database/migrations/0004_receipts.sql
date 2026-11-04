-- Details read from a payment app's success screen (OCR of the attached
-- screenshot), kept beside the transaction. Empty strings when unknown.
ALTER TABLE transactions ADD COLUMN receipt_bank TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN receipt_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN receipt_payment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN receipt_date TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN receipt_time TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_transactions_receipt_reference ON transactions(user_id, receipt_reference);
