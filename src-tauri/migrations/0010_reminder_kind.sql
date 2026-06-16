-- no-transaction
-- Reminder-Art unterscheiden: 'payment' (Zahlungs-Fälligkeit) vs. 'cancel' (Kündigungsfrist).
-- Bisher war die Idempotenz-Grenze UNIQUE(subscription_id, due_date) — würde kollidieren, wenn
-- ein Zahlungstermin und eine Kündigungsfrist desselben Abos auf dasselbe Datum fallen. Daher
-- 'kind' in die UNIQUE-Constraint aufnehmen. SQLite kann UNIQUE nicht per ALTER ändern -> Rebuild.
-- '-- no-transaction' MUSS Zeile 1 sein (sonst greift PRAGMA foreign_keys=OFF nicht, FK 787).
PRAGMA foreign_keys=OFF;

CREATE TABLE reminders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  due_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','cancel')),
  UNIQUE (subscription_id, due_date, kind)
);

INSERT INTO reminders_new (id, subscription_id, due_date, sent_at, kind)
SELECT id, subscription_id, due_date, sent_at, 'payment' FROM reminders;

DROP TABLE reminders;

ALTER TABLE reminders_new RENAME TO reminders;

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
