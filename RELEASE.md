# RELEASE.md — Wie SubTracked released wird

Solo-Projekt, lokal-first. Es gibt keinen Auto-Promotion-Pfad — jedes Release wird per Hand durchgeklickt, bevor es veröffentlicht wird.

## Release-Workflow (heutiger Stand)

1. **Tag setzen + pushen**: `git tag v0.X.Y && git push origin v0.X.Y`. Das triggert [.github/workflows/release.yml](.github/workflows/release.yml).
2. **CI baut** auf macOS (arm64 + x86_64), Linux (`ubuntu-22.04`) und Windows. Ergebnis: ein **Draft**-Release auf GitHub mit allen Installern. Dauer ca. 10–15 Min.
3. **Draft prüfen**: Assets vollständig (`.msi` + `-setup.exe`, `.dmg` + `.app.tar.gz` ×2, `.deb` + `.rpm` + `.AppImage`)? Version in den Dateinamen korrekt?
4. **Release-Text prüfen**: Die tauri-action legt den Body aus `.github/workflows/release.yml` an. Vor Veröffentlichung kurz gegen die Asset-Namen prüfen und bei Bedarf ergänzen (siehe Vorlage unten).
5. **Smoke-Checkliste durchgehen** (siehe unten) — auf jedem OS, das released wird.
6. **Draft veröffentlichen**, erst wenn alle Plattformen abgenommen sind. Vorher nicht.

## Release-Page für normale Nutzer

Der GitHub-Release muss ohne Projektwissen verständlich sein: was laden, was beim ersten Start erwartet wird, und dass die App lokal-first arbeitet.

### Download-Matrix

| System | Asset | Nutzung |
| --- | --- | --- |
| Windows | `SubTracked_0.1.0_x64_en-US.msi` | Standard-Installer; alternativ `SubTracked_0.1.0_x64-setup.exe`. |
| macOS Apple Silicon | `SubTracked_0.1.0_aarch64.dmg` | Macs mit M-Serie. |
| macOS Intel | `SubTracked_0.1.0_x64.dmg` | ältere Intel-Macs. |
| Linux Debian/Ubuntu | `SubTracked_0.1.0_amd64.deb` | Debian-, Ubuntu- und verwandte Systeme. |
| Linux Fedora/openSUSE/RHEL | `SubTracked-0.1.0-1.x86_64.rpm` | RPM-basierte Distributionen. |
| Linux universell | `SubTracked_0.1.0_amd64.AppImage` | ohne Installation startbar. |

Die `.app.tar.gz`-Assets für macOS werden für spätere Updater-/Automationspfade mitgebaut; normale Nutzer nehmen die `.dmg`.

### Release-Body-Vorlage

```markdown
SubTracked zeigt dir nicht nur, was deine Abos kosten, sondern wann dein Konto durch kommende Abbuchungen knapp wird. Lokale Desktop-App, keine Cloud, keine Registrierung.

## Download

- Windows: `SubTracked_0.1.0_x64_en-US.msi`
- macOS Apple Silicon: `SubTracked_0.1.0_aarch64.dmg`
- macOS Intel: `SubTracked_0.1.0_x64.dmg`
- Linux Debian/Ubuntu: `SubTracked_0.1.0_amd64.deb`
- Linux Fedora/openSUSE/RHEL: `SubTracked-0.1.0-1.x86_64.rpm`
- Linux universell: `SubTracked_0.1.0_amd64.AppImage`

## Hinweis zu unsignierten Builds

Diese frühe Version ist noch nicht code-signiert. macOS Gatekeeper und Windows SmartScreen können beim ersten Start warnen.

- macOS: `.dmg` öffnen, App nach `Applications` ziehen, dann per Rechtsklick → Öffnen starten.
- Windows: SmartScreen → Weitere Informationen → Trotzdem ausführen.

## Enthalten

- Konten mit Saldo, Mindestpuffer und Cashflow-Forecast
- Abos mit Erinnerungen, Archivierung, Preis-Historie und zweiwöchentlichem Intervall
- wiederkehrende und einmalige Einnahmen
- lokale SQLite-Datenbank und JSON-Backup/Restore
- native Notifications, Tray und Autostart

Smoke-getestet auf Linux, macOS und Windows. Details und Source-Build-Anleitung stehen im README.
```

### Wegwerf-Tags vor v0.1.0

Solange v0.1.0 noch nicht steht, sind Wegwerf-Tags (`v0.0.0-smoketest`, `v0.0.0-ci3`, …) ok, um die Pipeline zu triggern. Nach dem Test:

- Draft-Release auf GitHub löschen (`gh release delete <tag> --cleanup-tag`), oder
- Remote-Tag separat löschen falls `--cleanup-tag` an 401 scheitert: `git push origin :refs/tags/<tag>`
- Lokalen Tag entfernen: `git tag -d <tag>`

## Pre-Release-Smoke-Checkliste

Diese Liste deckt die zwei Backlog-Punkte „Windows/macOS Smoke-Test vor v0.1.0" und „Manuelle Pre-Release-Smoke-Checkliste dokumentieren" zusammen ab. Auf jedem OS einmal durchgehen.

### 0. Installer starten (unsigniert → OS-Warnung erwartet)

Solange wir keine Code-Signatur haben, blocken macOS Gatekeeper und Windows SmartScreen den ersten Start. Beides ist erwartet und kein Bug — der Test soll genau das mit erfassen.

- **macOS:**
  - `.dmg` öffnen, App nach `Applications` ziehen.
  - Erstes Öffnen: Im Finder `Applications` → Rechtsklick auf SubTracked → **Öffnen** (nicht Doppelklick — Doppelklick blockt mit „nicht verifizierter Entwickler"). Im Dialog „Öffnen" bestätigen.
  - Fallback bei „beschädigt"-Meldung: `xattr -d com.apple.quarantine /Applications/SubTracked.app` im Terminal.
- **Windows:**
  - `.msi` doppelklicken. SmartScreen-Warnung „Der PC wurde von Windows geschützt" → **„Weitere Informationen"** klicken → **„Trotzdem ausführen"**.
  - Installer durchklicken.

### 1. Erster Start
- [ ] App-Eintrag im Anwendungs-/Start-Menü heißt **„SubTracked"** (groß), nicht „subtracked"
- [ ] App startet aus dem Menü ohne sichtbaren Crash
- [ ] Hauptfenster ist sichtbar, Fenstertitel = „SubTracked"

### 2. Tray
- [ ] Tray-Icon erscheint in der Menübar (macOS) / Taskleiste (Windows)
- [ ] Klick / Doppelklick aufs Tray-Icon bringt das Fenster nach vorn
- [ ] Rechtsklick öffnet das Tray-Menü („Öffnen", „Beenden")

### 3. Konto + Abo + Einnahme anlegen
- [ ] Konto anlegen: Name, Saldo, Mindestpuffer, Währung
- [ ] Abo anlegen: Name, Betrag, Intervall, Anker-Datum, Konto
- [ ] Wiederkehrende Einnahme anlegen
- [ ] StatusCard zeigt einen plausiblen Banner (grün / gelb / rot mit Datum)
- [ ] „Demnächst" listet die nächsten Buchungen mit korrektem Datum/Betrag
- [ ] OverviewSection zeigt Saldoverlauf und ggf. Warnung

### 4. Editieren + Preis-Historie
- [ ] Abo bearbeiten → Betrag ändern → Speichern
- [ ] Abo erneut im Edit-Mode öffnen: „Preis-Historie" ist auffaltbar und listet alten + neuen Stand
- [ ] Konto bearbeiten → Saldo ändern → Speichern → Frische-Hinweis aktualisiert sich

### 5. Backup-Roundtrip
- [ ] Einstellungen → „Backup exportieren" → Pfad wählen → Datei wird angelegt
- [ ] Datei kurz manuell ansehen: JSON valide, alle Tabellen drin, `exportedAt` als RFC3339
- [ ] Daten ändern (Abo löschen oder umbenennen)
- [ ] „Backup importieren" → Datei wählen → 1. Bestätigung → 2. Bestätigung → Daten sind zurück, UI aktualisiert sich

### 6. Notification + Settings
- [ ] Einstellungen → Notification-Berechtigung anfragen → OS-Dialog erscheint → erlauben
- [ ] „Test-Erinnerung senden" → System-Toast erscheint
- [ ] Reminder-Status-Block zeigt „Letzte Prüfung" und „Nächste Prüfung"
- [ ] Autostart-Toggle aktivieren → kein Fehler

### 7. Tray-Lifecycle + Persistenz
- [ ] Fenster mit `X` schließen → Fenster verschwindet, App läuft weiter (Tray bleibt)
- [ ] Aus dem Tray das Fenster wieder öffnen → kommt nach vorn, alle Daten weiter da
- [ ] App komplett beenden (Tray-Menü „Beenden")
- [ ] App neu starten → Konto, Abo, Einnahme alle wieder da, Saldo unverändert

### 8. DB-Pfad verifizieren

Nach dem ersten Start muss die DB an einem dieser Pfade liegen (Tauri nutzt `app_config_dir()`):

| OS | Pfad |
| --- | --- |
| **macOS** | `~/Library/Application Support/com.tcgtvv.subtracked/subtracker.db` |
| **Windows** | `%APPDATA%\com.tcgtvv.subtracked\subtracker.db` (= `C:\Users\<User>\AppData\Roaming\com.tcgtvv.subtracked\`) |
| **Linux** | `~/.config/com.tcgtvv.subtracked/subtracker.db` |

- [ ] Datei existiert, > 0 Bytes
- [ ] Daneben liegen `subtracker.db-wal` + `subtracker.db-shm` (SQLite WAL-Mode aktiv)

> **Hinweis macOS:** `~/Library` ist im Finder per Default versteckt — entweder im Finder mit **Cmd+Shift+G** den Pfad direkt eintippen, oder im Terminal mit `ls -la ~/Library/Application\ Support/com.tcgtvv.subtracked/` prüfen. Die DB heißt `subtracker.db` (von „Tracker"), nicht `subtracked.db` — der App-Name ist „SubTracked", die DB-Datei ein historisches Artefakt.

### 9. Autostart (optional, einmalig pro OS)
- [ ] Autostart in Settings aktivieren
- [ ] Rechner / Sitzung neu starten
- [ ] App startet automatisch, landet **im Tray** (sichtbar, aber ohne Hauptfenster)

## Wenn etwas fehlschlägt

- **Logs:** macOS `Console.app` (Filter „SubTracked"), Windows Event-Viewer, oder ein `--debug`-Build mit offenen DevTools.
- **Daten weg nach Reboot?** Siehe BACKLOG-Bug-Eintrag „Datenpersistenz nach Reboot — verifiziert stabil" (2026-06-06) für Diagnose-Reihenfolge.
- **HANDOVER-Eintrag** mit OS-Version, Tag, gescheitertem Schritt und Symptom anlegen — der nächste Agent muss das Symptom reproduzieren und fixen können.
