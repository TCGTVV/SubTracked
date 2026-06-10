CREATE TABLE IF NOT EXISTS subscription_price_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    amount_cents    INTEGER NOT NULL,
    currency        TEXT    NOT NULL,
    changed_at      TEXT    NOT NULL
);

INSERT INTO subscription_price_history (subscription_id, amount_cents, currency, changed_at)
SELECT id, amount_cents, currency, datetime('now')
FROM subscriptions;
