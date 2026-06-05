import { useEffect, useId, useState, type Ref } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

interface Props {
  ref: Ref<HTMLDialogElement>;
}

export function SettingsDialog({ ref }: Props) {
  const autostartId = useId();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

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

        {error && (
          <p className="error" role="alert">
            Fehler: {error}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={(e) => e.currentTarget.closest("dialog")?.close()}
          >
            Schließen
          </button>
        </div>
      </div>
    </dialog>
  );
}
