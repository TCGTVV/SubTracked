import { BellOff, BellRing } from "lucide-react";
import { Button } from "./ui/button";

export type NotificationStatus = "loading" | "granted" | "default" | "denied";

interface Props {
  status: NotificationStatus;
  onActivate: () => void;
}

export function NotificationPermissionBanner({ status, onActivate }: Props) {
  if (status === "loading" || status === "granted") return null;

  if (status === "denied") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="status"
      >
        <BellOff className="size-4 shrink-0" />
        Benachrichtigungen sind blockiert. Bitte in den System-Einstellungen aktivieren.
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
      role="status"
    >
      <span className="flex items-center gap-2">
        <BellRing className="size-4 shrink-0 text-warning" />
        Benachrichtigungen sind nicht aktiviert — ohne Aktivierung kommen keine Erinnerungen.
      </span>
      <Button type="button" size="sm" onClick={onActivate}>
        Aktivieren
      </Button>
    </div>
  );
}
