CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  account_id INTEGER REFERENCES accounts(id),
  interval TEXT NOT NULL CHECK (interval IN ('monthly','quarterly','yearly')),
  anchor_date TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  due_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (subscription_id, due_date)
);
