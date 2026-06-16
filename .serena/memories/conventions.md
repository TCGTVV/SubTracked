# Konventionen

Verbindliche Regeln stehen in `AGENTS.md` ("Konventionen (verbindlich)"). Hier nur Agent-relevante Hinweise, die über das Wiederholen hinausgehen.

## Nicht naiv umschreiben

- `src/lib/recurrence.ts` ist getestet. Folgetermine = `anchor + k·step` (anker-additiv), niemals iterativ vom letzten Termin weiter. Sonst driften Monatsende-Abos (31.) auf den 28.
- `src-tauri/src/recurrence.rs` ist die Rust-Parallele fuer den Reminder-Scheduler. Neue Intervall-/Datumsregeln muessen TS und Rust konsistent halten; am besten gemeinsame Testvektoren ergaenzen.
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
- Bereits angewendete Migrationen niemals editieren — neue Schema-Aenderungen immer als neue Datei.

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
