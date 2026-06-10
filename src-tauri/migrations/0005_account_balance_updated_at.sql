ALTER TABLE accounts ADD COLUMN balance_updated_at TEXT;
UPDATE accounts SET balance_updated_at = datetime('now') WHERE balance_updated_at IS NULL;
