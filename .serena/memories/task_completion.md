# Task Completion

Vor "fertig":

1. **Passende automatisierte Checks laufen lassen**:
   - Frontend/TS/UI: `pnpm build` und/oder `pnpm test:run`.
   - Rust: `cd src-tauri && cargo nextest run`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`.
   - Format/Lint allgemein: `pnpm lint` bzw. bei gewollten Auto-Fixes `pnpm lint:fix`.
   - Unbenutzte Dateien/Exports/Typen (Frontend): `pnpm knip`.
2. **Bei App-/Tauri-/Plugin-Aenderungen:** `pnpm tauri dev` starten. Auf Linux ist der Wayland-DMABUF-Fix im `pnpm tauri`-Script bereits gesetzt. Fenster muss ohne Rust-Panic starten.
3. **Manuelle Smoke-Tests:** geaenderten UI-/Plugin-Pfad tatsaechlich ausfuehren, soweit lokal moeglich. Tauri-Plugins wie Notification/Autostart sind nur begrenzt headless testbar.
4. **BACKLOG.md updaten:** erledigte Punkte abhaken, nicht entfernen.
5. **HANDOVER.md oben ergaenzen:** neuer Eintrag direkt unter der Anleitung, bei Codex-Eintraegen explizit "Codex" in Titel/Text nennen.
6. **Keine Secrets committen** (`.env`, Credentials, private Signier-Keys).

## Linter/Formatter

- **Biome** ist eingerichtet (`pnpm lint`, `pnpm lint:fix`).
- **rustfmt/clippy** sind Standard fuer Rust (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`).
- **Lefthook** laeuft beim Commit und fuehrt Biome, Vitest, cargo fmt und cargo clippy aus; Rust-Jobs koennen bei Non-Rust-Commits geskippt werden.

## Automatisierte Tests

- **Vitest/RTL**: `pnpm test:run` fuer Frontend-Unit- und Komponenten-Smoke-Tests.
- **Rust-Tests**: `cd src-tauri && cargo nextest run`, aktuell vor allem Recurrence und Reminder-Format-Helfer.
- **CI**: GitHub Actions faehrt Lint, Knip, Vitest, cargo fmt, cargo clippy und cargo nextest.
- Wenn Checks aus Zeit-/Umgebungsgruenden nicht liefen, im finalen Bericht ausdruecklich sagen.
