# HANDOVER.md — Schichtübergabe für Agents

> **Konvention für jeden Agent, der an SubTracked arbeitet:**
>
> 1. **Session-Start:** Diesen Eintrag oben **vollständig lesen**, bevor du etwas anderes tust. Erst danach `AGENTS.md`, `BACKLOG.md`, Memories etc.
> 2. **Session-Ende:** Einen neuen Eintrag **oben** anfügen (direkt unter dieser Anleitung, über dem aktuell obersten Eintrag). Schablone steht ganz unten in dieser Datei.
> 3. Alte Einträge **nicht löschen** — sie sind der Verlauf, wie git-Log, aber narrativ. Wenn die Datei zu lang wird, älteste Einträge in `HANDOVER-archive.md` auslagern (ab ~20 Einträgen sinnvoll).
> 4. Sprache: Deutsch (passend zur Projekt-Konvention).

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
| Branch | `main`, **noch nicht gepusht** (Code-Commits + dieser HANDOVER-Commit lokal voraus) |
| HEAD | HANDOVER-Commit; davor `9634cf5`, `18f4c6d`, `3a73b58` |
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
