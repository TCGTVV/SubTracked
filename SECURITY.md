# Sicherheitsrichtlinie

SubTracked ist eine lokale Desktop-App für private Finanzdaten — Sicherheit und Datenschutz stehen daher im Zentrum. Zum Umgang mit deinen Daten siehe auch [PRIVACY.md](PRIVACY.md).

## Unterstützte Versionen

SubTracked ist ein aktiv entwickeltes Solo-Projekt im 0.x-Stadium. Sicherheitsfixes fließen ausschließlich in die **jeweils neueste Release-Version**; es gibt keine Rückportierung in ältere Versionen.

| Version                              | Unterstützt |
| ------------------------------------ | ----------- |
| neuestes Release (aktuell `v0.2.1`)  | ✅          |
| ältere Versionen                     | ❌          |

Für Sicherheitsfixes immer auf die neueste Version von der [Releases-Seite](https://github.com/TCGTVV/SubTracked/releases/latest) aktualisieren.

## Eine Sicherheitslücke melden

**Bitte melde Sicherheitslücken nicht über öffentliche GitHub-Issues** — das setzt andere Nutzer einem Risiko aus, bevor ein Fix verfügbar ist.

Bevorzugter Weg:

1. **GitHub Security Advisories** (privat) — im Repository unter **Security → „Report a vulnerability"**, oder direkt: <https://github.com/TCGTVV/SubTracked/security/advisories/new>
2. **Fallback per E-Mail:** elreydelorbe@pm.me

Hilfreich für eine schnelle Einschätzung:

- betroffene Version und Plattform,
- Beschreibung und mögliche Auswirkung,
- Reproduktionsschritte oder ein Proof-of-Concept,
- optional ein Vorschlag zur Behebung.

## Reaktion

Dies ist ein Hobby-/Solo-Projekt ohne festes SLA. Realistische Erwartung:

- **Eingangsbestätigung:** in der Regel innerhalb von 7 Tagen.
- **Einschätzung und Fix:** nach Best Effort, abhängig von Schwere und Aufwand.
- Nach einem Fix wird die Lücke transparent im zugehörigen Release dokumentiert (auf Wunsch mit Nennung des Finders).

## Sicherheitsmodell & bekannte Risiken

SubTracked ist **local-first**: keine Server, keine Cloud, kein Account, keine Netzwerk-Synchronisierung, keine Telemetrie. Damit entfällt die gesamte Transport- und Server-Angriffsfläche. Die relevanten Restrisiken:

- **Unsignierte Builds.** Die Installer sind aktuell **nicht code-signiert** (macOS Gatekeeper / Windows SmartScreen warnen beim ersten Start). Lade Releases ausschließlich von der offiziellen [Releases-Seite](https://github.com/TCGTVV/SubTracked/releases) und prüfe — sobald verfügbar — die veröffentlichten Prüfsummen. Code-Signing ist als Roadmap-Punkt vorgesehen.
- **Backup im Klartext.** Die SQLite-Datenbank, die automatischen Pre-Migration-Backups und selbst erstellte JSON-Exporte liegen **unverschlüsselt** im lokalen App-Verzeichnis. Wer Zugriff auf dein Betriebssystem-Konto bzw. Dateisystem hat, kann sie lesen. Bewahre Exporte entsprechend auf. Optionale Backup-Verschlüsselung ist als Roadmap-Punkt vorgesehen.
- **Lokaler Dateizugriff.** Die App schützt nicht vor anderen Programmen oder Personen mit Zugriff auf dasselbe Betriebssystem-Konto. Der Schutz deiner Daten entspricht dem Schutz deines Rechner-Logins — Full-Disk-Encryption wird empfohlen.
- **Abhängigkeiten.** Die App bündelt Drittanbieter-Bibliotheken (Rust/Tauri, npm). Updates kommen über neue Releases; automatisiertes Dependency-/Audit-Scanning ist als Roadmap-Punkt vorgesehen.

Bewusst **nicht** Teil des Bedrohungsmodells (weil die Funktionalität nicht existiert): Netzwerk-/MITM-Angriffe, Server-Kompromittierung, Account-Übernahme, serverseitige Datenlecks.
