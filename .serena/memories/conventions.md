# Konventionen

Verbindliche Regeln stehen in `AGENTS.md` ("Konventionen (verbindlich)"). Hier nur Agent-relevante Hinweise, die über das Wiederholen hinausgehen.

## Nicht naiv umschreiben

- `src/lib/recurrence.ts` ist getestet. Folgetermine = `anchor + k·step` (anker-additiv), niemals iterativ vom letzten Termin weiter. Sonst driften Monatsende-Abos (31.) auf den 28.
- `src/lib/db.ts` ist der **einzige** DB-Layer. snake_case ↔ camelCase-Mapping (siehe `mapSub` / `SubRow`) bleibt dort. Kein Direktzugriff auf `tauri-plugin-sql` aus Komponenten.
- Reminders: `UNIQUE(subscription_id, due_date)` + `INSERT OR IGNORE` — `runReminderCheck` darf beliebig oft laufen (App-Start + stündliches Intervall), pro Fälligkeit höchstens eine Notification.

## Geld & Datum

- Beträge **immer** als `amount_cents: number` (Integer). Nie Float. Erst beim Render `/ 100`.
- Datumswerte als ISO `YYYY-MM-DD`-String, nicht als `Date`-Objekt durch die Layer reichen.

## Migrationen

- Neue Datei in `src-tauri/migrations/`, Namensschema `NNNN_zweck.sql` (vierstellig hochgezählt).
- In `src-tauri/src/lib.rs` die `migrations`-Vec um einen `Migration`-Eintrag mit **nächster freier `version`** ergänzen.
- Bereits angewendete Migrationen niemals editieren — `tauri-plugin-sql` führt sie nicht erneut aus und Schema driftet auseinander.

## Sprache

Alle nutzer-sichtbaren UI-Texte sind **deutsch**. Code-Identifier/Kommentare folgen dieser Linie nicht zwingend (Mischung im Repo vorhanden).

## Sonstiges

- Geschäftslogik in `src/lib/` bleibt framework-unabhängig (UI austauschbar, testbar). Keine React-Imports dort.
- Serena-Tool-Zeilennummern sind 0-basiert (vs. Read-Tool 1-basiert) — bei Verweisen aufpassen.
