<p align="center">
  <img src="assets/logo.png" alt="SubTracked-Logo" width="480">
</p>

# SubTracked

Liquiditäts-Radar für wiederkehrende Zahlungen. Pflegt deine Abos, schreibt deine Konten in die Zukunft fort und warnt früh, wenn das Geld eng wird. Native Desktop-App, im Tray leise im Hintergrund.

Im Eigenbedarf gebaut: lokal, eigene Daten, kein Account, kein SaaS — Tabellen-Tracking ersetzt durch einen Client, dem man die Pflege nicht jedes Mal antrainieren muss.

## Funktionen

### Konten + Deckung

- **Konten mit Saldo und Mindestpuffer**: pro Konto Währung, aktueller Stand und optionaler Sicherheitsbetrag. Saldo wird ab heute mit den anstehenden Abbuchungen fortgeschrieben.
- **Deckungswarnung**: orange Markierung sobald der Forecast unter den Mindestpuffer fällt, rot sobald er unter null geht. Pro Buchung sieht man den Saldo danach.
- **Saubere Mehrwährungs-Sicht**: jedes Konto rechnet in seiner eigenen Währung, fremde Abos werden ehrlich als „N Abos in anderer Währung werden hier nicht berücksichtigt" markiert statt heimlich umgerechnet.

### Abos

- **Verwalten** mit Name, Betrag, Konto, Intervall (monatlich / quartalsweise / jährlich) und erster Fälligkeit. Toleranter Betrags-Parser (akzeptiert `12,99`, `12.99`, `1.234,56`).
- **Demnächst (30 Tage)**: kompakte Liste aller Fälligkeiten im nächsten Monat — der tägliche Arbeitsmodus.
- **Filter und Sortierung** für die Abo-Liste (nach Konto, Währung, Erinnerungs-Status; sortierbar nach Name, Fälligkeit, Betrag).
- **Archivieren statt Löschen**: gekündigte oder pausierte Abos verschwinden aus dem Forecast, lassen sich aber jederzeit reaktivieren.

### Erinnerungen

- **Native System-Notifications** mit einstellbarer Vorlaufzeit pro Abo, pro Abo stummschaltbar.
- **Sichtbarer Reminder-Status** in den Einstellungen: letzte Prüfung, nächste geplante Prüfung, letzte gesendete Erinnerung — plus Button für eine sofortige Test-Notification.
- **Idempotente Sendung**: ein Reminder wird erst dann als „gesendet" markiert, wenn die Notification wirklich rausging.

### Hintergrund-Betrieb

- **Tray-Icon**, Fenster-X versteckt das Fenster (App läuft weiter).
- **Autostart beim Login** über die Einstellungen aktivierbar.
- **Stündlicher Reminder-Loop** im Rust-Hauptprozess — unabhängig vom Webview-Lifecycle, läuft auch wenn das Fenster versteckt ist.

## Tech

- **[Tauri 2](https://tauri.app/)** (Rust-Kern, System-WebView)
- **React 19** + **TypeScript** (strict)
- **SQLite** über eigenen [`sqlx`](https://github.com/launchbadge/sqlx)-Pool im Rust-Hauptprozess (WAL-Mode, Migrations via `sqlx::migrate!`)
- **Reminder-Loop** in Rust mit `tokio` + `chrono`, sendet native OS-Notifications über [`tauri-plugin-notification`](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/notification)
- **Biome** für Lint + Format
- **Vitest** (Frontend) + **`cargo test`** (Rust) für Tests, **Lefthook** als Pre-Commit-Gate, GitHub Actions als CI

## Status

Funktional komplett für den Eigenbedarf (Stand 2026-06-07). Entwickelt und genutzt auf Linux (KDE/Cachyos). Windows und macOS sollten technisch funktionieren, sind aber nicht getestet. Noch keine getaggte Version, keine vorgefertigten Installer — siehe Quellbau unten.

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
