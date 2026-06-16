# Screenshots für die README

Diese Bilder werden in der Haupt-[README](../../README.md) eingebunden. Lege sie **genau unter diesen Dateinamen** hier ab, dann erscheinen sie automatisch.

Aktuell eingebunden (in der README so verlinkt):

| Datei | Was zeigen | Hinweise |
| --- | --- | --- |
| `uebersicht.png` | Übersicht/Dashboard mit Sidebar, Deckungs-Status, „Demnächst", Baseline, Cashflow | Heller Modus, Fenster breit genug fürs mehrspaltige Grid. Das Hero-Bild. |
| `abo1.png` | „Abo bearbeiten"-Dialog, Kündigungs-Sektion **aufgeklappt** (Frist sichtbar) | Zeigt Intervall-Dropdown + Kündigung. |
| `abo2.png` | Abo-Liste mit farbcodierten Karten und „Kündigen bis"-Hinweis | Filter/Sortierung oben sichtbar lassen. |
| `dark.png` | Übersicht im **dunklen** Modus | Über den Theme-Umschalter unten in der Sidebar. |
| `einnahme.png` | Einnahmen-Ansicht | Mindestens eine Beispiel-Einnahme. |
| `demo.gif` _(optional)_ | Kurzer Ablauf: Abo anlegen → Übersicht aktualisiert sich → Theme umschalten | 5–10 s, klein halten (< ~3 MB). In der README noch nicht verlinkt — bei Bedarf ergänzen. |

Beim Ersetzen einfach denselben Dateinamen behalten, dann bleibt die README-Einbindung gültig.

## Aufnahme-Tipps

- **Beispieldaten** statt echter Finanzdaten verwenden (z. B. Netflix, Spotify, ein Giro-Konto). Keine echten Salden zeigen.
- **Konsistente Fenstergröße** über alle Shots (z. B. ~1280×800), damit die Bilder zusammenpassen.
- PNG für Standbilder. Optional mit `oxipng`/`pngquant` verkleinern.
- GIF z. B. mit [Peek](https://github.com/phw/peek) (Wayland-fähig) aufnehmen.

Nach dem Ablegen: kurz prüfen, dass die README die Bilder zeigt (`gh`/GitHub-Vorschau oder lokaler Markdown-Renderer).
