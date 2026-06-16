-- no-transaction
-- Variable Intervalle (Backlog): neue Kadenzen 'weekly', 'bimonthly' (alle 2 Monate),
-- 'semiannual' (halbjährlich). SQLite kann CHECK-Constraints nicht per ALTER ändern,
-- daher werden subscriptions + incomes nach dem 0007-Muster neu aufgebaut. Die in 0008
-- ergänzten cancel_*-Spalten müssen dabei erhalten bleiben.
-- WICHTIG: '-- no-transaction' MUSS die erste Zeile sein, sonst läuft die Migration in
-- einer Transaktion und 'PRAGMA foreign_keys=OFF' bleibt wirkungslos (-> FK-Fehler 787
-- beim DROP/RENAME, weil reminders/subscription_price_history auf subscriptions zeigen).
PRAGMA foreign_keys=OFF;

CREATE TABLE subscriptions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  account_id INTEGER REFERENCES accounts(id),
  interval TEXT NOT NULL CHECK (interval IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly')),
  anchor_date TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notify INTEGER NOT NULL DEFAULT 1,
  cancel_mode TEXT CHECK (cancel_mode IN ('period','date')),
  cancel_period_value INTEGER,
  cancel_period_unit TEXT CHECK (cancel_period_unit IN ('days','weeks','months')),
  cancel_date TEXT
);

INSERT INTO subscriptions_new (
  id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active,
  created_at, notify, cancel_mode, cancel_period_value, cancel_period_unit, cancel_date
)
SELECT
  id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active,
  created_at, notify, cancel_mode, cancel_period_value, cancel_period_unit, cancel_date
FROM subscriptions;

DROP TABLE subscriptions;

ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE TABLE incomes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  account_id INTEGER REFERENCES accounts(id),
  interval TEXT NOT NULL CHECK (interval IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly')),
  anchor_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  one_time INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO incomes_new (
  id, name, amount_cents, currency, account_id, interval, anchor_date, active, one_time, created_at
)
SELECT
  id, name, amount_cents, currency, account_id, interval, anchor_date, active, one_time, created_at
FROM incomes;

DROP TABLE incomes;

ALTER TABLE incomes_new RENAME TO incomes;

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
