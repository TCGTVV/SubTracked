# HANDOVER.md — Schichtübergabe für Agents

> **Konvention für jeden Agent, der an SubTracked arbeitet:**
>
> 1. **Session-Start:** Diesen Eintrag oben **vollständig lesen**, bevor du etwas anderes tust. Erst danach `AGENTS.md`, `BACKLOG.md`, Memories etc.
> 2. **Session-Ende:** Einen neuen Eintrag **oben** anfügen (direkt unter dieser Anleitung, über dem aktuell obersten Eintrag). Schablone steht ganz unten in dieser Datei.
> 3. Alte Einträge **nicht löschen** — sie sind der Verlauf, wie git-Log, aber narrativ. Wenn die Datei zu lang wird, älteste Einträge in `HANDOVER-archive.md` auslagern (ab ~20 Einträgen sinnvoll).
> 4. Sprache: Deutsch (passend zur Projekt-Konvention).

---

## 2026-06-04 — MVP-Frontend von 0 auf Schritte 1–7 + Konten + Edit

### Was passierte

Kompletter Erst-Aufbau der UI von Tauri-Template auf einen funktionalen MVP. 17 Commits in dieser Session (`535fa54` … `44d9169`).

- **Repo-/Tooling-Setup**
  - Serena-MCP eingebunden, Onboarding durchlaufen → 6 Memories angelegt (`mem:core`, `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`, `mem:ui_vision`).
  - `.gitignore` um `.claude/settings.local.json` ergänzt; `.mcp.json` portabel gemacht (`--project "."`); `.serena/` ins Repo aufgenommen.
  - `gh` (GitHub CLI) installiert + per Device-Login authentifiziert; Push-Verhalten danach reibungslos.
  - Wayland-Renderfix (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) ins `pnpm tauri`-Script gebacken — `pnpm tauri dev` startet seitdem ohne `Gdk Error 71`.

- **Frontend (`src/`)** — alle Schritte 1–7 des ursprünglichen 8er-Plans aus dem Backlog erledigt:
  1. Tauri-Template (greet-Demo, Logos) entfernt, Rumpf nur noch `<h1>SubTracked</h1>`.
  2. `listSubscriptions()` beim Mount geladen, Lade-/Fehler-/Leer-Zustände gerendert, `Intl.NumberFormat de-DE` für Beträge.
  3. Nächste Fälligkeit pro Eintrag via `nextDueDate()` + `dd.MM.yyyy`-Format.
  4. **Anlegen-Dialog** als native HTML5-`<dialog>` mit `useId`-A11y, Pending-/Error-States. Form-Helper in `src/lib/format.ts`, Dialog in `src/components/SubscriptionDialog.tsx`.
  5. **Löschen** pro Eintrag mit `window.confirm()`.
  6. **Konten-Verwaltung** (`AccountsDialog.tsx`): Liste + Add + Delete mit Soft-Check (`countSubsForAccount()`). `SubscriptionDialog` bekam Konto-Dropdown.
  7. **Übersicht** (`OverviewSection.tsx`): zwei Blöcke — monatliche Fixkosten-Baseline (`coverage.computeMonthlyBaseline()`) und anstehende Abflüsse 6 Monate (`coverage.computeCoverage()` als `<details>` pro Konto). `monthsPer` aus `recurrence.ts` exportiert, um die Baseline-Berechnung ohne Logik-Duplikat zu bauen.

- **Edit-Funktion** (User-Wunsch außerhalb des Original-Plans):
  - `db.updateSubscription()` neu, `NewSubscriptionDialog.tsx` → `SubscriptionDialog.tsx` umbenannt (git-`mv`) und generalisiert: `subscription`-Prop entscheidet zwischen Create- und Edit-Modus.
  - Key-Remount-Pattern in `App.tsx` (`key={editingSub?.id ?? "new"}-${openSeq}`) garantiert frischen Form-State pro Open.

- **Bugfixes**
  - `react-day-picker@^10` ersetzt natives `<input type="date">` — letzteres öffnete im WebKitGTK-Modal-`<dialog>` einen Picker, der nicht zumachte. Eigene `DateField.tsx`-Komponente mit Popover + Outside-Click/Escape-Handling.
  - `sql:allow-execute` ins Capability ergänzt. `sql:default` deckt **nur** `load/select/close` ab, daher schlugen INSERT/DELETE mit `sql.execute not allowed` fehl.

- **Audit am Sitzungsende:**
  - Stale Duplikat-Ordner `src/src-tauri/` entdeckt (Erbe aus Erst-Commit `d74a1cc` vor dieser Session, ältere `lib.rs` mit Demo-greet, vom Tauri-Build nie verwendet) → in `44d9169` entfernt.
  - Alle anderen Aussagen aus dem Chat gegengeprüft, deckungsgleich mit Repo-Stand.

- **Backlog-Pflege**
  - User-Braindumps eingearbeitet: Edit-Funktion (erledigt), Komma/Punkt-Lokalisierung, Notification-Mute pro Abo, monatliche Fixkosten-Baseline (erledigt), UI-Redesign Richtung arsnova.eu (verlinkt `mem:ui_vision`).
  - Eigene Code-Review-Beobachtungen: ON-DELETE-CASCADE-Migration für `reminders`, `SubRow.interval`-Cast, ungenutzter `tauri-plugin-opener` zur Entfernung.
  - Vergessene Erledigt-Hakerl nachgepflegt (`99599b7`).

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (alles gepusht) |
| HEAD | `44d9169` |
| Working tree | clean |
| Build | grün (`pnpm build` → 286 KB JS / 13,6 KB CSS, gzipped 89 KB / 3,1 KB) |
| App | `pnpm tauri dev` startet ohne Workarounds (Wayland-Fix ist im Script) |
| Test-Daten | keine — DB ist leer; beim ersten Start "Noch keine Abos angelegt." |

### Nächster Schritt (vorgemerkt)

**Schritt 8 von 8** des Original-Plans: `runReminderCheck()` in `App.tsx` verdrahten:
- Beim App-Mount einmal aufrufen.
- `setInterval(runReminderCheck, 60 * 60 * 1000)` für stündliche Wiederholung.
- Cleanup in `useEffect`-Return (`clearInterval`).
- `runReminderCheck` ist idempotent (siehe `src/lib/reminders.ts` und `insertReminderIfNew()` mit `UNIQUE(subscription_id, due_date) + INSERT OR IGNORE`), daher gefahrlos jederzeit aufrufbar.

Danach gibt der Backlog (`BACKLOG.md`) die Reihenfolge weiter vor. Direkt naheliegende Folgepunkte: Notification-Permission-Status in der UI sichtbar machen; `lead_days` pro Abo editierbar (Vorbereitung für den Mute-Toggle-Backlogpunkt).

### Wichtige Entscheidungen + Begründung

Decisions, deren *Warum* aus dem Code allein nicht ablesbar ist:

- **Native HTML5-`<dialog>`** statt Custom-Modal: gratis Focus-Trap, Backdrop, Escape, A11y. Kein Eigenbau, kein React-Portal nötig.
- **`react-day-picker` als Dep** statt nativem Date-Input: WebKitGTK-Picker schließt im Modal-Dialog nicht — bekannter Bug. Quick-Fixes (blur on change, etc.) sind unzuverlässig. Saubere Lösung gewählt, weil User explizit "höchste Qualität nach allen Standards" gefordert hat.
- **Account-Delete Soft-Check** statt Verlassen auf FK-Constraint: SQLite-FKs sind ohne `PRAGMA foreign_keys = ON` nicht erzwungen, und `tauri-plugin-sql` aktiviert das nicht garantiert. App-Layer-Garantie ist robuster. Backlog hat den Cleanup ("ON DELETE CASCADE-Migration") als spätere Härtung.
- **Ein `SubscriptionDialog` für Create+Edit** (nicht zwei Komponenten): Mode-Switch via `subscription`-Prop. Reset zwischen Sessions via Key-Remount, nicht via `useEffect`-Synchronisation (letzteres ist fehleranfälliger).
- **`active` bewusst NICHT im Edit-Form** exponiert: würde sonst zu "wo ist mein Netflix-Abo hin?" führen, weil `listSubscriptions(true)` nur Aktive zeigt. Pause-Funktion bekommt später eigenes Konzept (UI-Filter "inaktive anzeigen" + sichtbarer Status).
- **`monthsPer` aus `recurrence.ts` exportieren** statt in `coverage.ts` duplizieren: eine Wahrheit für die Intervall-Faktoren, ohne `recurrence.ts` strukturell zu ändern (nur `export` zugefügt).
- **Wayland-Fix in `package.json`** (nicht `tauri.conf.json`): wirkt nur bei Dev, nicht bei Build; und steht an offensichtlicher Stelle für jeden, der `pnpm tauri dev` aufruft.

### Gotchas / Stolperfallen für Nachfolger

- **Wayland-Workaround ist nur in pnpm-Script.** Wer `tauri` direkt ruft (`./node_modules/.bin/tauri dev` o.ä.) fängt sich `Gdk Error 71`. → Immer über `pnpm tauri …` gehen, oder die Env-Var manuell exportieren.
- **`sql:default` deckt nur Reads.** Jede neue Mutation-Operation (z.B. `db.execute("UPDATE …")`) braucht entweder `sql:allow-execute` (haben wir) oder einen spezifischeren Permission-Eintrag in `src-tauri/capabilities/default.json`. Bei "permission not allowed"-Fehlern dort suchen.
- **DB-Pfad ist `sqlite:subtracker.db`** (siehe `lib.rs` und `db.ts`). Liegt im OS-spezifischen App-Data-Verzeichnis, nicht im Repo.
- **`recurrence.ts` ist anker-additiv (`anchor + k*step`), NIE iterativ.** Naives Umschreiben driftet Monatsende-Abos weg (31. → 28.). Steht auch in AGENTS.md und `mem:conventions`.
- **Migrationen sind unveränderlich nach Apply.** Neue `.sql` mit nächster `version` in `lib.rs` registrieren. Bei Schema-Drift im Dev: `~/.local/share/com.subtracked.app/subtracker.db` (oder OS-Äquivalent) löschen und Dev neu starten.
- **Geld in `amount_cents` (Integer)**, Datum als ISO-String `YYYY-MM-DD`. **Nie aufweichen.** Float-Geld produziert Rundungsfehler in Cent.
- **UI-Texte: deutsch.** Code/Identifier können englisch sein, Mischung im Repo.

### Geänderte/neue Memories

- **Serena** (`.serena/memories/`):
  - Neu: `ui_vision.md` (arsnova.eu / Material 3 als langfristiges Designziel).
  - `core.md` verweist jetzt auf alle 5 anderen User-Memories inklusive `mem:ui_vision`.
- **Auto-Memory** (`~/.claude/projects/-home-legr-SubTracked/memory/`):
  - `user_role.md` — User ist Entwicklungs-Anfänger, SubTracked erstes eigenes Projekt, Konzepte erklären statt voraussetzen.
  - `feedback_workflow.md` — Solo-Frühphase, oft committen, direkt auf `main`, kein Prozess-Overhead.
  - `feedback_code_quality.md` — durchgehend hohe Qualität, native HTML-Standards, A11y + Pending-/Error-States ernst nehmen, aber **keine** prophylaktischen Abstraktionen.
  - `MEMORY.md` als Index mit allen drei.

### Offen / nicht in dieser Session geklärt

- Schritt 8 (Reminder-Loop) implementiert sich noch nicht selbst.
- Backlog-Punkte in "Als Nächstes" und "Später" — siehe `BACKLOG.md`. Keine davon angefangen.
- Multi-Currency-Edge-Case in `computeCoverage`/`computeMonthlyBaseline`: aktuell werden Cents über Währungen hinweg summiert. Solange nur EUR verwendet wird, kein Problem. Backlog hat "Mehrwährungs-Handling in der Kontodeckung (Umrechnung)" als "Später"-Punkt.

---

## Eintrag-Schablone (für die nächste Session unten kopieren, oben einfügen)

```markdown
## YYYY-MM-DD — <Kurztitel der Session>

### Was passierte
- Stichpunkte mit den wesentlichen Aktionen, gerne mit Commit-Hashes.

### Status am Sitzungsende
- Branch / Push-Stand / HEAD-Hash
- Working-Tree-Status
- Build-Status
- App-Startbarkeit
- Sonstige Zustände, die für den nächsten Start relevant sind

### Nächster Schritt
- Konkret, mit Bezug zum Backlog oder Code-Stelle.

### Wichtige Entscheidungen + Begründung
- Was wurde entschieden + WARUM. Das "warum" ist das Wichtigste; das "was" liest der Nachfolger aus dem Code.

### Gotchas / Stolperfallen
- Was musste umgangen werden, was würde sonst überraschen?

### Geänderte/neue Memories
- Serena / Auto-Memory, mit kurzer Begründung warum gespeichert.

### Offen / nicht geklärt
- Was im Backlog steht, was als Fragezeichen bleibt, was bewusst aufgeschoben wurde.
```
