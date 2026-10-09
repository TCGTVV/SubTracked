# Konventionen

Verbindliche Regeln stehen in `AGENTS.md` ("Konventionen (verbindlich)"). Hier nur Agent-relevante Hinweise, die über das Wiederholen hinausgehen.

## Nicht naiv umschreiben

- `src/lib/recurrence.ts` ist getestet. Folgetermine = `anchor + k·step` (anker-additiv), niemals iterativ vom letzten Termin weiter. Sonst driften Monatsende-Abos (31.) auf den 28.
- `src-tauri/src/recurrence.rs` ist die Rust-Parallele fuer den Reminder-Scheduler. Neue Intervall-/Datumsregeln muessen TS und Rust konsistent halten. Seit Commit `6283ddb` gibt es dafuer eine geteilte Fixture `tests/fixtures/recurrence-vectors.json` (Repo-Root), konsumiert von `recurrence::tests::shared_vectors_match_typescript_impl` (Rust) und `src/lib/recurrence-vectors.test.ts` (TS) — bei neuen Intervall-/Kuendigungsregeln dort Vektoren ergaenzen statt neue Tests nur auf einer Seite.
- `src/lib/db.ts` ist die einzige Frontend-Bridge zur Persistenz. Komponenten rufen keine Tauri-Commands direkt fuer DB-Zugriff auf; sie gehen ueber diese Wrapper.
- Echte SQLite-Zugriffe liegen im Rust-Backend (`src-tauri/src/commands.rs` + `AppState { db: SqlitePool }`). Kein zweiter Pool, kein Webview-SQL.
- Reminders: `UNIQUE(subscription_id, due_date)` bleibt die Idempotenz-Grenze. Seit 2026-06-07 bedeutet ein Reminder-Row: "Notification wurde erfolgreich angestossen". Bei fehlender Permission oder `show()`-Fehler wird nichts als gesendet markiert, damit spaeter erneut versucht werden kann.

## Geld & Datum

- Beträge **immer** als Integer in `amount_cents` speichern. Der Name ist historisch: semantisch ist es die kleinste Waehrungseinheit (EUR = Cent, KRW = Won). Nie Float speichern; erst bei Anzeige/Notification mit Currency-Subdivisor formatieren.
- Frontend-Currency-Subdivisions liegen in `src/lib/format.ts` (`getCurrencySubdivisor`). Rust-Notifications haben eine parallele kleine Subdivision-Logik in `src-tauri/src/reminders.rs`; bei neuen Zero-Decimal-Waehrungen beide Seiten aktualisieren.
- Datumswerte als ISO `YYYY-MM-DD`-String, nicht als `Date`-Objekt durch die Layer reichen.

## Migrationen

- Neue Datei in `src-tauri/migrations/`, Namensschema `NNNN_zweck.sql` (vierstellig hochgezählt).
- Migrationen laufen via `sqlx::migrate!("./migrations")`; es gibt keine manuelle Migrations-Vec mehr in `lib.rs`.
- Bereits angewendete Migrationen niemals editieren — neue Schema-Aenderungen immer als neue Datei (sqlx prüft die Checksumme; das gilt auch für bekannte Mängel in 0007/0009/0010).
- **Tabellen-Rebuild (Muster 0007/0009/0010) vermeiden**, wenn es geht: `-- no-transaction` + `DROP`/`RENAME` ist nicht crash-atomar (Power-Loss zwischen Drop und Rename), und `sqlite_sequence` wird nicht mitgeführt (nach dem Rebuild ID-Wiedervergabe für gelöschte Maximal-IDs möglich). Der Auto-Snapshot in `db_backup.rs` fängt den Crash-Fall ab, ersetzt aber keinen sauberen Ansatz. Müssen Constraints nachgerüstet werden, sind `CREATE TRIGGER … RAISE(ABORT, …)` (siehe 0015) der rebuild-freie Weg. Ist ein Rebuild unvermeidbar: `INSERT OR REPLACE INTO sqlite_sequence` für die neue Tabelle ergänzen und einen Migrationstest schreiben.

## Datei-Zugriff (seit 2026-10-09)

- Der Renderer übergibt **nie** einen freien Dateipfad an Rust. Datei-Commands (`export_backup`, `import_backup`, `export_subscriptions_csv`, `preview_csv_import`, `reconcile_csv`) nehmen ein `token`, das `pick_save_file`/`pick_open_file` (Rust öffnet den nativen Dialog) in `src-tauri/src/file_grants.rs` ausgestellt hat: einmal gültig, an Lesen/Schreiben gebunden.
- Neuer Command mit Dateizugriff → Token über `FileGrants::take(&token, GrantKind::…)` einlösen, im Frontend `PickedFile` aus `src/lib/db.ts` durchreichen. Kein `@tauri-apps/plugin-dialog` im Renderer, `dialog:default` steht nicht mehr in `capabilities/default.json`.
- Schema-Integrität: Migration `0015` setzt Trigger, die `validation.rs` spiegeln. Ändert sich eine Regel in `validation.rs`, braucht es eine neue Migration (`DROP TRIGGER` + `CREATE TRIGGER`), nicht nur eine Code-Änderung.
- Dynamisches SQL in sqlx 0.9 (auch Tests): `sqlx::query(sqlx::AssertSqlSafe(String))`.

## Termine, Skips, Verschiebung, Kurse (seit 2026-10-09)

- **Nominaler Termin vs. Buchungstag:** `anchor + k·step` ist der *nominale* Termin und bleibt der Schlüssel für Erinnerungs-Idempotenz (`reminders.due_date`) und Skips (`subscription_skips.due_date`). Die Verschiebungsregel (`shift_rule`: `none`/`next`/`previous`) erzeugt daraus den *Buchungstag* — der gilt für Prognose, Demnächst, Jahresplan, Simulation und den Erinnerungs-Vorlauf. Skips werden **vor** der Verschiebung angewendet (auf den nominalen Termin).
- **Skips** hängen im Frontend als `Subscription.skippedDates` an den Abos (Hook setzt sie aus `list_skips`); jede neue Terminberechnung muss über `subscriptionDatesWithin` laufen, sonst vergisst sie Skips und Verschiebung. Einmalige Ausgaben sind nicht skippbar.
- **Bankarbeitstag** = Mo–Fr ohne bundeseinheitliche Feiertage; Rust und TS müssen identisch bleiben (`bankday-vectors.json` ergänzen statt nur eine Seite testen).
- **Wechselkurse:** `exchange_rates` in Mikro-Einheiten (`rate_micros`, kein Float). Umgerechnet wird nur mit ausdrücklich hinterlegtem Kurs (direkt oder Kehrwert), nie über eine Dritt-Währung, und jeder umgerechnete Posten trägt `convertedFrom` und wird in der UI mit „≈" gekennzeichnet. Kosten-Überblick/Baseline bleiben pro Währung getrennt.
- **Backup:** neue Tabelle ⇒ `BackupFile`-Feld mit `#[serde(default)]`, `validate_backup`, `collect_backup`, `restore_backup` (DELETE vor, INSERT nach den Eltern) und den Safety-Net-Test `restore_backup_deletes_every_application_table` ergänzen.
- **Neue sqlx-Queries** ⇒ `cargo sqlx prepare -- --tests` gegen eine frisch migrierte DB (`cargo sqlx database create && cargo sqlx migrate run`) und `.sqlx/` mitcommitten.

## Sprache

Alle nutzer-sichtbaren UI-Texte sind **deutsch**. Code-Identifier/Kommentare folgen dieser Linie nicht zwingend (Mischung im Repo vorhanden).

## Sonstiges

- Geschäftslogik in `src/lib/` bleibt framework-unabhängig (UI austauschbar, testbar). Keine React-Imports dort.
- Serena-Tool-Zeilennummern sind 0-basiert (vs. Read-Tool 1-basiert) — bei Verweisen aufpassen.
- HANDOVER-Eintraege von Codex ausdruecklich als Codex-Eintraege markieren.

## UI / shadcn (seit 2026-06-16)

- Klassen-Merging immer über `cn()` aus `src/lib/utils.ts`. Styling nur über Tailwind-Token-Utilities (`bg-card`, `text-muted-foreground`, `border-border`, `text-destructive`, `text-success`/`text-warning`, `chart-1..5`, `text-fluid-*`, `--sidebar-w`/`--card-min`) — **kein `App.css`/Vanilla-CSS mehr**, keine neuen globalen Element-Regeln.
- **Dialoge sind controlled:** `open: boolean` + `onClose`/`onSaved`-Callbacks (kein nativer `<dialog>`/`ref.showModal()` mehr — `Dialog.tsx`/`lib/dialog.ts` existieren nicht mehr). Entity-initialisierte Dialoge (Sub/Income) bekommen in `App.tsx` einen **Remount-`key`** (`key={`sub-${id}-${seq}`}`), damit der Form-State pro Öffnen frisch ist.
- **Radix `Select`:** leerer Item-Wert ist verboten → Sentinels (`"none"`/`"__all__"`/`"__none__"`) statt `""`. `SelectContent` läuft auf `position="popper"` (nicht item-aligned). Bei neuen Selects gleiches Muster.
- shadcn-Komponenten aus der Registry kommen oft mit Biome-Formatverstößen (keine Semikolons etc.) → nach `shadcn add` einmal `pnpm lint:fix`.
- `src/components/ui/` = generierte shadcn-Primitive; App-Komponenten daneben in `src/components/`. `react-day-picker` ist v10 — `Calendar` ist gegen die v10-API handgeschrieben.
