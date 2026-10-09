-- Manuelle Wechselkurse für die Prognose in Fremdwährung (siehe src/lib/rates.ts).
-- 1 `from_currency` = rate_micros / 1.000.000 `to_currency`.
-- Kurse sind ganzzahlige Mikro-Einheiten statt Float ("Geld nie als Float"); umgerechnet wird
-- ausschließlich auf einen hier ausdrücklich hinterlegten Kurs hin, nie still.
-- Kein Auto-Kurs-Abruf: die App bleibt offline-first und ohne Netzwerkzugriff für Daten.
CREATE TABLE exchange_rates (
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate_micros INTEGER NOT NULL CHECK (rate_micros > 0 AND rate_micros <= 1000000000000),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_currency, to_currency),
  CHECK (from_currency <> to_currency)
);
