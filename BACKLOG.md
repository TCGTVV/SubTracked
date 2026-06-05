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
- [ ] **README-/GitHub-Polish bei v0.1.0**: Screenshot oder kleines GIF einbetten (Tray-Icon, Hauptfenster, Settings-Dialog), README-Funktionen-Sektion bei Bedarf erweitern, ggf. Demo-Video für die GitHub-Release-Page. Logo ist seit 2026-06-05 unter `assets/logo.png` im README, fehlt also nur noch der UI-visueller-Anker — bewusst noch nicht jetzt, weil die UI noch im Wandel ist.
- [ ] **Logo neu exportieren / fixen.** Zwei Probleme am aktuellen `assets/logo.png`:
  - **Transparenz fehlt**: Das Schachbrettmuster im Hintergrund ist *kein* Alpha-Kanal, sondern wurde versehentlich als Pixel mit-exportiert (das Schachbrett ist eine *Anzeige-Konvention* in Bild-Editoren für Transparenz, aber hier eben mit gerastert worden). Auf GitHub-Hellmode sieht das hässlich aus. Fix: im Quelltool den Hintergrund auf wirklich transparent stellen, dann als PNG-mit-Alpha exportieren.
  - **Größe übertrieben**: 2752×1536 / 5,1 MiB — für die GitHub-Anzeige weit überdimensioniert und landet so dauerhaft in der Git-History. Bei Re-Export gleich auf eine vernünftige Zielbreite (z.B. 1200 px) gehen und mit `pngquant --quality=85-95` oder `oxipng -o 4` nachverdichten. Erwartung: ~80-95 % kleiner ohne sichtbaren Qualitätsverlust. Tools aktuell nicht lokal installiert.
  - Beides am besten in einem Aufwasch: ein sauberer Re-Export löst beide Punkte gleichzeitig.

## 📐 Tests & Qualität

Strategie am 2026-06-05 mit dem User diskutiert und festgelegt. Stack-Entscheidungen: **Biome** statt ESLint+Prettier (eine Tool, Rust-basiert, vernünftige Defaults), **vitest** für Pure-Logic-Tests jetzt (Komponenten/E2E später, siehe "Später"), **Lefthook** statt husky (leichter), **GitHub Actions** für CI (nicht der Matrix-Build, der bleibt separat). Schritte in Reihenfolge:

- [x] **Schritt 1: Biome eingerichtet** (2026-06-05) — `biome.json` mit Spaces 2 / lineWidth 100, `pnpm lint` und `pnpm lint:fix` als Scripts, initialer Format-Pass über die ganze Codebase.
- [x] **Schritt 2: Rust-Strenge** (2026-06-05) — `cargo clippy --all-targets -- -D warnings` clean ohne Eingriffe; `cargo fmt --check` hatte zwei triviale Abweichungen in `lib.rs` (eine künstlich umgebrochene Zeile + fehlende Final-Newline), per `cargo fmt` korrigiert.
- [x] **Schritt 3: vitest** (2026-06-05) — `vitest@4.1.8` als devDependency, separate `vitest.config.ts` (env `node`, entkoppelt von der Tauri-`vite.config.ts`), Scripts `pnpm test` / `pnpm test:run`. 26 Tests in `src/lib/{recurrence,coverage,format}.test.ts`: zentrale Drift-Tests für die anker-additive Logik (`nextDueDate`/`dueDatesWithin` mit Anker 31.01.), Bucket-/Sortierungs-/Math.round-Verhalten in `coverage`, Locale-tolerante Regex-Matcher für `formatAmount`. `reminders.ts` (mit DB-Mock) auf später vertagt.
- [ ] **Schritt 4: Lefthook** als Pre-Commit-Hook — eine Binary, kein Node-Hook-Dance. Hooks: `cargo fmt --check`, `cargo clippy`, `pnpm lint`, `pnpm vitest run` (nur die schnellen Unit-Tests).
- [ ] **Schritt 5: GitHub Actions CI** — gleiche Checks wie lokal, triggert auf Push zu `main`. **Nicht** der große Matrix-Build (der bleibt im "Später"-Punkt für Release-Tags).

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
- [ ] **Komponenten-Tests via React Testing Library**, wenn UI komplexer wird (SubscriptionDialog hat schon viel State, SettingsDialog wird wachsen). Setzt vitest aus dem Tests-Block voraus.
- [ ] **E2E-Tests via Tauri WebDriver** vor `v1.0`. Großer Setup-Aufwand, ROI erst wenn echte User-Flows stabil bleiben müssen.
- [ ] **`CoverageItem` um `subscription_id` erweitern**, damit der React-Key in `OverviewSection` (`${subscription}-${date}`) trivial eindeutig wird. Aktuell pragmatische Annahme: pro Konto keine zwei Subs mit identischem Namen UND identischem Fälligkeitstag.

## Hinweise

Konventionen und Stack siehe [AGENTS.md](./AGENTS.md). Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben.
