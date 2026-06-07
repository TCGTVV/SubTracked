-- Konten bekommen Wahrung, aktuellen Saldo und Mindestpuffer fur die Deckungs-Prognose.
-- Bestehende Konten werden mit EUR / 0 / 0 als sinnvollen Defaults migriert; der User
-- kann anschliessend pro Konto den realen Saldo und ggf. einen Puffer pflegen.
ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE accounts ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN min_buffer_cents INTEGER NOT NULL DEFAULT 0;
