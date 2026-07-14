# SubTracked — Core

Plattformübergreifender Desktop-Tracker für wiederkehrende Abos/Zahlungen. Erinnert mit konfigurierbarer Vorlaufzeit, damit das Konto vor der Abbuchung gedeckt ist.

## Autoritative Projektdokumente

Diese im Repo gepflegten Dateien sind verbindlich und sollten zuerst gelesen werden, bevor Code geändert wird — Memories duplizieren sie bewusst nicht:

- `HANDOVER.md` — immer zuerst den obersten Eintrag vollständig lesen; dort steht der letzte Sitzungsstand, nächste Schritte, Entscheidungen und Gotchas.
- `AGENTS.md` — Stack, Konventionen, Verzeichnis-Map, Pflicht-Invarianten (Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben, DB nur über `src/lib/db.ts`, Migrationen nie nachträglich ändern, UI-Texte deutsch).
- `BACKLOG.md` — Aufgabenstand, Reihenfolge = Priorität, erledigte Punkte werden abgehakt (nicht gelöscht).

## Source-Map

- `src/` — React-Frontend (Vite). Geschäftslogik liegt in `src/lib/` und bleibt framework-unabhängig.
  - `src/types.ts` — gemeinsame Typen (`Account`, `Subscription`, `Interval`).
  - `src/lib/db.ts` — typed Frontend-Bridge zu Tauri-Commands via `invoke<T>()`; kein direkter SQLite-Zugriff mehr im Webview.
  - `src/lib/recurrence.ts` — Fälligkeit (`nextDueDate`, `dueDatesWithin`). Anker-additive Logik, GETESTET.
  - `src/lib/coverage.ts` — Kontodeckungs-/Abfluss-Prognose (`computeCoverage`, `computeMonthlyBaseline`).
  - `src/lib/format.ts` — deutsche Geld-/Datumsformatierung, tolerant lokalisierte Betragseingabe, Currency-Subdivisions (KRW = 1).
  - `src/hooks/` — App-Orchestrierung (`useSubscriptions`, `useNotificationPermission`).
  - `src/components/` — Dialoge/Views; komponentennahe RTL-Smoke-Tests liegen daneben.
  - `src/App.tsx` — Frontend-Einstieg und UI-Orchestrierung.
- `src-tauri/` — Rust-Kern.
  - `src/lib.rs` — Tauri-Builder, tracing-Setup, sqlx-Pool, Migrations, Tray, Window-Verhalten, Reminder-Scheduler.
  - `src/db.rs` — Tauri-managed `AppState { db: SqlitePool }` und serde/sqlx-Structs.
  - `src/commands.rs` — einzige DB-Command-Schicht für Frontend-Invokes.
  - `src/reminders.rs` — Rust-Reminder-Loop-Logik; Reminder-Row bedeutet "Notification erfolgreich angestossen".
  - `src/recurrence.rs` — Rust-Parallele zur anker-additiven Recurrence-Logik, mit Tests.
  - `migrations/` — SQL-Migrationen via `sqlx::migrate!("./migrations")`; bereits angewandte Migrationen nie ändern.

## Weiterführende Memories

- Stack & Versionspins (schlanker Kern, in jeder Session gelesen): `mem:tech_stack`. Details zu Rust→TS-Typgenerierung + Compile-time-SQL-Verifikation: `mem:rust_build_pipeline`. Vitest/RTL/axe-Gotchas: `mem:frontend_test_setup`.
- Befehle für Dev/Build inkl. Wayland-Renderfix: `mem:suggested_commands`.
- Code-Konventionen, die über AGENTS.md hinaus für Agents relevant sind: `mem:conventions`.
- Was vor "fertig" laufen muss: `mem:task_completion`.
- UI-Designziel für späteres Overhaul (arsnova.eu / Material 3): `mem:ui_vision`.
