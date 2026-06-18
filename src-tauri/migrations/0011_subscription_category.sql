-- Optionale Kategorie pro Abo (Backlog: "Kategorien/Tags für Abos").
-- Freitext mit Presets im Frontend (Streaming, Versicherung, …) — bewusst kein CHECK,
-- damit eigene Kategorien möglich bleiben. NULL = keine Kategorie; Bestandszeilen bleiben gültig.
ALTER TABLE subscriptions ADD COLUMN category TEXT;
