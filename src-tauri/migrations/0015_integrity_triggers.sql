-- Zweite Verteidigungslinie: die App-Validierung (validation.rs) wird zusätzlich im Schema
-- erzwungen. Bewusst als TRIGGER statt CHECK-Constraints: SQLite kann CHECKs nicht per
-- ALTER nachrüsten, das hieße Tabellen-Rebuild (DROP/RENAME, nicht crash-atomar,
-- sqlite_sequence-Problem — siehe 0007/0009). Trigger lassen Bestandszeilen unangetastet und
-- greifen nur bei künftigen INSERT/UPDATE.
--
-- Regeln spiegeln validation.rs 1:1 — bei Änderungen dort hier NICHT editieren, sondern
-- eine neue Migration schreiben (DROP TRIGGER + CREATE TRIGGER).
--   * Betrag > 0; Ausnahme Trial-Abo: Betrag 0 nur mit geplanter Preisänderung
--   * geplanter Preis > 0
--   * Vorlauf 0..365 Tage (MAX_LEAD_DAYS)
--   * active/notify/one_time sind Booleans (0/1)
--   * Konto: Mindestpuffer >= 0, Saldo innerhalb ±9_000_000_000_000_000 (MAX_ACCOUNT_BALANCE_CENTS)

CREATE TRIGGER subscriptions_integrity_insert
BEFORE INSERT ON subscriptions
WHEN NEW.amount_cents < 0
  OR (NEW.amount_cents = 0 AND NEW.pending_amount_cents IS NULL)
  OR (NEW.pending_amount_cents IS NOT NULL AND NEW.pending_amount_cents <= 0)
  OR NEW.lead_days NOT BETWEEN 0 AND 365
  OR NEW.active NOT IN (0, 1)
  OR NEW.notify NOT IN (0, 1)
  OR NEW.one_time NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'subscriptions: Integritaetsregel verletzt (Betrag, Vorlauf oder Boolean-Feld)');
END;

CREATE TRIGGER subscriptions_integrity_update
BEFORE UPDATE ON subscriptions
WHEN NEW.amount_cents < 0
  OR (NEW.amount_cents = 0 AND NEW.pending_amount_cents IS NULL)
  OR (NEW.pending_amount_cents IS NOT NULL AND NEW.pending_amount_cents <= 0)
  OR NEW.lead_days NOT BETWEEN 0 AND 365
  OR NEW.active NOT IN (0, 1)
  OR NEW.notify NOT IN (0, 1)
  OR NEW.one_time NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'subscriptions: Integritaetsregel verletzt (Betrag, Vorlauf oder Boolean-Feld)');
END;

CREATE TRIGGER incomes_integrity_insert
BEFORE INSERT ON incomes
WHEN NEW.amount_cents <= 0
  OR NEW.active NOT IN (0, 1)
  OR NEW.one_time NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'incomes: Integritaetsregel verletzt (Betrag oder Boolean-Feld)');
END;

CREATE TRIGGER incomes_integrity_update
BEFORE UPDATE ON incomes
WHEN NEW.amount_cents <= 0
  OR NEW.active NOT IN (0, 1)
  OR NEW.one_time NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'incomes: Integritaetsregel verletzt (Betrag oder Boolean-Feld)');
END;

CREATE TRIGGER accounts_integrity_insert
BEFORE INSERT ON accounts
WHEN NEW.min_buffer_cents < 0
  OR NEW.balance_cents NOT BETWEEN -9000000000000000 AND 9000000000000000
BEGIN
  SELECT RAISE(ABORT, 'accounts: Integritaetsregel verletzt (Mindestpuffer oder Saldo)');
END;

CREATE TRIGGER accounts_integrity_update
BEFORE UPDATE ON accounts
WHEN NEW.min_buffer_cents < 0
  OR NEW.balance_cents NOT BETWEEN -9000000000000000 AND 9000000000000000
BEGIN
  SELECT RAISE(ABORT, 'accounts: Integritaetsregel verletzt (Mindestpuffer oder Saldo)');
END;
