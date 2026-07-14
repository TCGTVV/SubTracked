# Tech-Stack

- **Tauri v2** (Rust-Kern, System-WebView). Targets: Windows, Linux, macOS.
- **Frontend:** React 19 + TypeScript 5.8, Vite 7, `@vitejs/plugin-react`.
- **UI-Stack:** Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (new-york, baseColor neutral; `src/components/ui/`) auf `radix-ui`-Umbrella (`^1.5`, nicht die `@radix-ui/react-*`-Einzelpakete) + lucide-react. `cn()` (`clsx`+`tailwind-merge`) in `src/lib/utils.ts`, `class-variance-authority` für Varianten, `tw-animate-css` für Enter/Exit-Animationen. Alias `@`→`src`. Token-System + Fluid-`clamp()`-Tokens + Dark-Mode (`.dark`) in `src/index.css` (oklch). Kein MUI/Emotion/`App.css`. `react-day-picker` v10 (Calendar handgeschrieben gegen v10-API). Gotcha: `Select` läuft auf `position="popper"` (item-aligned flackert beim Schließen in WebKitGTK); globale `[data-state="closed"]{animation-fill-mode:forwards}`-Regel in `index.css` fixt das Exit-Flicker aller Radix-Overlays.
- **DB:** SQLite via eigenem `sqlx`-Pool (`sqlx 0.9.0`, Features `runtime-tokio`, `sqlite`, `macros`, `migrate`). Pool wird im Tauri-`setup`-Block geöffnet, `app.manage(AppState { db: pool })`. Migrations via `sqlx::migrate!("./migrations").run(&pool)` direkt nach dem Pool-Open. Frontend ruft `invoke<T>(...)` aus `@tauri-apps/api/core`; DB-Schicht liegt in `src-tauri/src/{db,commands}.rs` — seit 2026-06-06 die einzige DB-Schicht (`tauri-plugin-sql` komplett raus). Details zu Rust→TS-Typgenerierung und Compile-time-verifizierten Queries (ts-rs, `sqlx::query!`, `.sqlx`-Cache, `SQLX_OFFLINE`): `mem:rust_build_pipeline`.
- **Date-Math:** `chrono 0.4` (no-default-features, Features `clock`, `std`) für den Reminder-Scheduler. Anker-additive Recurrence-Logik in `src-tauri/src/recurrence.rs`, parallel zu `src/lib/recurrence.ts`.
- **Async-Tasks:** `tokio 1` (Feature `time`) für `tokio::time::sleep` im Reminder-Loop. `tauri::async_runtime` als Spawn-Wrapper.
- **Logging:** `tracing` + `tracing-subscriber` (Feature `env-filter`) + `tracing-appender`. Zwei Layer im Setup-Block: stdout + Daily-Rolling-File in `app_log_dir()` (max. 7 Tagesdateien). Default-Level `info`, Override via `RUST_LOG`.
- **Notifications:** `tauri-plugin-notification ~2.3`. Permission-Check über `permission_state() == PermissionState::Granted`.
- **Autostart:** `tauri-plugin-autostart ~2.5` (Desktop-only, per `cfg`-Gate).
- **Util-Frontend:** `date-fns ^4` (für `recurrence.ts`/`coverage.ts`/`format.ts`).
- **Paketmanager:** `pnpm@11.3.0`. Benötigt Node.js ≥ 22.13 (`node:sqlite`-Builtin). `pnpm-workspace.yaml` setzt `allowBuilds.esbuild`/`allowBuilds.lefthook` = true (lefthook braucht das postinstall-Script für die Go-Binary).

## Qualität & Tooling

**Frontend:** Biome (Lint+Format, `pnpm lint`), Vitest 4 + RTL + axe-core (`pnpm test:run`, jsdom-Environment), Knip (unbenutzte Dateien/Exports/Typen, `pnpm knip`, Config `knip.json`). Details zu Vitest/RTL/axe-Gotchas (Radix-Portal-Queries, jsdom-Stubs, Mock-Pattern): `mem:frontend_test_setup`.
**Rust:** cargo-nextest (Testrunner, `cargo nextest run` in `src-tauri/`), rustfmt/clippy (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`), cargo-machete (unbenutzte Dependencies, `cargo machete`), cargo-deny (Lizenzen/Bans/Sources, Config `src-tauri/deny.toml`).
**CI:** GitHub Actions. `checks.yml` — Lint, Knip, Vitest, cargo fmt/clippy/nextest/machete, TS-Bindings-Frische-Check, sqlx-Cache-Frische-Check. `security.yml` — pnpm audit, cargo-audit, cargo-deny (nur bans/licenses/sources — Advisories deckt cargo-audit ab).
**Pre-Commit:** Lefthook, vier parallele Jobs (biome, vitest, cargo fmt, cargo clippy) — bewusst **ohne** nextest/knip/machete, um Commits schnell zu halten; die volle Prüfung läuft in CI.

## SQLite-Pfad

`subtracker.db` — via `app.path().app_config_dir().join("subtracker.db")`. Linux `~/.config/com.tcgtvv.subtracked/`, macOS `~/Library/Application Support/com.tcgtvv.subtracked/`, Windows `%APPDATA%\com.tcgtvv.subtracked\`. WAL-Mode aktiv, `create_if_missing(true)`. FK-Enforcement per Default an (`sqlx-sqlite`) — `delete_subscription` läuft daher in einer Transaktion (Reminders zuerst, dann Abo).

## TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` aktiv — neue Dead-Variables/Params brechen den Build.
