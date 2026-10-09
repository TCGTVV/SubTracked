-- Wochenend-/Feiertags-Verschiebung der Buchung (siehe bankdays.rs):
--   'none'     Termin bleibt, wie er ist (bisheriges Verhalten, Default)
--   'next'     fällt er auf Wochenende/Feiertag, bucht die Bank am nächsten Bankarbeitstag (Lastschrift)
--   'previous' ... am vorigen Bankarbeitstag (z.B. Gehaltseingang)
-- Gespeichert wird nur die Regel; der nominale Termin (anchor_date + k·step) und damit der
-- Schlüssel der Erinnerungen/Skips bleibt unverändert.
-- Reines ADD COLUMN (kein Tabellen-Rebuild); die CHECK-Klausel wird gegen Bestandszeilen
-- (alle 'none') geprüft.
ALTER TABLE subscriptions ADD COLUMN shift_rule TEXT NOT NULL DEFAULT 'none'
  CHECK (shift_rule IN ('none', 'next', 'previous'));
ALTER TABLE incomes ADD COLUMN shift_rule TEXT NOT NULL DEFAULT 'none'
  CHECK (shift_rule IN ('none', 'next', 'previous'));
