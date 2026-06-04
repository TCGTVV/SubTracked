# SubTracked — Core

Plattformübergreifender Desktop-Tracker für wiederkehrende Abos/Zahlungen. Erinnert mit konfigurierbarer Vorlaufzeit, damit das Konto vor der Abbuchung gedeckt ist.

## Autoritative Projektdokumente

Diese im Repo gepflegten Dateien sind verbindlich und sollten zuerst gelesen werden, bevor Code geändert wird — Memories duplizieren sie bewusst nicht:

- `AGENTS.md` — Stack, Konventionen, Verzeichnis-Map, Pflicht-Invarianten (Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben, DB nur über `src/lib/db.ts`, Migrationen nie nachträglich ändern, UI-Texte deutsch).
- `BACKLOG.md` — Aufgabenstand, Reihenfolge = Priorität, erledigte Punkte werden abgehakt (nicht gelöscht).

## Source-Map

- `src/` — React-Frontend (Vite). Geschäftslogik liegt in `src/lib/` und bleibt framework-unabhängig.
  - `src/types.ts` — gemeinsame Typen (`Account`, `Subscription`, `Interval`).
  - `src/lib/db.ts` — einziger DB-Layer (SQLite via `tauri-plugin-sql`); kapselt snake_case ↔ camelCase.
  - `src/lib/recurrence.ts` — Fälligkeit (`nextDueDate`, `dueDatesWithin`). Anker-additive Logik, GETESTET.
  - `src/lib/coverage.ts` — Kontodeckungs-Prognose (`computeCoverage`).
  - `src/lib/reminders.ts` — `runReminderCheck` (Notification + Idempotenz-Insert).
  - `src/App.tsx` — Frontend-Einstieg, derzeit noch Tauri-Template-Reste (siehe Backlog).
- `src-tauri/` — Rust-Kern.
  - `src/lib.rs` — Plugin-Registrierung (`sql`, `notification`, `autostart`, `opener`) + Migrationsliste.
  - `migrations/` — SQL-Migrationen, monoton hochgezählte `version` in `lib.rs`.

## Weiterführende Memories

- Stack & Versionspins, plus Pflicht-Feature für `tauri-plugin-sql`: `mem:tech_stack`.
- Befehle für Dev/Build inkl. Wayland-Renderfix: `mem:suggested_commands`.
- Code-Konventionen, die über AGENTS.md hinaus für Agents relevant sind: `mem:conventions`.
- Was vor "fertig" laufen muss: `mem:task_completion`.
