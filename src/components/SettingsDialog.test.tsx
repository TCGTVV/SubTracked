import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReminderStatus, sendTestNotification } from "../lib/db";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  getReminderStatus: vi.fn(),
  sendTestNotification: vi.fn(),
}));

const mockIsEnabled = vi.mocked(isEnabled);
const mockEnable = vi.mocked(enable);
const mockDisable = vi.mocked(disable);
const mockGetReminderStatus = vi.mocked(getReminderStatus);
const mockSendTestNotification = vi.mocked(sendTestNotification);

const defaultStatus = {
  lastCheckAt: null,
  intervalSecs: 3600,
  lastSent: null,
};

function renderDialog() {
  const ref = createRef<HTMLDialogElement>();
  const result = render(<SettingsDialog ref={ref} />);
  ref.current?.setAttribute("open", "");
  return { ...result, ref };
}

describe("SettingsDialog", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockGetReminderStatus.mockReset();
    mockSendTestNotification.mockReset();
    mockGetReminderStatus.mockResolvedValue(defaultStatus);
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
      expect(screen.getByRole("alert")).toHaveTextContent(/Permission denied/);
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
});
