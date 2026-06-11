-- no-transaction
PRAGMA foreign_keys=OFF;

CREATE TABLE subscriptions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  account_id INTEGER REFERENCES accounts(id),
  interval TEXT NOT NULL CHECK (interval IN ('monthly','biweekly','quarterly','yearly')),
  anchor_date TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notify INTEGER NOT NULL DEFAULT 1
);

INSERT INTO subscriptions_new (
  id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, created_at, notify
)
SELECT
  id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, created_at, notify
FROM subscriptions;

DROP TABLE subscriptions;

ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE TABLE incomes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  account_id INTEGER REFERENCES accounts(id),
  interval TEXT NOT NULL CHECK (interval IN ('monthly','biweekly','quarterly','yearly')),
  anchor_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  one_time INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO incomes_new (
  id, name, amount_cents, currency, account_id, interval, anchor_date, active, one_time, created_at
)
SELECT
  id, name, amount_cents, currency, account_id, interval, anchor_date, active, 0, created_at
FROM incomes;

DROP TABLE incomes;

ALTER TABLE incomes_new RENAME TO incomes;

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
