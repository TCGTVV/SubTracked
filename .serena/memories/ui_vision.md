# UI-Vision (langfristig)

Vorlage: **arsnova.eu** (https://arsnova.eu/de, https://github.com/kqc-real/arsnova.eu). User-Wunsch, dass SubTracked optisch in diese Richtung wandert. **Nicht für die laufende MVP-Phase**, sondern als Designziel für ein späteres UI-Overhaul.

## Design-Tokens, die übernommen werden sollen

- **Material 3 / Material You** als Designsprache (arsnova nutzt Angular Material 3).
- **Teal/Petrol-Akzentfamilie** als Primärfarbe — sichtbar in den Repo-Badges: `#0f766e`, `#007A8A`, `#2596be`, neutraler Sekundär-Slate `#2D3748`.
- **Card-Layout** mit abgerundeten Ecken, dezenter Elevation, klar getrennten Bereichen.
- **Material Symbols / Material Icons** als Hauptikonografie (statt Emoji/Text-Buttons).
- **Light + Dark Mode in voller Parität**, Toggle prominent.
- **Sans-Serif-Typografie**, klare Größenhierarchie, großzügiger Whitespace.
- **App-Feel statt Web-Formular**: schnelle, semantische Übergänge, klare Primär-CTAs pro Screen.
- **Persönlichkeit dezent dosiert** (arsnova hat verspielte Emojis fürs Gamification-Element; SubTracked eher zurückhaltend mit dezenten Status-Icons/Badges).

## Was *nicht* übernommen wird

- Stack-Wahl: arsnova ist Angular 21 + Angular Material 3 + tRPC + Prisma + PostgreSQL. SubTracked bleibt React + Tauri + SQLite. **Nur das Look-and-Feel ist Vorlage**, nicht der Tech-Stack.
- Multi-User/Server-Aspekte (Sessions, Token, Rollen, MOTD): irrelevant für eine Single-User-Desktop-App.

## Implementation-Vorüberlegung (vor Umsetzung evaluieren)

Für Material 3 in React kommen u.a. in Frage:
- **MUI v6+** (offiziell Material You / M3-Support).
- **Material Web Components** (von Google, mit React-Wrappern).
- **shadcn/ui + custom Tokens** (radix-basiert, sehr flexibel, kein nativer M3-Look ohne Anpassung).
- **Tailwind + M3-Color-Tokens** (eigenes Theme-System; pflegeintensiv).

Vor dem Sprung **eine Lib auswählen + Migrations-Plan**, nicht halbherzig drei kombinieren. Bundle-Size auf einem Desktop-Tauri-Build ist weniger kritisch als im Web, also können auch "schwerere" Libs in Betracht kommen.

## Bezug zum aktuellen Stand

Aktuell hat SubTracked eine **funktionale, vanilla-CSS-getragene UI**: einfache Karten, blauer Akzent (`#396cd8`), dunkler Hintergrund im Dark Mode. Schon brauchbar als MVP, aber weit weg vom angepeilten App-Look. Backlog-Eintrag "UI-Redesign Richtung arsnova.eu" markiert das Ziel.
