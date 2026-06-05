# BACKLOG.md

Aufgabenliste für SubTracked. Reihenfolge = grobe Priorität. Erledigtes abhaken, nicht löschen (Verlauf).

## ✅ Erledigt

- [x] Tauri-v2-Gerüst (React + TypeScript, pnpm)
- [x] Plugins eingebunden: `sql`, `notification`, `autostart`
- [x] SQLite-Schema als Migration (`0001_init.sql`) + in `lib.rs` registriert
- [x] `sqlite`-Feature in `Cargo.toml` aktiviert
- [x] Framework-unabhängige Logik vorhanden: `recurrence.ts`, `coverage.ts`, `db.ts`, `reminders.ts`
- [x] Auf GitHub gepusht (Commit mit Schutz-E-Mail)

## 🐛 Bugs

- [ ] **Datenpersistenz nach Reboot — Beobachtung beobachten.** User hatte am 2026-06-05 berichtet, nach einem System-Neustart seien angelegte Abos weg. Untersuchung am selben Tag (siehe HANDOVER 2026-06-05 — Persistenz-Diagnose): DB unter `~/.config/com.tcgtvv.subtracked/subtracker.db` enthält die Daten, WAL aktiv, Identifier nie geändert, Code-Pfad clean (`getDb` cached, `listSubscriptions` plain SELECT, Errors werden im UI als Banner sichtbar). Aktuell **nicht reproduzierbar** — Persistenz scheint gesund.

  Falls das Phänomen wieder auftritt, in dieser Reihenfolge:
  1. `ls -la ~/.config/com.tcgtvv.subtracked/` — DB + WAL + SHM da, Zeitstempel sinnvoll?
  2. `sqlite3 ~/.config/com.tcgtvv.subtracked/subtracker.db "SELECT * FROM subscriptions;"` — Einträge in der DB?
  3. Wenn DB voll, UI leer → Frontend-Bug. Devtools-Console im `pnpm tauri dev` prüfen (silent rejection in `listSubscriptions`?).
  4. Wenn DB leer → Connection-Lifecycle in `tauri-plugin-sql` auditieren; PRAGMA `journal_mode`/`synchronous`; prüfen ob das Verzeichnis von außen geleert wird.

  **DB-Pfad-Sonderheit**: `tauri-plugin-sql` nutzt `app_config_dir()`, nicht `app_data_dir()` — die Datei landet daher im Config-Dir (`~/.config/...` auf Linux), obwohl es Nutzdaten sind. Footgun für Suchen am falschen Ort.

## 🔨 Jetzt (Oberfläche)

- [x] **Abo-Liste** anzeigen (Name, Betrag, nächste Fälligkeit, Konto) — nutzt `db.listSubscriptions()` + `recurrence.nextDueDate()`
- [x] **Abo anlegen / bearbeiten / löschen** (Formular) — `db.addSubscription()`, `db.updateSubscription()`, `db.deleteSubscription()`
- [x] **Konten** anlegen/auswählen — `db.listAccounts()`, `db.addAccount()`, `db.deleteAccount()` mit Soft-Check (`countSubsForAccount()`)
- [x] **Kontodeckungs-Ansicht** (anstehende Abflüsse je Konto, N Monate) — `coverage.computeCoverage()`, collapsible pro Konto
- [x] **Monatliche Fixkosten-Übersicht** ("Baseline") — `coverage.computeMonthlyBaseline()`, pro Konto + Gesamt-Summe
- [x] **Erinnerungs-Check verdrahten:** `runReminderCheck()` beim App-Start + stündliches Intervall in `App.tsx`
- [x] Standard-Template-Reste (`greet`-Demo) durch echte UI ersetzen

## ⏭️ Als Nächstes (Hintergrund-Betrieb)

- [x] **Tray-Icon** + Fenster beim Schließen nur verstecken (App läuft weiter)
- [x] **Autostart beim Login** über Einstellungen aktivierbar (`@tauri-apps/plugin-autostart` `enable()`)
- [x] Notification-Berechtigung sauber abfragen und Status anzeigen
- [x] Vorlaufzeit (`lead_days`) pro Abo in der UI editierbar
- [x] **Notifications pro Abo stummschaltbar** — bei bekannten regelmäßigen Abos (z.B. Netflix monatlich) will man keinen Spam. Neue Spalte `notify INTEGER DEFAULT 1` via Migration, UI-Toggle pro Abo, `runReminderCheck` überspringt stumme Abos. Sie bleiben aber sichtbar in Liste/Fixkosten-Übersicht

## 🚀 Distribution & Setup

- [ ] **Lokales Installer-Build & richtige App-Installation.** Aktuell läuft SubTracked nur via `pnpm tauri dev` aus dem Git-Klon. `pnpm tauri build` produziert OS-spezifische Artefakte (Linux: `.deb`/`.rpm`/`.AppImage` unter `src-tauri/target/release/bundle/`). Installieren und prüfen:
  - App-Eintrag im Anwendungsmenü erscheint
  - SubTracked normal von dort startbar (Desktop-Verknüpfung, Application-Launcher)
  - Tray-Icon + Autostart funktionieren wie im Dev
  - DB-Pfad identisch zum Dev-Build (siehe Bugs)
- [ ] **Versions-Tag `v0.1.0`** schneiden, sobald die UI stabil läuft und der Installer-Punkt oben abgenommen ist.

## 📐 Tests & Qualität

- [ ] **Test- & Qualitätssicherungs-Strategie festlegen** (Diskussion vor Umsetzung). Aktueller Stand: nur `tsc` + `cargo check`, keine Tests, kein Lint, kein Formatter. Themen für die Diskussion:
  - **Unit-Tests**: vitest für reines TS (`recurrence.ts`, `coverage.ts`, `format.ts`, `reminders.ts` mit Mock-DB)
  - **Komponenten-Tests**: vitest + React Testing Library für Dialoge & Banner
  - **E2E/Smoke**: nötig? Tauri-WebDriver-Setup ist nicht-trivial — vielleicht erst ab Beta
  - **Lint**: ESLint mit `eslint-plugin-react` + `typescript-eslint`? Oder Biome (eine Tool-Chain, schneller)?
  - **Formatter**: Prettier (Standard) oder Biome (s.o.)
  - **Rust-Seite**: `cargo clippy` mit `-D warnings` als Pflicht; `cargo fmt --check`
  - **Pre-Commit-Hook** (lefthook bevorzugt, weil leichter als husky)
  - **CI**: was läuft wann (Push, PR, Tag)? GitHub Actions vermutlich, sobald das CI-Matrix-Item aus "Später" angegangen wird
  - Reihenfolge der Einführung: was ist High-ROI zuerst? (Wahrscheinlich Formatter + Clippy + vitest-Unit für die pure Logik.)

## 🌱 Später

- [ ] **UI-Redesign Richtung arsnova.eu** (Angular Material 3 / Material You als Vorlage) — Teal-Akzentpalette, Card-Layout, Material Icons, vollständige Dark-Mode-Parität, App-Feel statt Web-Formular. Vor Umsetzung Lib-Auswahl (MUI v6 / Material Web / shadcn+Tokens / Tailwind+M3). Designziel und nicht-zu-übernehmende Teile siehe Serena-Memory `mem:ui_vision`
- [ ] **GitHub-Actions-Matrix-Build** (`tauri-action`) für Win/Linux/macOS-Installer bei jedem Release-Tag
- [ ] App-Icon / Branding
- [ ] Import/Export (CSV) der Abos
- [ ] Mehrwährungs-Handling in der Kontodeckung (Umrechnung)
- [ ] Optionale weitere Kanäle (z.B. Telegram) als Alternative zu nativen Notifications
- [ ] Auf Windows und macOS testen
- [ ] Migration: `ON DELETE CASCADE` für `reminders.subscription_id`, damit beim Löschen eines Abos keine Waisen-Reminder zurückbleiben
- [ ] `SubRow.interval`: aus SQLite kommt ein roher `string` — sauberer Cast in `mapSub` statt implizit auf `Interval` zu vertrauen (DB-`CHECK` greift, aber Typ ist optimistisch)
- [ ] `tauri-plugin-opener` entfernen, falls nicht für externe Links genutzt (aktuell ungenutzt)
- [ ] **Lokalisierung der Eingaben** — Inputs sollten DE-Konventionen tolerieren, nicht nur HTML-Standards. Konkret: Beträge mit Komma *und* Punkt als Dezimaltrenner annehmen (z.B. `12,99` und `12.99` beide gültig), Tausendertrennzeichen ignorieren. Mittelfristig: ein gemeinsamer Eingabe-Parser für Beträge an einer Stelle

## Hinweise

Konventionen und Stack siehe [AGENTS.md](./AGENTS.md). Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben.
