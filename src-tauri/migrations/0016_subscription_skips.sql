-- Übersprungene Einzelabbuchungen ("Dienst pausiert für 2 Monate"). Ein Eintrag bedeutet:
-- der Termin `due_date` (der nominale Wiederholungstermin, YYYY-MM-DD) findet NICHT statt —
-- keine Buchung in Prognose/Demnächst/Jahresplan, keine Zahlungs-Erinnerung. Das Abo selbst
-- bleibt aktiv und unverändert (Kündigungsfrist, Preis-Historie, Kosten-Äquivalent).
-- Kein CHECK/Trigger auf das Datum: ob es ein echter Wiederholungstermin ist, prüft der
-- Command (recurrence.rs) — SQL kennt die Anker-additive Logik nicht.
CREATE TABLE subscription_skips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (subscription_id, due_date)
);
