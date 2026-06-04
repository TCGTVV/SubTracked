# Tech-Stack

- **Tauri v2** (Rust-Kern, System-WebView). Targets: Windows, Linux, macOS.
- **Frontend:** React 19 + TypeScript 5.8, Vite 7, `@vitejs/plugin-react`.
- **DB:** SQLite via `tauri-plugin-sql ~2.4`. Pflicht: `features = ["sqlite"]` in `src-tauri/Cargo.toml`.
- **Notifications:** `tauri-plugin-notification ~2.3`.
- **Autostart:** `tauri-plugin-autostart ~2.5` (nur Desktop, nicht Mobile — bereits per `cfg`-Gate in `Cargo.toml`).
- **Util:** `date-fns ^4`, `@tauri-apps/plugin-opener`.
- **Paketmanager:** `pnpm` (mit `pnpm-workspace.yaml`, das `allowBuilds: esbuild: true` setzt).

## SQLite-Pfad

`sqlite:subtracker.db` — registriert in `src-tauri/src/lib.rs`. Liegt im OS-spezifischen App-Data-Verzeichnis von Tauri.

## TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` aktiv — neue Dead-Variables/Params brechen den Build.
