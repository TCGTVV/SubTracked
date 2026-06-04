# BACKLOG.md

Aufgabenliste für SubTracked. Reihenfolge = grobe Priorität. Erledigtes abhaken, nicht löschen (Verlauf).

## ✅ Erledigt

- [x] Tauri-v2-Gerüst (React + TypeScript, pnpm)
- [x] Plugins eingebunden: `sql`, `notification`, `autostart`
- [x] SQLite-Schema als Migration (`0001_init.sql`) + in `lib.rs` registriert
- [x] `sqlite`-Feature in `Cargo.toml` aktiviert
- [x] Framework-unabhängige Logik vorhanden: `recurrence.ts`, `coverage.ts`, `db.ts`, `reminders.ts`
- [x] Auf GitHub gepusht (Commit mit Schutz-E-Mail)

## 🔨 Jetzt (Oberfläche)

- [ ] **Abo-Liste** anzeigen (Name, Betrag, nächste Fälligkeit, Konto) — nutzt `db.listSubscriptions()` + `recurrence.nextDueDate()`
- [ ] **Abo anlegen / bearbeiten / löschen** (Formular) — `db.addSubscription()`, `db.deleteSubscription()`
- [ ] **Konten** anlegen/auswählen — `db.listAccounts()`, `db.addAccount()`
- [ ] **Kontodeckungs-Ansicht** (anstehende Abflüsse je Konto, N Monate) — `coverage.computeCoverage()`
- [ ] **Erinnerungs-Check verdrahten:** `runReminderCheck()` beim App-Start + stündliches Intervall in `App.tsx`
- [ ] Standard-Template-Reste (`greet`-Demo) durch echte UI ersetzen

## ⏭️ Als Nächstes (Hintergrund-Betrieb)

- [ ] **Tray-Icon** + Fenster beim Schließen nur verstecken (App läuft weiter)
- [ ] **Autostart beim Login** über Einstellungen aktivierbar (`@tauri-apps/plugin-autostart` `enable()`)
- [ ] Notification-Berechtigung sauber abfragen und Status anzeigen
- [ ] Vorlaufzeit (`lead_days`) pro Abo in der UI editierbar

## 🌱 Später

- [ ] **GitHub-Actions-Matrix-Build** (`tauri-action`) für Win/Linux/macOS-Installer bei jedem Release-Tag
- [ ] App-Icon / Branding
- [ ] Import/Export (CSV) der Abos
- [ ] Mehrwährungs-Handling in der Kontodeckung (Umrechnung)
- [ ] Tests für `recurrence.ts` und `coverage.ts` ins Repo aufnehmen
- [ ] Optionale weitere Kanäle (z.B. Telegram) als Alternative zu nativen Notifications
- [ ] Auf Windows und macOS testen
- [ ] Migration: `ON DELETE CASCADE` für `reminders.subscription_id`, damit beim Löschen eines Abos keine Waisen-Reminder zurückbleiben
- [ ] `SubRow.interval`: aus SQLite kommt ein roher `string` — sauberer Cast in `mapSub` statt implizit auf `Interval` zu vertrauen (DB-`CHECK` greift, aber Typ ist optimistisch)
- [ ] `tauri-plugin-opener` entfernen, falls nicht für externe Links genutzt (aktuell ungenutzt)
- [ ] **Lokalisierung der Eingaben** — Inputs sollten DE-Konventionen tolerieren, nicht nur HTML-Standards. Konkret: Beträge mit Komma *und* Punkt als Dezimaltrenner annehmen (z.B. `12,99` und `12.99` beide gültig), Tausendertrennzeichen ignorieren. Mittelfristig: ein gemeinsamer Eingabe-Parser für Beträge an einer Stelle

## Hinweise

Konventionen und Stack siehe [AGENTS.md](./AGENTS.md). Geld in Cent, Datum als `YYYY-MM-DD`, `recurrence.ts` nicht naiv umschreiben.
