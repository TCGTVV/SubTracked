import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

const mockIsEnabled = vi.mocked(isEnabled);
const mockEnable = vi.mocked(enable);
const mockDisable = vi.mocked(disable);

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
  });

  it("zeigt die Checkbox initial deaktiviert, bis isEnabled aufgelöst hat", async () => {
    // never-resolving Promise → autostart bleibt null
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
});
