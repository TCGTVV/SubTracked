# SubTracked

Persönlicher Abo-Tracker, der im System-Tray lebt. Verwaltet wiederkehrende Zahlungen, zeigt anstehende Fälligkeiten als native System-Notifications und gibt eine 6-Monats-Kontodeckungs-Übersicht.

Frühphasig, im Eigenbedarf — gebaut als Ersatz für Tabellen-/Notiz-Zettel-Tracking durch etwas Natives und Stilles.

## Funktionen

- **Abos verwalten** mit Name, Betrag, Konto, Intervall (monatlich / quartalsweise / jährlich), erster Fälligkeit
- **Erinnerungen** als native System-Notifications, einstellbare Vorlaufzeit pro Abo, pro Abo stummschaltbar
- **Übersicht**: monatliche Fixkosten-Baseline und 6-Monats-Deckung pro Konto
- **Hintergrund-Betrieb**: Tray-Icon, Fenster-X versteckt das Fenster (App läuft weiter), optional Autostart beim Login

## Tech

- **[Tauri 2](https://tauri.app/)** (Rust-Kern, System-WebView)
- **React 19** + **TypeScript** (strict)
- **SQLite** über [`tauri-plugin-sql`](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/sql) (WAL-Mode)
- Native OS-Notifications über [`tauri-plugin-notification`](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/notification)
- **Biome** für Lint + Format

## Status

Funktional komplett für den Eigenbedarf (Stand 2026-06-05). Entwickelt und genutzt auf Linux (KDE/Cachyos). Windows und macOS sollten technisch funktionieren, sind aber nicht getestet. Noch keine getaggte Version, keine vorgefertigten Installer — siehe Quellbau unten.

## Aus Source bauen

Voraussetzungen:

- Node ≥ 20 und [pnpm](https://pnpm.io/)
- Rust (stable)
- [Tauri-Build-Deps](https://tauri.app/start/prerequisites/) für dein OS (auf Linux z.B. `webkit2gtk`, `libayatana-appindicator`, …)

```bash
pnpm install
pnpm tauri dev      # Dev-Modus mit Hot-Reload
pnpm tauri build    # OS-spezifischer Installer in src-tauri/target/release/bundle/
```

## Lizenz

MIT — siehe [LICENSE](LICENSE).
