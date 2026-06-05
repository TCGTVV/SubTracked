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

- [ ] **Dropdown-Lesbarkeit im Dark-Mode** — Native `<select>`-Elemente (Intervall + Konto im `SubscriptionDialog`) bleiben mit hellem Hintergrund, während die App-Schrift im Dark-Mode weiß ist. Ergebnis: weiß auf weiß, unlesbar. WebKitGTK rendert native Form-Controls in OS-Defaults, das CSS-Variablen-System der App greift dort nicht automatisch durch. Quick-Fix via expliziter Dark-Mode-Regel für `select`/`option` (background + color setzen). **Hinweis**: Das geplante UI-Redesign Richtung Material 3 (Backlog "🌱 Später") würde das eh komplett ersetzen — aber bis dahin ist die Bedienung blockiert, also Quick-Fix lohnt.
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
- [x] **Schritt 4: Lefthook** (2026-06-05) — `lefthook@2.1.9` als devDependency. `lefthook.yml` mit vier parallelen Jobs (biome, vitest, cargo fmt, cargo clippy), Trockenlauf in 1,5 s grün. `prepare`-Script ruft `lefthook install` beim `pnpm install`, damit jeder Cloner die Hooks automatisch bekommt. `pnpm-workspace.yaml` (`allowBuilds.lefthook: true`) freigibt das postinstall, das die Go-Binary downloadet.
- [x] **Schritt 5: GitHub Actions CI** (2026-06-05) — `.github/workflows/checks.yml` mit einem `checks`-Job auf `ubuntu-latest`. Steps: Tauri-Linux-Deps via apt, pnpm + Node 20 (cached), Rust-Toolchain mit clippy+rustfmt, `Swatinem/rust-cache` für die Cargo-Builds, dann `pnpm lint` → `pnpm test:run` → `cargo fmt --check` → `cargo clippy --all-targets -- -D warnings`. Triggers: push auf `main` + pull_request. Concurrency-Group cancelt veraltete Runs. Damit ist die ganze Tests-/Qualitäts-Strategie abgeschlossen.

## 🏛️ Architektur (Diskussion)

User hat am 2026-06-05 explizit eine Architektur-Diskussion angestoßen, weil eine zweite Meinung (Codex) "alles perfekt, keine Luft nach oben" gemeldet hatte. **Diskussion durchgeführt, Ranking nach Wert-pro-Aufwand festgelegt** — Reihenfolge der Hands-on-Umsetzung: (1) Custom Hooks → (3) Reminder im Rust → (2) Tauri-Commands. Punkte 4–8 sind weiterhin Diskussions-Material und werden vor Hands-on einzeln durchgesprochen.

- [x] **➊ Custom Hooks für `App.tsx`-Orchestrierung** (2026-06-05, Commit `1e936ba`) — drei Hooks unter `src/hooks/`: `useSubscriptions` (subs/accounts/loading/error/reload), `useNotificationPermission` (Status + activate), `useReminderLoop` (setInterval-Setup, JSDoc verweist auf ➋). App.tsx von 211 → 152 Zeilen, 7 useState + 3 useEffect → 2 useState + 1 useEffect (UI-State only) + 3 Hook-Aufrufe. Bewusst keine State-Library — Custom Hooks reichen für den Stand, ebnen ➍ (Komponenten-Testbarkeit).
- [ ] **➌ Tauri-Commands statt direktem `plugin-sql`-Zugriff** (hands-on, Reihenfolge 3, größter Block — eigene Session sinnvoll). Backend-Logik im Frontend (`src/lib/db.ts` enthält die SQL-Queries und das DB↔TS-Mapping, `src-tauri/src/lib.rs` ist quasi leer). Wir nutzen Tauri eher als "Browser mit SQLite-API" als als "Native Backend + UI-Frontend". Alternative: `#[tauri::command]`-Funktionen in Rust, Typen via `tauri-specta` generiert. Trade-off: mehr Boilerplate, klare Schichtung, native Performance bei großen Queries, Frontend wird "dümmer" und einfacher portabel (Mobile später).
- [ ] **➋ Reminder-Loop ins Rust-Backend** (hands-on, Reihenfolge 2). Reminder-Loop im Webview (`App.tsx:55ff`, `setInterval(tick, 60 * 60 * 1000)` in einem `useEffect`). Bekannte Achille-Sehne, schon im HANDOVER vermerkt: pausiert bei minimiertem Fenster / System-Suspend. Echte Architektur-Lösung wäre ein Rust-Side-Scheduler im Hauptprozess. Für eine Notification-zentrale App ist das nicht akademisch.
- [ ] **Komponenten-Testbarkeit** strukturell blockiert: Components rufen `db.*` direkt → ohne DB-Mock unmöglich zu testen. Backlog "Komponenten-Tests" listet das als Setup-Aufwand. Ein dünner Repository-Layer (z.B. ein `useSubscriptions()`-Hook der `db.listSubscriptions()` einkapselt) macht Mocking trivial.
- [ ] **Concerns-Mix in `reminders.ts`**: `runReminderCheck` liest DB + berechnet + sendet Notification + schreibt DB. Pure-Logic-Tests deshalb nicht möglich (siehe `Schritt 3` der Tests-Strategie, `reminders.ts` bewusst vertagt). Cleaner: pure `computeDueReminders(subs, lastReminders, now)` + Side-Effect `dispatchReminders(due)` als Orchestrator.
- [ ] **Reload-Pattern grobgranular**: jedes CRUD → `reloadAll()` → kompletter DB-Refresh. Bei <50 Subs unbemerkt, danach spürbar. Pattern: optimistic update + lokale State-Mutation + Rollback bei DB-Fehler. Optional, nicht akut.
- [ ] **Error-Boundary fehlt**: ein React-Crash in einer beliebigen Komponente killt die ganze App ohne Recovery. Schneller Add (~30 Min) mit hoher Hygiene-ROI.
- [ ] **i18n-Vorbereitung**: deutsche Strings hart im JSX. Single-Locale aktuell OK; falls Englisch später kommt, größerer Refactor. Pragmatisch: erst lösen wenn nötig, aber als bewusste Entscheidung führen.

## 🌱 Später

- [ ] **UI-Redesign Richtung arsnova.eu** (Angular Material 3 / Material You als Vorlage) — Teal-Akzentpalette, Card-Layout, Material Icons, vollständige Dark-Mode-Parität, App-Feel statt Web-Formular. Vor Umsetzung Lib-Auswahl (MUI v6 / Material Web / shadcn+Tokens / Tailwind+M3). Designziel und nicht-zu-übernehmende Teile siehe Serena-Memory `mem:ui_vision`
- [ ] **GitHub-Actions-Matrix-Build** (`tauri-action`) für Win/Linux/macOS-Installer bei jedem Release-Tag
- [ ] App-Icon / Branding
- [ ] Import/Export (CSV) der Abos
- [ ] Mehrwährungs-Handling in der Kontodeckung (Umrechnung)
- [ ] Optionale weitere Kanäle (z.B. Telegram) als Alternative zu nativen Notifications
- [ ] Auf Windows und macOS testen
- [ ] Migration: `ON DELETE CASCADE` für `reminders.subscription_id`, damit beim Löschen eines Abos keine Waisen-Reminder zurückbleiben
- [x] `SubRow.interval`-Cast (2026-06-05) — `SubRow.interval: string` (wie aus SQLite kommt), neuer privater `parseInterval(s)`-Helper in `db.ts` validiert und narrowed beim Mapping, wirft bei unbekanntem Wert. Defense-in-Depth gegen DB-Manipulation von außen.
- [x] `tauri-plugin-opener` entfernt (2026-06-05) — war seit Tauri-Template-Setup eingebunden, im Frontend nirgends genutzt. Vier Stellen weg (Cargo.toml/Lock, lib.rs, capabilities/default.json, package.json/Lock). `cargo check` + `pnpm install` clean.
- [ ] **Lokalisierung der Eingaben** — Inputs sollten DE-Konventionen tolerieren, nicht nur HTML-Standards. Konkret: Beträge mit Komma *und* Punkt als Dezimaltrenner annehmen (z.B. `12,99` und `12.99` beide gültig), Tausendertrennzeichen ignorieren. Mittelfristig: ein gemeinsamer Eingabe-Parser für Beträge an einer Stelle
- [ ] **Komponenten-Tests via React Testing Library**, wenn UI komplexer wird (SubscriptionDialog hat schon viel State, SettingsDialog wird wachsen). Setzt vitest aus dem Tests-Block voraus.
- [ ] **E2E-Tests via Tauri WebDriver** vor `v1.0`. Großer Setup-Aufwand, ROI erst wenn echte User-Flows stabil bleiben müssen.
- [ ] **`CoverageItem` um `subscription_id` erweitern**, damit der React-Key in `OverviewSection` (`${subscription}-${date}`) trivial eindeutig wird. Aktuell pragmatische Annahme: pro Konto keine zwei Subs mit identischem Namen UND identischem Fälligkeitstag.

## Hinweise

Konventionen und Stack siehe [AGENTS.md](./AGENTS.md). Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben.
