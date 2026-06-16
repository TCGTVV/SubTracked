# UI-Vision (Stand 2026-06-16 — realisiert)

Das UI-Overhaul ist **umgesetzt**. Die ursprüngliche arsnova.eu/Material-3-Vorlage (Teal, MUI) wurde nach einem gescheiterten MUI-v9-Pilot **verworfen**; stattdessen ein eigener Dashboard-Look auf Tailwind v4 + shadcn/ui. Historie siehe HANDOVER-Einträge 2026-06-12 (MUI-Pilot), 2026-06-15 (Pivot Phase 0+1), 2026-06-16 (Phase 2 + Abschluss).

## Realisierter Look

- **Stack:** Tailwind CSS v4 + shadcn/ui (radix-ui-Umbrella) + lucide-react. Details: `mem:tech_stack`.
- **Layout:** Dashboard mit linker **Sidebar** (`AppSidebar`: Wordmark, View-Nav Übersicht/Abos/Einnahmen, Konten-Liste mit Salden, Footer mit Theme-Toggle + Einstellungen) und scrollendem Content-Grid rechts (`grid-cols-[var(--sidebar-w)_1fr]`). Referenz war Actual Budget / Spotify.
- **Farbe:** Warm/bunt — **Indigo/Violett** als Primary, **Koralle/Rose** als Accent, Multi-Hue-Kategorie-Akzente (`chart-1..5`), `success`/`warning`. Weg vom Teal. Tokens in `src/index.css` (oklch) für Light + `.dark`.
- **Dark-Mode:** folgt System **+** Hell/Dunkel/System-Umschalter (`useColorScheme`, setzt `.dark` auf `<html>`).
- **„Dynamisch" = CSS-Technik:** Fluid-Tokens via `clamp()` (`--text-fluid-*`, `--sidebar-w`, `--card-min`) + `auto-fill`-Card-Grid, das auf Fensterbreite reagiert.
- **Icons:** lucide (SVG-in-JS), kein Material-Symbols-Font mehr.
- Card-Layout mit abgerundeten Ecken, dezenter Elevation/Hover-Lift; Cashflow-Karten mit buntem Links-Akzentstreifen je `id % 5`.

## Was bewusst nicht passiert ist

- Kein Routing (View-Wechsel = `useState`), Konten/Einstellungen bleiben Dialoge.
- Kein „echtes" Material 3 / kein arsnova-Klon — eigener Charakter.
- Deutsche UI-Strings bleiben (siehe `mem:conventions`).

## Offene Design-Ideen (Backlog, nicht zwingend)

- Risiko-/Status-Priorisierung in der Übersicht (Risiko zuerst, Listen danach), destruktives Löschen weniger prominent, perspektivisch Risiko-Timeline / Kontostand-Chart (BACKLOG „Später").
