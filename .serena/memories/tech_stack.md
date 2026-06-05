# Tech-Stack

- **Tauri v2** (Rust-Kern, System-WebView). Targets: Windows, Linux, macOS.
- **Frontend:** React 19 + TypeScript 5.8, Vite 7, `@vitejs/plugin-react`.
- **DB:** SQLite via `tauri-plugin-sql ~2.4`. Pflicht: `features = ["sqlite"]` in `src-tauri/Cargo.toml`.
- **Notifications:** `tauri-plugin-notification ~2.3`.
- **Autostart:** `tauri-plugin-autostart ~2.5` (nur Desktop, nicht Mobile — bereits per `cfg`-Gate in `Cargo.toml`).
- **Util:** `date-fns ^4`, `@tauri-apps/plugin-opener`.
- **Paketmanager:** `pnpm@11.3.0` (deklariert via `packageManager`-Feld in `package.json`). Benötigt Node.js **≥ 22.13** wegen `node:sqlite`-Builtin. `pnpm-workspace.yaml` setzt `allowBuilds.esbuild: true` und `allowBuilds.lefthook: true` (lefthook braucht das postinstall-Script, das die Go-Binary downloadet — pnpm v11 blockt sonst aus Sicherheitsgründen).

## Qualität & Tests (Stand 2026-06-05, fünf Schritte alle erledigt)

- **Biome** (`@biomejs/biome ^2.4.16`) als Lint+Formatter. Config in `biome.json` (Spaces 2, `lineWidth 100`, `useIgnoreFile: true`, `organizeImports: on`). Scripts `pnpm lint` und `pnpm lint:fix`.
- **vitest** (`^4.1.8`) für Pure-Logic-Tests. Separate `vitest.config.ts` mit `environment: "node"`, entkoppelt von der Tauri-`vite.config.ts`. 26 Tests in `src/lib/{recurrence,coverage,format}.test.ts`. Scripts: `pnpm test` (watch) und `pnpm test:run` (einmalig/CI).
- **Lefthook** (`^2.1.9`) als Pre-Commit-Hook. Config in `lefthook.yml`, vier parallele Jobs (biome, vitest, cargo fmt, cargo clippy). `prepare`-Script (`lefthook install`) wird beim `pnpm install` automatisch ausgeführt — neue Cloner brauchen keinen Init-Schritt.
- **GitHub Actions CI** in `.github/workflows/checks.yml`. Triggers: push auf `main` + pull_request. Job auf `ubuntu-latest` mit Tauri-Linux-Deps (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`, `build-essential`). Identische Checks wie lokal (`pnpm lint` / `pnpm test:run` / `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings`).
- **Rust-Strenge**: `cargo clippy --all-targets -- -D warnings` und `cargo fmt --check` als Standard. Im CI über `Swatinem/rust-cache@v2` mit `workspaces: src-tauri` gecacht.

## SQLite-Pfad

`sqlite:subtracker.db` — registriert in `src-tauri/src/lib.rs`. Das `tauri-plugin-sql` legt die Datei im **App-Config-Dir** ab (nicht Data-Dir, Sonderheit — siehe `app_config_dir()` in `tauri-plugin-sql/src/wrapper.rs`). Auf Linux: `~/.config/com.tcgtvv.subtracked/subtracker.db`. macOS: `~/Library/Application Support/com.tcgtvv.subtracked/`. Windows: `%APPDATA%\com.tcgtvv.subtracked\`. WAL-Mode aktiv (`journal_mode=wal`).

## TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` aktiv — neue Dead-Variables/Params brechen den Build.
