# Task Completion

Vor "fertig":

1. **TypeScript-Check:** `pnpm build` (führt `tsc && vite build` aus). Build muss durchlaufen — `strict` + `noUnused*` aktiv.
2. **App startet:** `WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri dev` (Linux) bzw. `pnpm tauri dev` (sonst). Fenster öffnet sich ohne Rust-Panic.
3. **Manuelle Smoke-Tests:** geänderten Pfad in der UI tatsächlich ausführen (Tauri-Plugins wie SQL/Notification/Autostart sind nicht headless testbar).
4. **Keine Secrets committen** (`.env`, Credentials).
5. **BACKLOG.md updaten:** erledigte Punkte abhaken (nicht entfernen — Verlauf bleibt sichtbar).

## Linter/Formatter

Aktuell **nicht eingerichtet** (kein ESLint, Prettier, rustfmt-CI). Nicht erfinden — wenn der Nutzer einen Lint-Lauf erwartet, vorher klären.

## Automatisierte Tests

Aktuell **nicht im Repo** (siehe Backlog "Tests für `recurrence.ts` und `coverage.ts` ins Repo aufnehmen"). Keine `pnpm test`-Pipeline behaupten — bei Änderungen an `recurrence.ts`/`coverage.ts` besonders sorgfältig manuell verifizieren.
