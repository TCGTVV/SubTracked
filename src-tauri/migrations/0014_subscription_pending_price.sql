-- Geplante Preisänderung mit Wirksamkeitsdatum (BACKLOG #204).
-- Beide Spalten sind immer gemeinsam gesetzt oder gemeinsam NULL (in validation.rs
-- erzwungen, ALTER TABLE kann keine CHECK-Constraints nachrüsten).
-- Trial-/Probeabo = amount_cents 0 + geplanter Preis ab pending_from.
ALTER TABLE subscriptions ADD COLUMN pending_amount_cents INTEGER;
ALTER TABLE subscriptions ADD COLUMN pending_from TEXT;
