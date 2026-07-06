-- Archivierungszeitpunkt für die „Gespart seit Kündigung"-Auswertung.
-- Gesetzt beim Deaktivieren (set_subscription_active), NULL beim Reaktivieren.
-- Bestands-Archivierte bleiben NULL — ihr Archivierungszeitpunkt ist unbekannt.
ALTER TABLE subscriptions ADD COLUMN archived_at TEXT;
