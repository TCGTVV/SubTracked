# HANDOVER.md — Schichtübergabe für Agents

> **Konvention für jeden Agent, der an SubTracked arbeitet:**
>
> 1. **Session-Start:** Diesen Eintrag oben **vollständig lesen**, bevor du etwas anderes tust. Erst danach `AGENTS.md`, `BACKLOG.md`, Memories etc.
> 2. **Session-Ende:** Einen neuen Eintrag **oben** anfügen (direkt unter dieser Anleitung, über dem aktuell obersten Eintrag). Schablone steht ganz unten in dieser Datei.
> 3. Alte Einträge **nicht löschen** — sie sind der Verlauf, wie git-Log, aber narrativ. Wenn die Datei zu lang wird, älteste Einträge in `HANDOVER-archive.md` auslagern (ab ~20 Einträgen sinnvoll).
> 4. Sprache: Deutsch (passend zur Projekt-Konvention).

---

## 2026-06-09 — Claude: Architektur-Cleanup-Block (6 ToDos abgearbeitet)

### Was passierte

Direkt nach dem Tests-Block (siehe Eintrag darunter) wollte der User den **Architektur-Cleanup-Block** komplett durchziehen. Sechs offene Architektur-ToDos aus dem Review-Block 2026-06-08 erledigt; Reihenfolge wieder klein → gross:

1. **BACKLOG-Architekturpunkt #9 (PRAGMA foreign_keys=ON) korrigiert.** Annahme im Original war falsch — sqlx 0.9 aktiviert FK per Default, das wurde im Tests-Block schon entdeckt. In dieser Session: `foreign_keys(true)` in [lib.rs](src-tauri/src/lib.rs) jetzt explizit gesetzt (Schutz gegen kuenftigen sqlx-Default-Wechsel + Code-Doku der Abhaengigkeit aus `update_subscription_in_db`). Doc-Kommentar auf `validate_account_exists` in [validation.rs](src-tauri/src/validation.rs) auf den tatsaechlichen Zweck umgeschrieben: lesbarer deutscher Fehler statt SQLite-Raw-Constraint-Meldung.

2. **`compute_due_reminders` Sichtbarkeit verengt.** `compute_due_reminders`, `DueReminder` und `Notifier`-Trait in [reminders.rs](src-tauri/src/reminders.rs) sind jetzt modul-privat. Der Tests-Block davor hatte `Notifier` versehentlich `pub` gemacht — jetzt korrigiert. Externe Caller koennen damit nicht mehr versehentlich am Idempotenz-Check vorbei Notifications schicken. Tests im `#[cfg(test)] mod tests` sehen die Items weiter via `super::*`, keine Anpassung dort noetig.

3. **`validate_interval` an `months_per_interval` delegiert.** Single Source of Truth in [recurrence.rs](src-tauri/src/recurrence.rs) jetzt als `pub const ALLOWED_INTERVALS: &[(&str, u32)]` — Name + Monatsschritt nebeneinander. `months_per_interval` macht einen Slice-Scan, `validate_interval` delegiert reine `months_per_interval(interval).map(|_| ())`. Neues Intervall = ein Eintrag in der Liste. Die Erlaubt-Liste taucht in der Fehlermeldung von `months_per_interval` jetzt automatisch komplett auf.

4. **Lock-Poisoning auf `ReminderState.last_check_at` geheilt.** Neue Methoden `ReminderState::record_check(when)` und `ReminderState::last_check()` in [db.rs](src-tauri/src/db.rs) heilen Poisoning automatisch via `tracing::error!` + `clear_poison()` + `into_inner()`. Das Mutex-Feld ist jetzt privat, beide Call-Sites (Reminder-Loop in `lib.rs`, `get_reminder_status` in `commands.rs`) gehen ueber die Methoden. `get_reminder_status` kann den Lock-Fehler nicht mehr nach oben durchreichen, weil die Methode poison-resilient ist — die `Result<ReminderStatus, String>`-Signatur bleibt aber wegen der SQL-Query erhalten.

5. **Permission-denied `tracing::info!`-Flut entzerrt.** `dispatch_due_reminders` in [reminders.rs](src-tauri/src/reminders.rs) zaehlt jetzt `skipped_no_permission` pro Tick und loggt nach der Schleife einmal aggregiert (`count = N`), statt pro faelliger Erinnerung eine separate Info-Zeile zu schreiben. Bei dauerhaft abgelehnter Permission und N Abos: 1 Log/Stunde statt N Logs/Stunde — das rolling 7-Tage-Log wird nicht mehr von Rauschen verstopft.

6. **`ALLOWED_CURRENCIES` als gemeinsame JSON.** Single Source of Truth jetzt in [tests/fixtures/currencies.json](tests/fixtures/currencies.json) (Code + Subdivisions pro Waehrung, analog `recurrence-vectors.json`). **Rust-Seite:** neues Modul [src-tauri/src/currencies.rs](src-tauri/src/currencies.rs) — `LazyLock<Vec<Currency>>` mit `include_str!` + `serde_json` zur Compile-Zeit eingebunden, Public-API `is_allowed`/`allowed_codes`/`subdivisor`. `validate_currency` und der Notification-Formatierer (frueher die Mini-`currency_subdivisor`-Funktion in `reminders.rs`) nutzen diese Helper. Pure Konstante `ALLOWED_CURRENCIES` aus `validation.rs` ist weg. **TS-Seite:** [src/lib/format.ts](src/lib/format.ts) importiert dieselbe JSON, derived `CURRENCY_OPTIONS` + `CURRENCY_SUBDIVISIONS` davon. `CurrencyOption` ist jetzt schlicht `string` (statt einer Literal-Union), weil JSON-Inhalt zur Compile-Zeit von TS nicht zu literalen Typen verengt wird; die Runtime-Pruefung via `isCurrencyOption` bleibt die Quelle der Wahrheit. Beim Hinzufuegen einer neuen Waehrung reicht jetzt ein Eintrag in der JSON; beide Seiten ziehen automatisch nach.

### Status am Sitzungsende

- Branch: `main`.
- Working tree dirty mit:
  - Modifiziert: `BACKLOG.md`, `HANDOVER.md`, `src-tauri/src/commands.rs`, `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/recurrence.rs`, `src-tauri/src/reminders.rs`, `src-tauri/src/validation.rs`, `src/lib/format.ts`.
  - Neue Dateien: `src-tauri/src/currencies.rs`, `tests/fixtures/currencies.json`.
- Verifikation gruen:
  - `cargo fmt --check` ✓
  - `cargo clippy --all-targets -- -D warnings` ✓
  - `cargo test` ✓ — **43 Tests** (+5 currencies-Modul-Tests gegenueber dem Tests-Block).
  - `pnpm test:run` ✓ — **171 Tests / 13 Files** (unveraendert; format.ts-Refactor war strukturell, alle Tests haben weiter Bestand).
  - `pnpm lint` ✓ — Biome 49 Files clean (+1 neues Rust-File wird von Biome ignoriert; +1 TS-Code-Pfad).
  - `pnpm build` ✓ — TS + Vite-Build in 1,25s gruen.

### Nicht gelaufen

- `pnpm tauri dev` Live-Smoke nicht gestartet. Strukturell beruehren die Aenderungen den Boot-Pfad (Modul `currencies` muss laden), die Reminder-Schleife (Logger-Aggregation, neuer Notifier-Trait), den Settings-Status (`record_check`/`last_check` als Adapter) und Validierung (Currency-Whitelist aus JSON). Live-Test waere wertvoll, besonders: (a) App startet ohne Panic (`currencies::LazyLock` greift beim ersten Validate); (b) Settings-Dialog zeigt `last_check_at` weiter sauber; (c) Abo mit z.B. `KRW` speichern → akzeptiert; (d) Abo mit `BTC` (manuell ueber Devtools) → klar lesbarer Fehler.

### Wichtige Entscheidungen + Begruendung

- **Shared JSON statt Codegen fuer Waehrungen.** Codegen (ts-rs / specta) waere robuster fuer Typen, aber zieht Build-Step + Dependency rein, die fuer 5 Waehrungen Overkill ist. Shared JSON mit doppeltem Loader ist mit dem `recurrence-vectors.json`-Pattern schon etabliert; ein neues Modul + ein neuer Import sind das ganze Setup.
- **`tests/fixtures/` als Ort fuer Runtime-Shared-Config.** Dort liegt schon `recurrence-vectors.json`, das beide Seiten lesen. Der Dir-Name passt nicht perfekt (Currencies sind Runtime-Config, nicht Test-Fixtures), aber ein eigener `data/`-Ordner fuer eine einzelne Datei waere Over-Engineering. Wenn weitere Shared-Config dazu kommt, umbenennen.
- **`CurrencyOption = string` statt Literal-Union.** TS kann beim JSON-Import keine Literale ableiten — der Cast verliert sie. Statt komplizierter Codegen-Loesung wird der Typ schlicht; die Runtime-Pruefung via `isCurrencyOption` ist der echte Gate. Existierende Verwender (`SubscriptionDialog`, `AccountsDialog`) brauchten Null Anpassungen.
- **Poison-Recovery als Methoden auf `ReminderState`.** Inline-Recovery an zwei Call-Sites waere ~12 LOC Duplikation. Inhaerente Methoden auf der bestehenden Struct sind die natuerliche Heimat — kostet ein `tracing`-Import in `db.rs`, was OK ist (db.rs hat eh schon sqlx/serde/chrono-Imports, ist also kein pristines Data-only-Modul).
- **Aggregiertes Permission-denied-Log statt warn-once-Persistenz.** Pro Tick einmal loggen ist die einfachste Loesung, die das Volumen runterbringt. Ein `HashSet<i64>` ueber Subscription-IDs zu pflegen waere genauer, aber bei dauerhaft abgelehnter Permission egal — der Diagnose-Wert ist „Permission fehlt, X Erinnerungen wuerden gehen", nicht „welche genau".

### Gotchas / Stolperfallen

- **`LazyLock` ist Rust 1.80+.** Die Crate kompiliert damit. Falls jemand auf aelterem Rust baut, schlaegt der Build fehl mit `cannot find type 'LazyLock'`. Falls das jemals auftaucht: `std::sync::OnceLock` + Getter-Funktion ist die naechstbessere Option.
- **`tests/fixtures/currencies.json` enthaelt einen `_comment`-Key.** Serde deserialisiert mit `serde_json::from_str` standardmaessig zusaetzliche Keys still — das funktioniert. Falls jemand `deny_unknown_fields` einschaltet, knallt es. Vorgewarnt.
- **`tests/fixtures/` wird jetzt von Production-Code via `include_str!` referenziert.** Wer den Dir bei einem kuenftigen Cleanup umbenennt, muss BEIDE Pfade (`recurrence-vectors.json`, `currencies.json`) und BEIDE Loader (Rust `include_str!`, TS-Import) anpassen. Schwer zu vergessen, weil cargo build sofort scheitert.
- **`CurrencyOption` ist jetzt strukturell `string`.** Wer im Frontend kuenftig stark-typisierte Currency-Werte braucht (etwa fuer eine `Map<CurrencyOption, X>`), muss die Funktionalitaet ueber Runtime-Checks oder einen Brand-Typ nachziehen — die alte Literal-Union ist weg.
- **Code von dieser Session ist NICHT reviewed.** Wie der Tests-Block darunter ist der Architektur-Block auf User-Wunsch direkt commited + gepusht worden, ohne `/code-review high`-Lauf. Der naechste Agent sollte vor weiteren funktionalen Aenderungen den kombinierten Diff `git diff ba060fa..HEAD` durch `/code-review high` schicken — Schwerpunkte: (a) Tests-Block (siehe Eintrag unten); (b) Architektur-Block-Spezifika: `LazyLock` Verhalten beim Tauri-Boot, die `ReminderState`-Poison-Recovery, der Doppel-`include_str!` auf die Test-Fixtures.

### Naechster Schritt

- Vor weiteren Code-Aenderungen: `/code-review high` ueber `git diff ba060fa..HEAD` (umfasst Tests- + Architektur-Block), siehe Stolperfallen oben.
- Live-Smoke mit `pnpm tauri dev` fuer den Boot-Pfad und die Validation-/Reminder-Adapter.
- Wenn beides sauber: die Tests- und Architektur-Sektionen im BACKLOG sind damit weitgehend leer (E2E vor v1.0 ist bewusst offen, Reload-Pattern ist optional). Naechste sinnvolle Themen waeren der **Release-Reife-Block** (Matrix-Build → Tag v0.1.0 → Updater) oder das **UI-Redesign Richtung arsnova.eu** (siehe `📐 Spaeter`-Sektion und `mem:ui_vision`).

### Geaenderte/neue Memories

- Keine.

### Offen / nicht geklaert

- Code-Review fuer Tests- + Architektur-Block ausstehend (siehe Stolperfallen).
- Live-Smoke ausstehend.
- Push erfolgt mit Commits dieses Blocks.

---

## 2026-06-09 — Claude: Tests-Block (4 Review-ToDos abgearbeitet, 1 Production-Bug gefixt)

### Was passierte

User hat sich nach dem Session-Start fuer den **Tests-Block** entschieden (`📐 Tests & Qualitaet` aus dem BACKLOG). Vier offene Test-ToDos aus dem Review-Block 2026-06-08 in dieser Reihenfolge erledigt — sortiert nach Aufwand (klein → gross):

1. **Recurrence-Vektoren um non-31-Clamps ergaenzt.** Vier neue Vektoren in [tests/fixtures/recurrence-vectors.json](tests/fixtures/recurrence-vectors.json):
   - `quarterly_drift_aug31_clamps_to_nov30` (Anker 2024-08-31, Nov hat 30 Tage)
   - `quarterly_drift_aug31_clamps_to_feb28` (zwei Quartale weiter, Feb 2025 hat 28 Tage)
   - `quarterly_drift_aug31_back_to_may31` (drei Quartale weiter, anker-additiv zurueck auf 31)
   - `yearly_leap_anchor_returns_to_29_in_next_leap_year` (2024-02-29 ueber drei 28er-Clamps zurueck auf 2028-02-29)

   Beide Seiten (TS + Rust) lesen die JSON via shared-fixtures-Loader; Drift in der Quartal-/Jahres-Klemmsemantik wuerde jetzt sofort auffliegen.

2. **TS-JSON-Cast fuer Recurrence-Vektoren narrowed.** Neuer `assertInterval`-Helper in [recurrence-vectors.test.ts](src/lib/recurrence-vectors.test.ts) plus eine `ALLOWED_INTERVALS as const satisfies readonly Interval[]`-Whitelist. Tippfehler im JSON (z.B. `"Monthly"`) fallen jetzt direkt im TS-Test mit Vektor-Name als klare Fehlermeldung auf, statt erst Rust-seitig als `Unbekanntes Intervall`. Drei zusaetzliche Helper-Tests dokumentieren die Schutzwirkung. Bewusst kein zod/io-ts — Single-Use-Site, minimaler Helper reicht.

3. **Orphan-account_id-Update als DB-/Command-Test absichern.** Inner-Helper `update_subscription_in_db(&SqlitePool, &Subscription)` aus dem `update_subscription`-Tauri-Command extrahiert; der Command delegiert nur noch. Vier `#[tokio::test]`-Faelle mit in-memory sqlx-Pool + Migrations decken unchanged/changed/cleared/invalid ab. **Im selben Aufwasch Production-Bug entdeckt und gefixt:** sqlx 0.9.0 aktiviert SQLite-FK per Default (`SqliteConnectOptions::foreign_keys: true`), entgegen der bisherigen Annahme im BACKLOG-Architekturpunkt #9. Der vorherige Orphan-Fix liess die Rust-Validierung fuer unveraenderte Orphans durch, aber SQLite blockierte das UPDATE-Statement wegen FK-Constraint, weil `account_id` weiterhin im `SET`-Clause stand. **Fix: bei unveraendertem `account_id` die Spalte komplett aus dem `SET`-Clause weglassen.** Zwei SQL-Pfade in `update_subscription_in_db` — einer mit account_id im SET (wenn geaendert + validiert), einer ohne (wenn unveraendert). Dadurch loest SQLite den FK-Check fuer die Legacy-Bindung gar nicht erst aus. Pure Helper `account_id_requires_validation` + `subscription_account_id_requires_validation` und ihre drei Pure-Tests sind im Zuge dessen weggefallen — Logik ist jetzt direkt im Update-Pfad inline und besser nachvollziehbar.

4. **Reminder-Dispatcher-Reservierung/Rollback automatisiert testen.** Neue `Notifier`-Trait in [reminders.rs](src-tauri/src/reminders.rs) als Side-Effect-Seam:
   - Production-Pfad: `struct AppNotifier<'a>(&'a AppHandle)` impl `Notifier` ruft `app.notification().builder().show()`.
   - Test-Pfad: `MockNotifier { calls: Mutex<u32>, result: Result<(), String> }` mit `success()`/`failure(msg)`-Convenience-Konstruktoren und `call_count()`-Inspektion.
   - `dispatch_due_reminders` nimmt jetzt `&dyn Notifier` statt `&AppHandle`; `run_reminder_check` als Orchestrator baut den `AppNotifier` und reicht ihn durch.
   - Trait-Bound: `pub trait Notifier: Send + Sync` — der Reminder-Loop laeuft als `tauri::async_runtime::spawn`-Task und braucht damit ein Send-Future.

   Vier Tests am Ende des `reminders::tests`-Moduls decken die kritische Reihenfolge `INSERT OR IGNORE` → `show()` → ggf. `DELETE` ab: Success-Pfad persistiert die Reservierung; show()-Failure rollt sie zurueck und propagiert den Notifier-Fehler; bereits reservierte Faelligkeit blockiert sowohl INSERT als auch show(); fehlende Permission reserviert nichts.

### Status am Sitzungsende

- Branch: `main`.
- Working tree dirty mit:
  - Modifiziert: `BACKLOG.md`, `HANDOVER.md`, `src-tauri/Cargo.toml`, `src-tauri/src/commands.rs`, `src-tauri/src/reminders.rs`, `src/lib/recurrence-vectors.test.ts`, `tests/fixtures/recurrence-vectors.json`.
  - Keine neuen Dateien.
- Verifikation gruen:
  - `cargo fmt --check` ✓
  - `cargo clippy --all-targets -- -D warnings` ✓
  - `cargo test` ✓ — **38 Tests** (vorher 33; +4 Orphan-DB-Tests, +4 Dispatcher-Tests, −3 entfernte Pure-Helper-Tests).
  - `pnpm test:run` ✓ — **171 Tests / 13 Files** (vorher 164; +4 neue Recurrence-Vektoren, +3 narrowing-Helper-Tests).
  - `pnpm lint` ✓ — Biome 48 Files clean.
  - `pnpm build` ✓ — TS + Vite-Build gruen.

### Nicht gelaufen

- `pnpm tauri dev` Live-Smoke nicht gestartet. Der Notifier-Refactor laesst die Production-Codeloop strukturell identisch (`AppNotifier` reicht alle Argumente unveraendert an `app.notification().builder()` weiter), aber ein kurzer Live-Test waere trotzdem gut, vor allem fuer den `update_subscription_in_db`-Pfad: Abo bearbeiten mit unveraendertem account_id muss durchgehen. Bei der naechsten Session mitnehmen.

### Wichtige Entscheidungen + Begruendung

- **Inner-Helper-Extraktion (`update_subscription_in_db`, `Notifier`-Trait):** Side-Effect-Seam ist die saubere Antwort auf die Test-Lucke. Tauri-State und AppHandle sind in Unit-Tests schwer zu mocken; ein duenner Adapter ueber sqlite-Pool bzw. Trait macht den Pfad direkt testbar, ohne dass der Production-Aufrufpfad sich aendert.
- **FK-Bypass via `SET`-Weglassen statt `PRAGMA foreign_keys=OFF`-Patch:** Der Fix bleibt schemakonform — wir umgehen die FK-Pruefung nur fuer den Spezialfall „unveraenderter Wert", in dem es semantisch nichts zu pruefen gibt. PRAGMA-Toggle wuerde die gesamte Connection beruehren und ist als Production-Pfad zu invasiv.
- **Pure-Helper entfernt statt umbenannt:** `account_id_requires_validation` hatte nach dem Inline der Decision in den UPDATE-Pfad keinen Konsumenten mehr. Inline-Code ist hier kuerzer und transparenter als ein zwei-Zeilen-Helper plus Tests, die nur sich selbst absichern.
- **Trait `Notifier: Send + Sync` statt `&AppHandle + 'static`-Workaround:** Der bestehende `tauri::async_runtime::spawn`-Aufruf erzwingt Send-Future. Send + Sync auf dem Trait ist der direkte Weg; alle Implementierungen (Production + Mock) erfuellen das ohnehin.
- **`dev-dependencies tokio = { features = ["rt", "macros"] }`** statt rt-multi-thread: single-threaded reicht fuer alle Tests dieser Session, kein Test braucht parallele Tasks oder `block_in_place`.

### Gotchas / Stolperfallen

- **BACKLOG-Architekturpunkt #9 (`PRAGMA foreign_keys=ON statt validate_account_exists-Patches`) basiert auf einer falschen Annahme.** Das Item sagt „SQLite-FKs in dieser App nicht aktiviert" — tatsaechlich sind sie per sqlx-Default ON. `validate_account_exists` bleibt trotzdem sinnvoll, weil die Existence-Pruefung in der Validierung einen klar lesbaren deutschen Fehler liefert (`Konto mit ID 9999 existiert nicht.`) statt einer rohen FK-Constraint-Fehlermeldung. Der Architekturpunkt selbst sollte umformuliert oder geschlossen werden.
- **`update_subscription_in_db` hat jetzt zwei UPDATE-SQL-Varianten** (mit/ohne `account_id` im `SET`). Wer das Schema kuenftig erweitert (z.B. neue Spalte), muss daran denken, sie in *beiden* Varianten zu erwaehnen. Pragmatischer Cut gegen reine Eleganz — eine dynamische `SET`-Klausel ueber Query-Builder waere komplexer als die Duplikation.
- **`MockNotifier` ist ein dummer Stub** — er prueft NICHT, dass die Reservierung *vor* `show()` in der DB liegt. Die Tests zeigen nur: nach erfolgreichem dispatch existiert die Row (Success-Pfad), und nach fehlgeschlagenem dispatch existiert sie nicht (Rollback-Pfad). Die strenge „happens-before"-Garantie ist implizit im Code, nicht im Test. Fuer den expliziten Beweis koennte spaeter ein `AssertingNotifier` mit `tokio::task::block_in_place` + multi-thread-Runtime dazukommen — heute nicht gemacht, weil der ROI klein ist und die einfacheren Tests die wahrscheinlich auftauchenden Refactoring-Fallen schon abfangen.

### Naechster Schritt

- Vor Push: optional kurzer `pnpm tauri dev`-Smoke fuer den Abo-Edit-Pfad (unchanged account_id, Wechsel auf null, Wechsel auf gueltiges Konto).
- Wenn die Tests-Sektion damit komplett ist (E2E via Tauri WebDriver bleibt bewusst offen vor v1.0), waere als naechster Block der **Architektur-Cleanup** dran:
  - BACKLOG-Architekturpunkt #9 umformulieren oder schliessen (FK-Annahme korrigieren).
  - Lock-Poisoning auf `ReminderState.last_check_at` heilen (Architekturpunkt #10).
  - Permission-denied `tracing::info!`-Flut entzerren (Architekturpunkt #11).
  - Sichtbarkeit von `compute_due_reminders` (Architekturpunkt #12).
  - Duplikations-Quellen `ALLOWED_INTERVALS` (Architekturpunkt #13) und `ALLOWED_CURRENCIES` (Architekturpunkt #14).
- Alternativ: **UI-Redesign Richtung arsnova.eu** als groesserer Sprung (siehe `📐 Spaeter`-Sektion und `mem:ui_vision`).

### Geaenderte/neue Memories

- Keine.

### Offen / nicht geklaert

- **Code von dieser Session ist NICHT reviewed.** Der naechste Agent soll vor weiteren funktionalen Aenderungen `/code-review high` ueber den Diff `git diff ba060fa..5bd17e7` laufen lassen — AGENTS.md-Konvention ("Zweite Augen") wurde fuer diese Session bewusst uebersprungen, weil der User direkt commit+push wollte. Schwerpunkte fuer den Review: (a) die zwei `UPDATE`-SQL-Varianten in `update_subscription_in_db` — Schemaerweiterung muss beide Pfade beruehren, leicht zu uebersehen; (b) der FK-Bypass via `SET`-Weglassen — semantisch korrekt, aber konzeptionell ueberraschend; (c) `Notifier`-Trait-Bound `Send + Sync` korrekt fuer Production-`spawn`-Pfad?
- Live-Smoke mit `pnpm tauri dev` ausstehend.
- Push auf `origin/main` erfolgt (`5bd17e7`).

---

## 2026-06-08 — Codex: Push-Abschluss der Review-Fix-Blöcke

### Was passierte

- User bat nach den Fix- und Push-Runden darum, den finalen Stand noch einmal sauber im HANDOVER festzuhalten und erneut zu pushen.
- Vor diesem Nachtrag waren bereits gepusht:
  - `d386072` — `fix: Reminder-Tier-1-Bugs haerten`
  - `6320f94` — `docs: HANDOVER fuer Tier-1-Fixes aktualisieren`
  - `c6704fe` — `fix: Legacy-Validierung konsistent machen`
  - `2f5aa99` — `docs: HANDOVER fuer Legacy-Fixes aktualisieren`
- Dieser Eintrag ist ein reiner Dokumentations-Nachtrag; keine Code-/Backlog-Aenderung.

### Status am Sitzungsende

- Branch: `main`, vor diesem Nachtrag synchron mit `origin/main` auf `2f5aa99`.
- Working tree vor diesem Nachtrag: clean.
- Dieser HANDOVER-only Commit wird direkt anschliessend erstellt und auf `origin/main` gepusht.
- Code-Stand aus den beiden Fix-Bloecken bleibt:
  - Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` ✓ — 33 Tests.
  - Frontend: `pnpm test:run` ✓ — 164 Tests / 13 Files; `pnpm lint` ✓; `pnpm build` ✓.
  - `pnpm tauri dev` wurde in dieser Session fuer den ersten/Tier-1-Block gestartet und kam bis zum laufenden Rust-Binary/App-Start; fuer den zweiten Legacy/UI-Block gab es keinen erneuten Live-Smoke.

### Nächster Schritt

- Als naechstes keine user-facing Review-Bugs mehr: weiter mit den offenen Review-Themen in `📐 Tests & Qualität` und `🏛️ Architektur`:
  - Reminder-Dispatcher-Reservierung/Rollback automatisiert testen.
  - Orphan-`account_id`-Update als DB-/Command-Test absichern.
  - Recurrence-Vektoren um non-31-Clamps ergaenzen.
  - TS-JSON-Cast fuer Recurrence-Vektoren narrowen.
  - Architekturpunkte: FK-PRAGMA, Lock-Poisoning, Permission-denied Log-Flut, Sichtbarkeit/Duplikationen.

### Wichtige Entscheidungen + Begründung

- Kein weiterer Code-Review fuer diesen Nachtrag: reine HANDOVER-Dokumentation, keine Code-/Persistenz-/UI-Aenderung.
- Keine Tests erneut gestartet fuer diesen Nachtrag: Code-Checks liefen bereits gruen direkt vor den Fix-Commits und Lefthook lief bei den Commits.

### Gotchas / Stolperfallen

- Die vorherigen zwei HANDOVER-Eintraege dokumentieren die jeweilige Arbeit im Detail. Dieser Eintrag ist nur der finale Push-/Status-Abschluss, damit der naechste Agent oben sofort den tatsaechlichen Endzustand sieht.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Kein erneuter `pnpm tauri dev` nach dem zweiten Legacy/UI-Block.

## 2026-06-08 — Codex: Restliche Review-Bugs + Frontend-Legacy-Semantik

### Was passierte

- Zweiter Bugblock aus dem Review erledigt und committed:
  - `update_subscription` validiert `account_id` nur noch, wenn eine konkrete Zuordnung neu/anders ist. Unveraenderte Legacy-Orphans und Wechsel auf `null` blockieren Speichern nicht mehr.
  - Neuer gemeinsamer Rust-Helper `parse_iso_date_strict` in `recurrence.rs`; `validate_anchor_date` und `compute_due_reminders` nutzen denselben strikten `YYYY-MM-DD`-Parser.
  - `compute_due_reminders` validiert `lead_days` pro Legacy-Row mit `validate_lead_days`; ungueltige Werte werden gewarnt und geskippt.
  - Frontend validiert `anchorDate`/Currency feldnah in `SubscriptionDialog` und Currency feldnah in `AccountsDialog`.
  - `DateField` rendert invalide Legacy-Datumswerte roh statt beim Rendern zu crashen.
  - TS-Pure-Layer nutzt jetzt `parseStrictISODate`: `formatNextDue` zeigt `Ungueltiges Datum`, `computeCoverage`/`computeUpcoming` skippen invalide Legacy-Daten, `applyFilterAndSort` legt sie bei Faelligkeits-Sortierung ans Ende.
  - `formatAmount` crasht bei unbekannten Legacy-Waehrungen wie `EURO` nicht mehr, sondern rendert defensiv als Zahl + Code.
- `BACKLOG.md`:
  - `Orphan account_id`, `Legacy lead_days`, `Anchor-Date strict-on-write/lenient-on-read` und `Backend-Validierungs-Errors als Feld-Errors` abgehakt.
  - Neues Test-ToDo: echter DB-/Command-Test fuer Orphan-`account_id`-Update-Pfad.
- `/code-review high` via Subagent `Mill`:
  - Erste Runde fand blocker: TS-Date-Pfade normalisierten Legacy-Daten weiter (`new Date(...)`) und `formatAmount` konnte bei unbekannter Currency crashen.
  - Beides gefixt; zweite Runde: keine Blocker. Low-Testgap fuer echten DB-/Command-Test bleibt und ist im BACKLOG.

### Status am Sitzungsende

- Branch: `main`.
- Code-Commit: `c6704fe` (`fix: Legacy-Validierung konsistent machen`).
- Handover-Commit: `2f5aa99` (`docs: HANDOVER fuer Legacy-Fixes aktualisieren`), danach Push auf `origin/main`.
- Verifikation:
  - `cargo fmt --check` ✓
  - `cargo clippy --all-targets -- -D warnings` ✓
  - `cargo test` ✓ — 33 Tests gruen
  - `pnpm test:run` ✓ — 164 Tests / 13 Files gruen
  - `pnpm lint` ✓ — Biome 48 Files clean
  - `pnpm build` ✓ — TS + Vite-Build gruen
  - Lefthook beim Code-Commit ✓ — cargo-fmt, cargo-clippy, biome, vitest.

### Nächster Schritt

- Nach Push sind die user-facing Review-Bugs aus der Bugs-/UI-Sektion erledigt. Offene Review-Themen liegen nun vor allem in `📐 Tests & Qualität` und `🏛️ Architektur`:
  - Reminder-Dispatcher-Reservierung/Rollback automatisiert testen.
  - Orphan-`account_id`-Update als DB-/Command-Test absichern.
  - Recurrence-Vektoren um non-31-Clamps ergaenzen.
  - TS-JSON-Cast fuer Recurrence-Vektoren narrowen.
  - Architekturpunkte: FK-PRAGMA, Lock-Poisoning, Permission-denied Log-Flut, Sichtbarkeit/Duplikationen.

### Wichtige Entscheidungen + Begründung

- **Frontend normalisiert Legacy-Datumswerte nicht mehr still:** Wenn der Rust-Scheduler ein Datum skippt, darf die UI es nicht als gueltige Faelligkeit anzeigen. Deshalb strict parse + `Ungueltiges Datum`/Skip statt `new Date(...)`.
- **Defensive Currency-Anzeige statt Crash:** Legacy-/manuell kaputte Currency-Werte sollen die App nicht beim Rendern zerlegen. Speichern bleibt ueber Whitelist blockiert; Anzeigen bleibt robust.
- **Orphan-account_id nur bei echter Aenderung validieren:** So kann der User Legacy-Daten reparieren oder andere Felder speichern, ohne sofort am alten kaputten Konto-Verweis haengen zu bleiben.

### Gotchas / Stolperfallen

- `parseStrictISODate` gibt lokale `Date`s zurueck, nicht UTC-Dates. Das passt zur bestehenden `recurrence.ts`-Logik (`new Date(y, m-1, d)` in Tests) und vermeidet TZ-Verschiebungen.
- `computeMonthlyBaseline` nutzt kein Datum und wurde deshalb nicht auf Anchor-Parsing umgestellt.
- Der echte Tauri-Command-/DB-Test fuer den Orphan-Pfad ist noch offen; aktuell testen Rust-Unit-Tests nur den Pure-Helper.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Kein Live-Smoke mit `pnpm tauri dev` fuer den zweiten Block gelaufen; der vorherige Tauri-Start in dieser Session war fuer den Tier-1-Block gruen.
- Push auf `origin/main` erfolgte nach dem Handover-Commit.

## 2026-06-08 — Codex: Tier-1-Review-Fixes fuer Reminder/Account-Validation

### Was passierte

- Aus dem obersten HANDOVER/Review-Block wurden die drei Tier-1-Befunde umgesetzt:
  - `compute_due_reminders` bricht den Reminder-Tick nicht mehr wegen einer kaputten DB-Zeile ab. Kaputte `anchor_date`- oder Intervall-Werte werden pro Abo mit `tracing::warn!` geloggt und geskippt; gueltige Abos im selben Batch laufen weiter.
  - Der Reminder-Dispatcher reserviert `(subscription_id, due_date)` jetzt vor dem OS-Notification-Aufruf via `INSERT OR IGNORE`. Bei `show()`-Fehler wird die Reservierung wieder geloescht. Damit ist das konkrete Shutdown-Fenster `show()` erfolgreich, aber Reminder-Row fehlt, geschlossen.
  - `validate_account_fields` nimmt jetzt `balance_cents` als vierten Parameter und prueft den Saldo gegen `±9_000_000_000_000_000` kleinste Waehrungseinheiten. Negative Salden bleiben erlaubt, extreme i64-Werte werden abgefangen.
- Tests ergaenzt/angepasst:
  - Reminder-Test fuer gemischten Batch: kaputtes Ankerdatum wird geskippt, gueltiges Abo bleibt faellig.
  - Reminder-Test fuer gemischten Batch: ungueltiges Intervall wird geskippt, gueltiges Abo bleibt faellig (nach `/code-review high` nachgezogen).
  - Validation-Test fuer positive/negative Salden und Range-Grenzen.
- `BACKLOG.md` markiert die drei Review-Bugs als erledigt mit Codex-Spur.
- `/code-review high` lief vor dem Commit via Subagent `Sartre`: keine blockierenden Findings.
  - Medium-Testgap: Dispatcher-Reservierung/Rollback (`INSERT OR IGNORE` vor `show()`, Rollback bei `show()`-Fehler) ist nicht direkt automatisiert getestet. Als neues ToDo in `BACKLOG.md` aufgenommen, weil dafuer ein kleiner Side-Effect-Seam/Integrationstest-Harness sinnvoll ist.
  - Low-Testgap: ungueltiger Intervall-Skip war nicht direkt getestet. Direkt in dieser Session gefixt.

### Status am Sitzungsende

- Branch: `main`.
- Code-Commit: `d386072` (`fix: Reminder-Tier-1-Bugs haerten`).
- Handover-Commit: `6320f94` (`docs: HANDOVER fuer Tier-1-Fixes aktualisieren`), danach Push auf `origin/main`.
- Verifikation:
  - `cargo fmt --check` ✓
  - `cargo clippy --all-targets -- -D warnings` ✓
  - `cargo test` ✓ — 27 Tests gruen
  - `pnpm test:run` ✓ — 152 Tests / 13 Files gruen
  - `pnpm lint` ✓ — Biome 48 Files clean
  - `pnpm build` ✓ — TS + Vite-Build gruen
  - `pnpm tauri dev` ✓ bis zum laufenden Rust-Binary/App-Start; danach manuell per Ctrl-C beendet. Log zeigte nur die bekannte `libayatana-appindicator`-Warnung, keinen Rust-Startfehler.
  - Lefthook beim Code-Commit ✓ — cargo-fmt, biome, cargo-clippy, vitest.

### Nächster Schritt

- Naechste Review-Bugs aus `BACKLOG.md` angehen: sinnvoller naechster kleiner Block waere `Orphan account_id blockiert Edit der Sub-Row` + `Legacy lead_days bei Read nicht re-validiert` + `Anchor-Date strict-on-write, lenient-on-read`.

### Wichtige Entscheidungen + Begründung

- **Reminder-Race per Vorab-Reservierung geloest:** Es gibt keinen atomaren Commit ueber OS-Notification und SQLite. Die Aenderung priorisiert, dass eine erfolgreich angestossene OS-Notification nicht beim naechsten Start doppelt feuert. `show()`-Fehler werden durch Loeschen der Reservierung zurueckgerollt.
- **Compute bleibt tolerant statt migrationshart:** Kaputte Legacy-Zeilen sollen den stundenweisen Reminder-Loop nicht komplett killen. Warnlog + Skip ist fuer den Scheduler der robustere Default; Datenbereinigung kann spaeter separat passieren.
- **Saldo-Range orientiert sich an JS-Safe-Integer-Grenze:** Frontend/Forecast rechnen mit `number`, deshalb wird nicht nur i64-Gueltigkeit akzeptiert. Der gewaehlte Grenzwert ist praktisch riesig, faengt aber `i64::MIN`/`i64::MAX`-Missbrauch ab.

### Gotchas / Stolperfallen

- Die Vorab-Reservierung schliesst die Doppelbenachrichtigung, akzeptiert aber ein umgekehrtes Restrisiko: harter Prozessabbruch genau zwischen `INSERT OR IGNORE` und `show()` kann eine Row hinterlassen, ohne dass die Notification sichtbar wurde. Normale `show()`-Fehler werden zurueckgerollt.
- `compute_due_reminders` ist weiterhin als `Result<Vec<DueReminder>, String>` signiert, obwohl korrupte Einzelzeilen jetzt geskippt werden. Das haelt den bestehenden Call-Site-Shape klein; kuenftige systemische Compute-Fehler koennen weiter propagiert werden.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Direktes automatisiertes Testen des Dispatcher-Reservierung/Rollback-Pfads ist als Backlog-ToDo offen.

## 2026-06-08 — Claude: Code-Review des Hardening-Blocks (15 Befunde dokumentiert, push as-is)

Direkt nach dem Hardening-Commit-Block hat der User `/code-review` im extra-high-Recall-Modus angestossen. Ziel: zweite Augen ueber die 5 Commits, bevor sie nach origin/main pushen. Ergebnis: 15 Befunde dokumentiert, Push trotzdem (Option C — kein Fix-Pass jetzt, weil die Befunde Verbesserungen *ueber den ohnehin besseren* Stand sind, keine echten Regressionen).

### Vorgehen

- **Phase 1 — 9 Finder-Angles parallel** ueber den Diff `git diff origin/main...HEAD` (892 Zeilen, 688 insertions, 10 Files): A line-by-line, B removed-behavior, C cross-file, D language-pitfalls, E wrapper/proxy, plus Reuse/Simplification/Efficiency/Altitude.
- **Phase 2 — Dedup + Verification**: ~40 Roh-Kandidaten auf ~20 deduped. Statt 20 paralleler Verifier-Agents direkt durch Code-Read verifiziert; die meisten Befunde sind Code-Fakten (Line-Numbers, fehlende Validatoren, asymmetrische Pfade). Verifier-Agents bringen bei diesem Diff-Stil zu wenig zusaetzlichen Wert fuer den Token-Aufwand.
- **Phase 3 — Sweep**: ein zusaetzlicher Agent gegen die deduped Liste; brachte 4 echte neue Befunde (Lock-Poisoning, Shutdown-Race, Log-Flut, Vektor-Coverage-Luecke) + 2 Schaerfungen.
- **Phase 4 — Top-15 JSON** ranked nach Severity, Korrektheit vor Cleanup, wie vom Skill vorgegeben.

### Befunde (in BACKLOG aufgenommen, jeweils Quelle markiert)

**Bugs (6) — `🐛 Bugs`-Sektion:**
1. `compute_due_reminders` bricht den ganzen Batch bei einer korrupten Zeile ab (`?` propagiert) — eine kaputte `anchor_date`-Zeile killt alle Reminder.
2. Shutdown-Race zwischen `notification.show()` und `insert_reminder_if_new` — Notification raus, INSERT fehlt, naechster Start feuert erneut.
3. `balance_cents` ungeprueft in `add_account/update_account` — `validate_account_fields` deckt nur 3 von 4 numerischen Feldern.
4. Orphan-account_id blockiert Edit der Sub-Row, wenn User nur den Namen aendert.
5. Legacy `lead_days` bei Read nicht re-validiert — negative oder huge Werte unterwandern die neue Validierung.
6. Anchor-Date strict-on-write (Validation) vs. lenient-on-read (chrono in `compute_due_reminders`) — Legacy-Row lesbar, aber nicht editierbar.

**Tests & Qualitaet (2) — `📐`-Sektion:**
7. Recurrence-Vektoren decken non-31-Clamps nicht ab — quarterly/yearly Clamp-Edges fehlen.
8. TS-JSON-Cast widens `interval` auf `string` — Tippfehler im JSON wird vom Cast lautlos akzeptiert, scheitert dann Rust-seitig.

**Architektur/Altitude (6) — `🏛️`-Sektion:**
9. `PRAGMA foreign_keys=ON` ist die rechtere Tiefe vs. `validate_account_exists`-Patches — wuerde die Existence-Check-Funktion entbehrlich machen und alle kuenftigen Write-Pfade gleichzeitig haerten.
10. Lock-Poisoning auf `ReminderState.last_check_at` silently dropped — `if let Ok` lasst Err verfallen.
11. Permission-denied `tracing::info!`-Flut bei dauerhaft abgelehnter Berechtigung — verstopft das rolling 7-Tage-Log.
12. `pub fn compute_due_reminders` nur in-modul genutzt — Sichtbarkeit suggeriert externen Vertrag, der den Idempotenz-Check umgehen koennte.
13. `validate_interval` dupliziert `months_per_interval`-Liste — drift-anfaellig bei neuen Intervallen.
14. `ALLOWED_CURRENCIES` dupliziert frontend `CURRENCY_OPTIONS` — drift-anfaellig bei neuen Waehrungen.

**UI (1) — `🔨`-Sektion:**
15. Backend-Validierungs-Errors landen im dialog-weiten Banner statt am Feld — `SubscriptionDialog.validate()` prueft anchorDate-Format und Currency-Whitelist nicht.

### Entscheidung (Option C)

- **Push der 5 Hardening-Commits as-is**, weil:
  - Alle 15 Befunde sind Verbesserungen ueber den jetzigen Stand, nicht Regressionen gegenueber Pre-PR.
  - Die zwei schaerfsten Befunde (#1 Batch-Abbruch, #2 Shutdown-Race) sind theoretische Pfade ohne reproduzierbaren User-Trigger im aktuellen Datenbestand.
  - Tier-3-Befunde (Duplikation, FK-PRAGMA, Lock-Poisoning) sind Architektur-Investments fuer eine eigene Folge-Session.
- **Befunde im BACKLOG eingestreut** in die jeweils passende Sektion (`🐛 Bugs` / `🔨 Jetzt` / `📐 Tests` / `🏛️ Architektur`), markiert mit `(2026-06-08, Review)` zur Nachvollziehbarkeit.

### Naechster Schritt

- Eine eigene Fix-Session fuer Tier-1-Befunde (#1, #2, #3) waere sinnvoll — alle drei sind kleine Aenderungen mit Test-Abdeckung.
- Tier-3-Altitude-Befunde (#9 PRAGMA foreign_keys, #13/#14 Duplikations-Quellen) wuerden gut in eine "Schema-Strenge + Shared-Constants"-Session passen.
- `pnpm tauri dev` Live-Smoke immer noch ausstehend; bei der Fix-Session mitnehmen.

---

## 2026-06-08 — Claude: Hardening-Block (Server-Validierung, gemeinsame Recurrence-Vektoren, reminders-Split, Review-Konvention)

User hat aus den vier offenen Hardening-Items im BACKLOG den ganzen Block am Stueck angefragt. Item 5 (E2E via Tauri WebDriver) wurde nach Rueckfrage vertagt, weil eigener Infrastruktur-Block und Backlog selbst sagt „eigentlich erst vor v1.0". Die anderen vier sind erledigt.

### Geaendert

- `src-tauri/src/validation.rs` (neu, ~140 Zeilen + 70 Zeilen Tests)
  - Reine Helper: `validate_name/currency/interval/anchor_date/amount_cents/lead_days/min_buffer_cents`.
  - Komposit-Helper `validate_subscription_fields` und `validate_account_fields`.
  - Async-Helper `validate_account_exists(db, account_id)` — wichtig, weil SQLite-Foreign-Keys in dieser App nicht aktiviert sind (kein `PRAGMA foreign_keys=ON` in `lib.rs`), also waere ein dangling `account_id` sonst widerspruchsfrei.
  - Strikte Anchor-Date-Pruefung (Laenge == 10, Bindestriche an Position 4 + 7) **vor** dem chrono-Parse — chrono akzeptiert `2026-6-8` mit `%Y-%m-%d`, was die Recurrence-Logik mit unpadded Werten in die DB durchlassen wuerde.
  - Currency-Whitelist matcht `CURRENCY_OPTIONS` im Frontend (EUR/USD/GBP/CHF/KRW), Interval-Whitelist matcht das Schema-CHECK-Constraint, `lead_days` 0..=365 spiegelt die Frontend-Validierung.
  - 9 Unit-Tests, alle async-frei (auch der Existence-Check ist nicht im Test-Modul abgedeckt — koennte spaeter mit einer in-memory sqlx-Pool kommen).
- `src-tauri/src/lib.rs`
  - `mod validation;` registriert.
- `src-tauri/src/commands.rs`
  - `add_subscription` / `update_subscription` rufen `validate_subscription_fields` und (falls `account_id.is_some()`) `validate_account_exists`.
  - `add_account` / `update_account` rufen `validate_account_fields`. `update_account` validiert den vollen `Account` (Name + Currency + min_buffer); `add_account` mit dem nach Defaults aufgeloesten Currency-Wert.
- `tests/fixtures/recurrence-vectors.json` (neu)
  - 13 `next_due_date`-Vektoren als Single Source of Truth fuer beide Seiten: Anker in Zukunft, Anker == from, einfacher Monatssprung, 31.-Anker-Drift quer durch Feb/Mar/Apr/May/Jul, quartal exact-hit + one-day-past, jaehrlich-einfach, Schaltjahr-Anker (2024-02-29 → 2025-02-28 und 2026-02-28).
  - Repo-Root, neutraler Pfad fuer beide Sprachen.
- `src-tauri/src/recurrence.rs`
  - Neuer Test `shared_vectors_match_typescript_impl` parst die JSON via `include_str!` + `serde_json::from_str` und prueft jeden Vektor gegen `next_due_date`.
- `src/lib/recurrence-vectors.test.ts` (neu)
  - Vitest-Spec liest dieselbe JSON via Import (resolveJsonModule), narrowt auf Interval-Type, prueft jeden Vektor gegen `nextDueDate`. Lokales `parseDate` baut `new Date(y, m-1, d)` — Vitest hat `TZ=UTC` gesetzt, also Mitternacht-konsistent mit Rusts `NaiveDate`.
- `src-tauri/src/reminders.rs`
  - **Sauberer Split:** Neue pure Funktion `compute_due_reminders(subs, today) -> Vec<DueReminder>` (Notify-Filter + Anchor-Parse + `next_due_date` + Lead-Window-Vergleich), neue Async-Funktion `dispatch_due_reminders(pool, app, granted, due)` (Idempotenz-Check + Notification-Permission-Branch + `show()` + `INSERT OR IGNORE`). `run_reminder_check` ist nur noch Orchestrator.
  - Neuer pub-Struct `DueReminder { subscription_id, subscription_name, amount_cents, currency, due_date }` als Pipe-Format zwischen compute und dispatch.
  - 7 neue Unit-Tests fuer den pure-Pfad: muted skipped, today < remind_from skipped, today == remind_from included, today == due_date included (lead_days=0), 31.-Anker-Drift-Schutz (2025-03-25 mit Anker 2025-01-31 → 2025-03-31, nicht 03-28), bad anchor_date Fehler, gemischter Batch.
- `AGENTS.md`
  - Neuer Abschnitt „Zweite Augen — Code-Review-Konvention" nach „Pruefen vor Abschluss".
  - Regel: nicht-triviale Aenderungen vor Commit `/code-review high`; groessere Bloecke `/code-review ultra`; Triviales ohne Review.
  - Cross-Agent-Pattern (Claude ↔ Codex) explizit als „zweite Augen"-Praxis dokumentiert; Befunde gehen in den HANDOVER oder ins BACKLOG, nicht in „mache ich spaeter".
- `BACKLOG.md`
  - Vier ToDos in der Architektur-Sektion + Tests/Qualitaet-Sektion auf erledigt gesetzt mit konkreten Hinweisen, was getan wurde.

### Verifikation

- `pnpm exec tsc --noEmit` ✓.
- `pnpm lint` ✓ (Biome 48 Files clean — 2 neue Files dazu).
- `pnpm test:run` ✓ — **152 Tests in 13 Files gruen** (vorher 138; +14 in dieser Session, davon 13 geteilte Vektoren + 1 Sanity-Test „Fixtures nicht leer").
- `pnpm build` ✓ — TS-Compile + Vite-Bundle in 1.41s (305 kB JS, 18 kB CSS).
- `cargo fmt --check` ✓.
- `cargo clippy --all-targets -- -D warnings` ✓.
- `cargo test` ✓ — **25 Tests gruen** (vorher 8; +17 davon: 9 in `validation::tests`, 7 in `reminders::tests` fuer compute_due, 1 shared-vectors-Test).

### Nicht gelaufen

- `pnpm tauri dev` **nicht gestartet**. Memory `task_completion` empfiehlt das bei Tauri-/Plugin-Aenderungen — hier wuerde es vor allem den Validation-Pfad live abdecken (negativen Betrag, leeren Namen, nicht-existente Account-ID via Devtools-`invoke`). Cargo clippy + cargo test + cargo fmt + pnpm build sind alle gruen, also keine Compile- oder Test-Regression. **Bitte vor dem Commit kurz `pnpm tauri dev` und einen Live-Smoke-Test: Abo anlegen mit Betrag=0 oder leerem Namen sollte jetzt einen sauberen deutschen Fehler aus dem Rust zeigen, statt die Eingabe trotzdem zu speichern.** Wenn Frontend-Validierung greift, sieht man den Server-Pfad nicht — aber Konsistenz-Check, dass die Frontend-Pfade weiter funktionieren, ist sinnvoll.

### Wichtige Entscheidungen + Begruendung

- **Validation als eigenes Modul** statt inline in `commands.rs`: Helpers sind rein und testbar ohne Tauri/State. `commands.rs` bleibt schlank und konzentriert sich auf SQL.
- **Strikte Anchor-Date-Pruefung (Laenge 10 + Bindestriche an Position 4/7) zusaetzlich zu chrono**: chrono parst `%Y-%m-%d` tolerant, akzeptiert `2026-6-8` und `2026-06-8`. Das wuerde sich durch die ganze Recurrence-Pipeline ziehen und an spaeteren `format("%Y-%m-%d").to_string()`-Stellen ploetzlich gepaddet wieder rauskommen — Inkonsistenz in den `due_date`-Spalten zwischen `reminders.due_date` (gepaddet) und `subscriptions.anchor_date` (gemischt). Strikt validieren, sobald die Daten reinkommen.
- **Existence-Check fuer account_id nur wenn `Some`**: `account_id` ist nullable im Schema (Sub ohne Konto-Zuordnung ist valid). Frontend setzt `null` oft (Default), das soll weiterhin durchlaufen.
- **Geteilte Vektoren als JSON, nicht als gemeinsame Code-Datei**: minimaler Polyglot-Aufwand, beide Sprachen koennen JSON nativ lesen. Rust-Seite via `include_str!` (compile-time einbinden), TS via Vite-JSON-Import. Wenn das Setup mal flaky waere, gibt's klare Fehler-Pfade (parse failure beim Test-Start).
- **`DueReminder` enthaelt schon `subscription_name`/`amount_cents`/`currency`** statt nur ID + Datum. Begruendung: compute besitzt den `Subscription` ohnehin, der Dispatcher braucht diese Werte fuer die Notification, und wenn ich nur IDs zurueckgebe, muesste der Dispatcher die Subs nochmal aus der DB lesen oder durch einen Lookup ziehen. Pragmatischer Cut.
- **`compute_due_reminders` ist `pub`** im Modul, `dispatch_due_reminders` ist privat. Das spiegelt die Test-Intention: die pure Funktion ist die Stelle, an der man drift-saubere Lead-Window-Logik beweist; der Dispatcher ist Glue.
- **Review-Konvention als Doku, nicht als Code-Hook**: das Memory `feedback_workflow` ist explizit gegen Prozess-Overhead in der Solo-Fruehphase. CI-side Reviewer oder scheduled Review-Agent wuerden Token kosten und Zwang erzeugen, ohne dass das Solo-Setting davon profitiert. Konvention + `/code-review`-Tooling existiert schon — die Doku hebt es auf die Ebene „erinnere dich vor dem Commit".

### Gotchas

- **Rust-Modul `validation` nicht ueber `pub mod` exportiert** in `lib.rs` — wird nur `commands.rs`-intern benutzt. Wenn der Integration-Test fuer den Existence-Check spaeter dazukommt, koennte das von `pub mod` profitieren, aktuell nicht noetig.
- **`shared_vectors_match_typescript_impl` ist ein einziger `#[test]`**, der eine Schleife laeuft. Wenn ein Vektor scheitert, panic-Message enthaelt den Vektor-Namen (`panic!("vektor {}", v.name)`) — `cargo test` zeigt das im Stacktrace. TS-Seite hat einen `it(v.name)` pro Vektor, da sieht man jeden Fail einzeln. Asymmetrisch, aber pragmatisch.
- **`update_account` validiert die volle Account-Struktur** inkl. `min_buffer_cents`. Falls jemand spaeter einen `update_account_balance`-Command einfuehrt, der nur den Saldo aendert, muss er nicht den ganzen Account validieren — neuer schlanker Validator analog zu `set_subscription_active`.
- **`reminders::tests::sub` ist als Helper im Test-Modul** — wenn ein Test-File spaeter externe Subscription-Fixtures braucht, lohnt sich evtl. ein eigenes `mod test_fixtures` mit `pub(crate)`-Visibility. Aktuell aber kein Bedarf.
- **`pnpm tauri dev` nicht gelaufen**, siehe oben. Falls bei `tauri dev` doch ein Rust-Panic-Start passiert: hat fast sicher mit `validation`-Modulladung oder neuen Imports zu tun, dann erst `cargo check` lokal, dann gezielt im File suchen.

### Status am Sitzungsende

- Branch `main`, Working tree dirty mit:
  - 3 neue Files: `src-tauri/src/validation.rs`, `src/lib/recurrence-vectors.test.ts`, `tests/fixtures/recurrence-vectors.json`.
  - Modifiziert: `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/recurrence.rs`, `src-tauri/src/reminders.rs`, `AGENTS.md`, `BACKLOG.md`, `HANDOVER.md`.
- Tests gruen: 152 Vitest, 25 Cargo. Alle Linter/Formatter clean. Build clean.
- Live-Smoke vom User noch ausstehend.

### Naechster Schritt

- Vor Commit: `pnpm tauri dev` + Live-Smoke fuer Validation-Pfad (negativer Betrag, leerer Name, gefaktes account_id) und Sanity-Check, dass der Reminder-Loop weiter laeuft.
- Vor Push: optional `/code-review high` ueber die Session-Diff laufen lassen (nach der frisch eingefuehrten Konvention in AGENTS.md).
- Naechstes Backlog-Thema laut User-Wahl: entweder **Release-Reife-Block** (Matrix-Build → Tag v0.1.0 → Updater) oder **UI-Redesign Richtung arsnova**. **E2E via Tauri WebDriver** bleibt offen, sinnvoll vor v1.0 als eigene Session-Reihe.

---

## 2026-06-08 — Codex: Review-Befunde 3/4 ebenfalls gefixt

Direkt im Anschluss an die Fix-Session fuer Befunde 1/2 bat der User darum, die zuvor geparkten Befunde 3/4 doch direkt mitzunehmen. Ergebnis: beide erledigt, Backlog entsprechend auf erledigt gesetzt.

### Geaendert

- `src-tauri/src/commands.rs`
  - Oeffentlichen Tauri-Command `insert_reminder_if_new` entfernt.
- `src-tauri/src/lib.rs`
  - `commands::insert_reminder_if_new` aus `generate_handler!` entfernt.
- `src/lib/db.ts`
  - TS-Wrapper `insertReminderIfNew` entfernt.
  - Ergebnis: Reminder-Rows koennen nicht mehr vom Frontend als "gesendet" markiert werden; nur der Rust-Scheduler schreibt sie nach erfolgreichem Notification-Start. Der interne Helper `insert_reminder_if_new` in `src-tauri/src/reminders.rs` bleibt bewusst erhalten.
- `src/App.tsx`
  - Neuer `settingsOpenSeq`-State. `openSettings()` inkrementiert ihn vor `showModal()`.
- `src/components/SettingsDialog.tsx`
  - Neues optionales Prop `openSeq`.
  - Reminder-Status laedt weiterhin beim Mount und zusaetzlich bei jedem `openSeq > 0`-Wechsel, also bei jedem Oeffnen des dauerhaft gemounteten Dialogs.
- `src/components/SettingsDialog.test.tsx`
  - Neuer Test fuer erneuten `getReminderStatus()`-Call bei `openSeq`-Aenderung.
- `BACKLOG.md`
  - Die beiden Review-ToDos 3/4 auf erledigt gesetzt.
  - Architektur-Text zu Tauri-Commands korrigiert: der fruehere oeffentliche `insert_reminder_if_new`-Command ist nicht mehr aktueller Bestand.

### Verifikation

- `pnpm exec vitest run src/components/SettingsDialog.test.tsx` ✓ — 13 Tests.
- `pnpm exec tsc --noEmit` ✓.
- `cargo fmt --check` ✓.
- `cargo test` ✓ — 8 Tests.
- `pnpm test:run` ✓ — 12 Files / 138 Tests.
- `pnpm lint` ✓.
- `pnpm build` ✓.
- `cargo clippy --all-targets -- -D warnings` ✓.

### Nicht gelaufen

- `pnpm tauri dev` nicht gestartet. Fuer den Command-Removal-Pfad wurden Rust-Compile/Test/Clippy ausgefuehrt; der Settings-Refresh ist per RTL-Test abgedeckt.

### Status

- Working tree bleibt dirty mit allen vier Review-Fixes plus BACKLOG/HANDOVER.
- Alle Review-Befunde aus dem Codex-Review sind jetzt entweder direkt behoben oder im selben Stand dokumentiert; es bleiben keine Review-ToDos 3/4 mehr offen.

---

## 2026-06-08 — Codex: Review-Befunde 1/2 gefixt, 3/4 ins Backlog

User wollte nach der Review-Einschaetzung die Befunde 3 und 4 als ToDos im Backlog parken und die fachlichen Befunde 1 und 2 direkt beheben. Ergebnis: erledigt.

### Geaendert

- `BACKLOG.md`
  - Zwei offene Bug-ToDos ergaenzt:
    - alten `insert_reminder_if_new`-Command entfernen/entschaerfen.
    - Reminder-Status im Settings-Dialog beim Oeffnen frisch laden.
- `src/lib/coverage.ts`
  - Unzugewiesene Abos werden in `computeCoverage` nicht mehr in einem einzigen `UNASSIGNED_KEY`-Bucket gesammelt, sondern pro Waehrung (`__unassigned__:<currency>`) getrennt. Damit werden EUR/USD/KRW ohne Konto nicht mehr heimlich summiert.
  - Kommentar zum Multi-Currency-Schnitt aktualisiert.
- `src/components/OverviewSection.tsx`
  - React-Key fuer unzugewiesene Coverage-Buckets enthaelt jetzt die Waehrung, damit mehrere `(kein Konto zugeordnet)`-Buckets kollisionsfrei rendern.
- `src/lib/format.ts`
  - Neuer `parseSignedAmountInput(input)`-Helper: gleiche locale-tolerante Zahl-Logik wie `parseAmountInput`, aber mit fuehrendem Minus fuer Kontosalden.
  - `parseAmountInput` bleibt unsigned; Abo-Betraege bleiben dadurch unveraendert geschuetzt.
- `src/components/AccountsDialog.tsx`
  - Kontosaldo nutzt jetzt `parseSignedAmountInput`; negative Salden sind erlaubt.
  - Mindestpuffer laeuft ueber denselben Parser, wird danach aber weiter mit `minBufferCents < 0` blockiert, sodass die spezifische Meldung "Mindestpuffer darf nicht negativ sein." greift.

### Tests

- `src/lib/coverage.test.ts`
  - Neuer Test: unzugewiesene Subs in EUR/USD ergeben getrennte Coverage-Buckets.
- `src/lib/format.test.ts`
  - Neue Tests fuer `parseSignedAmountInput` (negative deutsche Eingaben, positive Eingaben, ungueltige Sign-Faelle).
- `src/components/AccountsDialog.test.tsx`
  - Neue Tests fuer negativen Saldo beim Anlegen, negativen Mindestpuffer als Validierungsfehler und Speichern eines bereits negativen Saldos im Edit-Mode.

### Verifikation

- `pnpm exec vitest run src/lib/coverage.test.ts` ✓ — 21 Tests.
- `pnpm exec vitest run src/lib/format.test.ts` ✓ — 21 Tests.
- `pnpm exec vitest run src/components/AccountsDialog.test.tsx` ✓ — 14 Tests.
- `pnpm exec vitest run src/components/SubscriptionDialog.test.tsx` ✓ — 13 Tests, zur Absicherung dass Abo-Betraege unsigned bleiben.
- `pnpm exec tsc --noEmit` ✓.
- `pnpm test:run` ✓ — 12 Files / 137 Tests.
- `pnpm lint` ✓.
- `pnpm build` ✓.

### Nicht gelaufen

- `pnpm tauri dev` nicht gestartet, weil nur Frontend-/Pure-Logic-Code und Backlog/HANDOVER geaendert wurden.
- Rust-Checks nicht wiederholt, weil kein Rust-Code in dieser Fix-Session geaendert wurde.

### Status

- Working tree ist absichtlich dirty mit den Fixes plus dem vorherigen Review-HANDOVER-Eintrag.
- Naechste sinnvolle Richtung: entweder committen oder die geparkten Backlog-ToDos 3/4 in einer kleinen Folgesession angehen.

---

## 2026-06-08 — Codex: Code-Review der 2026-06-07-Programmierarbeiten

User bat um einen Code-Review fuer alles, was "heute" programmiert wurde. Wegen Commit-Historie/Handovers wurde der Scope als die Code-Commits vom 2026-06-07 interpretiert (RTL/Test-Setup, Logging, Reminder/Tray-Fixes, Kontodeckung, Validierung, Archiv, Demnaechst, Test-Notification, Filter/Sortierung). Reine Doku-Commits wurden nur als Kontext betrachtet.

### Verifikation

- `pnpm exec tsc --noEmit` gruen.
- `pnpm test:run` gruen: 12 Files / 130 Tests.
- `cargo test` gruen: 8 Tests.
- `pnpm lint` gruen.
- `cargo fmt --check` gruen.
- `cargo clippy --all-targets -- -D warnings` gruen.
- `pnpm build` gruen.

### Review-Befunde

- `src/lib/coverage.ts`: unzugewiesene Abos werden in `computeCoverage` alle ueber denselben `UNASSIGNED_KEY` gebucketet. Bei mehreren unzugewiesenen Waehrungen werden Betrage zusammenaddiert und mit der Waehrung des ersten Subs angezeigt. Das widerspricht der Mehrwaehrungs-Ehrlichkeit.
- `src/lib/format.ts` + `src/components/AccountsDialog.tsx`: `parseAmountInput` blockiert `-`, wird aber auch fuer den aktuellen Kontosaldo verwendet. Negative Kontostaende koennen dadurch weder neu eingegeben noch beim Bearbeiten unveraendert gespeichert werden.
- `src-tauri/src/commands.rs` + `src/lib/db.ts`: der alte `insert_reminder_if_new`-Command/Wrapper ist weiterhin oeffentlich exponiert, obwohl Reminder-Rows jetzt "Notification wurde erfolgreich angestossen" bedeuten. Aktuell nicht aus React genutzt, aber ein spaeterer/falscher Aufruf koennte Reminder als gesendet markieren, ohne Notification.
- `src/components/SettingsDialog.tsx` + `src/App.tsx`: Reminder-Status wird beim Mount geladen, nicht beim Oeffnen des dauerhaft gemounteten Dialogs. Status kann bei spaeterem Oeffnen alt sein; manuelles "Aktualisieren" behebt es.

### Naechster Schritt

Bei Fix-Session zuerst die zwei fachlichen Befunde angehen: unassigned Coverage pro Waehrung trennen und negative Saldi im AccountsDialog erlauben (nicht fuer Abo-Betraege/Mindestpuffer).

---

## 2026-06-08 — Codex: Serena-Zugriff bestaetigt

Kurzer Verifikations-Check auf User-Wunsch. Ergebnis: Serena ist in dieser Codex-Session verfuegbar.

### Verifikation

- `mcp__serena.initial_instructions` erfolgreich aufgerufen.
- Serena meldet das Projekt `SubTracked` unter `/home/legr/SubTracked` als aktiviert.
- Sichtbare Memories laut Serena: `conventions`, `core`, `memory_maintenance`, `suggested_commands`, `task_completion`, `tech_stack`, `ui_vision`.

### Naechster Schritt

Bei der naechsten Facharbeit kann Codex Serena fuer Symbol-Uebersichten, Referenzen, Diagnostik und gezielte Code-Edits verwenden.

---

## 2026-06-08 — Codex: Serena-MCP fuer Codex eingerichtet

Kurze Setup-Session vor der naechsten Facharbeit: User fragte, ob Codex nicht selbst auf denselben Serena-MCP-Server zugreifen kann wie Claude Code in VS Code. Ergebnis: ja, Codex ist jetzt global mit Serena verdrahtet; die aktuell laufende Codex-Session sieht die Tools aber erst nach Neustart/neuem Thread.

### Geaendert

- `~/.codex/config.toml` (ausserhalb des Repos) per `codex mcp add serena -- ...` erweitert:
  - `command = "uvx"`
  - `args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "ide-assistant", "--project", "/home/legr/SubTracked"]`
- Bewusst absoluter Projektpfad statt `--project "."`, weil Codex-MCP ohne `cwd`-Option sonst je nach Startkontext das falsche Verzeichnis aktivieren koennte.
- `uvx --from git+https://github.com/oraios/serena serena --help` einmal erfolgreich ausgefuehrt, damit Serena im uv-Cache liegt. Dabei kam nur eine Python-3.14/Pydantic-V1-Warnung aus `anthropic/_compat.py`, der CLI-Help lief trotzdem sauber.

### Verifikation

- `codex mcp get serena` zeigt `enabled: true`, Transport `stdio`, Command `uvx`, Args mit `--project /home/legr/SubTracked`.
- `codex mcp list` zeigt Serena als `enabled`.
- `tool_search` findet in der laufenden Session weiterhin keine Serena-Tools. Erwartet: MCP-Server werden beim Session-Start geladen; neuer Codex-Thread/Restart noetig.
- Repo-Stand vor HANDOVER-Update war clean (`main...origin/main`).

### Gotchas

- In VS Code lag zusaetzlich ein synchronisierter MCP-Eintrag unter `/home/legr/.config/Code/User/mcp.json`, der auf macOS-Pfade und ein anderes Projekt zeigte (`/Users/.../arsnova.eu`). Den nicht fuer Codex kopieren.
- Die portable Repo-Datei `.mcp.json` bleibt weiterhin die Claude-Code-Seite fuer SubTracked (`uvx --from git+https://github.com/oraios/serena ... --project "."`).
- Naechster Codex-Start sollte zuerst pruefen, ob Serena-Tools sichtbar sind, dann idealerweise `initial_instructions`/Projektaktivierung ueber Serena nutzen.

---

## 2026-06-07 — Claude: README an den neuen Produktstand angepasst (Tagesabschluss)

Letzter Schritt der Session: die README untervernkaufte das Projekt nach den heutigen Erweiterungen deutlich („Persönlicher Abo-Tracker … kündigt Fälligkeiten an … zeigt Konten 6 Monate in die Zukunft"). Heute haben wir aus der App einen Liquiditäts-Radar gemacht — das gehört in die Tagline. User mochte den Satz aus der Sitzungs-Bilanz „SubTracked ist heute eine andere App als heute morgen" und wollte das in der README spiegeln.

### Geändert

- `README.md`
  - **Tagline neu** (User-Wahl aus drei Vorschlägen — Variante A „Liquiditäts-Radar zuerst, Abo-Tracker als Werkzeug"): „Liquiditäts-Radar für wiederkehrende Zahlungen. Pflegt deine Abos, schreibt deine Konten in die Zukunft fort und warnt früh, wenn das Geld eng wird. Native Desktop-App, im Tray leise im Hintergrund." Anti-SaaS-Linie unverändert darunter.
  - **Funktionen-Block** von vier Bullets auf vier thematische Sub-Sektionen ausgebaut: Konten + Deckung, Abos, Erinnerungen, Hintergrund-Betrieb. Erwähnt namentlich Mindestpuffer, Deckungswarnung (Puffer-/Null-Unterschreitung), Mehrwährungs-Schnitt mit ehrlichem Hinweis, toleranter Betrags-Parser, Demnächst-30-Tage-Sektion, Filter + Sortierung, Archivieren/Reaktivieren, Test-Notification + sichtbaren Reminder-Status, idempotente Reminder-Sendung, stündlicher Rust-Loop unabhängig vom Webview-Lifecycle.
  - **Status-Datum** von 2026-06-06 auf 2026-06-07 hochgezogen. Inhalt sonst gleich (Linux-fokussiert, Win/macOS untested, kein Tag, kein Installer).
- Tech-Sektion + Bauen/Entwicklung/Lizenz unverändert — die waren schon aktuell.

### Verifikation

- `pnpm lint` ✓ (Biome scannt 46 Files clean — README ist im Scope, keine Format-Verstöße).
- Optisch geprüft im File-Viewer, keine ASCII-Sonderzeichen-Probleme, keine kaputten Markdown-Sektionen.

### Entscheidung

- **Tagline-Variante A** (Liquiditäts-Radar zuerst) gewählt nach `AskUserQuestion` mit drei Optionen. B war „Abo-Tracker, der echte Kontodeckung kann" (näher am Status quo), C war „Zahlungsradar für den Alltag" (alltagsnah, ohne Fachbegriff). A trifft das Identitäts-Update am genauesten und gibt der Anti-SaaS-Linie den Raum dahinter zurück.

### Status am Tagesende

- Branch `main`, Working tree: `README.md` + `HANDOVER.md` modifiziert. Wird gemeinsam in einem Tagesabschluss-Commit gepusht.
- Tests: 130 Vitest + 8 Cargo grün (unverändert seit Filter-Commit).
- Heutige Session-Commits auf `main`: `5b9e27e` (Kontostände) → `014b919` (Validierung) → `9e1a06f` (Archiv) → `a45a791` (Demnächst) → `40f60de` (Test-Notification + Reminder-Status) → `3a26e64` (Filter + Sortierung) → dieser Tagesabschluss-Commit. Sechs Feature-Commits + ein README-Update.

### Nächster Schritt

Pause. Beim nächsten Session-Start: HANDOVER von oben lesen, dann Backlog-Kandidaten (Release-Reife mit `tauri-action`/Updater, UI-Redesign Richtung arsnova, oder ein anderes Backlog-Item nach User-Wahl).

---

## 2026-06-07 — Claude: Filter + Sortierung für die Abo-Liste

Das letzte sinnvolle Quick-Win-Item der Session: die Abo-Liste hat jetzt eine Filter-Bar mit vier Selects (Konto / Währung / Erinnerungen / Sortierung). Nur sichtbar, wenn ≥ 2 Abos da sind. Konto- und Währungs-Filter blenden sich automatisch aus, wenn nur eine Option existiert. Pure-Function-Logik mit 17 Tests, eigene Komponente, sauber vom bestehenden Archiv-Toggle entkoppelt.

### Geändert

- `src/lib/subscription-list.ts` (neu) — `applyFilterAndSort(subs, options, now)` als reine Funktion. Typen: `AccountFilter = null | "none" | number`, `NotifyFilter = null | "on" | "off"`, `SortKey` mit 6 Werten, `SubListOptions`-Container. Default-Options als Konstante `DEFAULT_SUB_LIST_OPTIONS` exportiert. Fälligkeits-Sortierung cacht `nextDueDate` pro Sub-ID (Map), damit der Sort-Comparator nicht doppelt rechnet. Helpers `uniqueCurrencies(subs)` (alphabetisch sortierte Set) und `hasUnassignedSubs(subs)` für die FilterBar-Logik.
- `src/lib/subscription-list.test.ts` (neu, 17 Tests) — alle Filter-Pfade einzeln + kombiniert (UND), alle 6 Sortier-Modi, `uniqueCurrencies` + `hasUnassignedSubs`-Edge-Cases (leer/single/Duplikate).
- `src/components/SubscriptionFilterBar.tsx` (neu) — vier Selects als `<label>` mit Captions, jeder verändert die `options` und ruft `onChange(next)`. Konto-Filter zeigt nur die in den Subs referenzierten Konten (Set-Lookup), plus „(kein Konto)" nur wenn `hasUnassignedSubs`. Konto-Filter ist nur sichtbar, wenn mindestens 2 Wahlmöglichkeiten vorhanden sind (verfügbare Konten + ggf. unassigned). Währungs-Filter analog versteckt bei einer einzigen Währung. Erinnerungen- und Sortierungs-Select sind immer sichtbar. Spezial-Wert `"__none__"` für "kein Konto" als String-Encoding, beim Lesen über `parseAccount(value)` → `AccountFilter`.
- `src/App.tsx` — neuer State `filterOptions: SubListOptions` mit `DEFAULT_SUB_LIST_OPTIONS`. `preFilteredSubs` ist explizit benannt (was nach Archiv-Toggle übrig bleibt), `visibleSubs` ist das Ergebnis von `applyFilterAndSort(preFilteredSubs, filterOptions)` in `useMemo`. FilterBar wird nach dem Archiv-Toggle gerendert, **nur wenn `preFilteredSubs.length >= 2`** — Single-Abo-Setup hat keinen Filter-Mehrwert. Neuer Empty-State „Kein Abo passt zu den aktuellen Filtern." wenn `preFilteredSubs.length > 0 && visibleSubs.length === 0`. OverviewSection bekommt weiterhin `activeSubs` (Filter wirkt **nicht** auf den Konto-Forecast — bewusst, Coverage ist Gesamtbild, Filter ist Listen-Sicht).
- `src/App.css` — neue `.filter-bar` (flex-wrap-Container mit dezentem Hintergrund + Border) und `.filter-field` (vertikales `<label>` mit Caption + Select). Dark-Mode-Anpassung für `.filter-field`-Caption.

### Verifikation

- `pnpm exec tsc --noEmit` ✓.
- `pnpm test:run` ✓ — **130 Tests in 12 Files grün** (vorher 113, +17 in dieser Session).
- `pnpm lint` ✓ (zwei Auto-Fixes: Test-Format „render-Calls einzeilig" und Import-Reihenfolge in `subscription-list.ts`; plus eine Descending-Specificity-Warnung in CSS, durch Streichen einer überflüssigen `.filter-field select`-Padding-Regel gelöst — Defaults reichen optisch).
- `cargo fmt --check` ✓ / `cargo clippy --all-targets -- -D warnings` ✓.
- `pnpm tauri dev` gestartet; User hat „passt" bestätigt: FilterBar erscheint ab 2 Abos, Konto/Währung-Filter verstecken sich richtig, alle 6 Sortier-Modi greifen, Empty-State greift bei voller Ausfilterung, Archiv-Toggle + Filter kombinieren sauber.

### Wichtige Entscheidungen + Begründung

- **Aktiv/Archiviert NICHT in der Filter-Bar**, obwohl Backlog-Wording („nach … aktiv/archiviert") das nahelegte. Begründung: der **bestehende Archiv-Toggle** macht denselben Job, und zwei UI-Pfade für denselben Filter wären verwirrend. Konsistenz: ein Konzept pro UI-Pfad. FilterBar arbeitet auf den preFiltered Subs (= das Ergebnis des Archiv-Toggles), beide Konzepte stacken sauber.
- **Konto- und Währungs-Filter verstecken sich bei nur einer Option** statt einfach „Alle / Hauptkonto" anzubieten. Begründung: kein UI ohne Funktion — wenn der User nur ein Konto hat, ist der Filter Lärm. Bei der Standalone-Solo-Installation ist das der Default-Case. Erinnerungen- und Sortierungs-Select sind immer sichtbar, weil sie auch bei einem Abo Sinn machen können (zumindest die Sortierung, falls jemand das umstellt für später).
- **FilterBar erst ab `preFilteredSubs.length >= 2`** sichtbar. Begründung: gleiche Logik. Bei einem Abo gibt's nichts zu filtern, eine Filter-Bar wäre nur Lärm. Schwelle 2 statt 1, weil 1 Abo „nichts zu sortieren" bedeutet und 2 die kleinste Liste ist, in der Sortierung überhaupt einen Unterschied macht.
- **`"none"` als Sentinel-String für „kein Konto"** im AccountFilter-Typ, statt `0` oder eines separaten Booleans. Begründung: `0` würde als Konto-ID interpretierbar (auch wenn IDs in SQLite immer ≥ 1 sind, wäre das fragil); ein Sentinel-String ist explizit und TypeScript prüft via union type. Im Select-DOM gerendert als `value="__none__"` mit Encode/Decode-Funktionen, um den DOM-String von den ID-Strings (`"1"`, `"2"`, …) zu unterscheiden.
- **Filter-State lokal in `App.tsx`, nicht persistiert**: pragmatisch erstmal genug. Wenn der User später beim App-Restart seine Filter wiederfinden will, wäre das ein localStorage-Hop. Memory `feedback_workflow` sagt explizit „Prozess hinzufügen, sobald sein Fehlen einmal weh getan hat" — Persistenz hat noch nicht weh getan.
- **`applyFilterAndSort` ist `O(n + n log n)` mit Caching**: das `dueCache` ist nur relevant wenn nach Fälligkeit sortiert wird — bei den anderen Sortier-Modi wird es nie befüllt. Mikro-Optimierung mit Sinn, weil `nextDueDate` einen anker-additiven Loop hat, der bei jährlich-Subs mehrere Iterationen kosten kann.
- **OverviewSection arbeitet weiter auf `activeSubs`, nicht auf `visibleSubs`**: Coverage und Baseline sind das **Gesamtbild** der Liquidität, nicht eine gefilterte Sicht. Wenn der User nach „nur EUR" filtert, soll das Konto-Forecast trotzdem alle EUR-Abos auf dem EUR-Konto zeigen — sonst wäre die Warnung „Konto unter 0" plötzlich falsch, weil sie nur den gefilterten Ausschnitt rechnet. UpcomingSection bekommt analog `activeSubs`.
- **Sortier-Strings als kompakte Keys (`"name-asc"`, `"due-desc"`)** statt zweier Felder `{ key, direction }`: bei nur 6 Kombinationen ist das simpler. Wenn später dritte Achsen dazukommen, lässt es sich umstellen.

### Gotchas

- **`uniqueCurrencies` und `accountId`-Set werden bei jedem Render neu berechnet** im FilterBar, weil das in einer Funktionskomponente ohne `useMemo` läuft. Bei realen Datenmengen (paar Dutzend Subs) ist das irrelevant — die Funktionen sind O(n). Wenn die App eines Tages tausende Subs hätte, wäre `useMemo` mit `[subs]`-Dependency ein leicht angedoschneeter Optimierungs-Pfad.
- **Filter-Bar verschwindet, wenn der User von 2 Abos auf 1 zurückgeht** (z.B. durch Löschen). Aktive Filter bleiben aber im State erhalten — wenn er später wieder ein neues Abo anlegt, das den Filtern nicht entspricht, kann die Liste komisch leer wirken. Pragmatisch: wenn das mal passiert, kann der User es selbst auf „Alle" zurückstellen. Defensiv-Reset wäre Overkill.
- **`useId()` für 4 Selects** in der FilterBar erzeugt 4 IDs, von denen aktuell nur zwei (Erinnerungen + Sortierung) tatsächlich gerendert werden, wenn die anderen Filter ausgeblendet sind. Kostet nichts, ist aber leicht „wasteful". React garantiert deterministische IDs pro Komponenten-Instanz, also kein Bug — nur eine kosmetische Beobachtung.
- **Lefthook hat Auto-Format-Fixes** (Test-render-Calls einzeilig + Import-Reihenfolge) gemeldet, beide via `pnpm biome check --write` aufgeräumt. Pattern wie bei den vorherigen Sessions: nach größeren Tests-Edits einmal lokal formatieren, bevor Commit.

### Status am Sitzungsende

- Branch `main`, Working tree: 4 modifizierte Dateien (`App.tsx`, `App.css`) + 4 neue (`subscription-list.ts`, `subscription-list.test.ts`, `SubscriptionFilterBar.tsx`) — Moment, das stimmt nicht. Lass mich nachzählen: `App.tsx`, `App.css` modifiziert; `subscription-list.ts`, `subscription-list.test.ts`, `SubscriptionFilterBar.tsx` neu; `BACKLOG.md`, `HANDOVER.md` modifiziert. Insgesamt 4 modifiziert + 3 neu. Noch nicht committet.
- Tests grün: 130 Vitest, 8 Cargo.
- Live-Smoke vom User bestätigt.

### Nächster Schritt

Das war das letzte Quick-Win-Item der Session. Verbleibende sinnvolle Richtungen:

- **Release-Reife** (`tauri-action` Matrix-Build, v0.1.0-Tag, Windows/macOS-Smoke, In-App-Updater) — eigene Session-Reihe, weil Signatur-Pipeline + CI-Setup einen Block bilden.
- **UI-Redesign Richtung arsnova** — Feature-Flächen sind jetzt stabil genug, dieser Block lohnt sich allmählich.

---

## 2026-06-07 — Claude: Test-Notification + Reminder-Status in Einstellungen

Zwei zusammengehörige Backlog-Items in einem Aufwasch: der User kann jetzt aus den Einstellungen heraus eine Test-Notification auslösen und sieht den Status des Reminder-Loops (letzte/nächste Prüfung, letzte gesendete Erinnerung). Macht den bisher „stillen" Background-Scheduler sichtbar und gibt einen schnellen Smoke-Test-Pfad für Notification-Permission + OS-Integration.

### Geändert

- `src-tauri/src/db.rs` — neuer `ReminderState`-Struct mit `last_check_at: Mutex<Option<DateTime<Utc>>>`. Default-Impl via `#[derive(Default)]`. Doc-Comment macht Persistenz-Entscheidung explizit: bewusst in-memory, geht beim App-Restart verloren, reicht für „läuft der Loop überhaupt?"-Diagnose. `chrono::{DateTime, Utc}` neu importiert.
- `src-tauri/src/lib.rs` — `REMINDER_INTERVAL` von `const` auf `pub const` umgestellt, damit Commands die Sekunden lesen können. `ReminderState::default()` über `app.manage()` registriert. Reminder-Loop aktualisiert nach jedem `run_reminder_check` (auch bei Error) den Zeitstempel via `app_handle.try_state::<ReminderState>()` → semantisch „Loop ist gelaufen", egal ob was gesendet wurde. Zwei neue Commands registriert.
- `src-tauri/src/commands.rs` — neue Structs `LastSentReminder { dueDate, subscriptionName, sentAt }` und `ReminderStatus { lastCheckAt, intervalSecs, lastSent }` als Serialize-Outputs. Neuer Command `get_reminder_status` liest den Mutex (`map_err` für Lock-Poisoning), ruft SQL-JOIN `SELECT r.due_date, s.name, r.sent_at FROM reminders r JOIN subscriptions s ON r.subscription_id = s.id ORDER BY r.sent_at DESC LIMIT 1`. Neuer Command `send_test_notification` ruft direkt `app.notification().builder().title("SubTracked Test").body(...).show()`. `serde::Serialize` und `tauri_plugin_notification::NotificationExt` neu importiert.
- `src/lib/db.ts` — `LastSentReminder`/`ReminderStatus`-Interfaces (camelCase, Rust mappt automatisch via `#[serde(rename_all)]`), `getReminderStatus()` und `sendTestNotification()`-Wrapper.
- `src/components/SettingsDialog.tsx` — zwei neue `.setting-row`-Blöcke unterhalb des Autostart-Toggles: „Erinnerungen testen" mit Button + status-`role`-Bestätigung; „Erinnerungs-Status" mit `<dl>` für Intervall/letzte Prüfung/nächste Prüfung/letzte Erinnerung + „Aktualisieren"-Knopf. Status wird beim Mount via `useEffect` + `loadReminderStatus()` (mit `useCallback`) geladen, kann manuell neu geladen werden. `nextCheck` clientseitig berechnet via `new Date(lastCheckAt).getTime() + intervalSecs * 1000`. Format-Helper: `formatDateTime`, `formatDate` (beide `date-fns` + `locale: de`), `formatInterval` rundet auf volle Stunden wenn möglich, sonst Minuten.
- `src/App.css` — `.setting-subheading`, `.setting-action-row`, `.setting-confirm` (grün), `.reminder-status` (`<dl>` als 2-Spalten-Grid), `.reminder-status dt/dd`. Dark-Mode-Anpassungen für die vier neuen Klassen.

### Tests

- `src/components/SettingsDialog.test.tsx` — Mock `../lib/db` ergänzt (`getReminderStatus`, `sendTestNotification`), Default-Status `{ lastCheckAt: null, intervalSecs: 3600, lastSent: null }` als `beforeEach`-Default. **5 neue Tests**: Klick auf Test-Notification ruft `sendTestNotification` + zeigt Bestätigung, Fehler beim Test wird als alert angezeigt + keine status-Bestätigung, „noch keine"-Anzeige wenn `lastCheckAt === null`, voll gefüllter Status rendert „alle 1 Stunde" + Sub-Name + Fälligkeits-Datum, „Aktualisieren"-Klick triggert zweiten `getReminderStatus`-Call. Stand: 13 Tests in `SettingsDialog.test.tsx` grün.

### Verifikation

- `pnpm exec tsc --noEmit` ✓.
- `pnpm test:run` ✓ — **113 Tests in 11 Files grün** (vorher 108, +5 in dieser Session).
- `pnpm lint` ✓ ohne Auto-Fix-Bedarf.
- `cd src-tauri && cargo fmt --check` ✓ / `cargo clippy --all-targets -- -D warnings` ✓ / `cargo test` ✓ (8/8).
- `pnpm tauri dev` gestartet; User hat „passt" bestätigt: Test-Notification triggert Toast und zeigt Bestätigung, Reminder-Status zeigt Intervall/letzte/nächste Prüfung, Aktualisieren-Knopf lädt neu.

### Wichtige Entscheidungen + Begründung

- **In-memory `ReminderState` statt SQLite-Persistenz**: „letzte Prüfung" ist Diagnose-Information für „läuft der Loop?", keine Geschäftsdaten. Persistierung wäre ein neues Table + Migration + DB-Writes pro Loop-Tick, für ein Feature, das beim App-Restart eh sofort wieder mit dem ersten Tick (~Sekunden später) gefüllt ist. Pragmatische Asymmetrie zur „letzten gesendeten Erinnerung", die persistent ist (steckt in der `reminders`-Tabelle).
- **`last_check_at` wird auch bei Loop-Error aktualisiert**: semantisch „Loop ist gelaufen", egal ob er was geschickt hat oder gescheitert ist. Falls der User in Settings „Letzte Prüfung: 14:30" sieht und es ist jetzt 17:00, weiß er: der Loop läuft nicht (sollte stündlich sein) und ein App-Restart oder Log-Check ist fällig.
- **`Mutex<Option<DateTime<Utc>>>` statt `RwLock` oder `tokio::sync::Mutex`**: stdlib `Mutex` reicht — der lock-Bereich ist mikroskopisch (1 Read oder 1 Write), kein Async-await innerhalb, keine Performance-Bedenken. `tokio::sync::Mutex` wäre Overkill für ein Diagnostik-Field. Lock-Poisoning wird im Command als String-Error zurückgegeben.
- **`app_handle.try_state` statt `state.try_state`** im Loop: der Loop kennt nur den `AppHandle`, nicht den `&App`. `try_state` gibt `Option<&State>` zurück; wenn die Registrierung gescheitert sein sollte (unrealistisch, weil wir's in `setup` machen), tut der Loop einfach nichts statt zu paniken. Defensiv, nicht defensiv-übertrieben.
- **`get_reminder_status` macht den Lookup `lastSent` via SQL-JOIN, nicht via zwei separate Queries**: Vorteil: ein einziger Roundtrip, atomare Sicht. JOIN ist trivial, weil `reminders.subscription_id` FK auf `subscriptions.id` ist.
- **Nächste Prüfung im Client berechnet** statt Server liefert: keine zusätzliche Rust-Logik, der Client kennt schon `lastCheckAt` und `intervalSecs`. JavaScript-Datumsmathe ist hier robust genug.
- **`formatInterval`-Helper rundet auf volle Stunden, sonst Minuten**: aktuelles Intervall ist 1h, Anzeige „alle 1 Stunde" liest sich natürlich. Bei späteren konfigurierbaren Intervallen (z.B. 30min) wäre die Sekundenanzahl ungeeignet — Helper deckt beide Fälle ab. Singular/Plural via Branch.
- **„Test-Erinnerung senden" hat eigene Bestätigung statt globaler Error/Success-Banner**: drei verschiedene Bedeutungen brauchen drei separate Statussignale. Status-`<span>` mit `role="status"` ist die A11y-konforme „dies ist eine non-disruptive Bestätigung", `role="alert"` bleibt für Fehler reserviert (wie sonst auch).
- **`useCallback` für `loadReminderStatus`**: weil `useEffect`-Dependencies auf die Funktion zeigen. Klassisches React-Hook-Pattern, sonst Re-Triggering-Loop.
- **Keine eigene `reminders.ts`-Lib-Datei** für die zwei neuen Wrapper: passt thematisch zu `db.ts` (zwei zusätzliche Tauri-Commands, klein). Eigene Datei wäre Über-Abstraktion bei 14 Zeilen Code.

### Gotchas

- **Reminder-Loop läuft alle 60 Minuten — initialer Check passiert sofort beim App-Start**: das heißt, beim ersten Öffnen der Settings nach App-Start ist `lastCheckAt` schon gefüllt (initial-Check ist innerhalb Sekunden durch). Falls jemand das Feature testen will, ohne 1h zu warten, würde er sehen: letzte Prüfung „vor 5 Sekunden", nächste Prüfung „in 59 Min 55 Sek". Die 1h-Konstante zu ändern hätte echten Performance-Impact (häufigere DB-Reads), deshalb nicht jetzt verstellbar — wenn der User das ändern will, ist das ein eigenes Backlog-Item.
- **`role="status"` vs. `role="alert"`**: `status` ist polite (Screen-Reader wartet auf Pause), `alert` ist assertive (sofortige Ankündigung). Test-Notification-Bestätigung ist `status` (kein dringender Fehler), Fehler ist `alert`. Wenn man die Bestätigung manchmal nicht sieht weil sie zu schnell wegfliegt: keine Auto-Hide eingebaut, der Text bleibt bis zum nächsten Klick oder Dialog-Close.
- **`Aktualisieren` lädt nur den Status neu, nicht den Loop**: der Loop läuft autonom alle 60 Min im Rust-Hintergrund. „Aktualisieren" zeigt nur den letzten bekannten State frischer an, triggert keinen extra Check. Falls jemand „Check JETZT laufen lassen" will, wäre das ein zusätzlicher Command (z.B. `run_reminder_check_now`) — bewusst nicht jetzt eingebaut.
- **`SettingsDialog`-Test mockt jetzt `../lib/db`** zusätzlich zu `@tauri-apps/plugin-autostart`. Wenn beim Hinzufügen weiterer DB-Calls vergessen wird, im Mock-Objekt zu ergänzen, wirft die Komponente einen `is not a function`-Error im Test. Pattern: Mock-Liste muss alle in Komponente importierten Symbole auflisten.

### Status am Sitzungsende

- Branch `main`, Working tree: 5 modifizierte Dateien (`db.rs`, `lib.rs`, `commands.rs`, `db.ts`, `App.css`) + 2 Dialog-Dateien (`SettingsDialog.tsx`, `SettingsDialog.test.tsx`) + `BACKLOG.md` + `HANDOVER.md`. Noch nicht committet.
- Tests grün: 113 Vitest, 8 Cargo.
- Live-Smoke vom User bestätigt.

### Nächster Schritt

Die zwei Backlog-Items „Test-Notification in den Einstellungen" und „Reminder-Status sichtbarer machen" sind durch. Mögliche Richtungen aus dem Backlog:

- **Filter + Sortierung für Abo-Liste** — klein, ROI ab vielen Abos.
- **Release-Reife** (Matrix-Build mit `tauri-action`, v0.1.0-Tag, Windows/macOS-Smoke, In-App-Updater) — größerer Block, eigene Session.
- **UI-Redesign Richtung arsnova** — feature-Flächen sind jetzt stabil genug, lohnt langsam.

---

## 2026-06-07 — Claude: Nächste-Fälligkeiten-Ansicht als primärer Arbeitsmodus

Quick-Win 2 nach Validierung + Archiv: SubTracked hat jetzt eine kompakte „Demnächst (30 Tage)"-Liste direkt über der Abo-Liste. Der tägliche Nutzen — „was geht in den nächsten Wochen ab?" — ist damit der erste Blick auf der Hauptseite, vor der Detail-Abo-Liste und vor dem Konto-Forecast.

### Geändert

- `src/lib/coverage.ts` — neue reine Funktion `computeUpcoming(subs, accounts, days = 30, now = new Date())`. Iteriert über alle Subs, sammelt `dueDatesWithin(anchor, interval, from, until)` und produziert eine flach chronologisch sortierte Liste mit `{ subscriptionId, subscription, date, cents, currency, accountName, notify }`. Account-Lookup über `Map(accounts.map((a) => [a.id, a.name]))`. Doc-Comment macht explizit, dass nur aktive Subs übergeben werden sollen — sonst landen archivierte Abos als Phantom-Buchungen im „primären Arbeitsmodus". `addDays` aus `date-fns` neu importiert.
- `src/components/UpcomingSection.tsx` (neu) — eigene Komponente, ruft `computeUpcoming` und rendert entweder Empty-State („Keine Fälligkeiten in den nächsten N Tagen.") oder eine `<ul>` mit Grid-Rows. Tooltip auf `· stumm` erklärt den Status für Screen-Reader und Mouse-Hover.
- `src/App.tsx` — `UpcomingSection` direkt nach dem Empty-State der Abo-Liste eingehängt, **vor** dem Archiv-Toggle und der Abo-Liste. Bedingung: `!loading && activeSubs.length > 0` — keine leere Section bei frischer Installation oder wenn alle Abos archiviert sind. Bekommt `activeSubs` (siehe vorheriger Quick-Win) und `accounts`.
- `src/App.css` — neue Klassen für `.upcoming` (Container mit dezentem Hintergrund + Border), `.upcoming-list`, `.upcoming-row` (4-Spalten-Grid: `3.5rem 1fr auto auto`), `.upcoming-date`, `.upcoming-name`, `.upcoming-muted`, `.upcoming-account`, `.upcoming-amount`. Trennlinien via `.upcoming-row + .upcoming-row { border-top }`.

### Tests

- `src/lib/coverage.test.ts` — neue `describe("computeUpcoming")` mit 5 Tests: chronologische Sortierung, leeres Fenster, `accountName = null` ohne Konto, currency-Übernahme pro Item ohne heimliches Mappen, `notify` wird durchgereicht.
- `src/components/UpcomingSection.test.tsx` (neu, 5 Tests) — Empty-State, Datum/Name/Konto/Betrag pro Zeile, `· stumm`-Markierung, `(kein Konto)`-Fallback, `days`-Parameter wird respektiert.

### Verifikation

- `pnpm exec tsc --noEmit` ✓.
- `pnpm test:run` ✓ — **108 Tests in 11 Files grün** (vorher 98, +10 in dieser Session).
- `pnpm lint` ✓ (Auto-Format-Fixes in beiden neuen Tests: `render(<X />)` einzeilig statt mehrzeilig — Biome-Default für kurze JSX-Calls).
- `cargo fmt --check` ✓ / `cargo clippy --all-targets -- -D warnings` ✓.
- `pnpm tauri dev` gestartet; User hat „passt" bestätigt: Section taucht über der Abo-Liste auf, chronologisch sortiert, stumme Abos markiert, ohne Konto wird als `(kein Konto)` ausgewiesen, archivierte Abos erscheinen nicht.

### Wichtige Entscheidungen + Begründung

- **`computeUpcoming` lebt in `coverage.ts`** statt einer neuen `upcoming.ts`. Begründung: thematisch verwandt (beides nutzt `dueDatesWithin`), und coverage.ts ist mit ~210 Zeilen noch weit unter einer Schwelle, ab der ich splitten würde. Eigene Datei wäre Über-Abstraktion.
- **Aufrufer entscheidet, welche Subs übergeben werden** (Pure-Function-Prinzip), die Funktion filtert nicht selbst nach `active`. Begründung: damit ist sie auch für eine künftige „Archiv-Demnächst-Ansicht" oder „alle Subs egal Status" wiederverwendbar. Doc-Comment macht die Erwartung explizit. App.tsx übergibt `activeSubs` — Konsistenz zur OverviewSection.
- **Position: über der Abo-Liste**, nicht als Tab-Umschaltung. Backlog sagt „primärer Arbeitsmodus", und Tab-Umschaltung würde einen Klick zwischen Demnächst und Abo-Liste verlangen. Always-on direkt oben ist der direkte Pfad. Abo-Liste darunter bleibt für „Bestand verwalten", Konto-Forecast ganz unten für „Liquidität langfristig".
- **Bedingte Anzeige `activeSubs.length > 0`**: keine leere Section in der frischen Installation. Erst wenn der User Abos hat, taucht die Sektion auf. Empty-State-Text in der Section selbst greift nur, wenn Subs existieren, aber keine Fälligkeit im 30-Tage-Fenster — selten, aber möglich (z.B. nur jährliche Abos mit Anker außerhalb).
- **Keine Klick-Aktion auf der Zeile**: bewusst Scope eng halten. Die Sub-Liste darunter hat alle Aktionen (Bearbeiten, Archivieren, Löschen). Wenn beim Live-Smoke der User „ich will direkt von hier editieren" gesagt hätte, wäre ein Klick→Edit-Dialog die nächste Erweiterung. Er hat nicht — also bleibt's so. Falls später nötig: `onClick` an `.upcoming-row` ist trivial.
- **Pro-Zeile `currency` aus dem **Sub**, nicht aus dem Konto**: in der Demnächst-Liste geht's um die Buchung selbst, nicht um Konto-Deckung. KRW-Sub auf EUR-Konto wird in der Demnächst-Sektion ehrlich als KRW angezeigt. Coverage filtert solche Subs raus (Konto-Sicht), Demnächst zeigt sie (Buchungs-Sicht) — zwei verschiedene Linsen aufs gleiche Datenmodell.
- **Datumsformat `dd.MM.` ohne Jahr** in der Demnächst-Liste: Fenster ist 30 Tage, da reicht Tag.Monat. Spart Spalten-Breite, lässt das Auge schneller scannen. Coverage zeigt `dd.MM.yyyy`, weil dort 6 Monate möglich sind und Jahres-Übergänge auftreten können.

### Gotchas

- **Fenster-Grenzen bei `dueDatesWithin`**: das Fenster ist `[from, until]` exklusive End-Tag (siehe `recurrence.ts`-Verhalten). 30 Tage ab 15.06. → bis 15.07. — der 15.07. selbst ist drin oder draußen? Schauen wenn jemand den Edge-Case findet; aktuell ist die Test-Coverage nur mit Mitten-Daten. Nicht jetzt fixen, höchstens wenn ein User „die nächste Fälligkeit am 30-Tage-Endtag erscheint nicht" meldet.
- **`computeUpcoming` setzt `notify` aus der Subscription**, nicht aus dem `accounts.notify` (gibt's nicht). Der Markierungs-Sinn ist „dieses Abo schickt keine Notification" → `sub.notify === false`. Test-Coverage prüft das.
- **Position der Section** verschiebt visuell auch die Headline-Hierarchie nach unten — Abo-Liste hat kein `<h2>` mehr direkt unter dem Header, sondern jetzt zuerst die Demnächst-Section. Wenn beim UI-Redesign jemand Layout-Strukturen ändert: die Demnächst-Section ist das neue erste inhaltliche Element nach Header + Banner.

### Status am Sitzungsende

- Branch `main`, Working tree: 4 modifizierte + 2 neue Dateien (`coverage.ts`, `coverage.test.ts`, `App.tsx`, `App.css` + neu `UpcomingSection.tsx`, `UpcomingSection.test.tsx`) + `BACKLOG.md` + `HANDOVER.md`. Noch nicht committet.
- Tests grün: 108 Vitest, 8 Cargo.
- Live-Smoke vom User bestätigt.

### Nächster Schritt

Die drei Quick-Wins der heutigen Session sind durch. Mögliche Richtungen (User-Wahl):
- **Filter + Sortierung für Abo-Liste** (Backlog Z. ~42) — kleine Erweiterung, ROI steigt ab vielen Abos.
- **Test-Notification + Reminder-Status in Settings** (Backlog Z. ~51-52) — kleines UX-Plus für Background-Reminder-Vertrauen.
- **Release-Reife** (Matrix-Build mit `tauri-action`, v0.1.0-Tag, Windows/macOS-Smoke) — größerer Block, eigene Session.
- **UI-Redesign Richtung arsnova** — jetzt wo die Feature-Flächen ungefähr final sind, lohnt der Block langsam.

---

## 2026-06-07 — Claude: Abo archivieren / reaktivieren

Quick-Win 1b nach der Formular-Validierung: das `active`-Feld im Subscription-Schema (existierte seit `0001_init.sql`) wird endlich als Nutzerkonzept angeboten. Statt nur Löschen kann der User Abos archivieren (z.B. gekündigte Mobilfunk-Verträge, pausierte Streaming-Dienste) und später reaktivieren. Coverage-Forecast bleibt sauber, weil archivierte Abos nicht eingerechnet werden.

### Geändert

- `src-tauri/src/commands.rs` — neuer `set_subscription_active(id, active)`-Command. Schlank gehalten (kein Full-Update wie bei `update_subscription`), weil der Toggle aus der Liste keine anderen Felder berührt.
- `src-tauri/src/lib.rs` — Command registriert.
- `src/lib/db.ts` — neuer `setSubscriptionActive(id, active)`-Wrapper.
- `src/hooks/useSubscriptions.ts` — lädt jetzt **alle** Subs via `listSubscriptions(false)` statt nur aktiver. Kommentar erklärt: App.tsx splittet selbst, OverviewSection bekommt nur aktive (damit Coverage keine Phantom-Abflüsse prognostiziert).
- `src/App.tsx` — neuer State `showArchived: boolean`, `useMemo`-abgeleitetes `activeSubs`, `archivedCount`, `visibleSubs`. Neuer Handler `handleToggleActive` ruft `setSubscriptionActive(!sub.active)` und `reloadAll`. Archiv-Toggle-Checkbox wird **nur eingeblendet, wenn `archivedCount > 0`** (sonst visueller Lärm ohne Nutzen). Pro Sub neuer Knopf "Archivieren"/"Reaktivieren" zwischen Bearbeiten und Löschen. OverviewSection bekommt `activeSubs` statt `subs`. Archivierte Items zeigen "archiviert" statt nächste Fälligkeit, Stumm-Hinweis wird unterdrückt (irrelevant bei archiviert).
- `src/App.css` — `.sub-archived` (opacity 0.6 + grauer Hintergrund) für ausgegrauten Look; `.archive-toggle` für das Checkbox-Label.

### Tests

- Keine neuen Tests in dieser Session. `useSubscriptions.test.tsx` blieb grün, weil der Mock den `onlyActive`-Parameter ignoriert. Es gibt keinen `App.test.tsx` (App ist hauptsächlich Komposition), neuer Code in App.tsx ist trivial: Filter via `useMemo`, Toggle-Checkbox, ein neuer Handler. Sinnvoller wäre ein App-Integrationstest, aber das wäre eine eigene Test-Strategie-Entscheidung. Pragmatisch erstmal verzichtet — funktionale Verifikation lief über `pnpm tauri dev`-Smoke vom User.

### Verifikation

- `pnpm test:run` ✓ — 98 Tests grün (unverändert).
- `pnpm lint` ✓ (zwei Auto-Fixes nötig: ternary-parens in App.tsx + descending-specificity in `.sub-archived .sub-name` — letzteres durch Entfernen der überflüssigen Italic-Regel gelöst, der ausgegraute Look reicht).
- `pnpm exec tsc --noEmit` ✓.
- `cd src-tauri && cargo fmt --check` ✓ / `cargo clippy --all-targets -- -D warnings` ✓ / `cargo test` ✓ (8/8).
- `pnpm tauri dev` gestartet; User hat archivieren/reaktivieren/Toggle/Coverage-Wirkung durchgeklickt und „passt alles" bestätigt.

### Wichtige Entscheidungen + Begründung

- **Archivieren ersetzt Löschen nicht, sondern ist zusätzlich.** Backlog-Wording war „statt nur löschen", aber pragmatisch braucht der User beides: Archivieren als schonende Default-Aktion, Löschen für echten Müll (Tippfehler beim Anlegen). Drei Buttons pro Item (Bearbeiten/Archivieren/Löschen) sind noch übersichtlich, eine spätere Row-Action-Konsolidierung im UI-Redesign kann das straffen.
- **`useSubscriptions` lädt alle, App.tsx splittet.** Alternative wäre ein zweiter Hook-Aufruf für archivierte Subs oder ein `onlyActive`-Param am Hook. Beide würden mehr Code und mehr DB-Roundtrips kosten. Bei realen Datenmengen (paar Dutzend Subs) ist ein einziger Load alle Subs billig genug.
- **OverviewSection bekommt nur `activeSubs`**, nicht alle Subs mit Filter im Forecast. Begründung: Forecast soll die Realität abbilden, nicht „was wäre wenn alle Abos reaktiviert würden". Archivierte Abos werden auch nicht in der Baseline gezählt. Konsequent zur Bedeutung von „archiviert" = „kostet aktuell kein Geld".
- **Reminder-Loop in Rust filtert bereits per `WHERE active = 1`** — kein zusätzlicher Code nötig, das Verhalten ist out of the box korrekt: archivierte Abos generieren keine Notifications mehr. Der `notify`-Toggle wird in archiviertem Zustand in der UI nicht mehr angezeigt, weil er irrelevant ist.
- **Toggle-Checkbox nur sichtbar, wenn `archivedCount > 0`**: kein UI-Element ohne Funktion. Solange der User nie etwas archiviert hat, bleibt die Oberfläche unverändert. Sobald das erste Abo archiviert ist, taucht der Toggle direkt darüber auf.
- **Schlanker `set_subscription_active`-Command** statt Wiederverwendung von `update_subscription`: vermeidet Race-Condition-Anfälligkeit (Edit-Dialog könnte noch offen sein, ein paralleler Toggle würde ungewollte Werte überschreiben) und ist ein einziger UPDATE statt zehn Felder bind+rebind.
- **`.sub-archived .sub-name { font-style: italic }` entfernt**: Biome warnte über Descending Specificity (`.sub-name` allein hat (0,1,0), die geschachtelte (0,2,0)). Pragmatisch gelöst: der `opacity: 0.6`-Look ist schon klar genug, Italic als zusätzliche Markierung war Doppelung. Zwei Lint-Verstöße durch Streichen einer überflüssigen Regel weg — guter Trade.

### Gotchas

- **`pnpm biome format --write src/App.tsx` ignorierte die Datei** mit „These paths were provided but ignored" trotz erkanntem Format-Fehler. Workaround: das ternary mit Parens (`{x ? (<>a</>) : (<>b</>)}`) auf single-line ohne Parens (`{x ? <>a</> : <>b</>}`) per Edit manuell zurechtgerückt. Vermutung: VCS-Integration (`useIgnoreFile`) hat irgendeinen Cache-Effekt; tiefer nicht untersucht.
- **`useSubscriptions.ts` Default-Param-Asymmetrie**: `listSubscriptions(onlyActive = true)` hat als TS-Wrapper weiter den Default `true`, der Hook übergibt nun explizit `false`. Tests die direkt `listSubscriptions()` rufen kriegen weiterhin nur aktive — Verhalten ist konsistent, aber leicht zu übersehen wenn man sich auf den Hook-Behavior verlässt.
- **Archivierte Subs verschwinden aus `OverviewSection`** sofort beim Archivieren, weil App.tsx `activeSubs` reaktiv neu berechnet. Wenn das jemals als Bug wirkt („das archivierte Abo war doch eben noch in der Übersicht!") ist's Absicht, nicht Bug — siehe Entscheidung oben.

### Status am Sitzungsende

- Branch `main`, Working tree: 6 modifizierte Dateien (`commands.rs`, `lib.rs`, `db.ts`, `useSubscriptions.ts`, `App.tsx`, `App.css`) + `BACKLOG.md` + `HANDOVER.md`. Noch nicht committet.
- Tests grün: 98 Vitest, 8 Cargo.
- Live-Smoke vom User bestätigt.

### Nächster Schritt

In derselben Session: **Nächste-Fälligkeiten-Ansicht als primärer Arbeitsmodus** (Backlog Z. ~41) — kompakte "Demnächst 30 Tage"-Liste über alle aktiven Subs hinweg, sortiert nach Datum.

---

## 2026-06-07 — Claude: Feldnahe Formular-Validierung in Abo- und Konten-Dialog

Quick-Win direkt nach dem Kontostände-Feature: der Codex-Review-Befund „bei ungültigem Input macht `SubscriptionDialog` still `return`" ist behoben. Beide Dialoge (Abo + Konto) haben jetzt feldnahe Fehlermeldungen, `aria-invalid`, `aria-describedby` und Fokus-Sprung auf das erste fehlerhafte Feld. Tippen räumt den Fehler weg. Konsistente Behandlung in beiden Dialogen, geteilte CSS.

### Geändert

- `src/components/SubscriptionDialog.tsx` — neuer `FieldErrors`-Typ (name/amount/leadDays), `validate()`-Helper sammelt alle Fehler und liefert daneben das geparste `amountNumber`, damit Submit-Pfad nicht doppelt parst. `useRef` für die drei textuellen Inputs (DateField ist eigener Komponententyp, anchorDate ist über `todayISO()` immer gefüllt, daher kein Ref nötig). `clearFieldError(field)` läuft im `onChange` und entfernt den jeweiligen Eintrag aus dem State. `aria-invalid` + `aria-describedby` werden nur gesetzt, wenn ein Fehler existiert. Fokus-Logik: erstes Fehler-Feld in DOM-Reihenfolge (name → amount → leadDays).
- `src/components/AccountsDialog.tsx` — analoge Umstellung. Bisher gab's nur einen globalen Error-Banner; jetzt feldnah für name/balance/buffer. `parseToCents` aus dem Component-Body in eine Modul-Funktion ausgezogen, damit sie auch von `validate()` außerhalb des Submit-Pfads nutzbar ist. Validierung nutzt `useRef` analog zum Abo-Dialog. Hint unter Mindestpuffer-Feld wird nur gezeigt, wenn kein Fehler aktiv ist (visuell sauber).
- `src/App.css` — neue `.field-error`-Klasse (Schriftgröße 0.8rem, Rot, `display: block`); globaler `[aria-invalid="true"]`-Selector setzt roten Border + Outline für jedes als invalid markierte Input. Dark-Mode-Anpassung (`#fca5a5` statt `#c00`).

### Tests

- `src/components/SubscriptionDialog.test.tsx` — 4 neue Tests, 3 alte „blockiert Submit"-Tests aufgewertet: prüfen jetzt auch die feldnahe Meldung + `aria-invalid` + Fokus. Neuer Test "räumt den Validierungs-Fehler weg, sobald der User wieder tippt". Neuer Test für Vorlauf-Range (999 → Fehler). Stand: 12 Tests im File grün.
- `AccountsDialog.test.tsx` — bestehender Test „zeigt eine Validierungs-Meldung bei ungültigem Saldo" greift weiterhin (sucht `role="alert"` mit `/Saldo ungültig/`, mein `<span role="alert">` triggert das). Keine Test-Änderung nötig.

### Verifikation

- `pnpm test:run` ✓ — **98 Tests grün** (vorher 95, +3 in dieser Session).
- `pnpm lint` ✓ ohne Auto-Fix-Bedarf.
- `cargo fmt --check` ✓ / `cargo clippy --all-targets -- -D warnings` ✓.
- `pnpm tauri dev` gestartet; User hat manuell durchgeklickt und „passt alles" bestätigt: leerer Submit → feldnahe Meldungen + roter Rand + Fokus aufs erste Feld; Tippen räumt auf; ungültige Werte (`abc`, `999`, `-100`) → spezifische Meldung am richtigen Feld.

### Wichtige Entscheidungen + Begründung

- **`role="alert"` auf der feldnahen Fehler-Span**, nicht auf einem globalen Container. Begründung: Screen-Reader liest den konkreten Fehler vor, sobald er erscheint, ohne den User aus dem Kontext zu reißen. Der globale Banner für DB-Fehler bleibt zusätzlich erhalten — das ist eine andere Klasse von Fehler (transient, system-seitig) und gehört nicht ans Eingabefeld.
- **Fokus-Logik in DOM-Reihenfolge** (name → amount → leadDays), nicht in Validierungs-Reihenfolge. Begründung: passt zur visuellen Erwartung des Users — er liest top-down, das erste rote Feld bekommt den Fokus. Bei nur einem Fehler ist es identisch; bei mehreren ist DOM-Reihenfolge intuitiver.
- **`clearFieldError` im `onChange` statt im `onBlur`**: sofortiges Feedback. Sobald der User korrigiert, verschwindet die Meldung. `onBlur` hätte den Fehler bis zum nächsten Tab-Wechsel hängen lassen — unnötig hart.
- **Submit-Button bleibt im AccountsDialog bei leerem Namen disabled**, im SubscriptionDialog dagegen nicht. Begründung: AccountsDialog hatte das schon vor diesem Quick-Win als belt-and-suspenders; ich lasse es so. SubscriptionDialog disabled den Submit nur bei `submitting`-State, weil dort mehr Felder zu validieren sind und der User explizites Submit-Feedback bekommt — sonst wirkt's, als ob „Anlegen" einfach nichts tut.
- **`parseToCents` aus dem AccountsDialog-Component-Body in eine Modul-Funktion ausgezogen**: hängt nicht vom Component-State ab und ist durch `validate()` auch außerhalb des Submit-Handlers nötig. Kleiner Cleanup, keine Über-Abstraktion.
- **CSS-Selector `[aria-invalid="true"]` als globaler Stil**: greift automatisch für alle Felder ohne Klassen-Duplikation. Single source of truth für „roter Border bei invalid". Falls künftig irgendwo `aria-invalid` gesetzt wird, sieht's konsistent aus.

### Gotchas

- **jsdom + RTL `toHaveFocus()`**: funktioniert nur, wenn `autoFocus` nicht gleichzeitig auf demselben Feld liegt — sonst hat es Focus auch ohne Validierungs-Logik. Im Abo-Dialog hat das Name-Feld `autoFocus`, das ist Initial-State. Der Test prüft den Fokus *nach* einem Submit auf leerem Name-Feld; weil keine Tab-Bewegung stattfand, ist `autoFocus` weiterhin aktiv und der Test grün. Falls jemand `autoFocus` später entfernt: Test bleibt valide, weil meine `nameRef.current?.focus()`-Logik den Fokus dann aktiv setzt.
- **`role="alert"` mehrfach im Dialog**: bei mehreren validation errors gleichzeitig sind mehrere alerts da. Standard-RTL `getByRole("alert")` würde das als Mehrfach-Match werfen. Tests nutzen daher `getByText(/.../)` für die spezifische Meldung statt `getByRole("alert")`. Bestehender Test „Fehler-Meldung wenn DB-Operation fehlschlägt" nutzt valide Inputs → genau ein alert → bleibt grün.

### Status am Sitzungsende

- Branch `main`, Working tree: 4 modifizierte Dateien (`App.css`, `SubscriptionDialog.tsx`, `AccountsDialog.tsx`, `SubscriptionDialog.test.tsx`) + `BACKLOG.md` + `HANDOVER.md`. Noch nicht committet.
- Tests grün: 98 Vitest, 8 Cargo.
- Live-Smoke vom User bestätigt.

### Nächster Schritt

Direkt anschließend in derselben Session: **Abo archivieren/pausieren** (Backlog-Item, `active`-Spalte existiert bereits im Schema). Danach: **Nächste-Fälligkeiten-Ansicht** als primärer Arbeitsmodus.

---

## 2026-06-07 — Claude: Kontostände + Deckungswarnung + Mehrwährungs-Schnitt

Claude hat den **größten Produkthebel aus dem Codex-Review** umgesetzt: SubTracked rechnet jetzt echte Kontodeckung, nicht nur Abflüsse. Konten haben Währung, aktuellen Saldo und optionalen Mindestpuffer; die Übersicht zeigt pro Buchung den Saldo danach und warnt früh, wenn das Konto unter Puffer/Null fällt. Multi-Currency wird sauber pro Konto geschnitten — der pauschale EUR-Hardcode (Codex-Befund) ist weg.

**Wichtige Konvention ab heute:** Jeder HANDOVER-Eintrag markiert in Überschrift und Body, welcher Agent ihn geschrieben hat (`Claude:` / `Codex:`). Memory `feedback-handover` entsprechend ergänzt.

### Geändert

- `src-tauri/migrations/0003_account_balance.sql` (neu) — `accounts` bekommt `currency TEXT NOT NULL DEFAULT 'EUR'`, `balance_cents INTEGER NOT NULL DEFAULT 0`, `min_buffer_cents INTEGER NOT NULL DEFAULT 0`. Bestehende Konten migrieren transparent mit den Defaults.
- `src-tauri/src/db.rs` — `Account`-Struct um die drei Felder erweitert (`serde(rename_all = "camelCase")` macht das Frontend-Mapping automatisch).
- `src-tauri/src/commands.rs` — `list_accounts` liest die neuen Spalten; `add_account` akzeptiert sie optional (Defaults `"EUR"` / 0 / 0); neuer `update_account(account: Account)`-Command für Saldo/Puffer-Updates aus dem UI. In `lib.rs` registriert.
- `src/types.ts` — `Account` um `currency`, `balanceCents`, `minBufferCents` erweitert.
- `src/lib/db.ts` — `addAccount` auf Objekt-Argument umgestellt (sauberer bei 5 Feldern), neue `updateAccount(account)`-Funktion.
- `src/lib/format.ts` — `CURRENCY_OPTIONS` + `CurrencyOption`-Typ aus `SubscriptionDialog` ausgezogen, damit AccountsDialog dieselbe Liste nutzt (single source of truth).
- `src/lib/coverage.ts` (kernumbau) — `AccountCoverage` jetzt mit `accountId`, `currency`, `startingBalanceCents`, `minBufferCents`, `finalBalanceCents`, `firstBelowBufferDate`, `firstBelowZeroDate`, `foreignCurrencySubsCount`. `CoverageItem` bekommt `balanceAfterCents` + `belowBuffer`/`belowZero`. Algorithmus: erst Items pro Konto sammeln, nach Datum sortieren, dann in einem zweiten Pass den Saldo fortschreiben — saubere Trennung Sammeln/Berechnen. Konten ohne Buchungen werden trotzdem als Bucket gerendert (Saldo soll sichtbar bleiben). Fremdwährungs-Subs werden ignoriert und nur als Zähler ausgewiesen. `computeMonthlyBaseline` splittet jetzt pro `(Konto, Währung)`.
- `src/components/AccountsDialog.tsx` (Neubau) — Edit-Mode pro Konto („Bearbeiten"-Knopf füllt Form mit Currency/Saldo/Puffer, Submit ruft `updateAccount`); Add-Mode wie bisher, aber mit den drei neuen Feldern. Saldo + Puffer nutzen `type=text + inputMode=decimal + parseAmountInput` (analog zum Abo-Betrag, akzeptiert Komma und Tausender). Validierung mit `role="alert"` für ungültige Eingaben.
- `src/components/OverviewSection.tsx` (überarbeitet) — Coverage-Header zeigt jetzt "Saldo heute: X → Y" pro Konto, plus orange/rote `coverage-warning` bei Puffer/Null-Unterschreitung. Pro Buchung steht "→ Saldo danach", farblich markiert (`coverage-row-warn`/`coverage-row-danger`). `formatAmount` bekommt jetzt die echte Konto-Währung statt hartem `"EUR"`. Fremdwährungs-Hinweis als `coverage-hint`. Baseline rendert Currency in Klammern, wenn dasselbe Konto mehrere Währungen hat.
- `src/App.css` — neue Klassen für `.account-balance`, `.account-actions`, `.field-hint`, `.coverage-balance`, `.coverage-row-balance`, `.coverage-warn`/`-danger`, `.coverage-warning-warn`/`-danger`, `.coverage-row-warn`/`-danger`, `.coverage-hint`. Dark-Mode-Anpassungen für Warn/Danger-Texte. Coverage-Row-Grid auf 4 Spalten (Name/Datum/Betrag/Saldo).
- `src/components/SubscriptionDialog.tsx` — nur Import-Anpassung (`CURRENCY_OPTIONS` aus `format.ts` statt lokal), keine Verhaltensänderung.

### Tests

- `src/lib/coverage.test.ts` (überarbeitet, 14 Tests grün) — neue Tests für Saldo-Forecast (`balanceAfterCents`), Puffer-/Null-Warnungen, Fremdwährungs-Ignoranz, Currency aus Konto, Konten-ohne-Buchungen-Bucket, Aktiv-vor-Leer-Sortierung. Alte Tests an neue Feldnamen (`totalOutflowCents`) angepasst.
- `src/components/AccountsDialog.test.tsx` (überarbeitet, 11 Tests grün) — neue Tests für Saldo/Puffer-Anzeige, `addAccount` mit Objekt-Argument inkl. Currency/Saldo-Parsing, leeres Saldo-Feld → 0, Validierungs-Meldung bei ungültigem Saldo, Edit-Mode-Start mit Vorbefüllung, `updateAccount`-Flow.
- `src/components/OverviewSection.test.tsx` (überarbeitet, 6 Tests grün) — neue Tests für Saldo-Forecast in Coverage-Section, Saldo-pro-Buchung-Anzeige, Puffer/Null-Warnung-Rendering, Fremdwährungs-Hinweis. Tests scopen jetzt explizit auf die Coverage-Section, weil der Konto-Name jetzt auch in Baseline auftaucht (vorher nur in Coverage). Veralteter „Gesamt-Zeile"-Test entfernt (Gesamt-Summen über Währungen hinweg werden nicht mehr gezeigt).
- `src/components/SubscriptionDialog.test.tsx` + `src/hooks/useSubscriptions.test.tsx` — Account-Mocks um die neuen Pflichtfelder erweitert.

### Verifikation

- `pnpm exec tsc --noEmit` ✓
- `pnpm lint` ✓ (zwei Auto-Format-Fixes für `coverage.ts` Map-Generic und `SubscriptionDialog`-Import nach `pnpm biome check --write` — Lefthook-Pattern wie üblich)
- `pnpm test:run` ✓ — **95 Tests in 10 Files grün** (vorher 87)
- `cd src-tauri && cargo check` ✓
- `cd src-tauri && cargo fmt --check` ✓
- `cd src-tauri && cargo clippy --all-targets -- -D warnings` ✓
- `cd src-tauri && cargo test` ✓ — 8 Tests grün (keine Rust-Tests dazugekommen; Saldo-Logik lebt im Frontend in `coverage.ts`)
- `pnpm tauri dev` gestartet; **User hat manuell durchgeklickt und „passt alles" bestätigt** (Konto-Edit, Saldo-Eingabe mit Komma, Forecast-Anzeige, Warnungen, Mehrwährungs-Ignorier-Hinweis).

### Wichtige Entscheidungen + Begründung

- **Saldo-Modell „aktueller Stand, gilt ab heute"** statt Stichtag-mit-Historie. Begründung: einfach, keine zweite Tabelle, deckt den Kern „Sieht mein Konto in den nächsten Monaten gut aus?" zu 100 %. Verlauf wäre eigenes Feature (separate `account_balance_history`-Tabelle), kommt wenn echter Bedarf entsteht.
- **Konto hat genau eine Währung**, fremde Subs werden ignoriert und nur gezählt. Begründung: ehrlicher als heimliches Umrechnen mit veralteten Kursen. Codex hatte den EUR-Hardcode im Review explizit als „stille Lüge" markiert; die neue Variante macht das transparent. Wechselkurs-Umrechnung ist eigenes Feature im Backlog.
- **Forecast pro Buchung statt pro Monat**: direkter Mehrwert. Der User sieht „nach Netflix am 15.07. noch 482,01 EUR" konkret, nicht nur „Monatsende Juli ~480 EUR". Cost: vier Spalten statt drei im Grid; bei langen Forecast-Zeiträumen entsteht eine längere Liste, ist aber durch `<details>` collapsible.
- **`computeCoverage`-Zwei-Pass-Architektur** (erst Items sammeln, dann Saldo fortschreiben) statt Saldo inkrementell beim Sammeln. Begründung: Items müssen vor Saldo-Berechnung nach Datum sortiert sein, sonst stimmt der Forecast nicht. Im selben Pass wäre der Code kompakter, aber falsch (Items kommen pro Subscription gruppiert herein, nicht chronologisch).
- **`AccountCoverage`-Bucket auch ohne Buchungen** rendern: ein Konto mit Saldo aber ohne Subs ist trotzdem interessant (siehe Sparkonto). Sortierreihenfolge: Aktive Konten zuerst, dann nach Outflow-Summe — sodass der User die „brennenden" Konten oben sieht.
- **Mindestpuffer Default 0**, nicht 100 EUR oder ähnliches. Begründung: User kennt sein eigenes Puffer-Bedürfnis besser; ein Default-Wert würde nur unnötige False-Positive-Warnungen erzeugen, bis er das Feld bewusst setzt.
- **`addAccount` von Positional auf Objekt-Argument** umgestellt: bei 5 Feldern (Name/Note/Currency/Saldo/Puffer) wäre Positional fehleranfällig. Breaking Change im Aufruf, aber nur intern (eine Stelle in `AccountsDialog`).
- **`CURRENCY_OPTIONS` in `format.ts` ausgezogen**: Liste lebt jetzt an genau einer Stelle und wird von SubscriptionDialog + AccountsDialog importiert. Memory `feedback_code_quality` sagt explizit „durchgehend hohe Qualität, aber keine Über-Abstraktion" — eine Konstante an einer Stelle ist die einfachste Form von DRY ohne Over-Engineering.
- **Validierung im AccountsDialog mit `role="alert"`** statt stiller `return`: der existierende Backlog-Punkt „sichtbare Formular-Validierung im Abo-Dialog" gilt analog für Konten. Hier gleich richtig gemacht, weil neue Felder eingeführt wurden.

### Gotchas / nächste Hinweise

- **Migration ist additive `ALTER TABLE`** — `sqlx::migrate!` führt sie beim ersten Start automatisch aus. Bestehende User mit Konten haben danach EUR/0/0 als Werte und müssen ihren realen Saldo nachpflegen. Keine UI-Migration nötig, weil das Feld leer = 0 ist und in der Übersicht als „Saldo heute: 0,00 €" angezeigt wird — selbsterklärend, was zu tun ist.
- **Fremdwährungs-Hinweis kann verwirren**, wenn der User einen USD-Sub auf einem EUR-Konto bewusst dort führt (z.B. Kreditkarten-Konto in EUR, aber USD-Abos drauf). Aktuell wird der USD-Sub ignoriert; Lösung wäre, das Konto in zwei aufzuteilen, oder später Wechselkurs-Umrechnung. Für jetzt ist der Hinweis die ehrliche Variante.
- **Saldo wird nicht automatisch nach Buchungen reduziert** — die App kennt ja nicht den realen Konto-Saldo nach Abbuchungen (das macht die Bank). User muss den Saldo selbst aktualisieren, wenn er es genauer haben will. Das ist konsistent mit „SubTracked ist Radar, nicht Buchhaltung".
- **`computeCoverage` mutiert intern Maps**, aber gibt eine reine Liste zurück. Pure Function bleibt's. Tests verlassen sich auf Determinismus — `TZ=UTC` in `vitest.config.ts` ist hier kritisch (Coverage iteriert Datum-für-Datum).
- **Backlog-Items „Sichtbare Formular-Validierung im Abo-Dialog" + „Filter/Sortierung" + „Nächste-Fälligkeiten-Ansicht"** sind als nächstes naheliegende Kandidaten — sie heben den Nutzen der jetzt sichtbaren Forecast-Daten weiter (besseres Drilldown). Vor dem UI-Redesign aber abschließend prüfen, ob die jetzige Coverage-Darstellung reicht oder ob die Redesign-Session sie sowieso umbaut.

### Geänderte Memories

- `~/.claude/projects/-home-legr-SubTracked/memory/feedback_handover.md` — neue Pflicht-Regel ergänzt: „Agent-Markierung in Überschrift + Body" (Claude vs. Codex). Vom User am 2026-06-07 explizit gefordert, weil er jetzt mit zwei Agents arbeitet (Codex als Reviewer).

### Status am Sitzungsende

- Branch `main`, Working tree: ~20 modifizierte + 1 neue Datei (Migration + Backend + Frontend + Tests + Doku). Noch nicht committet — User-Freigabe ausstehend.
- App-Stand: live verifiziert, alle Tests grün.

---

## 2026-06-07 — Codex: Tray-Aufpopp-Bug auf KDE Plasma gefixt

Codex hat den Tray-Aufpopp-Bug als eigene Debug-Session bearbeitet, fokussiert auf User-System **CachyOS + KDE Plasma** (Windows/macOS erstmal egal). Der Fix wurde im Dev-Build vom User manuell getestet und bestaetigt; App danach vom User manuell beendet. User bat danach, alles zu committen/pushen und die Arbeit fuer heute zu beenden.

### Geändert

- `src-tauri/src/lib.rs`
  - `show_main_window` loggt jetzt `was_visible` und `was_minimized`, wenn eine Tray-Aktion das Fenster zeigen soll.
  - Reihenfolge/Mechanik angepasst: `show()` + `unminimize()` synchron, danach verzögerter Fokus über `focus_main_window_after_show`.
  - Grund: In Tauri/Tao unter Linux sendet `set_focus()` nur einen Focus-Request, wenn das native GTK-Fenster zu diesem Zeitpunkt bereits sichtbar und nicht minimiert ist. Direkt nach `show()` ist das bei einem zuvor per X versteckten Fenster noch nicht zuverlässig verarbeitet.
  - Linux/KDE-spezifischer Raise-Impuls: nach kurzer Verzögerung `set_always_on_top(true)`, 40ms später wieder `false`, danach zweiter `set_focus()`. Ziel: KWin/Plasma soll das Fenster wirklich nach vorne heben statt nur den Taskleisten-Eintrag zu highlighten.
- `BACKLOG.md`
  - Tray-Bug abgehakt mit Hinweis auf bestaetigten Live-Test auf CachyOS/KDE Plasma.

### Verifikation

- `cd src-tauri && cargo check` grün.
- `cd src-tauri && cargo test` grün: 8 Tests.
- `cd src-tauri && cargo fmt --check` grün.
- `cd src-tauri && cargo clippy --all-targets -- -D warnings` grün.
- `pnpm lint` grün.
- `pnpm tauri dev` gestartet; User hat den Dev-Build auf CachyOS/KDE Plasma manuell getestet und bestaetigt, dass das Fenster aus dem Tray wieder hochkommt. App anschließend manuell beendet.

### Gotchas / nächste Hinweise

- Fix ist auf CachyOS/KDE Plasma verifiziert. Windows/macOS waren bewusst nicht Ziel dieser Debug-Session.
- Der Linux-Pfad nutzt ein kurzes `always_on_top`-Toggle als KWin/Plasma-Raise-Impuls. Falls spaeter auf anderen Linux-Desktops Nebenwirkungen auftauchen, gezielt dort re-evaluieren.

---

## 2026-06-07 — Codex: Reminder-Korrektheit + Serena-Memories aktualisiert

Codex hat den empfohlenen kleinen Stabilitätsblock umgesetzt: Reminder werden nur noch als gesendet markiert, wenn wirklich eine Notification angestossen wurde, KRW/Zero-Decimal-Währungen werden in Rust-Notifications korrekt formatiert, und die veralteten Serena-Memories wurden aktualisiert. Serena-MCP-Tools waren weiterhin nicht via `tool_search` sichtbar; die lokalen `.serena/memories/*` wurden direkt im Repo editiert.

### Geändert

- `src-tauri/src/reminders.rs`
  - Reminder-Row bedeutet jetzt semantisch: "Notification wurde erfolgreich angestossen".
  - Vor dem Versand wird nur noch geprüft, ob bereits ein Reminder-Row existiert.
  - Bei fehlender Notification-Permission wird kein Row geschrieben; stattdessen `tracing::info!` mit `subscription_id` und `due_date`.
  - Nach erfolgreichem `show()` wird per `INSERT OR IGNORE` idempotent markiert.
  - Neuer Rust-Helper fuer Notification-Betragsformatierung: EUR/USD/etc. als `17,99 EUR`, KRW als `1.500 KRW` ohne `/100`.
  - 3 neue Rust-Tests fuer Regular Currency, KRW und defensive negative Werte.
- `.serena/memories/core.md`
  - Source-Map auf aktuellen sqlx/Tauri-Commands-/Rust-Reminder-Stand gebracht.
- `.serena/memories/conventions.md`
  - DB-Grenzen, Minor-Unit-Geld, Rust/TS-Recurrence-Duplikation und neue Reminder-Sent-Semantik aktualisiert.
- `.serena/memories/task_completion.md`
  - Veraltete Aussagen "keine Tests / kein Formatter" entfernt; aktuelle Biome/Vitest/Rust/Lefthook-Checks dokumentiert.
- `BACKLOG.md`
  - Reminder-Sent-Bug, KRW-Notification-Bug und Serena-Memory-Item abgehakt.
- `AGENTS.md`
  - Nach User-Freigabe ebenfalls auf aktuellen sqlx/Tauri-Commands-/Rust-Reminder-Stand synchronisiert: kein `tauri-plugin-sql`, keine `reminders.ts`, neue Migration-Regel via `sqlx::migrate!`, aktuelle Completion-Checks.

### Verifikation

- `cd src-tauri && cargo test` grün: 8 Tests.
- `cd src-tauri && cargo fmt --check` grün.
- `cd src-tauri && cargo clippy --all-targets -- -D warnings` grün.
- `pnpm lint` grün.
- `pnpm test:run` grün: 87 Tests in 10 Files.
- `pnpm build` grün.
- Nach AGENTS-Update erneut `pnpm lint` grün.
- `pnpm tauri dev` nicht gestartet; Änderung betrifft keinen neuen UI-Pfad, sondern Reminder-Backend + Doku.

### Gotchas / nächste Hinweise

- Durch die neue Semantik kann bei fehlender Notification-Permission stündlich ein Info-Log fuer faellige Erinnerungen entstehen. Das ist absichtlich: kein stilles "sent", solange der User nichts sehen konnte.
- Wenn neue Währungen ohne Subdivision hinzukommen (z.B. JPY), müssen Frontend-`getCurrencySubdivisor()` und Rust-`currency_subdivisor()` gemeinsam erweitert werden.
- AGENTS.md und Serena-Memories sind jetzt wieder auf demselben aktuellen Architekturstand.

---

## 2026-06-07 — Codex: Review-Liste ins BACKLOG einsortiert

Codex hat die zuvor erstellte Projekt-Review-Arbeitsliste in `BACKLOG.md` an die jeweils passende Stelle einsortiert. Keine App-Code-Änderungen.

### Geändert

- `🐛 Bugs`: Reminder-Sent-Semantik bei fehlgeschlagener/fehlender Notification und KRW/Zero-Decimal-Formatierung in Rust-Notifications ergänzt.
- `🔨 Jetzt (Oberfläche)`: sichtbare Formularvalidierung, Archivieren/Pausieren, nächste Fälligkeiten und Filter/Sortierung ergänzt.
- Neue Rubrik `📈 Produktnutzen / Prognose`: Kontostände, Deckungswarnungen, Mindestpuffer, Mehrwährungs-Prognose und Preis-Historie ergänzt.
- `⏭️ Hintergrund-Betrieb`: Test-Notification und Reminder-Status ergänzt.
- `🚀 Distribution & Setup`: Matrix-Build und Windows/macOS-Smoke-Test eingeordnet.
- `📐 Tests & Qualität`: Serena-Memories aktualisieren und E2E-Test-Idee eingeordnet.
- `🏛️ Architektur`: serverseitige Command-Validierung und TS/Rust-Recurrence-Duplikation ergänzt.
- `🌱 Später`: Settings-Ausbau, UI/Empty-State-Ideen, Backup-Export, variable Intervalle, Kündigungsfrist und Kategorien ergänzt.
- Veraltetes offenes Logging-Item als erledigt markiert, weil `tracing`/Datei-Logging bereits umgesetzt ist.

### Verifikation

- Keine Tests ausgeführt; reine Markdown-/Backlog-Änderung.

### Status

- User hat anschließend ausdrücklich "alles committen und pushen" angefordert.
- Working tree enthält `BACKLOG.md`, `HANDOVER.md` sowie die bislang untracked `assets/logo2.png` und `assets/logo3.png`; alle vier Dateien werden auf User-Wunsch in den Commit aufgenommen.

---

## 2026-06-07 — Codex: Projekt-Review und Arbeitsliste

Codex hat das Projekt einmal quer gelesen, um Sinn, Logik und Verbesserungshebel zu verstehen. Keine Code-Änderungen an App-Logik; nur Review/Analyse und diese HANDOVER-Dokumentation.

### Gelesen / geprüft

- Frontend: `App.tsx`, Dialoge, `OverviewSection`, Hooks, `DateField`, CSS.
- TS-Logik: `recurrence.ts`, `coverage.ts`, `format.ts`, `db.ts`.
- Rust: `lib.rs`, `commands.rs`, `db.rs`, `reminders.rs`, `recurrence.rs`, Migrationen, Capabilities, `tauri.conf.json`.
- Projekt-Doku: `README.md`, `BACKLOG.md`, `.serena/memories/*`.

### Verifikation

- `pnpm test:run` grün: 87 Tests in 10 Files.
- `pnpm build` grün.
- `cargo test` grün: 5 Rust-Tests.
- `cargo clippy --all-targets -- -D warnings` grün.
- `cargo fmt --check` grün.

### Wichtigste Review-Befunde

- SubTracked ist fachlich eher ein lokaler Zahlungsradar/Kontodeckungs-Assistent als nur eine Abo-Liste. Größte Produkthebel: Kontostände/Prognose, Reminder-Zuverlässigkeit, Release-Reife, dann UI-Overhaul.
- Multi-Currency ist nur teilweise umgesetzt: Eingabe/Anzeige einzelner Beträge kann KRW, aber `OverviewSection` formatiert Baseline/Coverage pauschal als EUR und `reminders.rs` teilt Beträge pauschal durch 100. Das sollte vor ernsthafter Mehrwährungsnutzung korrigiert werden.
- Reminder-Idempotenz greift auch dann, wenn Notification-Permission fehlt: `reminders.rs` schreibt den Reminder-Row vor dem Notification-Versand bzw. auch ohne Versand. Dadurch kann eine Fälligkeit als erledigt gelten, obwohl der User nie eine Notification bekam. Produktentscheidung nötig: "einmalige App-interne Erinnerung" vs. "nur nach erfolgreichem Versand als sent markieren".
- Tray-Aufpopp-Bug bleibt ein v0.1-Reife-Thema. Vermutlich braucht `show_main_window` zusätzliche Fokus-/Visibility-Behandlung und echte Reproduktion unter KDE Wayland.
- Serena-Memories sind teilweise veraltet (`core.md`, `conventions.md`, `task_completion.md` erwähnen altes `tauri-plugin-sql`, alte Testlage, alte Completion-Regeln). Nicht kritisch für die App, aber kritisch für Agenten-Kontext.

### Empfohlene nächste Arbeit

1. Kleine Korrekturen: Backlog-Logging-Item abhaken/aktualisieren, Serena-Memories bereinigen, KRW/Mehrwährungs-Anzeige in Overview und Reminder fixen.
2. v0.1-Reife: Tray-Aufpopp-Bug reproduzieren/fixen, Release-Matrix mit `tauri-action`, README-Screenshot/GIF, optional Update-Mechanismus erst nach signierter Pipeline.
3. Produktnutzen: Kontostände/Polster pro Konto, Warnlogik "Konto voraussichtlich nicht gedeckt", bessere Fälligkeitsliste/Filter, Archiv/Stummschaltung sichtbarer machen.

---

## 2026-06-07 — Codex: Onboarding / Kontext eingelesen

Kurze Orientierungssitzung von **Codex** ohne Code-Änderungen. User fragte zunächst nach Repo-/MCP-Zugriff und wies darauf hin, Serena als MCP für alle Aufgaben zu nutzen. In dieser Umgebung sind aktuell keine Serena-Tools über `tool_search` sichtbar; falls sie später exponiert werden, bevorzugt für Symbol-/Code-Orientierung verwenden.

### Gelesen

- Oberster HANDOVER-Eintrag vollständig gelesen.
- `AGENTS.md`, `README.md` und `BACKLOG.md` gelesen.
- Geprüft: Es gibt nur `HANDOVER.md`, kein separates `HANDOVER-archive.md`.

### Status

- Keine Code- oder Konfigurationsänderungen.
- Working tree vor diesem Eintrag nur mit den bekannten untracked Dateien `assets/logo2.png` und `assets/logo3.png`.
- Aktuelle sinnvolle nächste Aufgaben bleiben: Tray-Aufpopp-Bug, UI-Redesign Richtung arsnova, Matrix-Build-Pipeline.

### Gotchas

- Projektregel bleibt: Vor jeder Arbeit zuerst den obersten HANDOVER-Eintrag lesen.
- Neue HANDOVER-Einträge von Codex sollen ausdrücklich als Codex-Einträge markiert werden, damit später keine Agent-Verwechslung entsteht.
- Wenn Nutzer-sichtbare UI geändert wird: Texte Deutsch halten.
- Bei Betragsfeldern künftig an den WebKitGTK-Komma-Fall denken: `type=text` + `inputMode=decimal` + `parseAmountInput`.

---

## 2026-06-07 — Lokalisierung der Betrags-Eingabe (Komma + Tausender) + Crash-Recovery-Folge-Session

Folge-Session nach OS-Crash (siehe nächster Eintrag) am selben Tag. Erst Aufräum-Arbeit (App-Log-Forensik, HANDOVER-Nachtrag, Sanity-Check Tests+Clippy), dann ein Backlog-Item: **Lokalisierung der Eingaben**. Ein Commit (`9e05c51`), 13 neue Tests (10 Helper + 3 Dialog), live im laufenden Build mit `pnpm tauri dev` smoke-getestet, dann durch den User selbst durchgeklickt-verifiziert.

### Was passierte (chronologisch)

| Thema | Commits | Hinweise |
|---|---|---|
| Crash-Forensik | – | App-Log `~/.local/share/com.tcgtvv.subtracked/logs/subtracked.2026-06-07.log` zeigte zwei `INFO SubTracked startet`-Zeilen um 12:23:33Z und 12:28:19Z UTC (= 14:23 / 14:28 lokal). Letzter Commit war 14:21:59 — die ~5 min Lücke + Doppel-Startup ist konsistent mit „App lief, OS-Crash mit, Reboot + Neustart". **Kein App-internes Crash-Indiz**, das tracing-System loggt aktuell nur Startup + Reminder-Errors. |
| HANDOVER-Nachtrag | `8dd7af0` | Vollständige Sitzungs-Dokumentation der durch den Crash beendeten Vor-Crash-Sitzung. Pre-commit-Hook lief sauber durch (biome + vitest grün). |
| Sanity-Check nach Crash | – | `pnpm test:run` 74/74 grün, `cargo clippy --all-targets -- -D warnings` clean. Keine FS-Inkonsistenzen durch den unsauberen Shutdown. |
| Architektur ➑ Doku-Strategie geprüft | – | War bereits im Vor-Crash-Commit `be686f0` als „Status Quo halten" entschieden — ich hatte das in der Empfehlungs-Tabelle aus Versehen als noch offen geführt. Korrigiert, Architektur-Sektion ist damit *de facto* abgeschlossen (zwei verbleibende Items „Concerns-Mix" und „Reload-Pattern" sind explizit als niedrig/optional markiert). |
| Lokalisierung Betrags-Eingabe | `9e05c51` | Neuer `parseAmountInput(input: string): number \| null` in `src/lib/format.ts`. Heuristik: bei beiden Trennzeichen ist das spaeter stehende der Dezimaltrenner, das andere Tausender; bei genau einem Trenner mit 3 Stellen danach (z.B. `1,234`) wird er als Tausender gedeutet; sonst Dezimal. Null bei leer / strukturell ungültig / Vorzeichen. `SubscriptionDialog` von `<input type="number">` auf `<input type="text" inputMode="decimal">` umgestellt — `type=number` blockierte in WebKitGTK je nach Locale die Komma-Eingabe **stumm**, das war der eigentliche Auslöser. `centsToInput` formatiert die Edit-Vorbefüllung jetzt mit Komma (konsistent zur Liste-Anzeige via `formatAmount`). 10 neue parseAmountInput-Tests in `format.test.ts` decken alle Heuristik-Pfade + Edge-Cases (`,5`, `5.`, Whitespace, Buchstaben, Vorzeichen). 3 neue Dialog-Tests via RTL: Komma, deutsche Tausender, ungültige Eingabe. Alter Test „step und min bei KRW" entfernt (Attribute gibt es nicht mehr). Vorhandener Edit-Mode-Test auf `"17,99"`-String statt `17.99`-Number korrigiert (`type=text` gibt String). |
| Live-Smoke + Verifikation | – | `pnpm tauri dev` hochgefahren, App startet sauber (neuer Startup-Log um 12:51:03Z UTC), Hauptview rendert, keine Errors. Klick-Through nicht durch den Agent möglich (kein `ydotool`/`wtype`/Playwright im System), **User hat selbst durchgeklickt und „sieht gut aus" bestätigt**. |

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, HEAD `9e05c51` |
| Push-Stand | wird am Sitzungsende gepusht — vor der Sitzung war origin auf `2e1cf6b` (App-Logs vom Vortags-Marathon) |
| Working tree | clean bis auf untracked `assets/logo2.png`/`logo3.png` (unverändert, siehe vorherige Einträge) |
| Test-Stand | **87 Tests grün** in 10 Files (74 vorher + 13 in dieser Session) |
| Build/Tests lokal | `pnpm test:run` ✓, `cargo clippy --all-targets -- -D warnings` ✓ (vor Lokalisierungs-Commit), Lefthook hat den Lokalisierungs-Commit nach Auto-Biome-Format sauber durchgelassen |
| Live-Verifikation | User hat den Komma-Eingabe-Pfad in `pnpm tauri dev` durchgeklickt — bestätigt funktional |

### Nächster Schritt

Backlog-Items, die jetzt sinnvoll sind (Reihenfolge nach Wertschätzung):

- **🐛 Tray-Aufpopp-Bug** (Backlog Z. 26) — **User-Beobachtung 2026-06-07: vor dem OS-Crash hat es einmal funktioniert**, d.h. der Bug ist **nicht 100 % deterministisch**. Das ist ein wichtiger neuer Datenpunkt — könnte auf einen Race / State-abhängigen Pfad hindeuten (z.B. ob das Fenster vorher schon hidden vs. minimized war, ob ein anderer Tray-Klick kürzlich war, KDE-Session-Zustand). Beim nächsten Reproduktions-Versuch: explizit verschiedene Vor-Zustände durchprobieren (frisch gestartet vs. eine Weile hidden vs. nach Notification-Toast).
- **🎨 UI-Redesign Richtung arsnova** (Backlog Z. 88) — vor v0.1.0 sinnvoll, eigene Session-Reihe.
- **🚀 Matrix-Build-Pipeline** (Backlog Z. 89) — `tauri-action`-Workflow für signierten v0.1.0 + In-App-Updater.

### Wichtige Entscheidungen + Begründung

- **`<input type="number">` → `<input type="text" inputMode="decimal">`**: Der Witz an `type=number` ist genau die Validierung — und genau die hat in WebKitGTK das stumme Komma-Blocking verursacht. Mit `type=text` haben wir volle Kontrolle, behalten via `inputMode="decimal"` das mobile Numeric-Keypad und parsen selbst. Das gibt zusätzlich die Möglichkeit, deutsche Tausender (`1.234,56`) anzunehmen, was `type=number` nie konnte. Trade-off: keine Step-Buttons mehr — bei Geld-Eingabe nutzt die ehrlich gesagt niemand, vernachlässigbar.
- **Heuristik „3 Stellen nach einzelnem Trenner = Tausender"**: realer Fall ist `1,234` (englischer User, meint 1234) oder `1.234` (deutscher User, meint 1234). Mit der Regel wird beides als Tausender gedeutet. Trade-off: wenn ein deutscher User wirklich „1,234 EUR" (= 1.234 EUR mit 3 Nachkommastellen) tippen will, kriegt er 1234 EUR. Bei Geld sind 3 Nachkommastellen aber unüblich; 99,9 %-Lösung ist gut genug.
- **`centsToInput` mit Komma statt Punkt**: konsistent zur deutschen Listen-Anzeige (`formatAmount` nutzt `Intl.NumberFormat("de-DE")`). Beim Edit eines bestehenden Abos sieht der User dieselbe Schreibweise wie in der Liste, nicht eine englische Variante.
- **Helper-Funktion `parseAmountInput` in `format.ts`** statt inline im Dialog: dieselbe Logik wird absehbar bei Konto-Eingabe / CSV-Import auch gebraucht. Single source of truth.
- **Verifikation: User klickt selbst durch** statt WebDriver-Setup: Echtes WebKitGTK-Verhalten war der Risikopunkt, das kann nur durch Klicken im echten Build verifiziert werden. WebDriver-Setup (Tauri-WebDriver) ist im Backlog als „großer Setup-Aufwand, ROI erst wenn echte User-Flows stabil bleiben müssen" markiert — heute drüber stehen wäre Über-Investment.

### Gotchas / Stolperfallen

- **`<input type="number">` blockiert Komma in WebKitGTK stumm** — der User merkt nicht, dass seine Tastatureingabe verworfen wird. Das war der eigentliche Bug-Auslöser. Wenn künftig weitere Number-Inputs auftauchen (`leadDays` zum Beispiel), auf dasselbe Symptom achten. **Lehre**: für deutsche User-Eingaben in Tauri/WebKitGTK lieber `type=text + inputMode=decimal + eigener Parser` als `type=number`.
- **Biome kann Format-Fixes auch nach Edit fordern**: zwei Format-Issues im ersten Commit-Versuch (Doppel-Leerzeile in `format.ts`, ein 3-Zeilen-Call der auf eine Zeile passt im Test). Auto-Fix via `pnpm biome check --write src/lib/format.ts src/components/SubscriptionDialog.test.tsx` hat beide aufgeräumt, danach Pre-commit-Hook clean. Pattern für nächste Sitzung: nach Edits auf `format.ts`/`*.test.tsx` einmal `pnpm biome check --write <file>` lokal laufen lassen, bevor Commit.
- **Tray-Aufpopp-Bug ist nicht-deterministisch**: User-Beobachtung „vor dem Crash funktionierte es". Bei künftiger Reproduktion ist Vor-Zustand zu variieren (siehe „Nächster Schritt").
- **Test-Coverage von Komma-Parsing in der UI**: die RTL-Tests fahren über jsdom — das ist nicht WebKitGTK. Falls WebKitGTK den `inputMode="decimal"`-Hint künftig anders interpretiert (mobile Tastatur), müsste das via echtem Build verifiziert werden. jsdom kennt `inputMode` nicht in der vollen Tiefe.

### Geänderte/neue Memories

- Keine direkten Memory-Änderungen in dieser Session. Die Sitzung hat etablierte Workflows fortgesetzt (Backlog-Item picken, Tests parallel ausbauen, kommittieren), keine neuen Vorlieben oder Constraints überraschend bekannt geworden.
- **Implizit aktualisiert**: `feedback_serena` wirkt jetzt deutlich verlässlicher — diese Sitzung ist komplett ohne explizite Erinnerung mit Serena gestartet (`get_symbols_overview` + `find_symbol` als Default) — das ist ein **Erfolgs-Datenpunkt**, kein neuer Memory-Eintrag nötig.

### Offen / nicht geklärt

- **Tray-Aufpopp-Bug** (Backlog Z. 26) — neuer Beobachtungs-Datenpunkt, weiter offen.
- **Architektur-„Concerns-Mix in reminders.rs"** und **„Reload-Pattern grobgranular"** — beide bewusst auf niedrig / optional.
- **i18n + Sprache** — Status Quo, kein Trigger.
- **AGENTS.md ggf. um Komma-Konvention erweitern** — derzeit nicht erwähnt, aber relevant für künftige Number-Input-Felder. Bewusst noch nicht eingebaut, weil das einen sehr spezifischen Code-Pfad betrifft und im HANDOVER-Verlauf gut auffindbar bleibt. Wenn das öfter zum Stolperdraht wird, in AGENTS.md ziehen.

---

## 2026-06-07 — Architektur ➍: RTL-Komponenten-Coverage + App-Logging (Sitzung durch OS-Crash beendet)

10 Commits zwischen 13:40 und 14:21, davon einer Architektur-Etappe (➍ RTL-Setup), fünf Test-Coverage-Commits und ein neues App-Logging-System. Sitzung **nicht regulär beendet** — der Linux-Host (CachyOS) ist um ca. 14:23–14:28 abgestürzt; dieser HANDOVER-Eintrag wird in der Folge-Session am selben Tag nachgetragen. **Kein Arbeitsverlust** (working tree war committed), kein App-internes Crash-Indiz (App-Log zeigt nur zwei `INFO SubTracked startet`-Zeilen um 14:23:33Z und 14:28:19Z UTC — konsistent mit „App lief beim OS-Crash, danach Reboot + Neustart").

### Was passierte (chronologisch)

| Thema | Commits | Hinweise |
|---|---|---|
| BACKLOG-Sweep vorab | `be686f0` | Drei kleine BACKLOG-Beschlüsse festgehalten: i18n=Status Quo (Deutsch, keine i18n-Library jetzt), Doku=Status Quo, dazu neues App-Logs-Item als Quick-Win formuliert — letzteres wurde noch dieselbe Sitzung umgesetzt. |
| Architektur ➍ RTL-Setup | `8761c3d`, `8644999` | `jsdom` als Default-Env in `vitest.config.ts`, `@vitejs/plugin-react` für JSX-Transform in `.tsx`-Tests, `vitest.setup.ts` lädt `@testing-library/jest-dom`-Matcher und ruft `cleanup()` nach jedem Test (RTL 16 koppelt das an globales `afterEach`, das ohne `globals: true` nicht da ist). `tsconfig.json` um `vitest.setup.ts` erweitert, damit Type-Augmentation der jest-dom-Matcher für `tsc --noEmit` sichtbar wird. Erste Tests als Pattern-Vorlagen: `useNotificationPermission.test.tsx` (5 Tests, `renderHook` + `vi.mock("@tauri-apps/plugin-notification")`) und `NotificationPermissionBanner.test.tsx` (4 Tests, `render` + `screen` + `fireEvent.click`). Direkt danach BACKLOG ➍ + RTL-Item abgehakt. |
| Tool-Recherche festgehalten | `9437c0f` | Drei „Code-Intelligence/Agent-Tools" aus dem Backlog evaluiert: **Fallow** (Rust-native Code-Intel) — sinnvoll, aber erst ab ~20k LOC oder spürbarer Architektur-Drift; bei SubTracked (~3000 LOC) decken Biome + `tsc` + Serena das schon ab. **Graphify** (tree-sitter Knowledge-Graph für Token-Reduktion) — redundant zu Serena (LSP-basiert, semantisch genauer). **Ruflo** (Multi-Agent-Orchestration) — Token-Spar-Versprechen unter konkreter Audit-Kritik („99% Theater, 1% Real"), für Solo-Projekt mit fokussierten Sessions nicht passend. Alle drei dokumentiert, Fallow als „später re-evaluieren"-Item, die anderen beiden als erledigt-mit-Begründung markiert. |
| Test-Coverage-Sweep | `af76bba`, `c21d05c`, `6fa0b73`, `62bc8d4`, `69e3d31` | **38 neue Tests in 5 Files** — SubscriptionDialog (8), OverviewSection (6, mit `TZ=UTC` in `vitest.config.ts` für Date-Determinismus über CI-Zeitzonen hinweg), AccountsDialog (9), SettingsDialog (7), useSubscriptions-Hook (8). Bewusst **Smoke-Tests, keine Verhaltens-Vertiefung** — Stand jetzt: jede dialoglastige Komponente hat eine Regressions-Trip-Wire, die bricht, wenn jemand versehentlich State/Validation/Props umbaut. Vertiefte Edge-Case-Tests folgen, wenn echte Bugs gefunden werden. |
| App-Logging | `2e1cf6b` | `tracing 0.1` + `tracing-subscriber 0.3` (env-filter) + `tracing-appender 0.2` als neue Cargo-Deps. Im `lib.rs`-Setup-Block ganz früh: `app_log_dir()` resolven + Dir anlegen, Rolling-File-Appender (`Rotation::DAILY`, prefix `subtracked`, suffix `log`, max 7 Files) → `~/.local/share/com.tcgtvv.subtracked/logs/` (Linux) bzw. OS-Äquivalent, `WorkerGuard` via `app.manage(guard)` am Leben halten (sonst gehen Logs verloren), `tracing_subscriber::registry` mit `env_filter` (default `info`, override via `RUST_LOG`) + zwei fmt-Layer (stdout mit ANSI, Datei ohne). Bestehender `eprintln!` im Reminder-Loop ersetzt durch `tracing::error!(error = %e, "Reminder-Check fehlgeschlagen")`. Damit ist der installierte Build endlich debuggebar (vorher gingen `eprintln!`-Fehler auf Wayland ohne Terminal verloren). |

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, auf origin/main, HEAD `2e1cf6b` |
| Working tree | clean bis auf untracked `assets/logo2.png`/`logo3.png` (alte Nano-Banana-Backups vom 5./6.6., siehe vorherige HANDOVER-Einträge) |
| Test-Stand | Frontend 47 RTL-Tests neu + altbestand → laut Memory-Update im App-Logs-Commit jetzt **74 Tests** insgesamt grün |
| Build/Tests lokal | Vor dem Crash: `pnpm lint`, `pnpm test:run`, `cargo clippy`, `cargo fmt --check` zu allen Commits grün (Lefthook hat sauber durchgelassen, sonst gäbe es keine Commits). Nach Crash nicht re-verifiziert. |
| App-Log | Zwei Startup-Einträge in `~/.local/share/com.tcgtvv.subtracked/logs/subtracked.2026-06-07.log` (14:23:33Z + 14:28:19Z UTC). Logging-System funktioniert. |

### Nächster Schritt

Kandidaten unverändert seit gestern (siehe vorheriger Eintrag), aber durch die heutige ➍-Etappe verschiebt sich die Architektur-Diskussion etwas:

- **🐛 Tray-Aufpopp-Bug** (Backlog Z. 26) — KDE-Plasma-Wayland; weiterhin offen.
- **🏛️ Architektur ➑** — Doku-Strategie (i18n ist auf Status Quo entschieden).
- **🎨 UI-Redesign Richtung arsnova** (Backlog Z. 88) — vor v0.1.0 sinnvoll, eigene Session-Reihe.
- **🚀 Matrix-Build-Pipeline** (Z. 89) — `tauri-action`-Workflow für signierten v0.1.0 + In-App-Updater.
- **Vertiefte Komponenten-Tests** — die Smoke-Tests aus heute sind die Tripwire-Schicht; falls echte Validation/Edge-Case-Bugs auftauchen, kann jeweils der entsprechende `.test.tsx`-File ausgebaut werden.

### Wichtige Entscheidungen + Begründung

- **RTL-Smoke-Tests statt Verhaltens-Vertiefung**: bewusst breit statt tief. Jede dialoglastige Komponente bekommt eine Regressions-Tripwire, nicht eine Verhaltens-Spezifikation. Begründung: bei einem Solo-Projekt in Frühphase ist Refactor-Sicherheit wertvoller als formale Verhaltens-Doku via Tests. Tiefere Tests gibt's, wenn ein konkreter Bug das rechtfertigt.
- **`TZ=UTC` in `vitest.config.ts`** statt in jedem Date-Test einzeln: globaler Hebel, ein Strang. OverviewSection war der erste Test, der mit lokaler Berlin-Zeit anders kalkuliert hätte als CI (Ubuntu-Runner laufen oft UTC). Repository-Convention statt Per-Test-Workaround.
- **`tracing` Setup ganz früh in `run()`, vor allem anderen**: damit auch Setup-Fehler in die Logs landen. Wenn `app_log_dir()` selbst scheitert, läuft Logging nicht — aber der Initial-`eprintln!` als Fallback gibt einen Hinweis im Dev-Modus. Bewusst kein Fallback-Logger auf `/tmp` o.ä. — Komplexität ohne realen Nutzen.
- **`WorkerGuard` via `app.manage(guard)`**: das `tracing-appender`-Crate-Doku ist explizit: WorkerGuard muss am Leben bleiben, sonst werden Buffers nicht geflusht beim Shutdown. `app.manage()` ist der Tauri-idiomatische Weg, etwas an die App-Lifetime zu binden.
- **Drei Backlog-Tools (Fallow/Graphify/Ruflo) bewusst dokumentiert verworfen, nicht nur Item gelöscht**: damit die Recherche reproduzierbar ist und bei späterem Re-Evaluieren (z.B. Fallow ab 20k LOC) der Kontext da ist. Erspart, dieselbe Recherche in 6 Monaten zu wiederholen.

### Gotchas / Stolperfallen

- **OS-Crash beendet die Sitzung**: kein App-internes Indiz im Log (nur zwei Startup-Zeilen). Das tracing-System loggt aktuell nur Startup + Reminder-Errors — kein graceful-shutdown-Hook, also würden OS-Crashes generell unsichtbar bleiben. Wenn später ein App-Hang/Crash unterscheidbar werden soll, müsste man entweder einen `panic_hook` für Rust-Panics setzen oder beim regulären Shutdown ein `INFO SubTracked beendet` schreiben — beides nicht jetzt nötig.
- **RTL 16 koppelt `cleanup()` an globales `afterEach`**: ohne `globals: true` in `vitest.config.ts` (haben wir nicht) muss `cleanup()` manuell in `vitest.setup.ts` nach jedem Test gerufen werden. Steht in der RTL-16-Release-Notes, ist beim ersten Setup einmal eine Stolperfalle. Verifiziert: ohne diesen Cleanup bleiben DOM-Knoten zwischen Tests übrig, was zu Mehrfach-Matches in `screen.getByRole(...)` führt.
- **`@vitejs/plugin-react` ist Pflicht für `.tsx`-Tests**: Vitest nutzt esbuild, das macht TS-Transform aber nicht React-JSX-Pragma. Ohne Plugin schlagen JSX-Statements in Tests mit unverständlichem Parser-Error fehl.
- **App-Log-Pfad ist OS-spezifisch und nicht im Repo**: Linux `~/.local/share/com.tcgtvv.subtracked/logs/`, macOS `~/Library/Logs/com.tcgtvv.subtracked/`, Windows `%LOCALAPPDATA%\com.tcgtvv.subtracked\logs\`. Steht im App-Logs-Commit, sollte aber für Doku/Issues geläufig sein — User-Reports der Form „die App tut nichts" können hier oft sofort entschärft werden.
- **Rolling-File `max 7 Files`**: pragmatisch gewählt. Eine Woche tägliche Logs reicht für die meisten Debug-Szenarien, ohne dass `~/.local/share/` ungebremst wächst. Falls länger nötig: Konstante in `lib.rs` anheben.

### Geänderte/neue Memories

- **`.serena/memories/tech_stack.md`** im App-Logs-Commit aktualisiert: neuer Logging-Block (`tracing`/`tracing-subscriber`/`tracing-appender`), Test-Stand auf 74 hochgezogen.
- **Keine Auto-Memory-Änderungen** — die heutige Session war im etablierten Workflow (oft committen, Quick-Wins, Backlog-driven), nichts überraschend Neues über User-Vorlieben oder Projekt-Rahmen.

### Offen / nicht geklärt

- **Tray-Aufpopp-Bug** (Backlog Z. 26) — KDE-Plasma-Wayland, unverändert seit gestern.
- **Architektur ➑** — Doku-Strategie offen (i18n entschieden = Status Quo).
- **`assets/logo2.png`/`logo3.png` untracked** — siehe vorherige Einträge; weiterhin reines Cleanup-Item ohne Dringlichkeit.
- **`pnpm test:run` und `cargo clippy` nach Crash nicht re-verifiziert** — Folge-Session sollte das einmal kurz durchspielen, falls Caches/State im File-System inkonsistent geworden sind (vermutlich nicht, aber billig zu prüfen).

---

## 2026-06-06 — Quick-Win-Marathon: README, Smoke-Test, ErrorBoundary, KRW

11 Commits am Nachmittag, fünf Backlog-Items abgehakt, plus der erste lokale Production-Smoke-Test als psychologischer Release-Kandidat. Nach den Architektur-Etappen ➊/➋/➌ vormittags ging es jetzt um Sauberkeit, Distribution-Test und Polish.

### Was passierte (chronologisch)

| Thema | Commits | Hinweise |
|---|---|---|
| README-Polish + Philosophie umformuliert | `b89e17e`, `077036c` | Tagline dreht sich jetzt um „native Desktop-App, Tray leise im Hintergrund" mit Anti-SaaS-Linie (drei Varianten zur Auswahl gestellt, B gewählt). Tech-Sektion komplett aktualisiert: sqlx-Pool statt `tauri-plugin-sql`, Rust-Reminder, Vitest/`cargo test`/Lefthook/CI. Neuer „Entwicklung"-Block mit den lokalen Befehlen. HANDOVER-Klarstellung: das gestern beobachtete „alte Logo auf GitHub-Page" war Browser-Cache, nach Neustart sauber. |
| Backlog-Sweep + Updater-Item | `445543b`, `3a4c4b8` | Concerns-Mix-Item nach `reminders.ts`-Löschung auf `reminders.rs` umformuliert, klar niedrig priorisiert (Drift-Falle ist in `recurrence.rs` schon getestet). Komponenten-Testbarkeit-Item auf den heutigen Stand gezogen (direkt-`db.*` → Hooks + `invoke`-Wrapper). In-App-Updater-Item via `tauri-plugin-updater` neu eingefügt, klar als „ab v0.1.0 mit signierter Pipeline" markiert. |
| Installer-Smoke-Test | `a4538f3`, `19c5c06` | Erster lokaler `pnpm tauri build` deckte zwei Production-only-Probleme auf: lowercase `productName: "subtracked"` zog sich durch Binary + .desktop + Launcher-Anzeige, plus WebKitGTK-Wayland-DMABUF-Bug crashed den Release-Build mit `Gdk-Message Error 71`. Beide Fixes fest verankert: `productName: "SubTracked"` + `mainBinaryName: "subtracked"` (Display groß, Binary klein), `WEBKIT_DISABLE_DMABUF_RENDERER=1` als `unsafe set_var` mit `cfg(target_os = "linux")` ganz früh in `run()`. Installation auf Cachyos via `debtap`-Konvertierung mit `--assume-installed gtk=1`-Workaround (Debian-Paketname `libgtk-3-0` wird zu `gtk` statt `gtk3`). |
| Error-Boundary | `44c3681`, `444c9c4` | `src/components/ErrorBoundary.tsx` als Class-Component (React liefert kein Hook-Equivalent für `componentDidCatch`), in `main.tsx` um `<App />` gewickelt → fängt damit auch Errors beim allerersten App-Mount, nicht nur Sub-Komponenten. Fallback-UI nutzt die normale `.container`-Klasse für Layout-Konsistenz, neue `.error-details`-Klasse für die rot umrandete Error-Message-Box. Visuell verifiziert per temp-`throw` in `App()`. |
| CoverageItem-Key | `36c5e5c` | `CoverageItem.subscriptionId: number` neu, in `computeCoverage` aus `sub.id` gefüllt, in `OverviewSection` als React-Key (`${it.subscriptionId}-${it.date}` statt vorher `${it.subscription}-${it.date}`). Eindeutig auch im theoretischen Edge-Case zweier Abos mit identischem Namen + Fälligkeitstag. |
| KRW + Subdivisions | `5ef9238`, `7253226` | Zweistufig: erst KRW in `CURRENCY_OPTIONS` + `CURRENCY_SUBDIVISIONS`-Map + `getCurrencySubdivisor()`-Helper in `format.ts` (EUR/USD/GBP/CHF → 100, KRW → 1, Default 100); dann `SubscriptionDialog` mit conditional `step="1"`/`min="1"` und Subdivisor-aware `centsToInput` + Submit-Logik. DB-Schema bleibt unverändert — `amount_cents` ist semantisch „smallest currency unit", bei KRW direkt Won. Visuell verifiziert (Anlegen, Liste-Anzeige, Edit-Roundtrip, EUR-Sanity-Check). |

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, auf origin/main |
| Working tree | clean bis auf untracked `assets/logo2.png`/`logo3.png` (User-Backup-Material aus den Nano-Banana-Versuchen) |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 27/27 ✓ (+1 KRW-Test), `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| Lokaler Production-Build | `.deb`/`.rpm` gebaut, `.AppImage` scheitert lokal an fehlendem `fuse2` (kein Problem auf CI). Installation via `debtap` → `pacman -U` läuft, App startet aus dem Anwendungsmenü als „SubTracked", Tray + DB-Persistenz verifiziert. |
| Backlog-Sektion „🐛 Bugs" | 1 offen (Tray-Aufpopp-Bug) |
| Backlog-Sektion „🚀 Distribution & Setup" | Smoke-Test abgehakt, Updater-Item ergänzt; v0.1.0 + README-Polish-Bilder + Fallow + Matrix-Build offen |
| Backlog-Sektion „🏛️ Architektur" | ➊/➋/➌ erledigt, ➍ neu formuliert, ➎ niedrig priorisiert, ➏/➐ erledigt (Error-Boundary), ➑ offen (Doku-Strategie + i18n) |

### Nächster Schritt

Aktiver Quick-Win-Backlog ist abgearbeitet. Kandidaten für die nächste Session:

- **🐛 Tray-Aufpopp-Bug** (Backlog Z. 26) — KDE-Plasma-Wayland-Debugging, „Fenster zeigen" aus dem Tray-Menü highlightet nur die Taskleiste statt das Fenster wirklich zu zeigen. Reproduziert vom User, noch nicht angefasst.
- **🏛️ Architektur-Diskussion ➍/➑** — Komponenten-Testbarkeit-Hands-on (Setup für RTL via Backlog Z. 100), Doku-Strategie, i18n-Vorbereitung.
- **🎨 UI-Redesign Richtung arsnova** (Backlog Z. 88) — vor v0.1.0 sinnvoll, aber großer Block, eigene Session-Reihe.
- **🚀 Matrix-Build-Pipeline** (Z. 89) — `tauri-action`-Workflow als Vorbereitung für signierten v0.1.0-Release plus In-App-Updater (Backlog Z. 54).

### Wichtige Entscheidungen + Begründung

- **Installer-Build als Smoke-Test, nicht als Distributions-Schritt**: bewusst keine GitHub-Release-Hand-Arbeit jetzt — der echte v0.1.0-Release soll mit `tauri-action`-Matrix-Build + signiertem Updater starten. Manueller v0.0.x-Release wäre Wegwerf-Arbeit, weil der Updater auf signierte Builds angewiesen ist.
- **`debtap` als Arch-Workaround bewusst akzeptiert** statt FUSE2 nachzuinstallieren. Realer Distribution-Pfad führt über CI mit FUSE-Linux-Runner, nicht über lokales AppImage-Bundling. Die `--assume-installed gtk=1`-Krücke ist ein einmaliger Smoke-Test-Hack, kein dauerhafter Distribution-Pfad.
- **Wayland-Workaround in `lib.rs` mit `cfg(target_os = "linux")`**: auf X11 no-op, daher kein Schaden. Bewusst nicht conditional auf `WAYLAND_DISPLAY`-Detection gegated — der Aufwand wäre höher als der Nutzen (Env-Var-Set ist 1-Mikrosekunde).
- **ErrorBoundary in `main.tsx` um `<App />`, nicht in `App.tsx`**: damit fängt sie auch Errors beim allerersten App-Mount (z.B. wenn ein Hook beim ersten Render wirft), nicht nur in Sub-Komponenten.
- **`getCurrencySubdivisor`-Helper exportiert statt Map direkt**: vereinheitlicht den Default-100-Fallback. Über-Abstraktion vermieden, weil's ein Einzeiler ist und der Helper-Aufruf gleich aussieht wie die Map-Lookup.
- **KRW als zweistufiger Commit-Set** (Daten-Schicht + Dialog separat): saubere Trennung, jeweils mit grünen Tests. Der User wollte explizit erst (1)+(2), dann (3) — die Trennung war auch reviewbar besser.

### Gotchas / Stolperfallen

- **WebKitGTK-Wayland-DMABUF-Bug ist nur im Release-Build sichtbar**, weil `pnpm tauri dev` die Env-Var implizit setzt (Tauri-CLI hilft, sieht man am Output `WEBKIT_DISABLE_DMABUF_RENDERER=1 tauri dev`). Der `cargo run --release`-Pfad bzw. das installierte Binary nicht. **Lehre: nach jeder größeren Tauri-Änderung Production-Smoke-Test** — der Dev-Modus kann Production-Probleme verbergen.
- **`debtap` mapt Debian-Paketnamen 1:1**: `libgtk-3-0` wird zu `gtk` (existiert auf Arch nicht), nicht zu `gtk3`. Workaround: `--assume-installed gtk=1` beim `pacman -U`. Würde mit CI-Build (`tauri-action`) nicht passieren, weil die signierten Linux-Bundles direkt auf Ubuntu-Runner gebaut werden.
- **Cachyos hat kein `dpkg`, kein `rpm`, kein `fuse2`** standardmäßig — alle drei wären für die nativen Linux-Bundle-Targets nötig. `debtap` aus dem AUR füllt die `.deb`-Lücke. `.AppImage` braucht FUSE2 zum Auspacken (linuxdeploy ist selbst ein AppImage), sonst Bundle-Failure mit unspezifischem „failed to run linuxdeploy".
- **Biome wirft `noUnreachable`-Errors mehrfach**, sobald nach einem `throw` weiterer Code steht — auch wenn die Verifikation gewollt ist (temp-`throw` für Boundary-Test). `// biome-ignore lint/correctness/noUnreachable:` hilft nur lokal an der throw-Zeile; die Folge-Errors auf return-Statement-Zeilen blockieren `pnpm lint`. Lefthook beim Commit ist damit blockiert. Dev-Server (Vite) ignoriert Biome und läuft trotzdem. Pragmatisch: temp-`throw` für Verifikation nicht committen, nach OK rausnehmen.
- **In-App-Updater wartet auf signierte Builds** (Keypair via `pnpm tauri signer generate`, Public-Key in `tauri.conf.json`, Private-Key als GitHub-Secret) plus `latest.json`-Asset bei jedem Release. Ohne stabile signierte Release-Pipeline ist Auto-Update brüchig — daher im Backlog explizit als „ab v0.1.0" markiert.

### Geänderte/neue Memories

- **`feedback_serena`** (auto-memory) um expliziten Pre-Flight-Check verstärkt: vor jedem `Read`/`Edit` explizit fragen „kann ein Serena-Tool das?". Grund: User musste den Hinweis ein zweites Mal geben („verwendest du das tool aktiv?"). Reflex-Problem ist real und nicht durch einmaliges Memory-Schreiben gelöst. Verstärkungs-Datum 2026-06-06 im Memory notiert.
- Keine weiteren Memory-Änderungen.

### Offen / nicht geklärt

- **Tray-Aufpopp-Bug** (Backlog Z. 26) — wahrscheinlich KDE-Plasma-Wayland-spezifisch.
- **Architektur-Diskussions-Punkte ➍/➑** offen.
- **GitHub-Fallow** (Z. 57) noch nicht recherchiert.
- **Untracked `assets/logo2.png`/`logo3.png`** — User-Backup-Material aus den Nano-Banana-Versuchen, kann lokal entfernt werden, stört nichts.
- **AppImage lokal**: wenn der Smoke-Test irgendwann auch `.AppImage` decken soll, müsste `sudo pacman -S fuse2` einmalig laufen. Für jetzt verzichtet, weil CI-Pfad ohnehin der echte Distribution-Weg ist.

---

## 2026-06-06 — Quick-Win: Logo-Hintergrund + Größe gefixt

Folge-Quick-Win zum Dropdown-Fix. Logo hatte das Editor-Schachbrettmuster als Pixel im Bild und war 5,1 MiB groß — beides per Backlog-Item bekannt, war auf User-Re-Export gewartet. **Nachtrag 2026-06-06:** User meldete kurz, das Schachbrettmuster sei auf der GitHub-Page noch sichtbar — war ein Browser-Cache-Issue, nach Browser-Neustart sauber. Logo auf GitHub mit korrekter Transparenz.

### Was passierte

- **Nano-Banana-Re-Export hat nicht geholfen** — User hat zwei neue Versionen runtergeladen (`logo2.png`, `logo3.png`), beide haben das Schachbrett weiterhin als Pixel drin. Das Tool exportiert offenbar das Editor-Transparenz-Pattern systematisch mit, egal was man im Quelltool macht.
- **Lösungswechsel: algorithmisch via ImageMagick**. Schachbrett-Pixel-Sampling ergab `#CCCCCC` (hellgrau) und `~#F7F7F7` (fast-weiß) als die zwei Pattern-Farben. Logo-Farben (Teal `#2c6e7a`-ish und Orange `#e9a06a`-ish) sind weit davon entfernt — algorithmisches Entfernen kann nicht versehentlich Logo-Pixel mitreißen.
- **Befehl**: `magick assets/logo2.png -fuzz 12% -transparent "#cccccc" -fuzz 12% -transparent "#f7f7f7" -resize 1200x -strip /tmp/logo-test.png`. `-strip` entfernt PNG-Metadaten.
- **Ergebnis**: 2752×1536 / 5,1 MiB → 1200×670 / 146 KiB (≈ -97 %). Anti-Aliasing-Kanten am Logo unversehrt (Stichprobe Teal-Rahmen und Münzen-Outline).
- **User hat die saubere Version selbst auf `assets/logo.png` getauscht.**

### Status

- `assets/logo.png` ersetzt (1200×670, RGBA, 146 KiB).
- Backlog-Item "Logo neu exportieren / fixen" als erledigt markiert.
- `assets/logo2.png` und `assets/logo3.png` liegen lokal als untracked Dateien im assets-Ordner herum (User-Backup-Material) — nicht im Repo. Wer aufräumen will, kann sie lokal löschen; sie stören nichts.

### Wichtige Entscheidungen + Begründung

- **Algorithmisch statt User-Tool-Loop**: nach zwei gescheiterten Nano-Banana-Re-Exports wurde klar, dass das Tool das Pattern systematisch mit-rendert. ImageMagick-Pfad war zuverlässiger und reproduzierbar (Befehl im Backlog-Item dokumentiert für später).
- **`-fuzz 12 %`**: hoch genug für die JPEG-ähnlichen Farb-Variationen, die im PNG-Resampling auftraten (z.B. `#CDCBCC` statt exakt `#CCCCCC`); niedrig genug, um Logo-Anti-Aliasing-Pixel nicht zu erwischen.
- **`-resize 1200x` + `-strip`** in einem Schritt: einmaliger Pass spart einen Re-Encode-Roundtrip.

### Gotchas / Stolperfallen

- **AI-Bildgeneratoren wie Nano Banana** exportieren manchmal Editor-Transparenz-Pattern als sichtbare Pixel, weil sie das Bild beim "Flatten" auf einen weißen oder gemusterten Hintergrund komponieren. Wer wirklich Alpha-PNG braucht, muss vor dem Export einen Transparent-Background-Modus aktivieren — bei Nano Banana ist der Pfad dahin offenbar nicht zuverlässig.
- **`fish`-Shell und ImageMagick-Bracket-Syntax**: `magick file.png[1x1+50+50]` muss in fish gequotet werden (`"file.png[1x1+50+50]"`), sonst "no matches found".
- **ImageMagick 7 `magick` vs. 6 `convert`**: aktuelle Distros haben `magick` als Hauptbefehl; `convert` ist Legacy-Alias.

### Offen / nicht geklärt

- Anderer Quick-Wins (Error-Boundary, README-Polish, KRW+Subdivisions, CoverageItem.subscription_id, Backlog-Sweep) weiter offen.

---

## 2026-06-06 — Quick-Win: Dropdown-Lesbarkeit im Dark-Mode gefixt

Kleine Bonus-Runde nach dem ➋-Abschluss. User berichtete, dass die nativen `<select>`-Dropdowns im Dark-Mode unlesbar sind (weiß auf weiß). Quick-Fix.

### Was passierte

- **Erster Versuch**: `select option { color: #f6f6f6; background-color: #2a2a2a; }` im Dark-Mode-Media-Query — wirkungslos. WebKitGTK rendert das `<option>`-Popup als native GTK-Component und ignoriert CSS-Regeln auf `<option>`-Elementen weitgehend.
- **Zweiter Versuch, der gegriffen hat**: `color-scheme: dark` auf `:root` im Dark-Mode-Media-Query. Das ist das standardisierte Signal an den UA, native Form-Controls im dunklen System-Stil zu zeichnen. WebKitGTK respektiert es, der Dropdown ist jetzt dunkel mit hellem Text. Nebeneffekt: auch andere native Controls (Date-Picker-Popups, Scrollbars) sollten konsistent dunkel werden.
- Den nicht-greifenden ersten Versuch nach der Verifikation wieder aus dem Code geworfen — die `color-scheme: dark`-Zeile reicht und ist die idiomatische Lösung.

### Status

- Backlog-Bug "Dropdown-Lesbarkeit im Dark-Mode" als erledigt markiert (2026-06-06).
- Lokale Gates: nur `pnpm lint` lief (rein CSS-Änderung) — clean.

### Wichtige Entscheidungen + Begründung

- **`color-scheme` statt CSS-Override**: standardisierter, schmaler, und löst nebenbei verwandte Probleme (Scrollbars, andere native Controls). CSS-Override auf `<option>` hätte je nach Plattform unterschiedlich gewirkt und wäre brüchig.
- **Den ersten Versuch sauber wieder rausgeworfen** statt als Defense-in-Depth zu behalten: SubTracked ist Tauri-only, also immer WebView-basiert. Eine zweite Stilebene wäre toter Code mit irreführendem Kommentar.

### Gotchas / Stolperfallen

- **WebKitGTK ignoriert `<option>`-CSS** in den allermeisten Fällen. Wer "weiß auf weiß"-Probleme im Dark-Mode hat, sollte als erstes `color-scheme: dark` versuchen, nicht das Option-Styling.
- **Vite-HMR übernimmt CSS-Änderungen sofort** — kein App-Restart nötig zum Verifizieren. Praktisch.

### Offen / nicht geklärt

- Andere Quick-Wins aus dem Backlog (CoverageItem-key, README-Polish, Error-Boundary, KRW+Subdivisions, Backlog-Sweep) weiter offen.

---

## 2026-06-06 — Tagesabschluss

Marathon-Tag 2 in Folge — heute war komplett der Architektur-Strang ➌→➋ dran, beide vollständig erledigt. Detail-Einträge stehen unten, hier nur die Übersicht.

### Heute insgesamt erledigt

| Thema | Commits | HANDOVER-Eintrag |
|---|---|---|
| Architektur ➌ Foundation (sqlx-Pool + 4 Commands) | `fd3ad67`, `8a5bc9c` | "➌ Foundation" |
| Persistenz-Verdacht endgültig erledigt | `7651403` | "Persistenz-Verifikation" (Nachtrag im Foundation-Eintrag) |
| Architektur ➌ Konten-Charge (3 Commands) | `7e05ad5`, `863f1f7` | "➌ Konten-Charge" |
| Architektur ➌ Abschluss + Plugin-Entfernung | `6c67d1d`, `bbe71f7` | "➌ vollständig" |
| Architektur ➋ Reminder-Loop in Rust | (folgt) | hier |

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal Commit-Push folgt |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓, `cargo test` 5/5 ✓ (alle neu in `recurrence.rs`), `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| **Architektur ➊ + ➋ + ➌** | alle drei großen Hands-on-Punkte abgeschlossen |
| `tauri-plugin-sql` | komplett raus |
| Frontend-Reminder-Code | weg (Hook + reminders.ts gelöscht) |

### Nächster Schritt

Die drei „aktiven" Architektur-Punkte sind durch. Im Backlog liegen weiter:

- **🏛️ Architektur ➍–➑** als Diskussions-Material (Komponenten-Testbarkeit, Concerns-Mix in reminders [jetzt nach Rust verlagert, also obsolet?], Reload-Pattern, Error-Boundary, i18n, Dokumentations-Strategie).
- **🚀 Distribution & Setup**: Installer-Build, v0.1.0-Tag, README-Polish, README-Philosophie umformulieren, Logo neu exportieren.
- **🐛 Dropdown-Bug Dark-Mode** als Quick-Fix bei Gelegenheit.

Sinnvolle Reihenfolge für die nächste Session: **Installer-Build**, weil er drei Sachen auf einmal klärt — App ist nicht mehr nur dev-only, Tray/Autostart-Verhalten unter echter Installation, und der frühere Persistenz-Verdacht ist damit endgültig nachverfolgt im echten Build-Pfad. Plus: macht es psychologisch zum ersten "richtigen" Release-Kandidaten.

### Wichtige Erkenntnisse (Tages-Summe)

- **Reihenfolge-Tausch auf ➊→➌→➋** war die richtige Entscheidung. ➋ allein hätte einen Zweit-Pool gebraucht (Concurrency-Risiko) oder hätte ➌ vorweggenommen. So fiel ➋ am Ende des Tages zum Tagesausflug aus (ca. 2 Std mit Tests + Cleanup).
- **Manuelle Type-Spiegelung statt `tauri-specta`** hat für die neun Commands plus die Reminder-Logik problemlos gereicht. Kein Drift, kein Tests-Setup-Overhead. Wenn das Projekt auf 30+ Commands oder ein wachsendes Backend kommt, kann specta nachgerüstet werden.
- **Migrations-State-Tabelle ist plugin-übergreifend** (`_sqlx_migrations`): `tauri-plugin-sql` und `sqlx::migrate!` teilen sie sich nahtlos, weil das Plugin intern auch sqlx nutzt. Das machte den Plugin-Übergang risikofrei.
- **FK-Constraints, die "still" im Schema schlafen**, können plötzlich aktiv werden, wenn der DB-Treiber wechselt — siehe das `delete_subscription`-Bug-Symbiose-Moment am Vormittag. Lehre: Schema-Constraints sind ein versteckter Vertrag, der erst im Treiber-Wechsel sichtbar wird.
- **Doppelte Recurrence-Wahrheit** (TS + Rust) ist eine bewusste Akzeptanz: `recurrence.ts` bleibt fürs Frontend (Kontodeckungs-Ansicht), `recurrence.rs` für den Rust-Reminder. Beide Test-Suites halten die Drift-Sicherheit; die Logik selbst ändert sich konzeptionell nie wieder.

### Geänderte/neue Memories

- **Serena `tech_stack`** im Laufe des Tages zweimal aktualisiert: nach ➌-Abschluss (DB-Block + Rust-Architektur-Section), nach ➋-Abschluss (chrono + tokio + recurrence/reminders).

### Offen / nicht geklärt

- Architektur-Punkte ➍–➑ — vermutlich zum Teil obsolet durch heute, zum Teil weiter relevant.
- Distribution-Items.
- Quick-Fix Dropdown.
- Logo-Re-Export wartet auf User mit Quelltool.

---

## 2026-06-06 — Architektur ➋: Reminder-Loop im Rust-Hauptprozess

Letzte Architektur-Etappe des Tages. Nach dem ➌-Abschluss war ➋ wie versprochen ein Tagesausflug.

### Was passierte

- **Neue Cargo-Deps**: `chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }` für Date-Math; `tokio = { version = "1", features = ["time"] }` für den Sleep-Loop.
- **`src-tauri/src/recurrence.rs`** (neu): `months_per_interval(&str) -> Result<u32, String>` und `next_due_date(anchor: NaiveDate, interval: &str, from: NaiveDate) -> Result<NaiveDate, String>`. Anker-additive Logik via `NaiveDate::checked_add_months(Months::new(k * step))`. Plus `#[cfg(test)]`-Block mit fünf Tests:
  - `months_mapping`: Mapping monthly/quarterly/yearly/Fehler.
  - **`anker_additive_drift_31`**: der zentrale Sicherheitsbeweis — Anker 31.01.2025, sechs Folgeschritte, alle korrekt (28./31./30./31./30./31. statt naiv iterativer 28er-Drift).
  - `quarterly_step` und `yearly_step_leap` (Schaltjahr 29.02. → 28.02.).
  - `unbekanntes_interval`: Fehlerpfad.
- **`src-tauri/src/reminders.rs`** (neu): `pub async fn run_reminder_check(pool: &SqlitePool, app: &AppHandle) -> Result<u32, String>`. Genaue Pendant zur TS-Version:
  - Permission-Check via `app.notification().permission_state() == PermissionState::Granted`.
  - `Local::now().date_naive()` als heute.
  - SELECT aktiver Subs (nutzt `crate::db::Subscription`).
  - Pro Sub: Skip wenn `!sub.notify`, parse `anchor_date` (Format `%Y-%m-%d`), `next_due_date`, `remind_from = due - Duration::days(lead_days)`, Skip wenn `today < remind_from`.
  - `INSERT OR IGNORE INTO reminders` (idempotent); wenn rows_affected = 0, Skip Notification.
  - Sonst: `app.notification().builder().title(...).body(...).show()`. Title `"<name> fällig"`, Body `"<dd.MM.yyyy>: <amount>.<cents> <currency>. Konto rechtzeitig decken."` — wortwörtlich wie die alte TS-Version.
- **`src-tauri/src/lib.rs`** angepasst: zwei neue `mod`-Statements, `REMINDER_INTERVAL` als Konstante (1h), und im Setup-Block ein `tauri::async_runtime::spawn` mit:
  ```
  loop {
      if let Err(e) = reminders::run_reminder_check(&pool_for_loop, &app_handle).await {
          eprintln!("Reminder-Check fehlgeschlagen: {e}");
      }
      tokio::time::sleep(REMINDER_INTERVAL).await;
  }
  ```
  Initial-Check ist der erste Loop-Durchlauf, dann sleep, dann nächster Check.
- **Frontend-Cleanup**:
  - `src/App.tsx`: Import + `useReminderLoop()`-Aufruf raus.
  - `src/hooks/useReminderLoop.ts` gelöscht.
  - `src/lib/reminders.ts` gelöscht.
  - `src/lib/recurrence.ts` bleibt, weil `coverage.ts` (Kontodeckungs-Ansicht) `dueDatesWithin` weiter nutzt.
- **User-Verifikation**: App startet sauber, keine Console-Errors, normales CRUD-Verhalten unverändert. Notification-Pfad nicht direkt provoziert, aber die Idempotenz und der initiale Tick im Spawn sind beim App-Start abgespielt worden — wenn ein neues fälliges Abo angelegt wird, wird beim nächsten Tick (≤ 1h später) eine Notification kommen.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Working tree | clean nach Commit |
| Build/Tests lokal | wie oben in der Tages-Übersicht |
| **Architektur ➋** | abgeschlossen ✅ |
| Reminder-Pfad | komplett im Rust-Hauptprozess, kein Webview-Pause-Problem mehr |

### Wichtige Entscheidungen + Begründung

- **`chrono` mit `default-features = false` + `clock` + `std`**: schmalere Build-Footprint als die Default-Features (kein `wasmbind`, kein `serde`, das wir nicht brauchen). `clock` für `Local::now()`, `std` für die Standard-Operatoren.
- **`tokio::time::sleep` statt `tokio::time::interval`**: einfacher zu lesen, "Drift" um die Compute-Zeit der `run_reminder_check` ist bei stündlichem Tick vernachlässigbar. `interval` würde verlangen, einen ersten `interval.tick().await` zu skippen, was Boilerplate ist ohne klaren Gewinn.
- **`recurrence.ts` im Frontend NICHT gelöscht**: `coverage.ts` braucht weiter `dueDatesWithin` für die Kontodeckungs-Ansicht. Eine spätere Session könnte auch die Coverage-Logik nach Rust ziehen, aber:
  - `coverage.ts` ist pure Frontend-Logik mit Tests, kein klarer Architektur-Treiber.
  - Doppelte `recurrence`-Wahrheit (TS + Rust) ist klein und drift-stabil (Anker-additiv ist einfach), beide haben Test-Suiten.
- **`crate::db::Subscription` in `run_reminder_check` wiederverwendet** statt eigenem `SubMinimal`-Struct: weniger Code-Duplikation, kostet ein paar überflüssig gelesene Bytes pro Sub. Pragmatisch.
- **Notification-Body in deutscher Sprache hardcoded** wie in der TS-Version (`"Konto rechtzeitig decken."`): einheitlich zur UI-Sprache (Memory `mem:conventions` verlangt deutsche UI-Texte). i18n-Refactor kommt eines Tages, wir würden hier auch ein t() einbauen müssen — Folge-Item.
- **`REMINDER_INTERVAL` als Modul-Konstante** statt Tauri-Setting oder UI-konfigurierbar: 1h ist konservativ genug für jede Notification-zentrale App, gleichzeitig schnell genug für Stunden-Test (User kann eine Stunde warten und schauen). Wenn jemand das überhaupt jemals tunen will, eine Zeile.

### Gotchas / Stolperfallen

- **`NaiveDate::checked_add_months(Months::new(n))`** klemmt automatisch auf den letzten gültigen Tag des Folgemonats — identisches Verhalten wie `date-fns::addMonths`. Glücklicher Default; hätte man eine Library erwischt, die das nicht macht, wäre die ganze Drift-Logik manuell.
- **`tokio::time::sleep` braucht `tokio = { features = ["time"] }`**: das Default-Tokio (auf das sqlx mitkommt) hat das Feature nicht zwingend aktiviert. Explizit hinzufügen.
- **`pool.clone()` für AppState UND Spawn**: SqlitePool ist Arc-based, also Clone billig. Aber: wer den Pool nur in einer der beiden Stellen nutzt und das `clone()` vergisst, kriegt Move-Error.
- **Cargo-Fmt bricht Asserts in Tests vertikal um**, sobald sie über lineWidth liegen. Hat zwei Sessions in Folge die Test-Dateien aufgeblasen. Lesbar bleibt's, aber Code-Volume +30%.
- **Rust-Build nach Cargo.toml-Änderung**: `pnpm tauri dev` ist trotz aller Caches noch ~3,5 s — sehr schnell, weil chrono und tokio kleine Crates sind im Vergleich zu Tauri/Wry.

### Geänderte/neue Memories

- **Serena `tech_stack`** finale Update nach ➋: chrono + tokio als Deps, `cargo test` als zusätzlicher Test-Runner, Rust-Architektur-Section um `recurrence.rs` und `reminders.rs` erweitert, Reminder-Scheduler-Spawn in der `lib.rs`-Beschreibung.

### Offen / nicht geklärt

- Concerns-Mix-Item im Backlog (Architektur ➎): war ursprünglich für `reminders.ts` formuliert, aber `reminders.ts` ist jetzt weg und der Rust-`run_reminder_check` ist sauberer strukturiert (DB-Read → Logik-Pass → Side-Effects sind aber weiterhin in einer Funktion vermischt). Das Item kann beim nächsten Backlog-Sweep neu bewertet werden.
- Architektur-Punkte ➍, ➏, ➐, ➑ unverändert offen.
- Distribution + Quick-Fixes wie gehabt.

---

## 2026-06-06 — Architektur ➌ vollständig: letzte zwei Commands + Plugin-Entfernung (12/12)

Letzte Charge — `update_subscription` und `insert_reminder_if_new` portiert, dann `tauri-plugin-sql` aus dem ganzen Projekt entfernt. Damit ist Architektur-Punkt ➌ abgeschlossen.

### Was passierte

- **Zwei neue Tauri-Commands** in `src-tauri/src/commands.rs`:
  - `update_subscription(state, sub: Subscription) -> ()` — UPDATE-Statement mit allen neun Feldern; `Subscription` als kompletter Input inkl. `id`.
  - `insert_reminder_if_new(state, subscription_id: i64, due_date: String) -> bool` — `INSERT OR IGNORE` (die UNIQUE-Index-Idempotenz aus dem Schema), Rückgabe `res.rows_affected() > 0`.
- **Plugin komplett entfernt**:
  - `src/lib/db.ts`: `Database`-Import + `getDb`/`_db`-Singleton raus, alle Funktionen sind jetzt schlanke `invoke<T>(...)`-Wrapper. `parseInterval`/`narrowSub`/`SubFromRust` bleiben für das `interval`-Narrowing.
  - `src-tauri/capabilities/default.json`: `"sql:default"` und `"sql:allow-execute"` aus der Permissions-Liste raus (nur noch `core:default` + `notification:default`).
  - `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_sql::Builder::default().build())` raus.
  - `src-tauri/Cargo.toml`: `tauri-plugin-sql`-Dep raus.
  - `package.json`: `@tauri-apps/plugin-sql` via `pnpm remove` raus, `pnpm-lock.yaml` mit ge-updatet.
- **`tech_stack`-Memory aktualisiert** (Serena): DB-Block beschreibt jetzt den eigenen sqlx-Pool, neuer Abschnitt "Rust-Architektur" mit den drei Dateien (`lib.rs` / `db.rs` / `commands.rs`), SQLite-Pfad-Beschreibung adjusted (Pool öffnet direkt via `app_config_dir`), Opener-Util-Lasch-Erwähnung aus dem Memory entfernt (war seit gestern Mikro-Cleanup veraltet).
- **PoC-Verifikation vom User**: Bearbeiten eines Abos funktioniert, App läuft ohne Fehler-Banner — Reminder-Pfad nicht direkt provoziert, aber implizit OK durch normalen App-Lauf.
- **Bundle Status**: `pnpm build` wurde nicht erneut gemessen für diese Charge (die letzten Messungen vom heutigen Start: 290,64 KB JS). `@tauri-apps/plugin-sql` als Frontend-Dep weg sollte das Bundle nochmal kleiner machen; messen wir bei nächstem `pnpm build`-Anlass.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal Commit-Push folgt |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm exec tsc --noEmit` ✓, `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ (nach Auto-Format einer zu langen Zeile in `insert_reminder_if_new`) |
| **Architektur ➌** | **12/12 abgeschlossen** ✅ |
| `tauri-plugin-sql` | komplett raus (Crate + Frontend-Paket + Capability + Plugin-Init) |

### Nächster Schritt

**Architektur ➋ (Reminder-Loop in Rust)** — der versprochene Tagesausflug. Plan-Skelett:

- `tokio::spawn`-Task im Setup-Block von `lib.rs`, der z.B. minütlich tickt (Default-Interval einfach konfigurierbar lassen).
- Reminder-Logik aus `src/lib/reminders.ts` portieren: DB-Query auf fällige Subs → Due-Berechnung mit `recurrence`-Logik → Notification senden via `tauri::AppHandle::notification()` → `INSERT OR IGNORE INTO reminders` (idempotent dank UNIQUE-Index).
- Frontend-Hook `useReminderLoop` entfernen (samt JSDoc-Verweis auf ➋ — der ist eingehalten).
- App-Start-Trigger (`runReminderCheck()` in `App.tsx`) ebenfalls weg, weil der Rust-Task das beim Hochfahren erledigt.

`recurrence.ts` darf logisch im Frontend bleiben (es ist pure Logik mit 11 grünen Tests in `recurrence.test.ts`). Eine sauberere Variante wäre, die `nextDueDate`-Logik nach Rust zu spiegeln — aber: die Tests sind unser Sicherheitsnetz gegen die anker-additive Drift-Falle und liegen im TS-Test-Setup. Pragmatisch zunächst: `recurrence`-Pendant in Rust schreiben, JS-Variante (und Tests) zur Sicherheit behalten als doppelter Wahrheitsbeweis. Drift-Risiko ist minimal, weil die Logik einmal geschrieben und nie wieder angefasst werden sollte.

Alternative Pause-Wechsel statt ➋: Installer-Build, Dropdown-Bug, README-Polish.

### Wichtige Entscheidungen + Begründung

- **`update_subscription` nimmt komplette `Subscription` statt nur die ge-änderten Felder**: einfache Semantik, kein Patch-Diff-Tracking nötig. Bei neun Feldern verkraftbar.
- **`insert_reminder_if_new` mit zwei separaten Parametern statt einem `NewReminder`-Struct**: nur zwei Felder, kein semantischer Mehrwert in einem extra Struct. Symmetrie zu `add_account` (auch 2 Params).
- **`getDb` ersatzlos gestrichen**: die Funktion war ein Singleton-Cache für die Plugin-`Database`-Instanz. Ohne Plugin: kein State mehr im Frontend nötig, jeder `invoke`-Call ist self-contained. **Schöner Lieferantenmoment** — eine ganze Abstraktion fällt weg, weil die Architektur dahin gewachsen ist.
- **`capabilities/default.json` direkt mit angepasst**: `sql:*`-Permissions in der Capability sind ohne Plugin sinnlos — beim nächsten `pnpm tauri build` würde Tauri vermutlich warnen oder sogar failen. Gleich aufgeräumt.
- **`tech_stack`-Memory inline aktualisiert** statt zu warten: die Foundation-Session-Notiz "Memory-Update wartet auf ➌-Abschluss" wird jetzt eingelöst. Künftige Sessions sehen den korrekten Stack.

### Gotchas / Stolperfallen

- **Cargo-Build dauerte 55 s** statt der gewohnten 9 s — weil das Entfernen von `tauri-plugin-sql` als Dependency die Tauri-Plugin-Tree-Struktur veränderte und Tauri + Wry + viele GTK-Crates neu gebaut wurden. Bei größeren Dep-Tree-Änderungen ist das normal. Wer nachher denkt "was, schon wieder langsam?" — das ist Cache-Invalidierung, nicht Code-Bug.
- **Cargo fmt hat eine zu lange Zeile** in `insert_reminder_if_new` automatisch umgebrochen (`let res =` auf eigene Zeile, dann die `sqlx::query`-Kette eingerückt). Lefthook fängt das beim Commit; lokal vorher `cargo fmt` laufen lassen spart Reibung.
- **`Subscription` als Input in `update_subscription`** akzeptiert auch Felder mit ungültigen Werten wie `interval = "foobar"` — die DB-CHECK-Constraint fängt das, aber der User-facing Fehler ist hässlich. Frontend-Typ `Interval` als Union ist die erste Verteidigungslinie; Rust-Defense-in-Depth wäre `interval: Interval` als Rust-Enum mit `#[serde(rename_all = "lowercase")]`. Heute nicht gemacht, weil's keinen aktiven Bug gibt — Backlog-Item für ➍/Aufräumphase.
- **`Database.load("sqlite:subtracker.db")`** brauchte das `sqlite:`-Prefix für das Plugin. Unser Pool nutzt `sqlite://` (mit Slashes) als URI für `SqliteConnectOptions::from_str`. Wichtiger Unterschied — wer im git-Log alte Snippets kopiert, baut sich einen Verbindungsfehler.

### Geänderte/neue Memories

- **`tech_stack`-Memory** (Serena) aktualisiert: DB-Block, neuer Rust-Architektur-Abschnitt, SQLite-Pfad-Block-Adjustment, Opener-Util-Erwähnung entfernt.
- Keine neuen Auto-Memories.

### Offen / nicht geklärt

- Architektur ➋ (Reminder-Loop in Rust) als nächste Hands-on-Etappe.
- Restliche Architektur-Punkte ➍–➑ als Diskussions-Material im Backlog.
- Bundle-Size-Messung beim nächsten `pnpm build`-Anlass (eine kleine Reduktion ist zu erwarten).

---

## 2026-06-06 — Architektur ➌ Konten-Charge: drei weitere Commands portiert (7/12)

Direkt im Anschluss an die Foundation-Session — Momentum genutzt, um den Konten-Pfad in einem Rutsch nach Rust zu ziehen. Keine neuen Entscheidungen, einfach das etablierte Muster auf die nächsten drei Calls angewandt.

### Was passierte

- **Drei neue Tauri-Commands** in `src-tauri/src/commands.rs`:
  - `add_account(state, name: String, note: Option<String>) -> i64` — INSERT, gibt `last_insert_rowid` zurück.
  - `delete_account(state, id: i64) -> ()` — plain DELETE. FK-Bedacht: `subscriptions.account_id` referenziert `accounts(id)`. Bewusst **keine** Application-Logik-Kaskade (im Gegensatz zu `delete_subscription`), weil die UI vor dem Delete `countSubsForAccount` als Soft-Check nutzt und den Benutzer zu Tat-Anpassungen zwingt. Wenn jemand das umgeht, wirft der DB-FK eine etwas hässliche, aber sachlich korrekte Defense-in-Depth-Meldung.
  - `count_subs_for_account(state, account_id: i64) -> i64` — `SELECT COUNT(*) FROM subscriptions WHERE account_id = ?`, via `query_as::<_, (i64,)>` als Tuple destructured.
- **`src-tauri/src/lib.rs`**: drei neue Commands im `generate_handler!`-Macro registriert.
- **`src/lib/db.ts`**: drei Funktionen auf `invoke` umgestellt:
  - `addAccount(name, note)` → `invoke("add_account", { name, note: note ?? null })` — explizites `null` für die `note?`-Variante, weil `undefined` über die JSON-Bridge zu fehlendem Feld wird und Rust dann `Option<String>::None` korrekt nimmt; explizites `null` ist aber dokumentierender und symmetrisch zur Schreibweise im Rest der Codebase.
  - `deleteAccount(id)` → `invoke("delete_account", { id })`.
  - `countSubsForAccount(accountId)` → `invoke("count_subs_for_account", { accountId })` — camelCase-Key wegen `#[tauri::command(rename_all = "camelCase")]`.
- **PoC vom User verifiziert**: Konto anlegen, Konto ohne Subs löschen, Konto mit Subs löschen versuchen (Soft-Check blockt) — alle drei Pfade OK.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal Commit-Push folgt |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓ (implizit über Lefthook), `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓, `pnpm exec tsc --noEmit` ✓ |
| **Architektur ➌** | **7 von 12 Calls portiert** (58%) |

### Nächster Schritt

Verbleibender Rest auf `tauri-plugin-sql`:

- `updateSubscription` — analog zu `add_subscription`, aber mit `WHERE id = ?`.
- `insertReminderIfNew` — der `INSERT OR IGNORE`-Pfad. Klein, weil die Idempotenz im SQL liegt (UNIQUE(subscription_id, due_date)).
- `getDb`, `parseInterval`, `narrowSub`, `SubFromRust` — Helper. `getDb` wird obsolet sobald alle Frontend-Calls portiert sind, der Rest bleibt für das `interval`-Narrowing relevant.

Eine letzte Mini-Session schließt ➌ ab, dann komplettes Entfernen von `@tauri-apps/plugin-sql` aus dem Frontend und der `tauri-plugin-sql`-Crate aus `Cargo.toml`. Anschließend `tech_stack`-Memory aktualisieren und ➋ angehen.

### Wichtige Entscheidungen + Begründung

- **`delete_account` *ohne* Application-Logik-Kaskade**: bewusst andere Entscheidung als bei `delete_subscription`. Begründung: bei Subscriptions sind die Reminders ein reines Implementierungs-Detail (Idempotenz-Tracking), die der User nicht "selbst aufräumt". Bei Accounts dagegen sind die zugeordneten Subscriptions echte User-Daten, die der User aktiv migrieren/umordnen muss. Kaskade wäre Datenverlust; Soft-Check + harter FK-Schutz im DB-Layer ist die richtige Semantik.
- **`add_account` mit zwei separaten Parametern statt einem `NewAccount`-Struct**: weil's nur zwei sind und `note` als `Option` natürlich passt. Bei `add_subscription` waren es neun Felder — da rechtfertigte ein Struct den Aufwand. Pragmatisch.
- **`count_subs_for_account` via Tuple-Destructuring**: `query_as::<_, (i64,)>` ist schlanker als ein eigener `Count`-Struct. `let (n,): (i64,) = ...` ist idiomatisch sqlx.
- **Note-Feld als `note: note ?? null` ans invoke**: `undefined` würde in JSON zu fehlendem Feld → Rust kriegt `None`. Funktioniert auch. Aber `null` ist expliziter und macht's beim Lesen der Frontend-Logik klarer.

### Gotchas / Stolperfallen

- **Cargo-Aufruf aus Repo-Root wieder vergessen**: zweites Mal heute, dass `cargo clippy` / `cargo fmt` aus `/home/legr/SubTracked` lief und "could not find Cargo.toml" failed. **Lerne ich aus dem Schmerz** — sollte mir das endlich angewöhnen.
- **`Option<String>` in Tauri-Command-Parametern**: wenn JS `null` schickt, kriegt Rust `None`; wenn JS das Feld weglässt, auch `None`. Konsistent und vorhersagbar. Falls man eine echte "wurde nicht gesetzt vs. wurde gesetzt aber leer"-Unterscheidung bräuchte, müsste man auf `Option<Option<String>>` mit `#[serde(default, deserialize_with = "...")]` ausweichen — nicht hier nötig.

### Geänderte/neue Memories

- Keine Änderung. `tech_stack`-Update wartet weiter auf ➌-Abschluss.

### Offen / nicht geklärt

- 5 verbleibende Helper/Funktionen in db.ts (siehe "Nächster Schritt").
- Komplettes Entfernen von `@tauri-apps/plugin-sql` und `tauri-plugin-sql`-Crate, sobald alle Calls portiert sind.
- `tech_stack`-Memory-Update wartet weiter auf ➌-Abschluss.
- Architektur ➋ (Reminder in Rust) wartet auf ➌-Abschluss.

---

## 2026-06-06 — Architektur ➌ Foundation: eigener Rust-DB-Pool + erste vier Tauri-Commands

Erster Hands-on-Schritt der ➌-Etappe. Reihenfolge wurde vor Hands-on auf **➊→➌→➋** getauscht (statt ➊→➋→➌) — Diskussion mit konkreten Aufwand-Zahlen unten.

### Was passierte

- **Architektur-Diskussion ➋ vs ➌** geführt mit Belegen aus dem Code (db.ts: 12 DB-Funktionen, lib.rs: 78 Zeilen reines Setup ohne `#[tauri::command]`). Ergebnis: Reihenfolge tauschen auf ➊→➌→➋. ➋ allein würde einen zweiten Rust-DB-Pool neben `tauri-plugin-sql` brauchen (Concurrency-Risiko mit `SQLITE_BUSY` unter Last, doppelte Migration-Verantwortung) und der dann später unter ➌ wieder fliegt → Code für die Tonne. Mit ➌ zuerst wird die ganze DB-Schicht entkoppelt, ➋ wird zum Tagesausflug. Backlog-Architektur-Sektion aktualisiert.
- **Drei Vorab-Entscheidungen geführt und beschlossen**:
  1. **`tauri-plugin-sql` behalten oder rauswerfen?** Heute behalten als JS-DB-API-Compat-Shim für die noch nicht portierten Calls; Migrations-Konfiguration aber abgehängt (statt `Builder::new().add_migrations(...)` jetzt `Builder::default().build()`). Migrations laufen ab heute via `sqlx::migrate!("./migrations")`.
  2. **Type-Sync Rust↔TS** — entgegen meiner ersten Empfehlung **manuelle Spiegelung** statt `tauri-specta`. Begründung: Setup-Reibung in dieser Foundation-Session vermeiden. Wenn Drift-Schmerz real wird (vermutlich ab 6+ Commands), specta nachträglich ergänzen. Frontend nutzt die existierende `parseInterval`-Logik zum Narrowen von `interval: string` (Rust) auf `Interval` (TS-Union).
  3. **Tagesziel** — Foundation + 3–4 Commands als End-to-End-PoC, nicht alle 12.
- **Cargo-Deps**: `sqlx = "0.9.0"` mit `default-features = false` und `features = ["runtime-tokio", "sqlite", "macros", "migrate"]`. Auto-Install brachte sqlx-core, sqlx-sqlite, sqlx-macros und die typischen Cryptographie- + Hash-Crates mit (Cargo.lock +448 Zeilen).
- **`src-tauri/src/db.rs` neu**: `pub struct AppState { pub db: SqlitePool }`, plus drei `#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]`-Structs mit `#[serde(rename_all = "camelCase")]`: `Subscription`, `Account`, `NewSubscription` (für `add_subscription`-Body, mit `Option<bool>` für `active`/`notify`).
- **`src-tauri/src/commands.rs` neu**: vier `#[tauri::command(rename_all = "camelCase")]`-Funktionen, alle async:
  - `list_subscriptions(state, only_active: Option<bool>)` — Vec<Subscription>, ORDER BY name
  - `list_accounts(state)` — Vec<Account>
  - `add_subscription(state, sub: NewSubscription)` — i64 (last_insert_rowid)
  - `delete_subscription(state, id: i64)` — Transaktional: DELETE FROM reminders WHERE subscription_id = ? → DELETE FROM subscriptions WHERE id = ? → COMMIT. **Fix für den heute aufgetauchten FK-Bug** (Detail unter Gotchas).
- **`src-tauri/src/lib.rs` angepasst**: `tauri_plugin_sql::Builder::default().build()` (ohne Migrations), `.invoke_handler(generate_handler![...])` registriert die vier Commands, Setup-Block öffnet den `SqlitePool` via `app_config_dir() + "subtracker.db"` (gleicher Pfad wie das Plugin → Plugin und unser Pool teilen die Datei), `journal_mode = Wal`, `create_if_missing = true`, anschließend `sqlx::migrate!("./migrations").run(&pool).await`, dann `app.manage(AppState { db: pool })`. Sync-Wrap via `tauri::async_runtime::block_on`.
- **`src/lib/db.ts` umgestellt**: `listAccounts`, `listSubscriptions`, `addSubscription`, `deleteSubscription` rufen jetzt `invoke<T>(...)` aus `@tauri-apps/api/core`. `SubRow` und `mapSub` (alte snake_case → camelCase + 0/1 → bool-Konvertierung) wurden entfernt — kommt jetzt direkt typkonform aus Rust dank `#[serde(rename_all = "camelCase")]`. Neuer `narrowSub`-Helper für das `interval`-Narrowing. Die anderen acht Funktionen (`addAccount`, `deleteAccount`, `countSubsForAccount`, `updateSubscription`, `insertReminderIfNew`, plus `getDb`) bleiben unverändert auf `tauri-plugin-sql`.
- **PoC verifiziert mit dem User**: Abos lesen, Konten lesen, neues Abo anlegen, bestehendes Abo löschen (nach FK-Fix) — alles funktioniert.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt nach Commit) |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓, `pnpm build` ✓ (290,64 KB JS, -0,6 KB durch Mapping-Entfernung), `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| App-UI | Smoke-Test durch User OK — CRUD für Abos läuft End-to-End über die neue Rust-Schicht |
| **Architektur ➌** | **4 von 12 Calls portiert** (33%), Foundation steht |

### Nächster Schritt

**Restliche 8 Frontend-Calls auf invoke umstellen** (eigene Mini-Session pro 2–3 Calls realistisch, oder eine größere Session für alle 8):

- **Schreib-Pfade**: `updateSubscription`, `addAccount`, `deleteAccount` (auch hier vermutlich FK-Bedacht — `subscriptions.account_id` hat FK ohne CASCADE; `countSubsForAccount` ist schon der Soft-Check, der das verhindern soll, aber portieren wir das sauber zusammen mit `deleteAccount`).
- **Reminder-Pfad**: `insertReminderIfNew` als Command — kleiner als gedacht, weil die Idempotenz im SQL liegt (`INSERT OR IGNORE` + UNIQUE-Index).
- Wenn alle Frontend-Calls portiert sind: `getDb` + `@tauri-apps/plugin-sql`-Import aus `db.ts` entfernen, dann `@tauri-apps/plugin-sql` aus `package.json` raus. `tauri-plugin-sql` aus `Cargo.toml` kann dann auch fliegen, weil Migrations bei uns laufen.
- Erst **danach** sinnvoll: **Architektur ➋** (Reminder-Loop in Rust). Plan unverändert.

### Wichtige Entscheidungen + Begründung

- **Reihenfolge ➊→➌→➋ statt ➊→➋→➌**: oben unter "Was passierte" mit den konkreten Aufwand-Zahlen begründet. Hauptpunkt: ➋ allein wäre Brücken-Code, der ➌ wieder überholt.
- **`tauri-plugin-sql` bleibt vorerst drin, aber ohne Migrations-Konfiguration**: Übergangs-Kompromiss. Würden wir's heute komplett rauswerfen, müssten wir alle 12 Calls in einer Session portieren — riskant für eine Foundation-Session, wenn Edge-Cases auftauchen (siehe Gotchas: der FK-Bug ist genau so einer). So bleibt der Code lauffähig nach jedem Schritt.
- **Migrations bei uns via `sqlx::migrate!`** statt beim Plugin: erzwingt deterministische Reihenfolge (unser Setup läuft vor dem ersten Frontend-`Database.load()`). Schöner Nebeneffekt: `tauri-plugin-sql` nutzt intern dieselbe sqlx-Migrations-Tabelle (`_sqlx_migrations`), also würden Plugin-Migrations bei einem Frontend-`Database.load()` einfach "0 to run" sehen — kein Konflikt. Hatten wir vorab als Glücksfall identifiziert.
- **Manuelle Type-Spiegelung statt `tauri-specta`**: Entscheidung gegen meine erste Empfehlung. Begründung: für 12 Calls und 3 Typen ist der Drift-Schmerz überschaubar; `tauri-specta`-Setup hat eigene Reibung (RC-Versionen, build.rs, Output-Pfad) und hätte die Foundation-Session zerstreut. Wenn Drift sich beim Portieren der nächsten 8 Calls als Schmerz erweist, ergänzen wir specta nachträglich.
- **`#[tauri::command(rename_all = "camelCase")]` explizit** auf jedem Command, statt auf den Default zu vertrauen: Tauri-2-Default ist unsicher in Erinnerung (snake_case auf JS-Seite? camelCase?). Mit explizitem `rename_all` ist die JS-API deterministisch camelCase — passt zum Rest der Frontend-Konvention.
- **`delete_subscription` als Transaktion**: zwei DELETE-Statements müssen atomar sein. Wenn der zweite DELETE failt, sollen die Reminders nicht weg sein. `state.db.begin()` + `tx.commit()` ist das idiomatische sqlx-Muster.
- **`SqliteConnectOptions::from_str` + `create_if_missing(true)`** beim Pool-Setup statt einfach `SqlitePool::connect(url)`: Wir wollen explizite Kontrolle über `journal_mode = Wal` und `create_if_missing`. Letzteres ist wichtig, weil die DB-Datei bei ganz frischer Installation noch nicht existiert — ohne dieses Flag failt `SqlitePool::connect_with` mit "unable to open database file".
- **PoC mit `delete_subscription` als 4. Command**: ursprünglich nur 3 Commands geplant. Der FK-Bug beim User-Test machte das Portieren des 4. zwingend, weil eine zweistufige DELETE-Transaktion über `tauri-plugin-sql`'s JS-API umständlich gewesen wäre (kein offensichtlicher Transaction-Wrapper auf der JS-Seite des Plugins). Symbiose: Bug-Fix und nächster Architektur-Schritt fallen zusammen.

### Gotchas / Stolperfallen

- **FK-Constraint-Bug beim Löschen** war heute der wichtigste Lehr-Moment. Symptom beim User-Test: `Fehler: error returned from database: (code: 787) FOREIGN KEY constraint failed`. Ursache: `reminders.subscription_id` referenziert `subscriptions(id)` ohne `ON DELETE CASCADE`. Bei aktiven FKs blockt SQLite den DELETE auf `subscriptions`. **Warum es vorher nie aufgetreten ist**, ist nicht eindeutig — wahrscheinlich entweder (a) der frühere `tauri-plugin-sql`-Pool hatte FKs nicht enforced (Plugin-Config-Default unklar) oder (b) der User hatte bisher noch nie ein Abo mit existierenden Reminders gelöscht. Unter unserem neuen sqlx-Pool sind FKs offenbar enforced (sqlx-sqlite-Default? `SqliteConnectOptions::foreign_keys(true)` ist Default). Fix oben dokumentiert. Lehre: **Schema-Constraints, die "still" da liegen, können plötzlich aktiv werden, wenn der DB-Treiber wechselt** — und nichts ist hinterlistiger als ein FK, der im Schema deklariert ist, aber zur Laufzeit nie greift.
- **`ON DELETE CASCADE` im Schema wäre die eigentlich saubere Lösung**, aber unter `sqlx::migrate!` ein Krampf: sqlx wickelt Migrations in eine Transaction, und SQLite ignoriert `PRAGMA foreign_keys=OFF/ON` innerhalb einer Transaction (no-op). Der kanonische "12-step procedure" für FK-Änderungen (CREATE neue Tabelle, INSERT-SELECT, DROP alte, RENAME neue, mit ausgeschalteten FKs) ist damit nicht trivial machbar. Pragmatische Lösung in Application-Logik ist im SubTracked-Kontext OK.
- **Tauri-2 Parameter-Konvention für `invoke`-Commands ist verwirrend**: ohne `#[tauri::command(rename_all = "camelCase")]` ist nicht deterministisch, ob `only_active` (Rust) im JS-`invoke({...})`-Objekt als `only_active` oder `onlyActive` erwartet wird. Lehre: **explizit annotieren** spart Debug-Zeit.
- **`tauri::async_runtime::block_on` im Setup-Block**: das `setup`-Callback ist sync, async-Init braucht `block_on`. Tauri 2 bringt einen tokio-Runtime intern, deshalb funktioniert das ohne weiteres tokio-Setup-Boilerplate.
- **Bash `cd src-tauri && cargo ...` aus dem Repo-Root**: zwei der parallelen cargo-Calls liefen aus dem Root und failten mit "could not find Cargo.toml" — `cd src-tauri && ...` oder `--manifest-path src-tauri/Cargo.toml` ist nötig. Schon mehrfach passiert, sollte ich mir merken: **alle cargo-Calls explizit aus `src-tauri/`**.
- **Suspekt schnelles `cargo check`** beim ersten Lauf (`Finished in 0.23s`) ohne `Checking`-Zeile — Ursache: cargo cached die Build-Outputs, und wenn nichts touched wurde, gibt's nichts zu checken. Ein `touch src/lib.rs` triggert den Re-Check zuverlässig.

### Geänderte/neue Memories

- **`tech_stack`-Memory ist ab heute veraltet**: `sqlx 0.9.0` ist neuer Bestandteil; SQLite-Beschreibung als "via `tauri-plugin-sql ~2.4`" muss um den eigenen Pool ergänzt werden. **Sollte in der nächsten Session aktualisiert werden, sobald ➌ vollständig ist** — vorher noch zu viel im Fluss.
- Keine neuen Auto-Memories — Patterns sind aus dem Code ablesbar.

### Offen / nicht geklärt

- Restliche 8 db.ts-Funktionen auf `invoke` umstellen (nächste Sessions).
- Komplettes Entfernen von `@tauri-apps/plugin-sql` und `tauri-plugin-sql`-Crate, sobald alle Calls portiert sind.
- `tech_stack`-Memory-Update wartet auf ➌-Abschluss.
- Architektur ➋ (Reminder in Rust) wartet auf ➌-Abschluss.
- Restliche Architektur-Punkte ➍–➑ als Diskussions-Material im Backlog.

### Nachtrag — Persistenz-Verifikation nach Reboot

User hat nach der ➌-Foundation einen System-Reboot gemacht und SubTracked nochmal getestet → Abos sind alle da, Persistenz weiter gesund. Damit ist der seit 2026-06-05 als "Beobachtung beobachten" geführte Persistenz-Bug-Verdacht aus dem 🐛-Bugs-Block des Backlogs als **erledigt** markiert (BACKLOG.md). Der Bonus-Punkt: der neue sqlx-Pool nutzt explizit `journal_mode=Wal` + `create_if_missing=true` — beides war beim `tauri-plugin-sql` defaultmäßig vermutlich genauso, aber jetzt im Code sichtbar und unter eigener Kontrolle.

---

## 2026-06-05 — Marathon-Session-Abschluss

Sessions-Wrap-Up. Tagesabschluss nach einem langen Tag mit vielen Strängen — Tests-/Qualitäts-Strategie komplett (5/5), Mikro-Cleanups, Architektur-Diskussion + Hands-on auf ➊ durchgezogen. Detail-Einträge stehen unten — dies ist die Übersicht plus der konkrete Stand zur nächsten Session.

### Heute insgesamt erledigt (chronologisch)

| Thema | Commits | HANDOVER-Eintrag |
|---|---|---|
| Logo `assets/logo.png` + im README eingebunden | `5268a2e`, `d3d7e30`, `5c130cf` | "Logo ins Repo" |
| 📐 Tests-Strategie Schritt 2 (Rust-Strenge) | `1fb3b57` | "Schritte 2+3" |
| 📐 Tests-Strategie Schritt 3 (vitest, 26 Tests) | `64ee85e` | "Schritte 2+3" |
| 📐 Tests-Strategie Schritt 4 (Lefthook) | `059507f`, `b80747a` | "Schritt 4" |
| 📐 Tests-Strategie Schritt 5 (GitHub Actions CI) | `74b2131`, `275ed0c`, `0dc5b9b` | "Schritt 5" |
| Mikro-Cleanups: README Node, SubRow-Cast, Opener entfernen | `827eaf6`, `4a83712`, `ddc4e4c`, `a316042` | "Mikro-Cleanups" |
| 🏛️ Architektur-Diskussion + Plan-Festlegung | `3b61620`, `0905be2` | "Architektur-Diskussion" |
| 🏛️ Architektur ➊ (Custom Hooks) | `1e936ba`, `8d2fd19` | "Architektur ➊" |
| Dropdown-Bug + dieser Session-Abschluss | (folgt) | hier |

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt mit diesem Commit) |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓, `pnpm build` ✓, `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| **GitHub Actions** | grün auf `main` (zuletzt erfolgreich gefahren mit `0dc5b9b`) |
| Hooks | aktiv (Lefthook, 4 parallele Jobs) |

### Nächster Schritt — wichtig für die nächste Session

**Die ursprüngliche Architektur-Reihenfolge ➊→➋→➌ kollidiert mit der technischen Abhängigkeitskette.** ➊ (Custom Hooks) ist durch, aber:

- **➋ "Reminder-Loop ins Rust-Backend"** braucht DB-Zugriff aus Rust.
- **Aktuell** lebt die DB-Schicht komplett im Frontend via `tauri-plugin-sql`. Rust-Seite (`src-tauri/src/lib.rs`) hat keinen eigenen DB-Zugriff.
- **Zwei Wege**:
  - **A)** Eigener Rust-DB-Pool via `sqlx`/`rusqlite` neben `tauri-plugin-sql`. Schneller, aber zwei Connection-Pools auf einer Datei — WAL hilft, aber Concurrency-Risiko.
  - **B)** Erst ➌ (Tauri-Commands, also DB-Logik nach Rust verlagern), dann ➋ einfach drauf. Sauber, aber Reihenfolge tauscht zu **➊→➌→➋**.
- **Empfehlung an die nächste Session**: Mit dem User die Reihenfolge-Frage klären, bevor Hands-on. Option B (Reihenfolge tauschen) ist die saubere Variante, aber ➌ ist deutlich größer und braucht vermutlich zwei Sessions.

**Plan B-Plan**: Falls keine Lust auf großen Block, sind Quick-Win-Items naheliegend:
- 🐛 **Dropdown-Lesbarkeit im Dark-Mode** (neu im Backlog) — CSS-Override für `<select>`/`<option>` im Dark-Theme. 5–10 Min Quick-Fix, bis das UI-Redesign kommt.
- 🚀 **Lokaler Installer-Build** (`pnpm tauri build` → `.deb`/`.AppImage` → installieren → Tray/Autostart real testen). Bonus: klärt den Persistenz-Bug-Verdacht.

### Wichtige Entscheidungen + Begründung (Tages-Summe)

- **Tests-Strategie komplett ausgerollt**: Biome → cargo clippy/fmt → vitest → Lefthook → GitHub Actions. Jede Stufe einzeln dokumentiert. Hot-Path: jeder Commit wird lokal vorab geprüft, Push wird in der Cloud nochmal validiert.
- **Architektur-Diskussion explizit geführt** statt "machen wir mal" — User wollte Zweitmeinung zu Codex' "alles perfekt", acht Themen mit File-Belegen identifiziert, Reihenfolge gemeinsam beschlossen.
- **`replace_content` + Serena-symbolische Tools etabliert** in der Session-Mitte (User-Hinweis "ich sehe keine Serena-Usage"). Feedback-Memory `feedback-serena` angelegt — bei nächstem Session-Start zuerst `initial_instructions` aufrufen.

### Gotchas / Stolperfallen (aus Tagessumme)

- **pnpm v11 zwingt zu Node ≥ 22.13** (CI-Erkenntnis). README + tech_stack-Memory angepasst.
- **Lefthook 2.x skippt Jobs mit `root:`** bei ungeladenen staged files — sinnvolle Heuristik, aber im Trockenlauf nutze `--force`.
- **Bash-Tail kann Hook-Errors verschlucken**: lieber `git log` checken statt dem Output trauen, wenn kein Commit-Hash erscheint.
- **Biome formatiert JSON-Arrays kontext-abhängig**: 5 Einträge → Multi-Line, 4 → One-Line. Diff-Rauschen bei Permission-Sets.
- **Timezone-Trap in Vitest-Date-Tests**: `new Date("YYYY-MM-DD")` ist UTC-Mitternacht, `startOfDay()` arbeitet lokal — Helper `d(y, m, d)` in jeder Test-Datei einbauen.
- **Architektur ➋ + ➌ technisch verkoppelt** (siehe "Nächster Schritt"). Klären bevor Hands-on.

### Geänderte/neue Memories

- **Auto-Memory** `feedback-serena.md` neu: bei Session-Start zuerst Serena MCP aktivieren. Begründung: heutige Korrektur durch User.
- **Serena** `tech_stack` und `suggested_commands` komplett aktualisiert (Biome, vitest, Lefthook, CI, neue Befehle).

### Offen / nicht geklärt

- Architektur-Reihenfolge ➋ vs. ➌ (siehe oben — User-Diskussion vor Hands-on).
- 🐛 Dropdown-Bug (Quick-Fix).
- 🚀 Installer-Build steht weiter offen.
- 🎨 Logo-Re-Export wartet auf User mit Quelltool.
- Architektur-Punkte ➍ bis ➑ als Diskussions-Material im Backlog.

---

## 2026-06-05 — Architektur ➊ erledigt (Custom Hooks)

Punkt ➊ aus der Architektur-Sektion durchgezogen. Erste Hands-on-Architektur-Verbesserung der heutigen Marathon.

### Was passierte

- **Drei Custom Hooks unter `src/hooks/`** rausgezogen (Commit `1e936ba`):
  - `useSubscriptions()` — `subs`, `accounts`, `loading`, `error`, `setError`, `reloadAll`, `reloadAccounts`. Mount-Effect ruft `reloadAll` selbst.
  - `useNotificationPermission()` — `status` + `activate()`. Mount-Effect prüft Berechtigung, `activate` triggert OS-Prompt.
  - `useReminderLoop(intervalMs?)` — `setInterval`-Setup mit Default 1 h. JSDoc verweist explizit auf den Folge-Architektur-Punkt ➋ (Verlagerung ins Rust-Backend).
- **`App.tsx` von 211 → 152 Zeilen** (-28%). State-Count: 7 useState + 3 useEffect → **2 useState + 1 useEffect** (nur noch UI-State wie `editingSub`/`subOpenSeq`) + 3 Hook-Aufrufe.
- **Permission-Banner-`NotificationStatus`-Type** bleibt im Banner-Modul (single source of truth) — Hook importiert nur.
- **`reloadAll`-Error-Path im Hook**: `setError` wird exposed, damit App.tsx weiterhin `handleDelete`-Fehler in den gemeinsamen Error-State schreiben kann. Keine Over-Abstraktion durch Wrapper-Delete im Hook.
- **Verifikation**: `pnpm exec tsc --noEmit` ✓, `pnpm lint` ✓ (34 statt 31 Files), `pnpm test:run` 26/26 ✓, `pnpm build` ✓ (Bundle 290,88 → 291,27 KB JS, +0,4 KB durch die drei Hook-Files — vernachlässigbar).
- Backlog ➊ abgehakt.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt mit diesem HANDOVER) |
| HEAD | HANDOVER-Commit folgt; Code-Commit zuvor: `1e936ba` |
| Working tree | clean nach Commit |
| Build/Tests | alle vier Gates lokal grün + `pnpm build` durch |
| App-UI | Verhalten unverändert (reines Refactor) — keine UI-Verifikation gegen Tauri-App nötig, weil keine User-facing Logik geändert |

### Nächster Schritt

**Architektur ➋: Reminder-Loop ins Rust-Backend.** Plan-Skelett:

- Rust-Side: ein eigener `tokio::spawn`-Task im Setup-Block von `lib.rs` (oder als separater Modul), der minütlich/stündlich tickt.
- Reminder-Logik aus `src/lib/reminders.ts` portieren: DB-Query → Due-Berechnung → Notification senden → `reminders`-Insert (idempotent).
- Frontend-`useReminderLoop` entfernen, weil obsolet.
- Migration-/Schema-Strategie für die `reminders`-Tabelle bleibt unverändert (sie liegt bereits im Plugin-DB).
- Tauri-Notification-API funktioniert auch aus dem Rust-Hauptprozess (`tauri::AppHandle::notification()`).

Größerer Block als ➊ — möglicherweise eigene Session, weil Rust-Code geschrieben und das Reminder-Verhalten ggf. mit dem User abgenommen werden müsste. Plan ist im Backlog persistiert.

Alternativ pausieren oder zu Distribution-Items wechseln (Installer-Build) — User-Call.

### Wichtige Entscheidungen + Begründung

- **`setError` aus dem Hook exponiert** statt `handleDelete` in den Hook zu ziehen: minimal-invasiv. Der Hook bleibt fokussiert auf das Lade-/Reload-Pattern, `handleDelete` ist `confirm()` + DB-Op + Reload — gehört ergonomisch in App.tsx, weil die UI das `window.confirm` steuert.
- **`useReminderLoop` nimmt `intervalMs` als Parameter** mit Default: erlaubt zukünftigen Tests, ein kürzeres Intervall reinzureichen, ohne Magic-Mock auf `setInterval`. Default-Konstante intern definiert, nicht exportiert (interner Default).
- **JSDoc-Kommentar auf `useReminderLoop`** mit Verweis auf Architektur ➋: der Hook bleibt nicht "stillschweigend MVP" — wer ihn liest, weiß dass das ein bekanntes Limit ist und wohin es als Nächstes geht.
- **`Account`-Import aus `types` weg**: TypeScript inferrt das aus dem Hook-Return-Type. Weniger Imports, kein Typ-Drift möglich.
- **Verzeichnis `src/hooks/`** statt Hooks irgendwo verstreut: konventionelle React-Struktur, scanbar bei wachsendem Projekt. Co-Located in `src/components/`-Geschwister.

### Gotchas / Stolperfallen

- **`useEffect` mit `[reloadAll]` als Dependency**: weil `reloadAll` mit `useCallback([])` stabil ist, läuft der Effect genau einmal. Würde jemand die Deps von `useCallback` ändern, würde der Effect bei jedem Re-Aufruf neu laufen → unerwünschter Vollreload.
- **`useReminderLoop`-StrictMode-Doppellauf in Dev**: bei React StrictMode-Doppel-Mount fährt der Effect zweimal hoch, also zwei parallele Intervalle. Wegen Idempotenz harmlos, aber in Devtools sieht man doppelte DB-Calls. In Prod-Builds nicht.
- **Bundle-Size +0,4 KB JS** durch die drei Hook-Files: Trade-off bewusst gewählt — Lesbarkeit/Testbarkeit > minimale Bundle-Optimierung.

### Geänderte/neue Memories

- Keine. Hook-Konvention ist aus dem Code ablesbar. Wenn sich beim Folge-Refactor (➋, ➌) Patterns wiederholen, kann eine `conventions`-Ergänzung in Serena sinnvoll werden.

### Offen / nicht geklärt

- Architektur ➋ (Reminder ins Rust) als Nächstes geplant.
- Architektur ➌ (Tauri-Commands) wartet auf eigene Session.
- Punkte ➍–➑ stehen weiter im Backlog als Diskussions-Material.

---

## 2026-06-05 — Architektur-Diskussion + Plan, Hands-on auf Punkt ➊

User-Wunsch: Zweitmeinung zu Codex' Aussage "alles perfekt, keine Luft nach oben". Diskussion durchgeführt, acht konkrete Themen mit File-Belegen in `BACKLOG.md` unter neuer Sektion 🏛️ Architektur dokumentiert (Commit `3b61620`).

### Was passierte

- **Architektur-Sektion im Backlog** angelegt mit acht Diskussions-Themen — State-Konzept App.tsx, Backend-Logik im Frontend, Reminder-Loop im Webview, Komponenten-Testbarkeit, Concerns-Mix in reminders.ts, Reload-Pattern, Error-Boundary, i18n.
- **Pragmatische Einordnung gegeben**: für MVP-Solo-Eigenbedarf ist der Stand OK, aber "perfekt" stimmt nicht. Vor allem App.tsx (7 useState + 3 useEffect auf 211 Zeilen) und der Webview-Reminder-Loop (pausiert bei minimiertem Fenster — funktionaler UX-Defekt für eine Notification-zentrale App) wären sinnvolle Verbesserungen.
- **Ranking nach Wert-pro-Aufwand mit User festgelegt** — Reihenfolge der Umsetzung:
  1. **➊ Custom Hooks** für die App.tsx-Orchestrierung (niedrigster Aufwand, höchster Aufräumeffekt, ebnet ➍).
  2. **➋ Reminder-Loop ins Rust-Backend** (mittlerer Aufwand, behebt echten UX-Defekt).
  3. **➌ Tauri-Commands** statt direktem `plugin-sql`-Zugriff (größter Aufwand, größte konzeptionelle Klärung — eigene Session wert).
- **User-Erwartung explizit gesetzt**: heute schaffen wir wahrscheinlich nicht alles. Plan ist im Backlog persistiert.
- **Hands-on jetzt auf Punkt ➊**.

### Status am Sitzungsende (Stand dieses HANDOVER-Commits)

| Bereich | Stand |
|---|---|
| Branch | `main`, gleich vor `origin/main` (Push folgt) |
| HEAD | HANDOVER-Commit folgt; Backlog-Commit zuvor: `3b61620` |
| Working tree | clean nach Backlog-Commit; Code-Refactor folgt |
| Hands-on | startet jetzt mit Punkt ➊ Custom Hooks |

### Nächster Schritt

**Punkt ➊ Custom Hooks** für App.tsx — drei Hooks rausziehen:

- `useSubscriptions()` → kapselt `subs`/`accounts`/`loading`/`error`/`reloadAll`/`reloadAccounts`.
- `useNotificationPermission()` → kapselt `notifStatus` + `activate()`-Logik.
- `useReminderLoop(intervalMs?)` → kapselt das `setInterval`-Setup für `runReminderCheck`.

Damit sinkt App.tsx von 7 useState + 3 useEffect auf 1–2 useState (UI-State wie `editingSub`, `subOpenSeq`) + 0 useEffect (kommt aus den Hooks).

Wenn ➊ in dieser Session nicht durch wird oder Folge-Items ausbleiben: nächste Session liest BACKLOG → 🏛️ Architektur, sieht die Reihenfolge ➊→➋→➌ und nimmt die nächste offene Nummer.

### Wichtige Entscheidungen + Begründung

- **Eigene Architektur-Sektion** statt Items in "Später" verstreuen: Diskussions-Material braucht eigenen Platz, sonst geht's unter und wird nie geführt. Analog zur 📐 Tests-Sektion, die als Strategie-Container für die fünf Schritte funktioniert hat.
- **Reihenfolge ➊→➋→➌ nicht "schwerstes zuerst"**: ➊ ist Vorarbeit für ➍ (Testbarkeit), ➋ ist UX-Defekt-Fix, ➌ ist konzeptionelle Umstellung mit doppelten Type-Definitionen — letzteres rechtfertigt eine eigene Session statt zwischendrin gequetscht.
- **Ranking offen kommuniziert** statt "ich entscheide einfach": User ist Anfänger, soll die Trade-offs verstehen können. Memory `user_role` ("Konzepte erklären, nicht voraussetzen") gibt das vor.
- **Punkte 4–8 als Diskussions-Material belassen**: keine voreilige Festlegung. Vor allem ➐ (Error-Boundary) und ➎ (Reminders-Concerns-Mix) lohnen ihre eigene Mini-Diskussion, weil sie thematisch anders gelagert sind.

### Gotchas / Stolperfallen

- **`reloadAll` setzt error, aber `handleDelete` in App.tsx setzt error auch**: beim Hook-Split muss der Hook entweder `setError` exposen oder die delete-Operation auch kapseln. Pragmatisch: `setError` exposen, App.tsx behält `handleDelete`. Keine Über-Abstraktion.
- **Reminder-Loop-Hook leere Dependency-`[intervalMs]`**: in StrictMode-Dev läuft der Effect zweimal → zwei parallele Intervalle. Wie heute schon, harmlos wegen Idempotenz. Wer das später ändert, muss aufpassen.
- **Permission-Banner braucht `NotificationStatus`-Type**: aktuell exportiert `NotificationPermissionBanner.tsx` den Type. Beim Hook-Split bleibt die Wahrheit dort, der Hook importiert nur. Kein zweiter Definitions-Ort.

### Geänderte/neue Memories

- Keine in dieser Diskussions-Phase. Wenn ➊ durch ist und die Hook-Konvention sich etabliert, ggf. Serena-Memory `conventions` ergänzen.

### Offen / nicht geklärt

- ➊ Custom Hooks beginnt jetzt.
- ➋ ➌ in dieser Session vermutlich nicht mehr — gehen in nächste Sessions.
- Punkte ➍ bis ⓼ warten auf separate Mini-Diskussionen, sobald ein passender Moment kommt.

---

## 2026-06-05 — Mikro-Cleanups (Opener, SubRow-Cast, README-Node)

Drei kleine Aufräumarbeiten als Pause-Wechsel nach der Tests-Strategie-Marathon. Alle drei lagen entweder im Backlog (Später-Sektion) oder als "Offen"-Notiz aus der CI-Session.

### Was passierte

- **README Node-Mindestversion 20 → 22.13** (Commit `827eaf6`). Aus der CI-Erkenntnis von vorhin: pnpm@11 verlangt `node:sqlite`-Builtin (ab Node 22.5). README-Voraussetzung war damit zu großzügig formuliert.
- **`SubRow.interval`-Cast** (Commit `4a83712`). `SubRow.interval` war als Union-Typ `Interval` (`"monthly" | "quarterly" | "yearly"`) typisiert, aus SQLite kommt aber ein roher `string`. Fix: `SubRow.interval: string`, neuer privater `parseInterval(s: string): Interval`-Helper in `src/lib/db.ts`, der die drei erlaubten Werte validiert und bei Mismatch eine Exception wirft. DB-`CHECK` greift bereits in der Migration, aber Defense-in-Depth gegen DB-Manipulation von außen kostet nichts.
- **`tauri-plugin-opener` entfernt** (Commit `ddc4e4c`). War seit Tauri-Template-Setup eingebunden, Frontend nutzte's nirgends. Vier Stellen entfernt:
  - `src-tauri/Cargo.toml` + `Cargo.lock`
  - `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_opener::init())`
  - `src-tauri/capabilities/default.json`: `"opener:default"`-Permission
  - `package.json` + `pnpm-lock.yaml`
  - Bonus: Biome verdichtet das durch die Entfernung kürzer gewordene `permissions`-Array jetzt auf eine Zeile (Default-Heuristik).
  - `cargo check` + `pnpm install` clean.
- **Backlog**: zwei Items in "Später" abgehakt (Opener, SubRow.interval-Cast). README-Node-Bump war kein eigenes Backlog-Item, nur eine HANDOVER-Notiz.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal 4 Commits vor `origin/main` (Push folgt) |
| HEAD | HANDOVER-Commit folgt; Code-Commits zuvor: `ddc4e4c`, `4a83712`, `827eaf6` |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓, `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| Hooks | aktiv, haben einen Biome-Format-Fix erzwungen (siehe Gotchas) |

### Nächster Schritt

Aus dem Block "🚀 Distribution & Setup" wird der **Lokale Installer-Build** zur naheliegenden nächsten Front: `pnpm tauri build` → `.deb`/`.AppImage` → installieren → Tray/Autostart in der echten App testen. Bonus: klärt den Persistenz-Bug-Verdacht (Dev-DB vs. installierte DB sind verschiedene Pfade).

Alternativen aus dem Backlog:
- 🌱 Später-Items: `CoverageItem.subscription_id` (winzig), Lokalisierung Komma/Punkt für Beträge (eigene Mini-Session), UI-Redesign (groß, braucht Lib-Auswahl).
- 🎨 Logo-Re-Export wartet auf User mit Quelltool.

### Wichtige Entscheidungen + Begründung

- **`parseInterval` als interne Funktion in `db.ts`** statt exportiert + getestet: 3-Werte-Check ist trivial korrekt, ein Vitest-Test wäre Theater. Sollte das Modul jemals wachsen oder mehrere Caller bekommen, kann man's leicht extrahieren.
- **Throw bei unbekanntem Wert** statt `?? "monthly"`-Fallback: silent Fallback würde DB-Korruption maskieren. `runReminderCheck` und `coverage` verlassen sich auf das Interval — falscher Wert dort führt zu stillen falschen Berechnungen. Lieber laut sterben.
- **Opener-Entfernung sauber, nicht kommentiert weglassen**: Tauri-Permission-Sets sind zentral, ein vergessenes `"opener:default"` ist Permission-Kruft, der spätere Audits schwerer macht.
- **Drei separate Commits** statt ein gebündeltes: drei distinkte Themen mit eigener Begründung, im Git-Log lesbar (User-Memory `feedback_workflow.md`: "Solo-Frühphase, oft committen").
- **Cargo.lock + pnpm-lock.yaml mit committet**: Reproducibility — kein Drift zwischen lokalem und CI-Build.

### Gotchas / Stolperfallen

- **Biome formatiert JSON-Arrays kontext-abhängig**: das `permissions`-Array hatte mit 5 Einträgen Multi-Line, mit 4 will Biome One-Line. **Beim ersten Commit-Versuch lief lefthook scheinbar grün durch** (alle Symbole `✓`), aber das Tail im Bash-Output schnitt die wichtige Zeile "Found 1 error" weg — ich sah die `summary:`-Zeile, nicht die echten Errors. Erst `lefthook run pre-commit --force` mit voller Ausgabe machte's sichtbar. Lehre: bei vermeintlich "grünem" Hook ohne Commit-Hash im Output **nicht** dem Tail vertrauen, sondern `git log` prüfen.
- **`cargo check` mutiert `Cargo.lock`** wenn Deps geändert wurden. Wer nur die staged Files committet (`Cargo.toml`), vergisst sonst die Lock. Defensive: `git add` immer beide explizit zusammen.
- **Generated schemas in `src-tauri/gen/schemas/`** referenzieren das Opener-Plugin noch (kommen vom letzten `tauri build`). Sind aber Build-Output, regenerieren sich beim nächsten `pnpm tauri build` / `cargo check`. Nicht manuell editieren.
- **Biome's `useFlatConfig` für JSON ist Default**: Lehre aus dem Opener-Entfernen — wer wieder einen Eintrag hinzufügt und das Array dadurch ≥5 Einträge bekommt, sieht Biome wieder auf Multi-Line zurückwechseln. Diff-Rauschen, das man im Hinterkopf haben sollte.

### Geänderte/neue Memories

- Keine. Die Cleanups sind aus dem Code ableitbar; der Workflow-Hinweis ("nicht dem Hook-Tail vertrauen") gehört eher in den HANDOVER-Verlauf als in eine Memory.

### Offen / nicht geklärt

- Installer-Build steht weiter aus.
- Logo-Re-Export wartet auf User.
- Persistenz-Bug-Verdacht bleibt "beobachten" bis zum echten Installer-Lauf.

---

## 2026-06-05 — Tests-Strategie Schritt 5 (GitHub Actions CI) — Strategie komplett

Letzter Schritt der Tests-/Qualitäts-Strategie. Plan-aufbauend auf Schritt 4 (Lefthook): dieselben vier Checks, aber auf GitHub-seitiger Compute, getriggert auf Push und PR. Damit ist die ganze 5-Schritt-Strategie erledigt.

### Was passierte

- **`.github/workflows/checks.yml`** angelegt — ein Job (`Lint, Tests, Cargo`) auf `ubuntu-latest`. Steps in Reihenfolge:
  1. `actions/checkout@v4`
  2. Tauri-Linux-Deps via apt: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev build-essential file`. Diese braucht die Tauri-Crate beim `cargo clippy`-Compile, auch ohne Bundle-Build.
  3. `pnpm/action-setup@v4` (zieht die Version aus dem neuen `packageManager`-Feld in `package.json`).
  4. `actions/setup-node@v4` mit `node-version: 22`, `cache: pnpm`.
  5. `dtolnay/rust-toolchain@stable` mit `components: rustfmt, clippy`.
  6. `Swatinem/rust-cache@v2` mit `workspaces: src-tauri` für Cargo-Build-Caching.
  7. `pnpm install --frozen-lockfile`, dann `pnpm lint` → `pnpm test:run` → `cargo fmt --check` → `cargo clippy --all-targets -- -D warnings`.
- **Triggers**: `push` auf `main` + `pull_request`. Concurrency-Group `checks-${{ github.ref }}` mit `cancel-in-progress: true` — neue Pushes überholen veraltete Runs.
- **`packageManager: "pnpm@11.3.0"` in `package.json`**: macht die pnpm-Version deterministisch — kein Drift zwischen Lokal und CI.
- **Erster CI-Run (`27012126265`) failte** im Setup-Node-Step: `pnpm@11.3.0` braucht `node:sqlite`-Builtin, das erst ab Node 22.5 existiert. Ich hatte `node-version: 20` gesetzt (an README "Node ≥ 20" orientiert), aber das ist für pnpm 11 zu alt. **Fix** in Commit `275ed0c`: auf `node-version: 22` umgestellt.
- **Zweiter CI-Run (`27012193991`) grün** — alle Steps ✓.
- Backlog-Schritt-5 abgehakt. Tests-Strategie-Sektion komplett.
- **Serena-Memories `tech_stack` und `suggested_commands` aktualisiert** — beide hatten die in den heutigen Sessions hinzugefügten Tools (Biome, vitest, Lefthook, CI) noch nicht.
- **Commits dieser Teil-Session**: `74b2131` (Workflow + Backlog), `275ed0c` (Node-Fix), dieser HANDOVER+Memory-Commit.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt nach diesem HANDOVER-Commit) |
| HEAD | HANDOVER+Memory-Commit folgt; Code-Commits zuvor: `275ed0c` (Node-Fix), `74b2131` (CI initial) |
| Working tree | clean nach Commit |
| Build/Tests lokal | `pnpm lint` ✓, `pnpm test:run` 26/26 ✓, `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |
| **GitHub Actions** | **grün** auf `main` (Run `27012193991`). Concurrency-Group aktiv |
| Hooks | aktiv (Lefthook), feuern bei jedem Commit |

### Nächster Schritt

Tests-Strategie ist abgeschlossen. Backlog-Lage:

- **🐛 Bugs**: Datenpersistenz "beobachten" — kein aktiver Schritt.
- **🚀 Distribution & Setup** — die naheliegende nächste Front:
  - **Lokales Installer-Build** (`pnpm tauri build`) + .deb/.AppImage installieren, Tray + Autostart in der echten App testen. Macht aus SubTracked endlich eine richtige App statt dev-only.
  - **Versions-Tag `v0.1.0`**, sobald Installer-Build abgenommen.
  - **README-/GitHub-Polish bei v0.1.0** (UI-Screenshot fehlt noch).
  - **Logo neu exportieren** (Transparenz-Bug + Größe) — wartet auf User mit Quelltool.
- **🌱 Später**: UI-Redesign Richtung arsnova.eu (`mem:ui_vision`), `tauri-plugin-opener` entfernen, Komma/Punkt-Lokalisierung, Komponenten-Tests via RTL.

Logische Reihenfolge: erst Installer-Build (sichert auch den Persistenz-Bug-Verdacht ab), dann ggf. UI-Polish vor v0.1.0.

### Wichtige Entscheidungen + Begründung

- **`packageManager`-Field in `package.json`** statt explizitem `version:` in `pnpm/action-setup@v4`: corepack-kompatibel, single source of truth, automatisch von neueren pnpm/yarn-Setups respektiert. Drift zwischen lokaler und CI-Version wird strukturell vermieden.
- **Node 22 statt 20** in CI: hätte ich aus pnpm-Doku ableiten können, habe ich nicht. Das Setup-Node-Failing war der schnellste mögliche Fehler-Pfad — nicht schlimm, einen Commit "verbraucht". README erwähnt "Node ≥ 20", was zu großzügig ist — sollte beim nächsten README-Polish auf 22 angehoben werden (Backlog-Vermerk hier).
- **Concurrency-Group mit `cancel-in-progress: true`**: bei aktiver Iteration spart das pro nachgeschobenem Push die Minuten des überholten Runs. Bei einem Solo-Repo ohne PR-Verkehr selten relevant, kostet aber nichts.
- **Linux-Only-Runner**: Matrix-Build (Win/macOS) ist im Backlog als "Später"-Item für Release-Tags vorgesehen. Tests/Lint/Clippy sind plattform-agnostisch genug, dass ein Runner reicht — die OS-Trennung wäre Theater.
- **`pnpm install --frozen-lockfile`**: bricht ab, wenn `pnpm-lock.yaml` nicht zum `package.json` passt. Erzwingt deterministische Installs, deckt typische "ich hab gepusht ohne Lockfile-Update"-Fehler im PR-Review ab.
- **Kein dedizierter `tsc --noEmit`-Step**: Biome deckt strukturelle JS-Issues ab, `vitest`/`tsc` über `pnpm build` würde redundant compilen. Wenn TypeScript-Errors auftauchen würden, fielen sie spätestens beim `pnpm tauri build` auf. Bewusst weggelassen, um den Hot-Path schnell zu halten.

### Gotchas / Stolperfallen

- **pnpm-Major-Bump = Node-Major-Bump**: pnpm 11 verlangt Node 22.13+, pnpm 12 wird vermutlich Node 24+ wollen. Wer in CI Node fix-pint, muss bei pnpm-Updates mitdenken.
- **GitHub-Action-Annotation**: "Node.js 20 actions are deprecated. Actions will be forced to Node.js 24 by default starting June 16th, 2026." Das bezieht sich auf die Action-Runtimes (`actions/checkout@v4` etc.), nicht auf unseren Code. Lösung ist nicht in unserer Hand — die Action-Maintainer müssen Releases mit Node-24-Runtime publishen. Bei `setup-node`/`checkout` schon angekündigt, aktuell noch v4 mit Node-20-Runtime. Nicht-blockierend; im Backlog vermerkt.
- **`packageManager`-Field ist eine Corepack-Konvention** — wenn jemand auf der Maschine kein Corepack hat, schmeißt pnpm beim `pnpm install` keinen Fehler, weil es die Version nicht erzwingt (anders als yarn's berry). In CI sorgt aber `pnpm/action-setup@v4` für genau die deklarierte Version.
- **`Swatinem/rust-cache@v2` mit `workspaces: src-tauri`**: muss explizit gesetzt werden, weil unsere Cargo-Crate nicht im Repo-Root liegt. Default würde versuchen, im Repo-Root zu cachen — nichts finden, leerer Cache, jeder Run baut von Null.
- **Tauri-Linux-Deps-Liste**: `libwebkit2gtk-4.1-dev` (Tauri 2 — Tauri 1 hatte `-4.0`), `libayatana-appindicator3-dev` für Tray. Wer auf alte Tauri-1-Tutorials guckt, baut sich mit `-4.0` ein Repo-Fehler-Theater.

### Geänderte/neue Memories

- **Serena `tech_stack`**: Biome / vitest / Lefthook / GitHub Actions ergänzt; Node-Anforderung auf `>=22.13` aktualisiert (war "ne sagte nichts").
- **Serena `suggested_commands`**: `pnpm lint`, `pnpm lint:fix`, `pnpm test`, `pnpm test:run`, `pnpm exec lefthook run pre-commit --force` (Hook-Trockenlauf), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` ergänzt.

### Offen / nicht geklärt

- README-Node-Minimum von "≥ 20" auf "≥ 22" anheben — minimal, beim nächsten README-Polish.
- Node-24-Migration für die Action-Runtimes — wartet auf Action-Maintainer.
- Reminders-Tests mit DB-Mock — weiterhin Später-Sektion.

---

## 2026-06-05 — Tests-Strategie Schritt 4 (Lefthook)

Direkt im Anschluss an Schritte 2+3 weiter im Plan. Schritt 4 war von Anfang an als kurz geplant — die Mechanik ist 1:1 die Befehle aus den vorigen Schritten, nur in einem Hook gebündelt. Hauptarbeit war pnpm-Sicherheits-Default + Workspace-Settings einzusortieren.

### Was passierte

- **`lefthook@2.1.9`** als devDependency.
- **`lefthook.yml`** mit vier parallelen `pre-commit`-Jobs:
  - `biome` → `pnpm lint`
  - `vitest` → `pnpm test:run`
  - `cargo-fmt` → `cargo fmt --check` (mit `root: src-tauri/`)
  - `cargo-clippy` → `cargo clippy --all-targets -- -D warnings` (mit `root: src-tauri/`)
- **`prepare`-Script** `lefthook install` in `package.json`: bei jedem `pnpm install` werden die Hooks in `.git/hooks/` eingeklinkt — kein manueller Init-Schritt für Cloner.
- **`pnpm-workspace.yaml`** `allowBuilds.lefthook: true`: gibt das postinstall-Script von lefthook frei, das die Go-Binary plattform-spezifisch downloadet. Pnpm v11 blockt das per Default aus Sicherheitsgründen (Ignored Builds). Die Zeile war im File schon als Placeholder vorbereitet ("set this to true or false"), nur noch auf `true` gesetzt.
- **Pnpm-Block aus `package.json` entfernt**: pnpm v11 liest `package.json:pnpm.*` nicht mehr und warnte bei jedem Install. Settings sind jetzt in `pnpm-workspace.yaml` zu Hause.
- **Verifiziert**:
  - `pnpm exec lefthook run pre-commit --force` → alle 4 grün in 1,5 s parallel.
  - Echter Commit `059507f` mit nur Config/Docs-Files staged: `cargo-*` automatisch geskippt (`no matching staged files` wegen `root: src-tauri/`), `biome` + `vitest` liefen. **Sinnvolles Verhalten**: wer nur am README schreibt, wartet nicht auf einen unnötigen Cargo-Build.
  - `pnpm exec lefthook run pre-commit --file src-tauri/src/lib.rs` → alle 4 grün. Cargo-Jobs feuern wie gewünscht, sobald Rust-Code staged ist.
- Backlog-Schritt-4 abgehakt.
- **Commit**: `059507f` "Qualitaet: Lefthook Schritt 4 — Pre-Commit-Hooks fuer alle Checks". HANDOVER-Commit folgt.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt nach HANDOVER-Commit) |
| HEAD | HANDOVER-Commit folgt; Code-Commit zuvor: `059507f` |
| Working tree | clean |
| Hooks | aktiv. Jeder weitere `git commit` triggert die vier Checks automatisch |
| Build/Tests | `pnpm test:run` 26/26 ✓, `pnpm lint` ✓, `cargo clippy --all-targets -- -D warnings` ✓, `cargo fmt --check` ✓ |

### Nächster Schritt

**Schritt 5 (letzter Tests-Strategie-Schritt): GitHub Actions CI** — gleiche Checks wie lokal, triggert auf Push zu `main`. Plan-Skelett:

- Eine Workflow-Datei `.github/workflows/checks.yml`.
- Triggers: `push` auf `main` + `pull_request` (auch wenn aktuell keine PRs gefahren werden — vorbereitet schadet nicht).
- Jobs: setup-node + pnpm, Rust toolchain, dann `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test:run`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`.
- Linux-Runner reicht (Tauri-Linux-Deps installieren via apt im Workflow oder via einem prebuilt-Image).
- **Nicht** der große Matrix-Build (der bleibt für Release-Tags im "Später"-Block, separate Workflow-Datei dann).

Danach ist die Tests-Strategie komplett abgeschlossen. Alternativen für danach: 🚀 Lokales Installer-Build oder 🌱 Später-Sektion.

### Wichtige Entscheidungen + Begründung

- **`prepare`-Script statt manuellem `lefthook install`-README-Hinweis**: zero-friction für Cloner. Funktioniert deterministisch über npm/yarn/pnpm hinweg, weil `prepare` der standardisierte Lifecycle-Hook nach `install` ist.
- **`allowBuilds.lefthook: true` in `pnpm-workspace.yaml`** statt globalem `pnpm config set ...`: Setting ist im Repo committet, jeder Cloner hat es automatisch. Globale Config wäre lokal-only.
- **`root: src-tauri/` für die Cargo-Jobs**: setzt nicht nur das Working-Directory, sondern aktiviert die "skip if no matching staged files"-Heuristik. Schöner Bonus: README-Commits werden nicht durch unnötige Cargo-Builds verlangsamt.
- **`parallel: true`** statt sequentiell: alle vier Checks sind unabhängig voneinander. Trockenlauf 1,5 s parallel vs. ~2,3 s sequentiell — bei jedem Commit ein bisschen Lebensqualität.
- **Keine Globs/Filter auf biome und vitest**: könnte man via `glob: "**/*.{ts,tsx,...}"` filtern, würde aber bei reinen Config-Commits einen Vitest-Run sparen (1,5 s). Pragmatisch bewusst weggelassen — die Hooks bleiben einfach zu lesen, und 1,5 s sind keine Schmerzgrenze. Bei zukünftigem Frust eine Zeile Glob ergänzen.
- **vitest ohne `--reporter=verbose` o.ä.**: Default-Output ist knapp, das ist im Hook-Kontext genau richtig.

### Gotchas / Stolperfallen

- **pnpm v11 Ignored Builds**: jeder neue dep mit postinstall-Script muss in `pnpm-workspace.yaml:allowBuilds` freigeschaltet werden. Sonst lädt die Binary nicht herunter und der CLI-Aufruf scheitert mit "command failed". Symptom beim ersten Versuch: `pnpm exec lefthook version` failed mit cryptic stack trace.
- **`pnpm install` zeigt am Ende exit 1, wenn Builds ignoriert wurden**, obwohl Pakete eigentlich installiert sind. Der Exit ist ein "approve-builds"-Reminder, kein echter Install-Fehler.
- **Lefthook 2.x ≠ 1.x**: in v2 ist die Job-Konfiguration unter `jobs:` (mit `name:`) statt früher direkt unter `commands:` (mit Hash-Map-Keys). Wer alte Tutorials liest, baut sonst ein Config-Schema, das v2 ignoriert oder ablehnt.
- **`root:` macht zwei Sachen gleichzeitig** (working-dir wechseln + Files-Filter). Wer `root:` schreibt, ohne sich der File-Filter-Semantik bewusst zu sein, kann sich wundern, warum sein Hook bei manchen Commits "stillschweigend" skippt. → Im `lefthook.yml`-Kommentar erklärt wäre vielleicht hilfreich; aktuell nur hier dokumentiert.
- **Echter `git commit` triggert die Hooks ab sofort**: Wer mit `--no-verify` arbeitet, umgeht sie. Default-Anweisung: nicht ausschalten, sondern fixen. Sonst ist der Sinn von Pre-Commit-Hooks weg.
- **`pnpm exec lefthook run pre-commit` ohne Flag** zeigt nur Skips wenn `git diff --cached` leer ist. Für Trockenlauf den Flag `--force` (alles) oder `--file <path>` (gezielt) nutzen.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Schritt 5 (GitHub Actions CI) als letzter Tests-Strategie-Schritt.
- Logo-Re-Export (Backlog).
- Reminders-Tests mit DB-Mock (Später-Sektion).

---

## 2026-06-05 — Tests-Strategie Schritte 2+3 (Rust-Strenge + vitest)

Direkt im Anschluss an die Logo-Mini-Session weiter im Plan: zwei Tests-Strategie-Schritte abgeräumt. Außerdem User-Korrektur am vorherigen HANDOVER-Eintrag eingearbeitet (Logo-Optimierung gehört als TODO ins Backlog, nicht als Gotcha hier) plus User-Beobachtung am Logo-Hintergrund ins Backlog.

### Was passierte

- **Backlog-Aufräumarbeit**:
  - Logo-Optimierungs-TODO aus dem HANDOVER-Gotcha-Block in den Backlog verschoben (User-Hinweis).
  - Backlog-Item für Logo-Bug ergänzt: Schachbrettmuster im Hintergrund ist *kein* Alpha-Kanal, sondern wurde versehentlich als Pixel mit-exportiert (Editor-Anzeige-Konvention für Transparenz fälschlich gerastert). Mit dem Komprimierungs-Item zu einem Re-Export-Item konsolidiert. Commit `5c130cf`.
- **Schritt 2: Rust-Strenge** (Commit `1fb3b57`):
  - `cargo clippy --all-targets -- -D warnings` clean ohne Eingriffe.
  - `cargo fmt --check` zeigte zwei triviale Abweichungen in `src-tauri/src/lib.rs` — eine manuell umgebrochene Zeile die unter 100 Zeichen passt + fehlende Final-Newline. Per `cargo fmt` automatisch korrigiert.
  - Backlog-Schritt-2 abgehakt.
- **Schritt 3: vitest** (Commit `64ee85e`):
  - `vitest@4.1.8` als devDependency installiert.
  - **Separate `vitest.config.ts`** (env `node`, include `src/**/*.test.ts`), entkoppelt von `vite.config.ts` (dort steht Tauri-Server/HMR-Setup, das Tests nicht brauchen).
  - Scripts `pnpm test` (watch) und `pnpm test:run` (einmalig/CI).
  - **3 Test-Files, 26 Tests, alle grün**:
    - `src/lib/recurrence.test.ts` (11): `monthsPer`-Mapping, `nextDueDate`-Sprünge für alle drei Intervalle, **expliziter Anker-Additiv-Drift-Beweis** (Anker 31.01.2025 → 28.02 → 31.03 → 30.04 → 31.05 → 30.06 → 31.07 statt naiv iterativ 28.02 → 28.03 → 28.04 …). `dueDatesWithin` mit Endpunkt-Inklusivität, leerem Range, Jahres-Sprünge.
    - `src/lib/coverage.test.ts` (9): Bucket-Gruppierung nach Konto, Platzhalter für `null`/verwaiste accountId, Sortierungen, Math.round-Reihenfolge in `computeMonthlyBaseline` (10000/12 = 833.33 → 833).
    - `src/lib/format.test.ts` (6): Locale-tolerante Regex-Matcher (`/^9,99\s*€$/` statt exakter Strings — Intl.NumberFormat nutzt ggf. NBSP zwischen Zahl und €), dd.MM.yyyy-Ausgabe, ISO-Format-Pattern.
  - Backlog-Schritt-3 abgehakt.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal 4 Commits vor `origin/main` (Push folgt mit diesem HANDOVER) |
| HEAD | HANDOVER-Commit folgt; Code-Commits zuvor: `5c130cf` (Backlog-Reorg), `1fb3b57` (Rust-Strenge), `64ee85e` (vitest + Tests) |
| Working tree | clean nach diesem Commit |
| Build | `pnpm lint` clean, `pnpm test:run` 26/26 grün, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean, `pnpm exec tsc --noEmit` clean |
| App | nicht angefasst |

### Nächster Schritt

📐 Tests & Qualität weiter:

- **Schritt 4: Lefthook** als Pre-Commit-Hook. Eine Binary, kein Node-Hook-Dance. Hooks: `cargo fmt --check`, `cargo clippy -- -D warnings`, `pnpm lint`, `pnpm test:run`. Dadurch laufen die Checks automatisch vor jedem Commit — sonst kommen unsortierte Imports oder fehlgeschlagene Tests erst in CI auf.
- **Schritt 5: GitHub Actions CI** als CI-Mantel über alles. Gleiche Checks wie lokal, triggert auf Push zu `main`. **Nicht** der große Matrix-Build (der bleibt für Release-Tags im "Später"-Block).

Parallel/Alternative weiterhin: 🚀 **Lokales Installer-Build** als Pause-Wechsel.

### Wichtige Entscheidungen + Begründung

- **Separate `vitest.config.ts`** statt `test`-Block in `vite.config.ts`: Tauri-`vite.config.ts` hat fixed-Port-Server, HMR-Setup, `process.env.TAURI_DEV_HOST`-Trickserei — alles irrelevant für Tests und potenziell Reibungspunkte. Entkoppelt sauberer trennbar.
- **Helper `d(year, month, day)` in den Tests** statt `new Date("YYYY-MM-DD")`: Timezone-Footgun beim ersten Lauf gefangen. ISO-only-Date wird als UTC-Mitternacht geparst, `startOfDay()` arbeitet aber lokal — daraus ergibt sich ein 23:00-Drift, der ALLE Date-Vergleiche kaputtmacht. `new Date(year, month-1, day)` baut lokale Mitternacht direkt. Im Test-File mit Kommentar erklärt, damit der Trick beim nächsten Lesen nicht überrascht.
- **Locale-tolerante Regex** für `formatAmount` statt `toBe("9,99 €")`: `Intl.NumberFormat` setzt zwischen Zahl und Währungssymbol mal Space, mal NBSP, je nach ICU-Version. Exakter String-Vergleich wäre brüchig.
- **Anker-Additiv-Drift-Test als zentrales Sicherheitsnetz**: HANDOVER-Liste markiert die Logik als kritischsten Punkt (`mem:conventions` ebenfalls). Test mit Anker 31.01.2025 und 6 Folgemonaten ist ein klarer Bug-Detektor — ein naiv iterativer Algorithmus würde ab Februar permanent auf 28. fallen, der Test schlägt sofort an.
- **`describe/it/expect` explizit importiert** statt vitest-Globals: keine `vitest/globals` in `tsconfig.json` nötig, alles per Datei selbsterklärend, kein impliziter Magic.
- **`reminders.ts`-Tests bewusst vertagt**: braucht DB-Mock, der allein doppelt so viel Code wie alle anderen Tests zusammen wäre. ROI gering, weil die Logik dort dünn ist (Permission-Check + `insertReminderIfNew`-Aufruf, beides Side-Effect-lastig). Im Backlog-Item erwähnt.

### Gotchas / Stolperfallen

- **Timezone-Trap in Date-Tests** (siehe oben). Wer neue Tests schreibt: immer `d(y, m, d)`-Helper oder `new Date(year, month-1, day)`, niemals ISO-only-Strings als Erwartung.
- **`pnpm test` läuft im Watch-Mode**, `pnpm test:run` einmalig. Im Pre-Commit (Schritt 4) und CI (Schritt 5) muss `test:run` rein, sonst hängt der Hook/CI.
- **vitest 4 nutzt `vitest/config`** für `defineConfig` — der ältere Pfad `vitest` wäre tot. Bei Doku-Suche darauf achten.
- **`Intl.NumberFormat` in Node**: Node 20+ hat ICU eingebaut, daher Tests laufen ohne extra Setup. Auf älteren Nodes (≤14) wäre `Intl` ohne full-ICU englischsprachig — irrelevant für uns, weil wir Node 20+ voraussetzen (`package.json`-eng. siehe README).

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Logo-Re-Export (Transparenz + Größe) — Backlog-Item, wartet auf User-Aktion mit dem Quelltool.
- Schritte 4 (Lefthook) und 5 (GitHub Actions CI) im Backlog für die nächste Session.
- `reminders.ts`-Tests — vertagt, kein Datum.

---

## 2026-06-05 — Logo ins Repo, im README eingebunden

Kurze Mini-Session direkt im Anschluss an den Außendarstellungs-Nachtrag der Vor-Session. User hatte ein Logo entwerfen lassen und in den Repo-Root gelegt (`Logo.png`); Frage war `docs/` vs `assets/` als Zielort.

### Was passierte

- **Entscheidung `assets/` statt `docs/`** (siehe Begründung unten). `assets/`-Verzeichnis neu im Repo-Root.
- **`Logo.png` → `assets/logo.png`** verschoben (lowercase, konventionell; Datei war nie getrackt, also normales `mv`, kein `git mv`).
- **README.md**: Logo zentriert ganz oben eingebunden via `<p align="center"><img src="assets/logo.png" alt="SubTracked-Logo" width="480"></p>`. H1 bewusst beibehalten unter dem Logo.
- **Commit**: `5268a2e` "Aussendarstellung: Logo in assets/, im README eingebunden" (2 Dateien, +4 / 0).
- HANDOVER-Commit folgt (dieser hier).

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, lokal eins vor `origin/main` (Push folgt nach HANDOVER-Commit) |
| HEAD | HANDOVER-Commit; Code-Commit davor: `5268a2e` |
| Working tree | clean |
| Build | nicht angefasst (nur Repo-Branding), letzter grüner Stand aus Vor-Session weiter gültig |
| App | unverändert |
| GitHub | Logo wird ab Push im README sichtbar (relative URL `assets/logo.png`, GitHub rendert das korrekt sowohl auf der Repo-Startseite als auch im Datei-Viewer) |

### Nächster Schritt

Backlog steht weiter wie nach der Vor-Session — der eigentliche Plan für die nächste echte Arbeits-Session ist unverändert:

- **📐 Tests & Qualität → Schritt 2: Rust-Strenge** (`cargo clippy -- -D warnings` + `cargo fmt --check`). Klein, schnell, Warnings aufräumen.
- Danach Schritt 3 (vitest), Schritt 4 (Lefthook), Schritt 5 (GitHub Actions CI).
- Parallel/Alternative: 🚀 Lokales Installer-Build (Distribution-Sektion).

Anmerkung zum Backlog-Item **"README-/GitHub-Polish bei v0.1.0"** (🚀 Distribution & Setup): Logo deckt jetzt den "visueller Anker im README"-Teil teilweise ab. Item bleibt aber offen, weil Screenshot/GIF der laufenden App weiter aussteht — bewusst nicht jetzt, weil die UI vor `v0.1.0` noch im Wandel ist (siehe Vor-Session-Notiz).

### Wichtige Entscheidungen + Begründung

- **`assets/` statt `docs/`**: `assets/` ist im OSS-Ökosystem die Standard-Konvention für Repo-Branding-Bilder (Logos, Screenshots, README-Visuals). `docs/` ist für *textuelle* Doku (Markdown-Seiten, ADRs, Architektur-Specs); das lohnt erst, wenn man mehr Doku hat, als sinnvoll am Repo-Root liegen kann (siehe Vor-Session-Notiz: aktuell 4 Root-Markdowns, das ist noch übersichtlich). Verwechslungsfalle bewusst nicht gewählt: `src/assets/` (Vite-bündeltes Code-Asset) und `public/` (statisch ausgeliefertes App-Asset) sind beide für die App, nicht für Repo-Branding.
- **`<p align="center">` mit HTML statt Markdown-Bild-Syntax**: GitHub-Markdown rendert HTML, und nur damit lässt sich das Logo zentrieren UND in der Breite begrenzen (`width="480"` — sonst würden die 2752×1536 px Original im README riesig erscheinen). Markdown-`![alt](url)` kann das nicht.
- **H1 `# SubTracked` unter dem Logo behalten**: Logo hat den Schriftzug visuell, aber Screen-Reader bekommen nur den `alt`-Text. GitHub nutzt den ersten H1 für die Repo-Headline. A11y und SEO über kosmetische Reduktion gestellt.
- **PNG nicht optimiert**: Lokal sind weder `pngquant` noch `optipng` noch `oxipng` installiert (geprüft). Verlust-behaftete Skalierung auf eigene Faust am User-Logo wäre invasiv. GitHub komprimiert für die Anzeige eh on-the-fly. Auf v0.1.0-Polish vertagt.

### Gotchas / Stolperfallen

- **Originalauflösung 2752×1536 / 5,1 MiB ist groß** — als konkretes Backlog-Item in 🚀 Distribution & Setup verschoben (gehört dort als TODO hin, nicht als Gotcha hier).
- **Relative Bild-URL `assets/logo.png` ist korrekt für GitHub**. Wenn das README irgendwann auf einer externen Seite eingebettet wird, müsste man auf absolute `https://raw.githubusercontent.com/...`-URL umstellen.
- **Logo war nie git-getrackt**, deshalb `mv` statt `git mv`. Für künftige Verschiebungen bereits getrackter Dateien gilt: `git mv` nutzen, behält History.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Logo-Optimierung als Backlog-Item in 🚀 Distribution & Setup gelandet.
- Backlog im Übrigen unverändert.

---

## 2026-06-05 — Biome (Tests-Strategie Schritt 1) — Session-Abschluss

Letzter Eintrag der heutigen Marathon-Session. Tests-/Qualitäts-Diskussion mit dem User durchgeführt, Stack entschieden, Schritt 1 (Biome) sofort umgesetzt. Schritte 2-5 in den Backlog gepackt für die nächste Session.

### Was passierte

- **Diskussion + Entscheidungen** (siehe BACKLOG-Sektion 📐):
  - Lint+Format: **Biome** statt ESLint+Prettier. Begründung: Solo-Frühphase, eine Tool statt zwei, Rust-basiert (schnell), vernünftige Defaults, react-hooks-Regeln eingebaut.
  - Tests: **vitest + nur Pure-Logic** für jetzt. Komponenten-Tests + E2E in "Später" verschoben.
  - Pre-Commit: **Lefthook**, nicht husky.
  - CI: **GitHub Actions** mit denselben Checks wie lokal (nicht der große Matrix-Build, der bleibt für Release-Tags).
- **`@biomejs/biome 2.4.16`** als devDependency installiert. `biome.json` im Repo-Root mit:
  - Spaces 2, `lineWidth 100`
  - `useIgnoreFile: true` (respektiert `.gitignore`)
  - Excludes: `**/dist`, `**/src-tauri/target`, `**/src-tauri/gen`
  - `organizeImports: on`, Linter recommended, JS-Formatter: double quotes / trailing commas all / semicolons always
- **Scripts** `pnpm lint` und `pnpm lint:fix` in `package.json`.
- **Zwei manuelle Lint-Fixes** vor dem Auto-Format:
  - `DateField.tsx`: `aria-required` auf `<button>` ist ARIA-ungültig — entfernt. Das ungenutzte `required`-Prop ist mitgeflogen (Caller in `SubscriptionDialog` angepasst, `anchorDate` hat eh immer einen Default).
  - `OverviewSection.tsx`: `noArrayIndexKey`-Lint behoben durch Drop des `-${i}`-Suffix im map-key. `${subscription}-${date}` ist pro Konto in der Praxis eindeutig; "robusten" Key (`subscription_id`) als Backlog-Item.
- **Auto-Fix-Pass** `pnpm lint:fix`: 14 Dateien angefasst, Imports sortiert, kurze Arrays kompaktiert, Final-Newlines, JSON auch eingerückt.
- **BACKLOG aufgesplittet**: der große Strategie-Mega-Punkt → fünf konkrete Schritte. Schritt 1 abgehakt. Komponenten-Tests, E2E, `CoverageItem.subscription_id` in "Später" verschoben.
- **Commits dieser Teil-Session**:
  - `2d409c5` "Qualitaet: Biome eingerichtet + initialer Format-/Lint-Pass" (17 Dateien, +221/-148)
  - dieser HANDOVER- + Backlog-Commit

### Status am Sitzungsende (Tagesabschluss)

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | Nachtrag-Commit `7684cd2` (README/LICENSE/Topics-Polish); davor `3589d1a` und `2d409c5` |
| Working tree | clean |
| Build | `pnpm build` grün (290,88 KB JS / 14,55 KB CSS), `cargo check` grün, `pnpm lint` clean |
| App | Sämtliche heute gebauten Features (Reminder-Loop, Permission-Banner, Tray + Hide-on-Close, Autostart-Toggle, Mute-Toggle) vom User abgenommen |

### Heute insgesamt — alle Themen + Commits

| # | Thema | Commits | HANDOVER-Eintrag |
|---|---|---|---|
| 1 | Reminder-Loop verdrahtet (Schritt 8/8 alter Plan) | `d3fb014`, `18c56db`, `884636e` | "Schritt 8/8" |
| 2 | Notification-Permission als bewusste UI-Aktion | `b911081`, `77c43d9`, `fa53d8f` | "Notification-Permission" |
| 3 | Tray-Icon + Hide-on-Close | `eac1d12`, `042657f` | "Tray-Icon" |
| 4 | Autostart-Toggle + Backlog-Restrukturierung (Bugs/Distribution/Tests neue Sektionen) | `7878168`, `fcd9791` | "Autostart-Toggle" |
| 5 | Persistenz-Diagnose + Doku-Fix DB-Pfad | `3a73b58` | "Persistenz-Diagnose ..." |
| 6 | Backlog-Tick lead_days (war seit Tag 1 implementiert) | `18f4c6d` | dito |
| 7 | Mute-Toggle (Migration v2 + UI) | `9634cf5`, `cf72f3a` | dito |
| 8 | Biome eingerichtet (Schritt 1 Tests-Strategie) | `2d409c5` | dieser Eintrag |
| 9 | HANDOVER + Backlog für 8 | (folgt) | dieser Eintrag |

**Backlog-Lage am Tagesende:**
- "🔨 Jetzt" — Reminder-Loop abgehakt (war noch offen morgens).
- "⏭️ Als Nächstes (Hintergrund-Betrieb)" — **komplett leer**, alle 5 Items erledigt.
- "🐛 Bugs" — Datenpersistenz steht als "beobachten, nicht reproduzierbar".
- "🚀 Distribution & Setup" — neu, zwei Items offen.
- "📐 Tests & Qualität" — Schritt 1 erledigt, Schritte 2-5 offen.
- "🌱 Später" — gewachsen um Komponenten-Tests, E2E, `CoverageItem.subscription_id`.

### Nächster Schritt (nächste Session)

Tests-/Qualitäts-Strategie weiter ausführen — Schritt 2 ist klein und schnell:

- **Schritt 2: Rust-Strenge.** `cargo clippy -- -D warnings` + `cargo fmt --check` einmal lokal laufen lassen, Warnings aufräumen. Falls leer, direkt zu Schritt 3.
- **Schritt 3: vitest** für `recurrence.ts` (anker-additive Logik, kritisch), `coverage.ts`, `format.ts`. Erste Tests vor allem fürs Sicherheitsnetz, nicht für Coverage-Quote.
- **Schritt 4: Lefthook**, sobald 2+3 stehen.
- **Schritt 5: GitHub Actions** als CI-Mantel über alles.

Parallele Alternativen, sobald 2-3 stehen oder als Pause-Wechsel:
- 🚀 **Lokales Installer-Build** (Distribution-Sektion) — auch der einzige Weg, den Persistenz-Bug-Verdacht "echt" zu reproduzieren.
- 🌱 **Später-Sektion** (UI-Redesign, opener-Entfernung, Komma/Punkt-Lokalisierung).

### Wichtige Entscheidungen + Begründung (für diese Teil-Session)

- **Biome statt ESLint+Prettier**: für Solo-Frühphase ist die Zwei-Tool-Kette Konfig-Theater. Biome's eingebaute Regeln (inkl. react-hooks-Subset) decken 90% von dem ab, wofür man bei ESLint Plugins zusammenklicken muss. Bonus: Rust-basiert, schnell.
- **`lineWidth: 100`** statt Biome-Default 80: unsere Imports und Dialog-Code haben oft ~90 Zeichen sinnvoll. 80 hätte mehr Multi-Line-Imports erzwungen, 100 hält Single-Line wo lesbar.
- **JSON-Dateien (`.mcp.json`, `capabilities/*.json`) auch durch Biome formattiert** statt explizit auszunehmen: Konsistenz im ganzen Repo. Kostete 2-3 zusätzliche Diffs, aber alles folgt jetzt einem Stil.
- **`required`-Prop komplett aus `DateField` entfernt** statt nur das ARIA-Attribut: das Prop hatte keine andere Funktion, war reines Theater. Lieber sauber raus.
- **`noArrayIndexKey` durch Drop statt Suppression**: defensiver Index war wahrscheinlich aus Vorsicht da; `${subscription}-${date}` ist im aktuellen Datenmodell eindeutig genug. Saubere Lösung (mit `subscription_id`) im Backlog vermerkt.
- **BACKLOG-Strategie-Item aufgesplittet** in fünf Schritte statt einen großen Mega-Punkt: Fortschritt wird sichtbar, jeder Schritt hat sein eigenes Hakerl.

### Gotchas / Stolperfallen

- **`pnpm lint` schlägt fehl wenn Imports unsortiert oder Format nicht stimmt.** Ohne Pre-Commit-Hook (Schritt 4) muss man `pnpm lint:fix` vor dem Commit selbst aufrufen — sonst CI-Schmerz später.
- **Biome formatiert JSON mit.** Wer den Tauri-Scaffold-Multi-Line-Stil für JSON möchte, müsste explizit ausnehmen — wir haben uns für Konsistenz entschieden.
- **`OverviewSection`-Map-Key ist jetzt `${subscription}-${date}`** ohne Tiebreaker. Bei zwei Subs mit identischem Namen UND identischem Fälligkeitstag im selben Konto würde React warnen. In der Praxis unwahrscheinlich; saubere Lösung im Backlog.
- **`DateField` hat kein `required`-Prop mehr.** Falls eine künftige Form ein Date-Pflichtfeld braucht, gehört die Validierung in den `handleSubmit` des umgebenden Formulars.

### Geänderte/neue Memories

- Keine in dieser Teil-Session. Aus heute insgesamt: `mem:tech_stack` SQLite-Pfad-Sektion präzisiert (`.config/`-Sonderheit) — siehe Persistenz-Diagnose-Eintrag unten.

### Offen / nicht geklärt

- Tests-Strategie-Schritte 2-5 stehen im Backlog für die nächste Session.
- Persistenz-Bug-Beobachtung weiter "auf der Hut" — bei Reboot-Wiederauftreten Repro-Schritte aus dem Backlog.
- Cargo-Warnings-Stand unbekannt (kommt mit Schritt 2 ans Licht).

### Nachtrag (nach dem eigentlichen Session-Abschluss): Außendarstellung

Der User hatte nach "fertig" noch eine Orga-/Außendarstellungs-Idee. Vier Sachen gleichzeitig umgesetzt (Commit `7684cd2`):

- **`README.md`** ersetzt den alten Tauri-Template-Standard durch eine echte Projektbeschreibung (Funktionen, Tech, Status, Source-Build, Lizenz-Verweis).
- **`LICENSE`** neu — MIT, Copyright `2026 TCGTVV`. Vorher war das Repo default-copyright (rechtlich = niemand darf was damit machen, obwohl public).
- **GitHub-Description** via `gh repo edit` präzisiert: _"Persoenlicher Abo-Tracker mit nativen Erinnerungen. Tauri + React + SQLite, im System-Tray."_ (ASCII-Variante wegen Shell-Eskapism, konsistent mit Commit-Stil.)
- **GitHub-Topics** via `gh repo edit --add-topic` gesetzt: `desktop-app`, `personal-finance`, `react`, `sqlite`, `subscription-tracker`, `tauri`, `typescript`.

**Bewusst nicht gemacht** (weil verfrüht): CONTRIBUTING.md, Issue-Templates, Code of Conduct, CHANGELOG, `docs/`-Ordner. Das alles lohnt sich erst, wenn das Projekt entweder Beitragende hat oder mehr als ~3-4 distinkte Doku-Bereiche benötigt — aktuell sind die 4 Root-Markdowns (`README`, `BACKLOG`, `HANDOVER`, `AGENTS`) übersichtlich am Root, kein Bedarf für Verzeichnis-Struktur.

**Backlog**: neues Item in 🚀 Distribution & Setup — _"README-/GitHub-Polish bei v0.1.0"_: Screenshot/GIF im README, evtl. Demo-Video für die Release-Page. Heute weggelassen, weil die UI noch im Wandel ist und ein Screenshot in 2 Wochen veraltet wäre.

---

## 2026-06-05 — Persistenz-Diagnose, lead_days-Tick, Mute-Toggle

Sammeleintrag für drei Themen seit dem letzten HANDOVER.

### Was passierte

**1. Persistenz-Diagnose** (Commit `3a73b58`). User-Beobachtung "nach Reboot waren Abos weg" untersucht:
- Disk-Check: DB unter `~/.config/com.tcgtvv.subtracked/subtracker.db` hat alle Einträge (2 Abos, 1 Konto, 2 Reminder), WAL aktiv (`journal_mode=wal`, `synchronous=NORMAL`).
- Identifier-Drift via git log ausgeschlossen — `com.tcgtvv.subtracked` ab `d74a1cc` stabil.
- Code-Pfad sauber: `getDb` cached, `listSubscriptions` plain SELECT, `mapSub` 1:1, Errors im UI als Banner sichtbar.
- **Befund**: Persistenz funktioniert. Ursprüngliches "weg" aktuell nicht reproduzierbar.
- **Drei Doku-Stellen mit falschem DB-Pfad korrigiert**:
  - HANDOVER 04.06.: nannte `.local/share/com.subtracked.app/...` — Verzeichnis UND Identifier falsch.
  - Mein neuer Backlog-Bug-Eintrag hatte den falschen Pfad geerbt.
  - Serena-Memory `tech_stack` war unscharf ("App-Data-Verzeichnis").
- **Sonderheit dokumentiert**: `tauri-plugin-sql` nutzt `app_config_dir()` (verifiziert in `tauri-plugin-sql/src/wrapper.rs:81`), nicht `app_data_dir()`. Auf Linux liegt die DB im Config-Dir.
- Backlog-Bug-Eintrag umformuliert von "kritisch" zu "beobachten, falls wieder" mit konkreten Repro-Schritten.

**2. lead_days-Backlog-Hakerl nachgezogen** (Commit `18f4c6d`). Das Feld war seit `f61d8ef` (Tag 1) im SubscriptionDialog wired und funktional — nur das Backlog-Item war nicht abgehakt.

**3. Mute-Toggle** (Commit `9634cf5`):
- Neue Migration `0002_add_notify.sql`: `ALTER TABLE subscriptions ADD COLUMN notify INTEGER NOT NULL DEFAULT 1`. Bestehende Abos bleiben "an", kein Daten-Verlust.
- `lib.rs` registriert Migration v2.
- `Subscription.notify: boolean` in `types.ts`. `db.ts` durchgängig: `SubRow.notify`, `mapSub`, `addSubscription` (optional, Default true — konsistent mit `active`), `updateSubscription`.
- `runReminderCheck` überspringt stumme Abos **vor** `insertReminderIfNew` — damit beim Wieder-Aktivieren in derselben Periode noch eine Notification feuern kann.
- `SubscriptionDialog`: Checkbox "Erinnerungen für dieses Abo", nutzt das `.setting-label`-CSS aus dem SettingsDialog.
- `App.tsx`: Liste zeigt `· stumm` hinter Konto-Name, damit stumme Abos erkennbar bleiben (sie tauchen weiter in Liste/Fixkosten auf).
- BACKLOG-Item abgehakt.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | `cf72f3a` (HANDOVER); davor `9634cf5`, `18f4c6d`, `3a73b58` |
| Working tree | clean |
| Build | `pnpm build` grün (290,93 KB JS / 14,55 KB CSS, gzipped 90,39 KB / 3,26 KB), `cargo check` grün |
| App | Mute-Toggle vom User abgenommen ("sollte passen"); Migration v2 läuft beim nächsten `pnpm tauri dev` automatisch auf der existierenden Dev-DB |

### Nächster Schritt

**"Als Nächstes (Hintergrund-Betrieb)" ist jetzt komplett abgeräumt** (Tray, Autostart, Notification-Permission-UX, Reminder-Loop, lead_days, Mute). Drei Optionen für den nächsten Block, geordnet nach erwartetem Wert:

1. **🚀 Lokales Installer-Build & richtige App-Installation.** Damit lebt SubTracked nicht mehr nur im `pnpm tauri dev`-Tab, sondern als echte App. Auch der einzige Weg, den Persistenz-Bug *richtig* zu reproduzieren (Dev-Lauf vs. installierter Lauf).
2. **📐 Tests & Qualitäts-Strategie diskutieren.** User wollte explizit eine Diskussion — Themen-Liste steht im Backlog.
3. **🌱 Später-Sektion**: UI-Redesign Richtung arsnova.eu (`mem:ui_vision`), tauri-plugin-opener entfernen, etc.

### Wichtige Entscheidungen + Begründung

- **`if (!sub.notify) continue;` VOR `insertReminderIfNew`** statt danach: ein Un-Mute soll für denselben Fälligkeitstag noch eine Notification erlauben können — das geht nur, wenn kein `reminders`-Eintrag existiert.
- **`notify` optional in `addSubscription`** mit Default `true`: konsistent mit `active`. Erlaubt zukünftigem Test-/Setup-Code, das Feld wegzulassen.
- **Checkbox nutzt `.setting-label`** aus dem SettingsDialog: einmal stylen, mehrfach verwenden. Kein neuer CSS-Wuchs.
- **`· stumm` als Text** statt Icon: keine extra Icon-Library, deutsche Lokalisierung passt, A11y umsonst.
- **Persistenz-Bug downgegraded** statt direkt Connection-Lifecycle zu auditieren: Disk-Evidenz sprach klar gegen einen Bug; tiefere Audit ohne reproduziertes Problem wäre Theater.

### Gotchas / Stolperfallen

- **DB-Pfad ist `~/.config/<identifier>/`, nicht `~/.local/share/...`**. `tauri-plugin-sql` nutzt `app_config_dir()`. Wer "Daten" semantisch im Data-Dir sucht, findet nur WebKit-Caches.
- **SQLite-Migration `ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT 1`** funktioniert nur mit **konstantem** Default. Mit `CURRENT_TIMESTAMP` o.ä. würde SQLite ablehnen. Für künftige Migrationen merken.
- **Mute-Toggle-Edge-Case**: Wenn ein Reminder VOR dem Muten in `reminders` landete, ist `isNew=false`. Selbst nach Un-Mute kommt für diesen Tag keine Notification mehr. Pragmatisch akzeptiert.

### Geänderte/neue Memories

- **Serena `tech_stack`**: SQLite-Pfad-Sektion präzisiert (App-Config-Dir, OS-spezifische Pfade, WAL-Status).

### Offen / nicht geklärt

- Persistenz-Beobachtung weiter "auf der Hut" — bei Wiederauftreten Repro-Schritte aus dem Backlog.
- Mute-Migration auf User-DB läuft erst beim nächsten App-Start; falls Migration schiefgeht, kommt der Fehler in der Console.
- "Als Nächstes"-Sektion ist leer; nächster großer Block ist Distribution oder Tests.

---

## 2026-06-05 — Autostart-Toggle + Backlog-Restrukturierung (Bugs, Distribution, Tests)

### Was passierte

- **`src/components/SettingsDialog.tsx`** (neu): native HTML5-`<dialog>` im gleichen Stil wie `AccountsDialog`. Eine Checkbox "Beim Login starten". Liest `isEnabled()` aus `@tauri-apps/plugin-autostart` beim Mount, beim Toggle ruft `enable()`/`disable()`. Pending-/Error-States, Schließen-Button mit der `closest("dialog")`-Konvention.
- **`src/App.tsx`**: Neuer Ref `settingsDialogRef`, Handler `openSettings`, "Einstellungen"-Button in `header-actions` (vor "Konten"/"Neues Abo"), `<SettingsDialog>` ans Ende der JSX.
- **`src/App.css`**: `.settings-dialog`, `.setting-row`, `.setting-label`, `.setting-hint` (Light + Dark).
- Das `tauri-plugin-autostart` war bereits komplett verdrahtet (Rust-Plugin in `lib.rs`, `desktop.json`-Capability, npm-Paket). Reine Frontend-Arbeit.
- **User-Braindump in den Backlog integriert** (siehe nächste Sektion).
- **Commits**:
  - `7878168` "Frontend: Autostart-Toggle in neuem Einstellungen-Dialog"
  - dieser HANDOVER-Commit (mit Backlog-Restrukturierung)

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | HANDOVER-Commit; Code-Commit davor: `7878168` |
| Working tree | clean |
| Build | `pnpm build` grün (290,53 KB JS / 14,55 KB CSS, gzipped 90,27 KB / 3,26 KB) |
| App | Autostart-Toggle vom User abgenommen, Toggle schreibt/löscht `.desktop` in `~/.config/autostart/` |

### Backlog-Restrukturierung (User-Wunsch)

Drei neue Sektionen vom User angeregt:

- **🐛 Bugs** zwischen "Erledigt" und "Jetzt". Erster Eintrag: **Datenpersistenz nach Reboot** — User beobachtete, dass nach System-Neustart bereits angelegte Abos weg waren. Reproduktions-Schritte stehen im Backlog. Potenziell kritisch.
- **🚀 Distribution & Setup** zwischen "Als Nächstes" und "Später". Zwei Items: lokales Installer-Build + `v0.1.0`-Tag. Hintergrund: User will langfristig SubTracked als richtige App auf dem Desktop nutzen, nicht jedesmal `pnpm tauri dev` starten.
- **📐 Tests & Qualität** als neue Sektion. Ein Item "Test- & Qualitätssicherungs-Strategie festlegen" — explizit als Diskussions-Item formuliert, **nicht** als Hands-on-Task. Subsumiert den bisherigen schmalen "Tests für recurrence.ts und coverage.ts"-Punkt aus "Später" (der wurde entfernt). User hat hohe Qualitätsanforderungen [[feedback-code-quality]] und will eine durchdachte Strategie statt ad-hoc Tests.

### Nächster Schritt

**Top-Priorität (Bug, nicht Feature):** 🐛 **Datenpersistenz nach Reboot reproduzieren und fixen.** Bevor weitere Features draufkommen, muss klar sein, dass User-Daten tatsächlich persistieren. Schritte stehen im Backlog. Vermutung: Connection-/WAL-Lifecycle oder Path-Drift zwischen Dev- und Build-Lauf.

Wenn Bug geklärt ist, weiter im Backlog:
- **lead_days editierbar** im SubscriptionDialog (Voraussetzung für Mute-Toggle)
- **Notifications pro Abo stummschaltbar**
- Dann **🚀 Lokales Installer-Build** als nächster Meilenstein (echte App-Nutzung statt Dev-Workflow)
- **📐 Tests- & Qualitäts-Strategie** ist eine Diskussion mit dem User; erst entscheiden, dann umsetzen

### Wichtige Entscheidungen + Begründung

- **Dedizierter `SettingsDialog`** statt Toggle direkt im Header oder Erweiterung von AccountsDialog: trennt Konfiguration sauber von Daten-Aktionen, bleibt erweiterbar (weitere Settings kommen sicher: lead_days-Default, Notifications-Verhalten, später Theme).
- **`autostart === true` als Checked-Logik**, nicht `Boolean(autostart)`: explizit, damit `null` (loading) eindeutig "noch unbekannt" bedeutet. Verhindert Flicker zwischen Default-false und tatsächlichem Wert während der Mount-Promise läuft.
- **`cancelled`-Flag im Mount-Effect**: Standard-Pattern gegen Race-Conditions, falls der Dialog während des async-Loads schon wieder unmounted wird (theoretisch — bei StrictMode-Doppel-Mount in Dev relevant).
- **Backlog: schmale "Tests für recurrence.ts und coverage.ts"-Punkt entfernt**, statt zwei parallele Test-Items zu führen. Das große Strategie-Item subsumiert ihn.
- **Backlog: 🐛-Sektion VOR "Jetzt"** statt am Ende: Bugs sollen sichtbar sein, nicht in der Liste verschwinden.

### Gotchas / Stolperfallen

- **Autostart-Plugin ist OS-spezifisch**:
  - Linux: `.desktop`-Datei in `~/.config/autostart/`. User-sichtbar, manuell löschbar.
  - macOS: registriert einen LaunchAgent.
  - Windows: Registry-Key unter `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`.
- **`Builder::new().build()` in `lib.rs`** nutzt Default-Args (leer). Wer der Auto-gestarteten Instanz spezielle Flags mitgeben will (z.B. `--hidden` für "still im Hintergrund starten ohne Fenster"), muss das via `Builder::new().args(...)` setzen. Aktuell startet die App beim Login mit normalem Fenster — funktional OK, aber "still im Tray" wäre eleganter. Nicht jetzt nötig.
- **Plugin-Errors landen als `Promise.reject` mit OS-Fehlertext** (z.B. wenn `~/.config/autostart/` wegen Permission nicht schreibbar). Wird im Banner unten im Dialog angezeigt.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- **🐛 Datenpersistenz-Bug** (siehe "Nächster Schritt") — Priorität 1 für die nächste Session, bevor weitere Features.
- Autostart-Args-Flag "still starten" (Gotchas) — nicht jetzt.
- Tests & Qualität: Strategie offen, Diskussion mit User steht an.

---

## 2026-06-05 — Tray-Icon + Hide-on-Close

### Was passierte

- **`src-tauri/Cargo.toml`**: Feature `tray-icon` für die `tauri`-Crate aktiviert (vorher `features = []`). Tauri 2 hat Tray nativ, kein separates Plugin.
- **`src-tauri/src/lib.rs`**:
  - Neue Imports: `tauri::menu::{Menu, MenuItem}`, `tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}`, `tauri::{Manager, WindowEvent}`.
  - `.setup(|app| ...)`-Block: baut zwei `MenuItem`s ("Fenster zeigen", "Beenden"), schiebt sie in ein `Menu`, übergibt das an den `TrayIconBuilder`. Icon = `app.default_window_icon()`. `show_menu_on_left_click(false)` — Linksklick zeigt das Fenster, das Menü erscheint per Rechtsklick.
  - `.on_window_event(...)` für `CloseRequested`: `api.prevent_close()` + `window.hide()`.
  - Helper `fn show_main_window(app: &tauri::AppHandle)` unter `run()`: bündelt `unminimize` + `show` + `set_focus`, weil das aus zwei Stellen aufgerufen wird (Menü-"show" und Linksklick).
- **BACKLOG**: "Tray-Icon + Fenster beim Schließen nur verstecken" abgehakt.
- **Commits**:
  - `eac1d12` "Tray: Tray-Icon + Hide-on-Close ..."
  - dieser HANDOVER-Commit

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | HANDOVER-Commit; Code-Commit davor: `eac1d12` |
| Working tree | clean |
| Build | `cargo check` grün, `pnpm build` weiter grün (Frontend unverändert) |
| App | Vom User abgenommen: Tray-Icon erscheint, Linksklick zeigt Fenster, Rechtsklick öffnet Menü, X versteckt, "Beenden" exit |

### Nächster Schritt

Backlog "Als Nächstes (Hintergrund-Betrieb)":
1. **Autostart beim Login** (`@tauri-apps/plugin-autostart`) — das Plugin ist schon in `Cargo.toml` und im Builder registriert. Fehlt nur die UI: ein Toggle in (neuen) Einstellungen. Naheliegend, weil zusammen mit Tray + Reminder-Loop die "läuft im Hintergrund"-UX komplett wird.
2. **`lead_days` pro Abo editierbar** — kleiner Add im `SubscriptionDialog`, Voraussetzung für den Mute-Toggle.
3. **Notifications pro Abo stummschaltbar** — Migration `notify INTEGER DEFAULT 1` + UI-Toggle.

### Wichtige Entscheidungen + Begründung

- **`tray-icon`-Feature auf der `tauri`-Crate** statt separates Plugin: Tauri 2 hat Tray nativ — Plugin-Dep wäre überflüssig.
- **Helper `show_main_window`** statt zweimal denselben dreizeiligen Block (unminimize/show/set_focus): eine Stelle, falls später Position/Größe restauriert werden müssen.
- **`show_menu_on_left_click(false)`**: Linksklick soll *zeigen*, nicht das Menü öffnen. Rechtsklick = Menü, das entspricht KDE-/Windows-Konvention.
- **`window.hide()` statt `window.minimize()`** beim Close: Minimieren würde die Taskbar nicht räumen, "im Hintergrund laufen" wäre kosmetisch falsch.
- **`app.exit(0)` direkt im Quit-Handler**: keine Graceful-Shutdown-Routine nötig — alles state-relevante (SQLite, Reminder-Tabelle) ist persistent.

### Gotchas / Stolperfallen

- **Tray-Support ist desktop-abhängig**:
  - KDE Plasma / Windows / macOS: out-of-box.
  - GNOME: braucht "AppIndicator and KStatusNotifierItem Support"-Extension.
  - Hyprland/Sway/i3: hängt am Statusbar-Daemon (waybar mit `tray`-Modul, eww, polybar mit `tray`).
- **Ohne sichtbares Tray = "App weg, nicht beendbar"**: User klickt X, kein Tray-Icon → einziger Ausweg ist `pkill subtracked` o.ä. Aktuell keine Fallback-Strategie (Hotkey, "Wirklich verstecken?"-Dialog). Akzeptiert weil User auf KDE-artigem System.
- **`on_window_event` feuert für alle Windows**. Wir haben nur "main", unkritisch. Bei einem späteren zweiten Window (Settings, About) muss man per `window.label()`-Check filtern, sonst versteckt X dort auch nur statt zu schließen.
- **Linux-Runtime-Dep**: `tray-icon` nutzt unter Linux `libayatana-appindicator` (bzw. GTK-Pfad). Auf Arch/cachyos meist vorhanden; auf anderen Distros ggf. `libayatana-appindicator3` o.ä. nachinstallieren.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Fallback für tray-lose Desktops (siehe Gotchas). Aktuell wartet das auf reales Schmerz-Feedback.
- Backlog-Reihenfolge "Als Nächstes" unverändert.

---

## 2026-06-05 — Notification-Permission als bewusste UI-Aktion

### Was passierte

- **`src/lib/reminders.ts`**: `runReminderCheck` fragt die Notification-Permission nicht mehr selbst an. Nur noch `isPermissionGranted()`-Check; ohne Granted entfällt `sendNotification()`, der DB-Eintrag (`insertReminderIfNew`) passiert weiterhin. Doc-Kommentar entsprechend angepasst.
- **`src/components/NotificationPermissionBanner.tsx`** (neu): Banner-Komponente mit Stati `loading | granted | default | denied`. `loading` und `granted` rendern `null` (kein Flicker, kein Rauschen). `default` zeigt einen "Aktivieren"-Button, `denied` einen informativen Hinweis auf die Systemeinstellungen.
- **`src/App.tsx`**:
  - Neuer State `notifStatus: NotificationStatus` (initial `"loading"`).
  - Mount-`useEffect` ruft `isPermissionGranted()`, mappt Boolean → `"granted" | "default"`. Fehlerfall: Console-Log + Fallback auf `"default"`.
  - Handler `activateNotifications()` ruft `requestPermission()` und mappt auf die Tri-State (`granted | denied | default`).
  - Banner zwischen Header und Lade-/Fehler-/Liste-Block; `onActivate` per `() => void activateNotifications()` synchron gewrappt.
- **`src/App.css`**: `.permission-banner` + `.permission-banner--denied`-Varianten, Light- und Dark-Mode.
- **BACKLOG**: "Notification-Berechtigung sauber abfragen und Status anzeigen" abgehakt.
- **Commit**: `b911081` "Frontend: Notification-Permission als bewusste UI-Aktion". HANDOVER + Backlog folgen im nächsten Commit.

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | `77c43d9` (HANDOVER-Commit), Code-Commit davor: `b911081` |
| Working tree | clean |
| Build | grün (`pnpm build` → 288,96 KB JS / 14,06 KB CSS, gzipped 89,91 KB / 3,16 KB) |
| App | startbar (`pnpm tauri dev`); **Banner-Optik vom User abgenommen** |

### Nächster Schritt

Backlog "Als Nächstes (Hintergrund-Betrieb)" — sinnvolle Reihenfolge:
1. **Tray-Icon + Hide-on-Close** — Voraussetzung dafür, dass der Reminder-Loop überhaupt zwischen App-Starts wirksam läuft. Eine geschlossene Webview feuert keine Intervalle mehr.
2. **Autostart beim Login** über Einstellungen aktivierbar (`@tauri-apps/plugin-autostart`).
3. **`lead_days` pro Abo in der UI editierbar** — kleines Add im `SubscriptionDialog`. Voraussetzung für den Mute-Toggle.
4. **Notifications pro Abo stummschaltbar** — neue Migration + UI-Toggle.

### Wichtige Entscheidungen + Begründung

- **Tri-State nicht direkt abfragbar.** Das Plugin exportiert nur `isPermissionGranted(): boolean` und `requestPermission(): "default" | "denied" | "granted"` — kein nicht-intrusives `permissionState()`. Konsequenz: Wir können `denied` vs `default` ohne User-Aktion nicht unterscheiden. Lösung: Beim Mount Boolean prüfen, ohne Granted erstmal als `"default"` darstellen; erst nach Button-Klick kennt die UI auch `"denied"`.
- **Permission-Anfrage komplett aus `runReminderCheck` ziehen.** Ein Modul soll nicht stellvertretend für die UI System-Dialoge auslösen. Verantwortlichkeit liegt jetzt klar bei der App-Komponente; Folge: `runReminderCheck` ist jetzt ohne Side-Effect-Überraschung aus anderen Kontexten aufrufbar (später z.B. aus einer Tray-Routine).
- **DB-Eintrag passiert auch ohne Permission.** Bewusst beibehalten — `reminders` ist Idempotenz-Anker, nicht "ich habe geschickt"-Log. Edge-Case dadurch siehe Gotchas.
- **Banner zwischen Header und Liste**, nicht im Header selbst: globaler Hinweis ist dort lesbar, ohne die Action-Buttons zu überladen.
- **Banner-Komponente exportiert `NotificationStatus`** statt Doppel-Definition in `App.tsx`: eine Wahrheit für die Status-Werte.
- **Inline-Arrow-Wrapper `() => void activateNotifications()`** beim Banner-Prop: `onActivate` ist `() => void`, `activateNotifications` ist async. Der Wrapper verhindert eine "Promise nicht awaited"-Warnung und gibt React keine Promise als Event-Return.

### Gotchas / Stolperfallen

- **Plugin-API hat kein `permissionState`.** Wer das Tri-State ohne Prompt braucht (z.B. später für einen Settings-Bildschirm), muss `isPermissionGranted` nutzen und `denied` nur **nach** einem User-getriggerten `requestPermission()` setzen — oder die Ablehnung selbst persistieren.
- **Erste Reminder-Loop-Tick läuft jetzt fast immer ohne Permission** (außer beim Re-Open einer bereits genehmigten App). Dadurch werden heute fällige Reminders ohne Notification in der DB archiviert. Klickt der User direkt danach auf "Aktivieren", ist es für **heutige** Reminders zu spät: `isNew=false` beim nächsten Tick. Symptom: "Aktiviert geklickt, nichts passiert". Bewusst nicht jetzt gelöst — Edge-Case wird erst bei echter täglicher Nutzung sichtbar. Vermerkt im "Offen"-Block.
- **Banner rendert `null` bei `loading` UND `granted`.** Wer per Snapshot/Testing prüft, muss beide Stati im Blick haben, sonst hält man den Banner für "tot".
- **Tauri Notification-Permission per OS-Setting widerrufbar** (zumindest macOS/Windows). Unsere UI hat keinen Listener für Widerrufe — der nächste Mount/Reload korrigiert es, der laufende Prozess nicht. Akzeptabel für MVP.

### Geänderte/neue Memories

- Keine.

### Offen / nicht geklärt

- Edge-Case "Reminders schon ohne Permission archiviert, danach aktiviert" — siehe Gotchas, erst bei echter Nutzung relevant.
- Backlog-Reihenfolge "Als Nächstes" bleibt unverändert.

---

## 2026-06-05 — Schritt 8/8: Reminder-Loop verdrahtet

### Was passierte

- `src/App.tsx`: zweiter `useEffect` ergänzt. Beim Mount läuft `runReminderCheck()` einmal sofort, danach via `setInterval` stündlich (`60 * 60 * 1000 ms`). Cleanup per `clearInterval` im Effect-Return.
- Fehler werden mit `.catch(...)` abgefangen und nur auf die Console geloggt — eine fehlgeschlagene Reminder-Runde darf nicht die UI crashen.
- Import von `runReminderCheck` aus `./lib/reminders` ergänzt.
- BACKLOG-Item "Erinnerungs-Check verdrahten" abgehakt.
- Commit: `d3fb014` "Frontend: Reminder-Loop in App.tsx verdrahtet (Schritt 8/8)".

### Status am Sitzungsende

| Bereich | Stand |
|---|---|
| Branch | `main`, **synchron mit `origin/main`** (gepusht) |
| HEAD | `18c56db` (HANDOVER-Commit), Code-Commit davor: `d3fb014` |
| Working tree | clean |
| Build | grün (`pnpm build` → 288,05 KB JS / 13,57 KB CSS, gzipped 89,62 KB / 3,07 KB) |
| App | startbar wie zuvor mit `pnpm tauri dev` |
| Test-Daten | unverändert (DB-Inhalt der Dev-Instanz hängt am lokalen Zustand) |

Damit ist der **ursprüngliche 8er-Plan komplett**.

### Nächster Schritt

`BACKLOG.md` "Als Nächstes (Hintergrund-Betrieb)" gibt die Reihenfolge vor. Naheliegend und in dieser Reihenfolge sinnvoll, weil aufeinander aufbauend:

1. **Notification-Berechtigung sauber abfragen und Status anzeigen.** Aktuell springt `runReminderCheck` direkt beim ersten Tick (= beim App-Start) in `requestPermission()`, wenn noch keine Berechtigung erteilt wurde. Das ist überraschend für User. Lieber: Permission-Status sichtbar in der UI, Button "Benachrichtigungen aktivieren" → erst dann fragen.
2. **`lead_days` pro Abo editierbar** im `SubscriptionDialog`. Voraussetzung für den Mute-Toggle (Backlog), weil beides die `subscriptions`-Spalten betrifft.
3. **Notifications pro Abo stummschaltbar** — neue Migration mit `notify INTEGER DEFAULT 1`, UI-Toggle, `runReminderCheck` überspringt stumme Abos.

### Wichtige Entscheidungen + Begründung

- **Synchroner `tick`-Wrapper + `.catch`** statt async-Callback an `setInterval`: `setInterval` ignoriert Promise-Returns, eine ungefangene Rejection wäre ein `unhandledrejection`-Event. Der Wrapper macht das Fehlerhandling explizit.
- **Sofort beim Mount aufrufen**, nicht erst nach dem ersten Intervall-Tick: sonst müsste man nach App-Start eine Stunde warten, bevor irgendwas passiert. `runReminderCheck` ist idempotent (`insertReminderIfNew` mit `UNIQUE(subscription_id, due_date) + INSERT OR IGNORE`), Doppelaufrufe sind harmlos.
- **Leeres Dependency-Array (`[]`)**: der Effect soll exakt einmal pro Mount aufgesetzt werden — kein Restart bei Re-Render, keine `useCallback`-Verflechtung mit `reloadAll`. Reminder-Loop ist unabhängig vom Daten-Reload.
- **Stundenintervall** wie in HANDOVER vom 04.06. vorgemerkt: schnell genug für tägliche `lead_days`-Auflösung, ohne die DB ständig zu fragen.
- **Kein `try/catch` um den Body von `runReminderCheck`** — der Fehler kommt schon als rejected Promise zurück, `.catch` reicht.

### Gotchas / Stolperfallen

- **React `StrictMode` ist in `src/main.tsx` aktiv.** In Dev (nicht Prod!) wird der Effect zweimal aufgesetzt → es passieren zwei `tick()`-Aufrufe direkt nach Mount, danach zwei parallele Intervalle. Beide Loops sind durch die Idempotenz harmlos, aber im Devtools sieht man doppelt so viele DB-Abfragen. In Prod-Builds tritt das nicht auf.
- **Erster `tick()` kann sofort einen System-Permission-Dialog auslösen**, wenn Notifications noch nie gewährt wurden — `runReminderCheck` ruft intern `requestPermission()`. → Verbesserung steht oben unter "Nächster Schritt".
- **Intervall überlebt keine Pause des Webview** (z.B. Fenster minimiert, Suspend des Systems). Wer mehr Garantien will, müsste Tauri-seitig im Rust-Hauptprozess einen Scheduler bauen. Für den MVP reicht der Webview-Interval.

### Geänderte/neue Memories

- Keine. Alles aus dieser Session ist aus dem Code ableitbar.

### Offen / nicht geklärt

- Permission-UX (siehe oben) — die jetzige Lösung ist funktional, aber nicht freundlich.
- Backlog-Punkte "Als Nächstes" und "Später" unverändert.
- Multi-Currency, ON-DELETE-CASCADE-Migration, `SubRow.interval`-Cast — alles weiter offen wie in der Vorgänger-Übergabe.

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
- **Migrationen sind unveränderlich nach Apply.** Neue `.sql` mit nächster `version` in `lib.rs` registrieren. Bei Schema-Drift im Dev: `~/.config/com.tcgtvv.subtracked/subtracker.db` (Linux) bzw. OS-Äquivalent löschen und Dev neu starten. **Achtung:** `tauri-plugin-sql` legt die DB im **App-Config-Dir** ab (nicht Data-Dir), siehe `app_config_dir()` in `tauri-plugin-sql/src/wrapper.rs`. Auf macOS: `~/Library/Application Support/com.tcgtvv.subtracked/`, Windows: `%APPDATA%\com.tcgtvv.subtracked\`. Korrigiert in der 2026-06-05-Diagnose-Session — der frühere Pfad-Eintrag mit `.local/share/com.subtracked.app/` war doppelt falsch (Verzeichnis + Identifier).
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
