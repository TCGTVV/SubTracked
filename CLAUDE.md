# CLAUDE.md — Pflichtregeln für Claude in SubTracked

> Diese Datei wird in jeder Claude-Session automatisch in den Kontext geladen. Sie steht über jedem Default-Verhalten.

## REGEL 1 — Serena ist Default, immer

**Jede Datei-Operation im Project-Root läuft über Serena, wo es technisch geht.** Keine Diskussion, kein Reflex auf `Read`/`Edit`/`Grep`. Token-Sparsamkeit ist in SubTracked Top-Wert; der User hat das **sechs Mal** korrigieren müssen (Stand 2026-06-12).

**Pre-Flight vor JEDEM Tool-Call auf eine Datei:**

1. **Steht der Inhalt schon im Kontextfenster?** → KEIN neuer Tool-Call. Aus dem Kontext arbeiten.
2. **Brauche ich den Datei-Inhalt überhaupt?** Für `mcp__serena__replace_content` reicht oft ein eindeutiger Anchor-String, den ich schon habe → KEIN Read.
3. **Kann ein Serena-Tool das?**
   - Discovery: `mcp__serena__get_symbols_overview`, `mcp__serena__find_symbol`, `mcp__serena__search_for_pattern`
   - Referenzen: `mcp__serena__find_referencing_symbols`
   - Edits: `mcp__serena__replace_symbol_body`, `mcp__serena__insert_after_symbol`, `mcp__serena__insert_before_symbol`, `mcp__serena__replace_content`
   - Memories: `mcp__serena__read_memory`, `mcp__serena__write_memory`
   → JA → Serena, nicht das eingebaute Tool.
4. **Erst wenn 1–3 alle NEIN sind:** bewusst `Read`/`Edit` mit `offset`/`limit` so eng wie möglich, und mental notieren, **warum** Serena hier nicht passte.

**Klare Ausnahmen (Serena nicht möglich):**

- Auto-Memory-Files unter `/home/legr/.claude/projects/.../memory/` (außerhalb Project-Root, Serena hat dort keinen Zugriff). `Edit`/`Write` sind hier richtig.
- Brand-new Dateien, die noch nicht existieren → `Write`.
- Bash-Kommandos, die kein Datei-Inhalt-Lookup sind (`git`, `gh`, `pnpm`, `cargo`).
- Diese `CLAUDE.md` selbst, wenn sie noch nicht existiert.

**Anti-Pattern, die nicht mehr passieren dürfen:**

- `Read` auf `HANDOVER.md`/`BACKLOG.md`/`README.md` „nur kurz zum Verifizieren" — der Inhalt steht in 90% der Fälle schon im Kontext, sonst `mcp__serena__search_for_pattern` mit Anker.
- `Edit` auf `HANDOVER.md`/`BACKLOG.md` für neue Einträge — `mcp__serena__replace_content` mit Regex auf einen eindeutigen Anchor-String.
- `Grep` zum Finden eines Symbols — `mcp__serena__find_symbol` oder `mcp__serena__search_for_pattern`.
- Code-Datei lesen, um eine kleine Stelle zu ändern — `mcp__serena__find_symbol(include_body=True)` + `mcp__serena__replace_symbol_body` oder `mcp__serena__replace_content`.

## REGEL 2 — Session-Start-Reihenfolge

1. `mcp__serena__initial_instructions`
2. `mcp__serena__list_memories` + relevante Memories lesen (`core`, `conventions`, `tech_stack`)
3. `HANDOVER.md` Top-Eintrag (per `Read offset=1 limit=N` ODER `mcp__serena__search_for_pattern` mit Anker `^## 20`)
4. Erst dann zur eigentlichen Aufgabe

Die feedback-Memory `feedback_serena.md` enthält die historische Eskalation (6 User-Korrekturen) und detailliertere Begründungen. Diese Datei (`CLAUDE.md`) ist die operative Kurzform.

---

Weitere Konventionen siehe `AGENTS.md` (Stack, Source-Map, Pflicht-Invarianten) und `HANDOVER.md` (Session-Verlauf).
