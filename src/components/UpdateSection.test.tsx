import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, installUpdate } from "../lib/db";
import { expectNoAxeViolations } from "../test-utils/axe";
import { UpdateSection } from "./UpdateSection";

vi.mock("../lib/db", () => ({
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

const mockCheck = vi.mocked(checkForUpdate);
const mockInstall = vi.mocked(installUpdate);

const available = { version: "0.6.0", currentVersion: "0.5.1", notes: "Neu: Skip + Verschiebung" };

describe("UpdateSection", () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockInstall.mockReset();
  });

  it("prüft nichts, bevor der Nutzer klickt", () => {
    render(<UpdateSection />);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nach Updates suchen" })).toBeEnabled();
  });

  it("meldet, wenn die Version aktuell ist", async () => {
    mockCheck.mockResolvedValue(null);
    render(<UpdateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/neuesten Stand/);
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it("zeigt ein verfügbares Update mit Notizen und installiert erst nach dem zweiten Klick", async () => {
    mockCheck.mockResolvedValue(available);
    mockInstall.mockReturnValue(new Promise(() => {})); // App startet neu → kehrt nie zurück
    render(<UpdateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));

    expect(await screen.findByText(/Version 0\.6\.0/)).toBeInTheDocument();
    expect(screen.getByText(/installiert:\s*0\.5\.1/)).toBeInTheDocument();
    expect(screen.getByText("Neu: Skip + Verschiebung")).toBeInTheDocument();
    expect(mockInstall).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Installieren und neu starten" }));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: /Wird heruntergeladen/ })).toBeDisabled();
  });

  it("zeigt Fehler bei der Prüfung und erlaubt einen neuen Versuch", async () => {
    mockCheck.mockRejectedValueOnce("Update-Prüfung fehlgeschlagen: offline");
    render(<UpdateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    expect(await screen.findByText(/offline/)).toBeInTheDocument();

    mockCheck.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("zeigt Fehler bei der Installation statt still zu scheitern", async () => {
    mockCheck.mockResolvedValue(available);
    mockInstall.mockRejectedValue("Update-Installation fehlgeschlagen: Signatur ungültig");
    render(<UpdateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Installieren und neu starten" }));
    expect(await screen.findByText(/Signatur ungültig/)).toBeInTheDocument();
  });

  it("hat keine axe-Verstöße", async () => {
    mockCheck.mockResolvedValue(available);
    render(<UpdateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    await screen.findByText(/Version 0\.6\.0/);
    await expectNoAxeViolations();
  });
});
