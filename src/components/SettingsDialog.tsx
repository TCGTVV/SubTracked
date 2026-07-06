import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openFileDialog, save } from "@tauri-apps/plugin-dialog";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Settings } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  type AppInfo,
  exportBackup,
  exportSubscriptionsCsv,
  getAppInfo,
  getReminderStatus,
  importBackup,
  type ReminderStatus,
  sendTestNotification,
} from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wird nach erfolgreichem Import aufgerufen, damit die App ihre Daten neu lädt. */
  onDataReplaced?: () => void | Promise<void>;
  /** Schließt Settings und öffnet den Bankauszug-CSV-Import-Dialog. */
  onStartCsvImport?: () => void;
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

export function SettingsDialog({ open, onClose, onDataReplaced, onStartCsvImport }: Props) {
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

  const [csvExportPending, setCsvExportPending] = useState(false);
  const [csvExportMessage, setCsvExportMessage] = useState<string | null>(null);
  const [csvExportError, setCsvExportError] = useState<string | null>(null);

  const loadReminderStatus = useCallback(async () => {
    try {
      setReminderStatus(await getReminderStatus());
      setReminderError(null);
    } catch (e) {
      setReminderError(toUserMessage(e, "Erinnerungs-Status laden"));
    }
  }, []);

  const loadAppInfo = useCallback(async () => {
    try {
      setAppInfo(await getAppInfo());
      setAppInfoError(null);
    } catch (e) {
      setAppInfoError(toUserMessage(e, "App-Informationen laden"));
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
          setError(toUserMessage(e, "Autostart-Status laden"));
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

  // Beim Öffnen (open false→true) den Reminder-Status neu laden — aber nicht beim
  // initialen Mount, da der Mount-Effect oben das bereits einmalig erledigt.
  const skipInitialOpen = useRef(true);
  useEffect(() => {
    if (skipInitialOpen.current) {
      skipInitialOpen.current = false;
      return;
    }
    if (open) void loadReminderStatus();
  }, [loadReminderStatus, open]);

  async function handleToggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      if (next) await enable();
      else await disable();
      setAutostart(next);
    } catch (e) {
      setError(toUserMessage(e, "Autostart umstellen"));
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
      setReminderError(toUserMessage(e, "Test-Benachrichtigung senden"));
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
      setBackupError(toUserMessage(e, "Backup speichern"));
    } finally {
      setBackupPending(false);
    }
  }

  async function handleImportConfirmed() {
    setBackupPending(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof selected !== "string") return; // Dialog abgebrochen
      await importBackup(selected);
      setConfirmingImport(false);
      setBackupMessage("✓ Backup importiert — Daten wurden wiederhergestellt.");
      await onDataReplaced?.();
    } catch (e) {
      setBackupError(toUserMessage(e, "Backup wiederherstellen"));
    } finally {
      setBackupPending(false);
    }
  }

  async function handleExportCsv() {
    setCsvExportPending(true);
    setCsvExportMessage(null);
    setCsvExportError(null);
    try {
      const path = await save({
        defaultPath: `subtracked-abos-${format(new Date(), "yyyy-MM-dd")}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return; // Dialog abgebrochen
      await exportSubscriptionsCsv(path);
      setCsvExportMessage(`✓ CSV gespeichert: ${path}`);
    } catch (e) {
      setCsvExportError(toUserMessage(e, "CSV exportieren"));
    } finally {
      setCsvExportPending(false);
    }
  }

  async function copyPath(kind: "config" | "log", path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(kind);
      setAppInfoError(null);
    } catch (e) {
      setCopiedPath(null);
      setAppInfoError(toUserMessage(e, "Pfad kopieren"));
    }
  }

  const nextCheck =
    reminderStatus?.lastCheckAt != null
      ? new Date(
          new Date(reminderStatus.lastCheckAt).getTime() + reminderStatus.intervalSecs * 1000,
        ).toISOString()
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fluid-lg">
            <Settings className="size-5 text-primary" />
            Einstellungen
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={autostartId} className="font-medium">
                Beim Login starten
              </Label>
              <Switch
                id={autostartId}
                checked={autostart === true}
                disabled={autostart === null || pending}
                onCheckedChange={(checked) => void handleToggle(checked)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              SubTracked startet nach dem Anmelden automatisch im Hintergrund. Zusammen mit dem
              Tray-Icon laufen Erinnerungen so ohne manuellen Start.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Erinnerungen testen</h3>
            <p className="text-xs text-muted-foreground">
              Sendet sofort eine Test-Notification — zeigt, ob Berechtigung, OS-Integration und der
              sichtbare Toast richtig zusammenspielen.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleTestNotification()}
                disabled={testNotificationPending}
              >
                {testNotificationPending ? "Sende …" : "Test-Erinnerung senden"}
              </Button>
              {testNotificationSent && (
                <span className="text-sm text-success" role="status">
                  ✓ Gesendet — siehst du den Toast?
                </span>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Erinnerungs-Status</h3>
            {reminderStatus ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Intervall</dt>
                <dd>alle {formatInterval(reminderStatus.intervalSecs)}</dd>
                <dt className="text-muted-foreground">Letzte Prüfung</dt>
                <dd>
                  {reminderStatus.lastCheckAt
                    ? formatDateTime(reminderStatus.lastCheckAt)
                    : "noch keine"}
                </dd>
                <dt className="text-muted-foreground">Nächste Prüfung</dt>
                <dd>{nextCheck ? formatDateTime(nextCheck) : "—"}</dd>
                <dt className="text-muted-foreground">Letzte Erinnerung</dt>
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
              <p className="text-xs text-muted-foreground">Lade …</p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadReminderStatus()}
              >
                Aktualisieren
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">App / Support</h3>
            {appInfo ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Version</dt>
                <dd>{appInfo.version}</dd>
                <dt className="text-muted-foreground">Datenordner</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {appInfo.configDir}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void copyPath("config", appInfo.configDir)}
                  >
                    Kopieren
                  </Button>
                  {copiedPath === "config" && (
                    <span className="text-xs text-success" role="status">
                      kopiert
                    </span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Log-Ordner</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{appInfo.logDir}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void copyPath("log", appInfo.logDir)}
                  >
                    Kopieren
                  </Button>
                  {copiedPath === "log" && (
                    <span className="text-xs text-success" role="status">
                      kopiert
                    </span>
                  )}
                </dd>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">Lade …</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">Daten / Backup</h3>
            <p className="text-xs text-muted-foreground">
              Alle Daten liegen nur lokal auf diesem Gerät. Ein Backup sichert Konten, Abos,
              Einnahmen und Verlauf als JSON-Datei. Beim Import wird der gesamte aktuelle Bestand
              durch das Backup <strong>ersetzt</strong>.
            </p>
            <Alert role="note">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Backup ist unverschlüsselt</AlertTitle>
              <AlertDescription>
                Die JSON-Datei enthält deine Finanzdaten im Klartext. Speichere sie nur an
                vertrauenswürdigen Orten und teile sie nicht ungeschützt.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={backupPending}
              >
                {backupPending ? "Arbeite …" : "Backup exportieren"}
              </Button>
              {!confirmingImport && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBackupMessage(null);
                    setBackupError(null);
                    setConfirmingImport(true);
                  }}
                  disabled={backupPending}
                >
                  Backup importieren
                </Button>
              )}
            </div>

            {confirmingImport && (
              <div
                className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
                role="alertdialog"
                aria-label="Import bestätigen"
              >
                <p className="text-sm">
                  <strong>Wirklich importieren?</strong> Alle aktuellen Konten, Abos und Einnahmen
                  gehen verloren und werden durch das Backup ersetzt.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleImportConfirmed()}
                    disabled={backupPending}
                  >
                    {backupPending ? "Stelle wieder her …" : "Ja, ersetzen"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingImport(false)}
                    disabled={backupPending}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            {backupMessage && (
              <span className="text-sm text-success" role="status">
                {backupMessage}
              </span>
            )}
            {backupError && (
              <Alert variant="destructive">
                <AlertDescription>Fehler: {backupError}</AlertDescription>
              </Alert>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">CSV</h3>
            <p className="text-xs text-muted-foreground">
              Abo-Liste als CSV exportieren (z.B. für Tabellenkalkulation) oder wiederkehrende
              Abbuchungen aus einem Bank-Kontoauszug automatisch erkennen und als Abos anlegen.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExportCsv()}
                disabled={csvExportPending}
              >
                {csvExportPending ? "Arbeite …" : "Abos als CSV exportieren"}
              </Button>
              {onStartCsvImport && (
                <Button type="button" variant="outline" size="sm" onClick={onStartCsvImport}>
                  Bankauszug importieren (CSV)
                </Button>
              )}
            </div>
            {csvExportMessage && (
              <span className="text-sm text-success" role="status">
                {csvExportMessage}
              </span>
            )}
            {csvExportError && (
              <Alert variant="destructive">
                <AlertDescription>Fehler: {csvExportError}</AlertDescription>
              </Alert>
            )}
          </section>

          {(error || reminderError || appInfoError) && (
            <Alert variant="destructive">
              <AlertDescription>Fehler: {error ?? reminderError ?? appInfoError}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
