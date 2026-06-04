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
- **DB:** SQLite via `tauri-plugin-sql` (eingebettet, kein Server)
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
    db.ts                 typisierter SQLite-Zugriff (einziger DB-Layer)
    reminders.ts          Erinnerungs-Check + native Notification
src-tauri/                Rust
  src/lib.rs              Plugin-Registrierung + Migrationen
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

- **Geld** wird als ganzzahlige **Cent** gespeichert (`amount_cents`), niemals als Float. Erst bei der Anzeige durch 100 teilen.
- **Datumswerte** als ISO-String `YYYY-MM-DD`.
- **`recurrence.ts` ist getestet und darf nicht naiv umgeschrieben werden.** Folgetermine werden immer auf das Original-Ankerdatum addiert (`anchor + k*step`), nie iterativ — sonst driften Monatsende-Abos (31.) auf den 28. weg.
- **DB-Zugriff ausschließlich über `src/lib/db.ts`.** Das snake_case-↔-camelCase-Mapping bleibt dort gekapselt.
- **Idempotente Erinnerungen:** `UNIQUE(subscription_id, due_date)` + `INSERT OR IGNORE`. Pro Fälligkeit höchstens eine Benachrichtigung.
- **Migrationen:** neue `.sql`-Datei in `src-tauri/migrations/` anlegen und in `lib.rs` mit hochgezählter `version` registrieren. Bereits angewandte Migrationen nie nachträglich ändern.
- `tauri-plugin-sql` benötigt `features = ["sqlite"]` in `Cargo.toml`.
- **Geschäftslogik bleibt in `src/lib/`** (framework-unabhängig), damit sie testbar bleibt und die UI austauschbar ist.
- **Nutzer-sichtbare Texte: Deutsch.**

## Prüfen vor Abschluss

- `pnpm tauri dev` startet und das Fenster öffnet sich ohne Rust-Fehler.
- TypeScript kompiliert (keine Typfehler).
- Keine Secrets committen.
