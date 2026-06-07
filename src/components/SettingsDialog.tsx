import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { type Ref, useCallback, useEffect, useId, useState } from "react";
import { getReminderStatus, type ReminderStatus, sendTestNotification } from "../lib/db";

interface Props {
  ref: Ref<HTMLDialogElement>;
  openSeq?: number;
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

export function SettingsDialog({ ref, openSeq = 0 }: Props) {
  const autostartId = useId();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [testNotificationPending, setTestNotificationPending] = useState(false);

  const loadReminderStatus = useCallback(async () => {
    try {
      setReminderStatus(await getReminderStatus());
      setReminderError(null);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : String(e));
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
    return () => {
      cancelled = true;
    };
  }, [loadReminderStatus]);

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

  const nextCheck =
    reminderStatus?.lastCheckAt != null
      ? new Date(
          new Date(reminderStatus.lastCheckAt).getTime() + reminderStatus.intervalSecs * 1000,
        ).toISOString()
      : null;

  return (
    <dialog ref={ref} className="dialog">
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

        {(error || reminderError) && (
          <p className="error" role="alert">
            Fehler: {error ?? reminderError}
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
