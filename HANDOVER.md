# HANDOVER.md — Schichtübergabe für Agents

> **Konvention für jeden Agent, der an SubTracked arbeitet:**
>
> 1. **Session-Start:** Diesen Eintrag oben **vollständig lesen**, bevor du etwas anderes tust. Erst danach `AGENTS.md`, `BACKLOG.md`, Memories etc.
> 2. **Session-Ende:** Einen neuen Eintrag **oben** anfügen (direkt unter dieser Anleitung, über dem aktuell obersten Eintrag). Schablone steht ganz unten in dieser Datei.
> 3. Alte Einträge **nicht löschen** — sie sind der Verlauf, wie git-Log, aber narrativ. Wenn die Datei zu lang wird, älteste Einträge in `HANDOVER-archive.md` auslagern (ab ~20 Einträgen sinnvoll).
> 4. Sprache: Deutsch (passend zur Projekt-Konvention).

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
