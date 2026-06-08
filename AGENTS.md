# AGENTS.md

Anweisungen für KI-Agents, die an diesem Projekt arbeiten. Kurz halten, Konventionen einhalten, offene Aufgaben siehe [BACKLOG.md](./BACKLOG.md).

## 🛎️ Schichtübergabe — IMMER ZUERST LESEN

**Vor jeder Arbeit:** zuerst [HANDOVER.md](./HANDOVER.md) — den **obersten Eintrag** — vollständig lesen. Dort steht der letzte Sitzungs-Stand, der nächste geplante Schritt, getroffene Entscheidungen mit Begründung und Stolperfallen.

**Am Sitzungsende:** in HANDOVER.md **oben** einen neuen Eintrag anfügen. Schablone steht unten in der Datei.

## Projekt

**SubTracked** — plattformübergreifender Desktop-Tracker für wiederkehrende Zahlungen/Abos. Erinnert den Nutzer rechtzeitig (Vorlaufzeit pro Abo), damit das jeweilige Konto vor der Abbuchung gedeckt ist.

## Tech-Stack

- **Tauri v2** (Rust-Kern, System-WebView) — Windows / Linux / macOS
- **Frontend:** React + TypeScript (Vite)
- **DB:** SQLite via eigenem `sqlx`-Pool im Rust-Hauptprozess (eingebettet, kein Server)
- **Benachrichtigung:** `tauri-plugin-notification` (nativ pro OS)
- **Autostart:** `tauri-plugin-autostart`
- **Paketmanager:** `pnpm`

## Verzeichnisstruktur

```
src/                      React-Frontend
  types.ts                gemeinsame TS-Typen (Account, Subscription, Interval)
  lib/                    framework-unabhängige Logik (testbar, UI-neutral)
    recurrence.ts         Fälligkeitsberechnung (GETESTET — siehe Konventionen)
    coverage.ts           Kontodeckungs-Prognose (reine Funktion)
    db.ts                 typisierte Tauri-Command-Bridge (einziger Frontend-DB-Zugriff)
    format.ts             Geld-/Datumsformatierung + Betrags-Parsing
  hooks/                  App-Orchestrierung (Subscriptions, Notification-Permission)
  components/             UI-Komponenten + RTL-Smoke-Tests
src-tauri/                Rust
  src/lib.rs              Plugin-Registrierung, sqlx-Pool, Logging, Tray, Reminder-Scheduler
  src/commands.rs         Tauri-Commands + SQL-Zugriff
  src/db.rs               AppState + serde/sqlx-Structs
  src/reminders.rs        Erinnerungs-Check + native Notification
  src/recurrence.rs       Rust-Fälligkeitsberechnung (GETESTET)
  migrations/             SQL-Migrationen (0001_init.sql, ...)
  Cargo.toml              Rust-Abhängigkeiten
```

## Befehle

```bash
pnpm install
# Dev: Wayland-Renderfix ist im pnpm-`tauri`-Script gesetzt
pnpm tauri dev
# Build (erzeugt Installer fürs aktuelle OS):
pnpm tauri build
```

## Konventionen (verbindlich)

- **Geld** wird als ganzzahlige **kleinste Währungseinheit** gespeichert (`amount_cents`, historischer Name), niemals als Float. EUR = Cent, KRW = Won. Erst bei Anzeige/Notification mit Currency-Subdivisor formatieren.
- **Datumswerte** als ISO-String `YYYY-MM-DD`.
- **`recurrence.ts` und `src-tauri/src/recurrence.rs` sind getestet und dürfen nicht naiv umgeschrieben werden.** Folgetermine werden immer auf das Original-Ankerdatum addiert (`anchor + k*step`), nie iterativ — sonst driften Monatsende-Abos (31.) auf den 28. weg.
- **Frontend-DB-Zugriff ausschließlich über `src/lib/db.ts`.** Komponenten rufen keine DB-Tauri-Commands direkt auf.
- **SQL-Zugriff ausschließlich im Rust-Backend** (`src-tauri/src/commands.rs` über den managed `SqlitePool`). Kein zweiter Pool, kein Webview-SQL.
- **Idempotente Erinnerungen:** `UNIQUE(subscription_id, due_date)` + `INSERT OR IGNORE`. Ein Reminder-Row bedeutet: Notification wurde erfolgreich angestoßen. Bei fehlender Permission wird nicht als gesendet markiert.
- **Migrationen:** neue `.sql`-Datei in `src-tauri/migrations/` anlegen. Migrationen laufen via `sqlx::migrate!("./migrations")`; bereits angewandte Migrationen nie nachträglich ändern.
- **Geschäftslogik bleibt in `src/lib/`** (framework-unabhängig), damit sie testbar bleibt und die UI austauschbar ist.
- **Nutzer-sichtbare Texte: Deutsch.**

## Prüfen vor Abschluss

- `pnpm tauri dev` startet und das Fenster öffnet sich ohne Rust-Fehler.
- `pnpm build` kompiliert TypeScript und baut das Frontend.
- Relevante Tests/Checks laufen (`pnpm test:run`, `pnpm lint`, bei Rust-Änderungen `cargo test`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`).
- Keine Secrets committen.

## Zweite Augen — Code-Review-Konvention

Der Implementierer ist immer parteilich, deshalb braucht jede nicht-triviale Änderung ein zweites Augenpaar vor dem Commit. Das Tooling ist da, der Aufruf ist menschlich:

- **Nicht-triviale Änderungen** (neue Features, Logik-Refactors, Schema-/Migrations-Eingriffe, Sicherheits- oder Persistenz-Pfade): vor dem Commit einmal `/code-review high` laufen lassen. Reviewer sieht nur den Diff, nicht die ganze Codebase — das ist gewollt: frische Augen, kein blinder Fleck durch Über-Vertrautheit.
- **Größere Blöcke** (Architektur-Eingriffe, Release-Vorbereitung, mehrere zusammenhängende Commits): `/code-review ultra` — Multi-Agent-Cloud-Review, deckt mehr ab, kostet mehr Token.
- **Trivial-Änderungen** (Doku-Tippfehler, einzeilige Bugfixes mit Test, Lint-Auto-Fixes): kein Review nötig.
- **Cross-Agent-Pattern:** Claude reviewt Codex' Sessions und umgekehrt — wer das letzte mal implementiert hat, schreibt diesmal den Review. Befunde werden im HANDOVER-Eintrag als eigene Sektion dokumentiert.
- **Befunde behandeln:** Wenn der Review Bugs oder konkrete Verbesserungen findet, in derselben Session fixen (kurz) oder als ToDo ins BACKLOG aufnehmen (länger). Nicht ungeprüft committen mit Verweis „mache ich später".
