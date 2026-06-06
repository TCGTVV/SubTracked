<p align="center">
  <img src="assets/logo.png" alt="SubTracked-Logo" width="480">
</p>

# SubTracked

Persönlicher Abo-Tracker als native Desktop-App. Verwaltet wiederkehrende Zahlungen, kündigt Fälligkeiten als System-Notifications an und zeigt deine Konten 6 Monate in die Zukunft. Im Tray leise im Hintergrund.

Im Eigenbedarf gebaut: lokal, eigene Daten, kein Account, kein SaaS — Tabellen-Tracking ersetzt durch einen Client, dem man die Pflege nicht jedes Mal antrainieren muss.

## Funktionen

- **Abos verwalten** mit Name, Betrag, Konto, Intervall (monatlich / quartalsweise / jährlich), erster Fälligkeit
- **Erinnerungen** als native System-Notifications, einstellbare Vorlaufzeit pro Abo, pro Abo stummschaltbar
- **Übersicht**: monatliche Fixkosten-Baseline und 6-Monats-Deckung pro Konto
- **Hintergrund-Betrieb**: Tray-Icon, Fenster-X versteckt das Fenster (App läuft weiter), optional Autostart beim Login

## Tech

- **[Tauri 2](https://tauri.app/)** (Rust-Kern, System-WebView)
- **React 19** + **TypeScript** (strict)
- **SQLite** über eigenen [`sqlx`](https://github.com/launchbadge/sqlx)-Pool im Rust-Hauptprozess (WAL-Mode, Migrations via `sqlx::migrate!`)
- **Reminder-Loop** in Rust mit `tokio` + `chrono`, sendet native OS-Notifications über [`tauri-plugin-notification`](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/notification)
- **Biome** für Lint + Format
- **Vitest** (Frontend) + **`cargo test`** (Rust) für Tests, **Lefthook** als Pre-Commit-Gate, GitHub Actions als CI

## Status

Funktional komplett für den Eigenbedarf (Stand 2026-06-06). Entwickelt und genutzt auf Linux (KDE/Cachyos). Windows und macOS sollten technisch funktionieren, sind aber nicht getestet. Noch keine getaggte Version, keine vorgefertigten Installer — siehe Quellbau unten.

## Aus Source bauen

Voraussetzungen:

- Node ≥ 22.13 und [pnpm](https://pnpm.io/)
- Rust (stable)
- [Tauri-Build-Deps](https://tauri.app/start/prerequisites/) für dein OS (auf Linux z.B. `webkit2gtk`, `libayatana-appindicator`, …)

```bash
pnpm install
pnpm tauri dev      # Dev-Modus mit Hot-Reload
pnpm tauri build    # OS-spezifischer Installer in src-tauri/target/release/bundle/
```

## Entwicklung

Lint, Tests und Qualitäts-Gates lokal (Rust-Befehle aus `src-tauri/`):

```bash
pnpm lint                                       # Biome (Lint + Format-Check)
pnpm test:run                                   # Vitest (Frontend-Unit-Tests)
cd src-tauri && cargo test                      # Rust-Tests (Recurrence-Logik)
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

[Lefthook](https://github.com/evilmartians/lefthook) hängt sich beim Commit automatisch ein und fährt diese parallel; Push triggert GitHub Actions als zusätzlichen Lauf.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
