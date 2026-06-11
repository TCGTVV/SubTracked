import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open, save } from "@tauri-apps/plugin-dialog";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { type Ref, useCallback, useEffect, useId, useState } from "react";
import {
  type AppInfo,
  exportBackup,
  getAppInfo,
  getReminderStatus,
  importBackup,
  type ReminderStatus,
  sendTestNotification,
} from "../lib/db";
import { closeDialogOnBackdropClick } from "../lib/dialog";

interface Props {
  ref: Ref<HTMLDialogElement>;
  openSeq?: number;
  /** Wird nach erfolgreichem Import aufgerufen, damit die App ihre Daten neu lädt. */
  onDataReplaced?: () => void | Promise<void>;
}

function formatDateTime(iso: string): string {
  return format(parseISO(iso), "dd.MM.yyyy HH:mm", { locale: de });
}

function formatDate(iso: string): string {
  return format(parseISO(iso), "dd.MM.yyyy", { locale: de });
}

function formatInterval(secs: number): string {
  if (secs >= 3600 && secs % 3600 === 0) {
    const h = secs / 3600;
    return h === 1 ? "1 Stunde" : `${h} Stunden`;
  }
  const minutes = Math.round(secs / 60);
  return `${minutes} Minuten`;
}

export function SettingsDialog({ ref, openSeq = 0, onDataReplaced }: Props) {
  const autostartId = useId();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [testNotificationPending, setTestNotificationPending] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appInfoError, setAppInfoError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<"config" | "log" | null>(null);

  const [backupPending, setBackupPending] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);

  const loadReminderStatus = useCallback(async () => {
    try {
      setReminderStatus(await getReminderStatus());
      setReminderError(null);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadAppInfo = useCallback(async () => {
    try {
      setAppInfo(await getAppInfo());
      setAppInfoError(null);
    } catch (e) {
      setAppInfoError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const enabled = await isEnabled();
        if (!cancelled) setAutostart(enabled);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAutostart(false);
        }
      }
    })();
    void loadReminderStatus();
    void loadAppInfo();
    return () => {
      cancelled = true;
    };
  }, [loadAppInfo, loadReminderStatus]);

  useEffect(() => {
    if (openSeq > 0) void loadReminderStatus();
  }, [loadReminderStatus, openSeq]);

  async function handleToggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      if (next) await enable();
      else await disable();
      setAutostart(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function handleTestNotification() {
    setTestNotificationPending(true);
    setTestNotificationSent(false);
    setReminderError(null);
    try {
      await sendTestNotification();
      setTestNotificationSent(true);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestNotificationPending(false);
    }
  }

  async function handleExport() {
    setBackupPending(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const path = await save({
        defaultPath: `subtracked-backup-${format(new Date(), "yyyy-MM-dd")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return; // Dialog abgebrochen
      await exportBackup(path);
      setBackupMessage(`✓ Backup gespeichert: ${path}`);
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupPending(false);
    }
  }

  async function handleImportConfirmed() {
    setBackupPending(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof selected !== "string") return; // Dialog abgebrochen
      await importBackup(selected);
      setConfirmingImport(false);
      setBackupMessage("✓ Backup importiert — Daten wurden wiederhergestellt.");
      await onDataReplaced?.();
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupPending(false);
    }
  }

  async function copyPath(kind: "config" | "log", path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(kind);
      setAppInfoError(null);
    } catch (e) {
      setCopiedPath(null);
      setAppInfoError(e instanceof Error ? e.message : String(e));
    }
  }

  const nextCheck =
    reminderStatus?.lastCheckAt != null
      ? new Date(
          new Date(reminderStatus.lastCheckAt).getTime() + reminderStatus.intervalSecs * 1000,
        ).toISOString()
      : null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: nativer <dialog> schliesst per Escape; onClick ergaenzt nur den Backdrop-Klick
    <dialog ref={ref} className="dialog" onClick={closeDialogOnBackdropClick}>
      <div className="settings-dialog">
        <h2>Einstellungen</h2>

        <div className="setting-row">
          <label htmlFor={autostartId} className="setting-label">
            <input
              id={autostartId}
              type="checkbox"
              checked={autostart === true}
              disabled={autostart === null || pending}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            <span>Beim Login starten</span>
          </label>
          <p className="setting-hint">
            SubTracked startet nach dem Anmelden automatisch im Hintergrund. Zusammen mit dem
            Tray-Icon laufen Erinnerungen so ohne manuellen Start.
          </p>
        </div>

        <div className="setting-row">
          <h3 className="setting-subheading">Erinnerungen testen</h3>
          <p className="setting-hint">
            Sendet sofort eine Test-Notification — zeigt, ob Berechtigung, OS-Integration und der
            sichtbare Toast richtig zusammenspielen.
          </p>
          <div className="setting-action-row">
            <button
              type="button"
              onClick={() => void handleTestNotification()}
              disabled={testNotificationPending}
            >
              {testNotificationPending ? "Sende …" : "Test-Erinnerung senden"}
            </button>
            {testNotificationSent && (
              <span className="setting-confirm" role="status">
                ✓ Gesendet — siehst du den Toast?
              </span>
            )}
          </div>
        </div>

        <div className="setting-row">
          <h3 className="setting-subheading">Erinnerungs-Status</h3>
          {reminderStatus ? (
            <dl className="reminder-status">
              <dt>Intervall</dt>
              <dd>alle {formatInterval(reminderStatus.intervalSecs)}</dd>
              <dt>Letzte Prüfung</dt>
              <dd>
                {reminderStatus.lastCheckAt
                  ? formatDateTime(reminderStatus.lastCheckAt)
                  : "noch keine"}
              </dd>
              <dt>Nächste Prüfung</dt>
              <dd>{nextCheck ? formatDateTime(nextCheck) : "—"}</dd>
              <dt>Letzte Erinnerung</dt>
              <dd>
                {reminderStatus.lastSent ? (
                  <>
                    {reminderStatus.lastSent.subscriptionName} (fällig{" "}
                    {formatDate(reminderStatus.lastSent.dueDate)})
                  </>
                ) : (
                  "noch keine"
                )}
              </dd>
            </dl>
          ) : (
            <p className="setting-hint">Lade …</p>
          )}
          <div className="setting-action-row">
            <button type="button" onClick={() => void loadReminderStatus()}>
              Aktualisieren
            </button>
          </div>
        </div>

        <div className="setting-row">
          <h3 className="setting-subheading">App / Support</h3>
          {appInfo ? (
            <dl className="app-info">
              <dt>Version</dt>
              <dd>{appInfo.version}</dd>
              <dt>Datenordner</dt>
              <dd>
                <code>{appInfo.configDir}</code>
                <button type="button" onClick={() => void copyPath("config", appInfo.configDir)}>
                  Kopieren
                </button>
                {copiedPath === "config" && <span role="status">kopiert</span>}
              </dd>
              <dt>Log-Ordner</dt>
              <dd>
                <code>{appInfo.logDir}</code>
                <button type="button" onClick={() => void copyPath("log", appInfo.logDir)}>
                  Kopieren
                </button>
                {copiedPath === "log" && <span role="status">kopiert</span>}
              </dd>
            </dl>
          ) : (
            <p className="setting-hint">Lade …</p>
          )}
        </div>

        <div className="setting-row">
          <h3 className="setting-subheading">Daten / Backup</h3>
          <p className="setting-hint">
            Alle Daten liegen nur lokal auf diesem Gerät. Ein Backup sichert Konten, Abos, Einnahmen
            und Verlauf als JSON-Datei. Beim Import wird der gesamte aktuelle Bestand durch das
            Backup <strong>ersetzt</strong>.
          </p>
          <div className="setting-action-row">
            <button type="button" onClick={() => void handleExport()} disabled={backupPending}>
              {backupPending ? "Arbeite …" : "Backup exportieren"}
            </button>
            {!confirmingImport && (
              <button
                type="button"
                onClick={() => {
                  setBackupMessage(null);
                  setBackupError(null);
                  setConfirmingImport(true);
                }}
                disabled={backupPending}
              >
                Backup importieren
              </button>
            )}
          </div>

          {confirmingImport && (
            <div className="setting-confirm-box" role="alertdialog" aria-label="Import bestätigen">
              <p>
                <strong>Wirklich importieren?</strong> Alle aktuellen Konten, Abos und Einnahmen
                gehen verloren und werden durch das Backup ersetzt.
              </p>
              <div className="setting-action-row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => void handleImportConfirmed()}
                  disabled={backupPending}
                >
                  {backupPending ? "Stelle wieder her …" : "Ja, ersetzen"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingImport(false)}
                  disabled={backupPending}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {backupMessage && (
            <span className="setting-confirm" role="status">
              {backupMessage}
            </span>
          )}
          {backupError && (
            <p className="error" role="alert">
              Fehler: {backupError}
            </p>
          )}
        </div>

        {(error || reminderError || appInfoError) && (
          <p className="error" role="alert">
            Fehler: {error ?? reminderError ?? appInfoError}
          </p>
        )}

        <div className="form-actions">
          <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
            Schließen
          </button>
        </div>
      </div>
    </dialog>
  );
}
