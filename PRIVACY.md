# Datenschutz

SubTracked ist so gebaut, dass deine Finanzdaten **deinen Rechner nie verlassen**.

## Was gesammelt wird

**Nichts.** SubTracked hat keine Telemetrie, kein Analytics, kein Crash-Reporting, keine Werbung und keine Tracker. Es gibt keinen Server, an den irgendetwas gesendet wird.

## Was gespeichert wird — und wo

Alle Daten liegen ausschließlich lokal im App-Verzeichnis:

- **macOS:** `~/Library/Application Support/com.tcgtvv.subtracked/`
- **Linux:** `~/.config/com.tcgtvv.subtracked/` (Logs unter `~/.local/share/com.tcgtvv.subtracked/logs/`)
- **Windows:** `%APPDATA%\com.tcgtvv.subtracked\`

Inhalt:

- `subtracker.db` — SQLite-Datenbank mit Konten, Abos, Einnahmen, Preis-Historie und Reminder-Metadaten.
- `backups/` — automatische Pre-Migration-Snapshots (unverschlüsselt, siehe [SECURITY.md](SECURITY.md)).
- Log-Dateien (rollierend, max. 7 Tage) mit technischen Diagnose-Informationen (Zeitstempel, Fehler).
- JSON-Backups, die du selbst über die Einstellungen exportierst, landen dort, wo du sie speicherst.

## Netzwerk

SubTracked stellt im Normalbetrieb **keine Netzwerkverbindungen** her: keine Synchronisierung, kein Auto-Update-Call, keine externen Ressourcen zur Laufzeit. Updates lädst du selbst manuell von der GitHub-Releases-Seite.

## Benachrichtigungen

Erinnerungen laufen als **native System-Notifications** über dein Betriebssystem. Dabei verlässt kein Inhalt den Rechner.

## Deine Kontrolle

- Du kannst alle Daten jederzeit über **Einstellungen → Backup** als JSON exportieren.
- Zum vollständigen Löschen genügt es, das oben genannte App-Verzeichnis zu entfernen.
