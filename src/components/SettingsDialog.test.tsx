import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open, save } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportBackup,
  getAppInfo,
  getReminderStatus,
  importBackup,
  sendTestNotification,
} from "../lib/db";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  getReminderStatus: vi.fn(),
  getAppInfo: vi.fn(),
  sendTestNotification: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
}));

const mockIsEnabled = vi.mocked(isEnabled);
const mockEnable = vi.mocked(enable);
const mockDisable = vi.mocked(disable);
const mockSave = vi.mocked(save);
const mockOpen = vi.mocked(open);
const mockGetReminderStatus = vi.mocked(getReminderStatus);
const mockGetAppInfo = vi.mocked(getAppInfo);
const mockSendTestNotification = vi.mocked(sendTestNotification);
const mockExportBackup = vi.mocked(exportBackup);
const mockImportBackup = vi.mocked(importBackup);

const defaultStatus = {
  lastCheckAt: null,
  intervalSecs: 3600,
  lastSent: null,
};

const defaultAppInfo = {
  version: "0.1.0",
  configDir: "/home/user/.config/com.tcgtvv.subtracked",
  logDir: "/home/user/.local/share/com.tcgtvv.subtracked/logs",
};

function renderDialog(onDataReplaced?: () => void | Promise<void>) {
  return render(<SettingsDialog open onClose={vi.fn()} onDataReplaced={onDataReplaced} />);
}

describe("SettingsDialog", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockSave.mockReset();
    mockOpen.mockReset();
    mockGetReminderStatus.mockReset();
    mockGetAppInfo.mockReset();
    mockSendTestNotification.mockReset();
    mockExportBackup.mockReset();
    mockImportBackup.mockReset();
    mockGetReminderStatus.mockResolvedValue(defaultStatus);
    mockGetAppInfo.mockResolvedValue(defaultAppInfo);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("zeigt die Checkbox initial deaktiviert, bis isEnabled aufgelöst hat", async () => {
    mockIsEnabled.mockReturnValue(new Promise(() => {}));
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it("zeigt die Checkbox aktiviert und gecheckt, wenn isEnabled true liefert", async () => {
    mockIsEnabled.mockResolvedValue(true);
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
    expect(checkbox).toBeEnabled();
  });

  it("zeigt die Checkbox aktiviert aber ungecheckt, wenn isEnabled false liefert", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    await waitFor(() => {
      expect(checkbox).toBeEnabled();
    });
    expect(checkbox).not.toBeChecked();
  });

  it("ruft enable() beim Aktivieren der Checkbox", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockEnable.mockResolvedValue(undefined);
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    await waitFor(() => {
      expect(checkbox).toBeEnabled();
    });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(mockEnable).toHaveBeenCalledOnce();
    });
    expect(mockDisable).not.toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it("ruft disable() beim Deaktivieren der Checkbox", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockDisable.mockResolvedValue(undefined);
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(mockDisable).toHaveBeenCalledOnce();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(checkbox).not.toBeChecked();
  });

  it("zeigt eine Fehler-Meldung, wenn isEnabled fehlschlägt", async () => {
    mockIsEnabled.mockRejectedValue(new Error("Autostart-API nicht verfügbar"));
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Autostart-API nicht verfügbar/);
    });
    const checkbox = screen.getByLabelText("Beim Login starten");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
  });

  it("zeigt eine Fehler-Meldung und behält den State, wenn enable() fehlschlägt", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockEnable.mockRejectedValue(new Error("Permission denied"));
    renderDialog();
    const checkbox = screen.getByLabelText("Beim Login starten");
    await waitFor(() => {
      expect(checkbox).toBeEnabled();
    });

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Autostart umstellen fehlgeschlagen/);
    });
    expect(checkbox).not.toBeChecked();
  });

  it("ruft sendTestNotification beim Klick auf 'Test-Erinnerung senden'", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockSendTestNotification.mockResolvedValue(undefined);
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Test-Erinnerung senden" }));

    await waitFor(() => {
      expect(mockSendTestNotification).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Gesendet/);
  });

  it("zeigt einen Fehler, wenn Test-Notification fehlschlägt", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockSendTestNotification.mockRejectedValue(new Error("Notification denied"));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Test-Erinnerung senden" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Notification denied/);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("rendert 'noch keine' wenn der Loop noch keinen Check abgeschlossen hat", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/Letzte Prüfung/).nextSibling?.textContent).toMatch(/noch keine/);
    });
  });

  it("rendert letzte Prüfung + Intervall + letzte gesendete Erinnerung, wenn Status vorhanden", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockGetReminderStatus.mockResolvedValue({
      lastCheckAt: "2026-06-07T10:00:00Z",
      intervalSecs: 3600,
      lastSent: {
        dueDate: "2026-06-15",
        subscriptionName: "Netflix",
        sentAt: "2026-06-07T09:00:00Z",
      },
    });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/alle 1 Stunde/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Netflix/)).toBeInTheDocument();
    expect(screen.getByText(/fällig 15\.06\.2026/)).toBeInTheDocument();
  });

  it("lädt den Reminder-Status erneut beim Klick auf 'Aktualisieren'", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();
    await waitFor(() => {
      expect(mockGetReminderStatus).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));
    await waitFor(() => {
      expect(mockGetReminderStatus).toHaveBeenCalledTimes(2);
    });
  });

  it("lädt den Reminder-Status erneut, wenn der Dialog geöffnet wird", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const { rerender } = render(<SettingsDialog open={false} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetReminderStatus).toHaveBeenCalledTimes(1);
    });

    rerender(<SettingsDialog open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetReminderStatus).toHaveBeenCalledTimes(2);
    });
  });

  it("zeigt App-Version und lokale Support-Pfade", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeInTheDocument();
    });
    expect(screen.getByText(defaultAppInfo.configDir)).toBeInTheDocument();
    expect(screen.getByText(defaultAppInfo.logDir)).toBeInTheDocument();
  });

  it("kopiert den Datenordner in die Zwischenablage", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(defaultAppInfo.configDir)).toBeInTheDocument();
    });

    const configRow = screen.getByText("Datenordner").nextSibling as HTMLElement;
    fireEvent.click(configRow.querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(defaultAppInfo.configDir);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/kopiert/);
  });

  it("exportiert ein Backup an den im Dialog gewählten Pfad", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockSave.mockResolvedValue("/home/user/subtracked-backup.json");
    mockExportBackup.mockResolvedValue(undefined);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Backup exportieren" }));

    await waitFor(() => {
      expect(mockExportBackup).toHaveBeenCalledWith("/home/user/subtracked-backup.json");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Backup gespeichert/);
  });

  it("weist darauf hin, dass Backup-Dateien unverschlüsselt sind", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();

    expect(screen.getByText("Backup ist unverschlüsselt")).toBeInTheDocument();
    expect(screen.getByText(/Finanzdaten im Klartext/)).toBeInTheDocument();
  });

  it("exportiert nicht, wenn der Speichern-Dialog abgebrochen wird", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockSave.mockResolvedValue(null);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Backup exportieren" }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledOnce();
    });
    expect(mockExportBackup).not.toHaveBeenCalled();
  });

  it("importiert erst nach Bestätigung und lädt danach die Daten neu", async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockOpen.mockResolvedValue("/home/user/subtracked-backup.json");
    mockImportBackup.mockResolvedValue(undefined);
    const onDataReplaced = vi.fn();
    renderDialog(onDataReplaced);

    // Erster Klick zeigt nur den Bestätigungs-Schritt — noch kein Import.
    fireEvent.click(screen.getByRole("button", { name: "Backup importieren" }));
    expect(screen.getByText(/Wirklich importieren\?/)).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ja, ersetzen" }));
    await waitFor(() => {
      expect(mockImportBackup).toHaveBeenCalledWith("/home/user/subtracked-backup.json");
    });
    expect(onDataReplaced).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(/importiert/);
  });

  it("bricht den Import ab, ohne Daten anzurühren", async () => {
    mockIsEnabled.mockResolvedValue(false);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Backup importieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByText(/Wirklich importieren\?/)).not.toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockImportBackup).not.toHaveBeenCalled();
  });
});
