# Tech-Stack

- **Tauri v2** (Rust-Kern, System-WebView). Targets: Windows, Linux, macOS.
- **Frontend:** React 19 + TypeScript 5.8, Vite 7, `@vitejs/plugin-react`.
- **DB:** SQLite via **eigenem `sqlx`-Pool** (`sqlx 0.9.0`, Features `runtime-tokio`, `sqlite`, `macros`, `migrate`). Pool wird im Tauri-`setup`-Block geöffnet und in `app.manage(AppState { db: pool })` abgelegt. Migrations laufen via `sqlx::migrate!("./migrations").run(&pool)` direkt nach dem Pool-Open. Frontend ruft `invoke<T>(...)` aus `@tauri-apps/api/core`; die DB-Schicht in Rust liegt in `src-tauri/src/{db,commands}.rs`. Seit 2026-06-06 ist das die **einzige** DB-Schicht — `tauri-plugin-sql` (Crate + `@tauri-apps/plugin-sql`) komplett raus.
- **Date-Math:** `chrono 0.4` (`no-default-features`, Features `clock`, `std`) für den Reminder-Scheduler. Anker-additive Recurrence-Logik in `src-tauri/src/recurrence.rs` (parallel zur TS-Version in `src/lib/recurrence.ts`, die weiter für die Kontodeckungs-Ansicht im Frontend gebraucht wird).
- **Async-Tasks:** `tokio 1` (Feature `time`) für `tokio::time::sleep` im Reminder-Loop. tauri::async_runtime ist der Spawn-Wrapper.
- **Notifications:** `tauri-plugin-notification ~2.3`. Aus Rust via `NotificationExt::notification().builder()...`. Permission-Check über `permission_state() == PermissionState::Granted`.
- **Autostart:** `tauri-plugin-autostart ~2.5` (nur Desktop, nicht Mobile — bereits per `cfg`-Gate in `Cargo.toml`).
- **Util-Frontend:** `date-fns ^4` (für `recurrence.ts` / `coverage.ts` / `format.ts`).
- **Paketmanager:** `pnpm@11.3.0` (deklariert via `packageManager`-Feld in `package.json`). Benötigt Node.js **≥ 22.13** wegen `node:sqlite`-Builtin. `pnpm-workspace.yaml` setzt `allowBuilds.esbuild: true` und `allowBuilds.lefthook: true` (lefthook braucht das postinstall-Script, das die Go-Binary downloadet — pnpm v11 blockt sonst aus Sicherheitsgründen).

## Qualität & Tests (Stand 2026-06-05, fünf Schritte alle erledigt)

- **Biome** (`@biomejs/biome ^2.4.16`) als Lint+Formatter. Config in `biome.json` (Spaces 2, `lineWidth 100`, `useIgnoreFile: true`, `organizeImports: on`). Scripts `pnpm lint` und `pnpm lint:fix`.
- **vitest** (`^4.1.8`) für Pure-Logic-Tests im Frontend. Separate `vitest.config.ts` mit `environment: "node"`. 26 Tests in `src/lib/{recurrence,coverage,format}.test.ts`. Scripts: `pnpm test` (watch) und `pnpm test:run` (einmalig/CI).
- **`cargo test`** für Rust-Unit-Tests. Aktuell 5 Tests in `src-tauri/src/recurrence.rs` (inkl. Anker-31.01-Drift-Beweis, analog zu den TS-Tests).
- **Lefthook** (`^2.1.9`) als Pre-Commit-Hook. Config in `lefthook.yml`, vier parallele Jobs (biome, vitest, cargo fmt, cargo clippy). `prepare`-Script (`lefthook install`) wird beim `pnpm install` automatisch ausgeführt — neue Cloner brauchen keinen Init-Schritt.
- **GitHub Actions CI** in `.github/workflows/checks.yml`. Triggers: push auf `main` + pull_request. Job auf `ubuntu-latest` mit Tauri-Linux-Deps (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`, `build-essential`). Identische Checks wie lokal (`pnpm lint` / `pnpm test:run` / `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings`).
- **Rust-Strenge**: `cargo clippy --all-targets -- -D warnings` und `cargo fmt --check` als Standard. Im CI über `Swatinem/rust-cache@v2` mit `workspaces: src-tauri` gecacht.

## SQLite-Pfad

`subtracker.db` — im Tauri-`setup`-Block via `app.path().app_config_dir().join("subtracker.db")` geöffnet. Auf Linux: `~/.config/com.tcgtvv.subtracked/subtracker.db`. macOS: `~/Library/Application Support/com.tcgtvv.subtracked/`. Windows: `%APPDATA%\com.tcgtvv.subtracked\`. WAL-Mode aktiv (`SqliteConnectOptions::journal_mode(SqliteJournalMode::Wal)`); `create_if_missing(true)` legt die Datei bei frischer Installation an. Foreign-Key-Enforcement ist unter `sqlx-sqlite` per Default an — das `delete_subscription`-Command wickelt das daher in eine Transaktion (Reminders zuerst, dann Abo).

## Rust-Architektur (seit 2026-06-06)

- `src-tauri/src/lib.rs` — Tauri-Builder, Plugin-Registrierung, `invoke_handler!`, Pool-Setup im Setup-Block, Tray + Window-Verhalten, **Reminder-Scheduler-Spawn** (`tauri::async_runtime::spawn` mit initial-Check und `tokio::time::sleep(REMINDER_INTERVAL)`-Loop, `REMINDER_INTERVAL = 1h`).
- `src-tauri/src/db.rs` — `AppState { db: SqlitePool }` als Tauri-managed State, plus Rust-Structs `Subscription` / `Account` / `NewSubscription` mit `#[derive(sqlx::FromRow, Serialize, Deserialize)]` und `#[serde(rename_all = "camelCase")]` für die JSON-Bridge.
- `src-tauri/src/commands.rs` — neun `#[tauri::command(rename_all = "camelCase")]`-Funktionen: `list_subscriptions`, `list_accounts`, `add_subscription`, `delete_subscription`, `add_account`, `delete_account`, `count_subs_for_account`, `update_subscription`, `insert_reminder_if_new`.
- `src-tauri/src/recurrence.rs` — `next_due_date(anchor, interval, from)` mit anker-additiver Logik via `NaiveDate::checked_add_months(Months::new(k * step))`. Tests in `mod tests` (inkl. 31.-Anker-Drift, Quartal/Jahr, Schaltjahr-Klemmung, Fehlerpfad).
- `src-tauri/src/reminders.rs` — `run_reminder_check(pool, app_handle) -> Result<u32, String>`: liest aktive Subs, prüft pro Sub `notify`/Vorlauf-Fenster, `INSERT OR IGNORE INTO reminders` für Idempotenz, sendet Notification via `tauri-plugin-notification` wenn Permission granted.

## TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` aktiv — neue Dead-Variables/Params brechen den Build.
