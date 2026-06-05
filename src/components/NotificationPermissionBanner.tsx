export type NotificationStatus = "loading" | "granted" | "default" | "denied";

interface Props {
  status: NotificationStatus;
  onActivate: () => void;
}

export function NotificationPermissionBanner({ status, onActivate }: Props) {
  if (status === "loading" || status === "granted") return null;

  if (status === "denied") {
    return (
      <div className="permission-banner permission-banner--denied" role="status">
        Benachrichtigungen sind blockiert. Bitte in den System-Einstellungen aktivieren.
      </div>
    );
  }

  return (
    <div className="permission-banner" role="status">
      <span>
        Benachrichtigungen sind nicht aktiviert — ohne Aktivierung kommen keine Erinnerungen.
      </span>
      <button type="button" onClick={onActivate}>
        Aktivieren
      </button>
    </div>
  );
}
