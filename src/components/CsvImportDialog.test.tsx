import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSubscription, previewCsvImport, type RecurringCandidate } from "../lib/db";
import { expectNoAxeViolations } from "../test-utils/axe";
import type { Account } from "../types";
import { CsvImportDialog } from "./CsvImportDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  previewCsvImport: vi.fn(),
  addSubscription: vi.fn(),
}));

const mockOpenFileDialog = vi.mocked(openFileDialog);
const mockPreviewCsvImport = vi.mocked(previewCsvImport);
const mockAddSubscription = vi.mocked(addSubscription);

const giro: Account = {
  id: 1,
  name: "Girokonto",
  note: null,
  currency: "EUR",
  balanceCents: 50_000,
  minBufferCents: 0,
  balanceUpdatedAt: null,
};

const netflix: RecurringCandidate = {
  name: "Netflix",
  amountCents: 1799,
  interval: "monthly",
  anchorDate: "2026-06-15",
  firstDate: "2026-03-15",
  occurrenceCount: 4,
};

const spotify: RecurringCandidate = {
  name: "Spotify",
  amountCents: 999,
  interval: "monthly",
  anchorDate: "2026-06-20",
  firstDate: "2026-04-20",
  occurrenceCount: 3,
};

function renderDialog() {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(<CsvImportDialog open accounts={[giro]} onClose={onClose} onImported={onImported} />);
  return { onClose, onImported };
}

/** Wählt eine Datei über den gemockten Datei-Dialog und lässt den Preview `rows` liefern. */
async function pickFileWith(rows: RecurringCandidate[]) {
  mockOpenFileDialog.mockResolvedValue("/tmp/umsaetze.csv");
  mockPreviewCsvImport.mockResolvedValue(rows);
  fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
  await waitFor(() => {
    expect(mockPreviewCsvImport).toHaveBeenCalledWith("/tmp/umsaetze.csv");
  });
}

describe("CsvImportDialog", () => {
  beforeEach(() => {
    mockOpenFileDialog.mockReset();
    mockPreviewCsvImport.mockReset();
    mockAddSubscription.mockReset();
  });

  it("ruft previewCsvImport nicht auf, wenn die Datei-Auswahl abgebrochen wird", async () => {
    mockOpenFileDialog.mockResolvedValue(null);
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
    await waitFor(() => {
      expect(mockOpenFileDialog).toHaveBeenCalledOnce();
    });
    expect(mockPreviewCsvImport).not.toHaveBeenCalled();
  });

  it("zeigt erkannte Kandidaten mit Betrag, Häufigkeit und Anlegen-Button", async () => {
    renderDialog();
    await pickFileWith([netflix, spotify]);

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByText(/4× erkannt/)).toBeInTheDocument();
    expect(screen.getByText(/17,99/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Abos anlegen" })).toBeEnabled();
  });

  it("belegt Intervall, Währung und Konto pro Kandidat mit Defaults vor", async () => {
    renderDialog();
    await pickFileWith([netflix]);
    await screen.findByText("Netflix");

    // Radix-Selects werden per Konvention nicht interaktiv getestet — Werte über Trigger-Text.
    const triggers = screen.getAllByRole("combobox");
    expect(triggers).toHaveLength(3);
    expect(triggers[0]).toHaveTextContent("Monatlich");
    expect(triggers[1]).toHaveTextContent("EUR");
    expect(triggers[2]).toHaveTextContent("(kein Konto)");
  });

  it("zeigt einen Hinweis, wenn keine wiederkehrenden Abbuchungen erkannt wurden", async () => {
    renderDialog();
    await pickFileWith([]);

    expect(
      await screen.findByText("Keine wiederkehrenden Abbuchungen erkannt."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /anlegen/ })).not.toBeInTheDocument();
  });

  it("zeigt eine Fehler-Meldung, wenn der CSV-Preview fehlschlägt", async () => {
    mockOpenFileDialog.mockResolvedValue("/tmp/kaputt.csv");
    mockPreviewCsvImport.mockRejectedValue(new Error("Keine Betrag-Spalte gefunden"));
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Keine Betrag-Spalte gefunden/);
    });
    expect(screen.queryByRole("button", { name: /anlegen/ })).not.toBeInTheDocument();
  });

  it("passt das Button-Label an die Auswahl an und deaktiviert bei leerer Auswahl", async () => {
    renderDialog();
    await pickFileWith([netflix, spotify]);
    await screen.findByText("Netflix");

    fireEvent.click(screen.getByLabelText("Spotify importieren"));
    expect(screen.getByRole("button", { name: "1 Abo anlegen" })).toBeEnabled();

    fireEvent.click(screen.getByLabelText("Netflix importieren"));
    expect(screen.getByRole("button", { name: "0 Abos anlegen" })).toBeDisabled();
  });

  it("legt alle ausgewählten Kandidaten mit Default-Werten an und meldet Erfolg", async () => {
    mockAddSubscription.mockResolvedValue(1);
    const { onImported } = renderDialog();
    await pickFileWith([netflix, spotify]);
    await screen.findByText("Netflix");

    fireEvent.click(screen.getByRole("button", { name: "2 Abos anlegen" }));

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledTimes(2);
    });
    expect(mockAddSubscription).toHaveBeenCalledWith({
      name: "Netflix",
      amountCents: 1799,
      currency: "EUR",
      accountId: null,
      interval: "monthly",
      anchorDate: "2026-06-15",
      leadDays: 60,
      cancelMode: null,
      cancelPeriodValue: null,
      cancelPeriodUnit: null,
      cancelDate: null,
      category: null,
      oneTime: false,
    });
    expect(onImported).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(/2 Abos angelegt/);
    // Kandidatenliste ist nach erfolgreichem Import geleert.
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
  });

  it("legt nur die ausgewählten Kandidaten an", async () => {
    mockAddSubscription.mockResolvedValue(1);
    renderDialog();
    await pickFileWith([netflix, spotify]);
    await screen.findByText("Netflix");

    fireEvent.click(screen.getByLabelText("Spotify importieren"));
    fireEvent.click(screen.getByRole("button", { name: "1 Abo anlegen" }));

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledOnce();
    });
    expect(mockAddSubscription).toHaveBeenCalledWith(expect.objectContaining({ name: "Netflix" }));
    expect(screen.getByRole("status")).toHaveTextContent(/1 Abo angelegt/);
  });

  it("zeigt einen Fehler und ruft onImported nicht, wenn das Anlegen fehlschlägt", async () => {
    mockAddSubscription.mockRejectedValue(new Error("DB nicht erreichbar"));
    const { onImported } = renderDialog();
    await pickFileWith([netflix]);
    await screen.findByText("Netflix");

    fireEvent.click(screen.getByRole("button", { name: "1 Abo anlegen" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/DB nicht erreichbar/);
    });
    expect(onImported).not.toHaveBeenCalled();
    // Kandidaten bleiben stehen, damit der User es erneut versuchen kann.
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ruft onClose beim Klick auf 'Schließen'", async () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hat keine axe-Verstöße (Kandidaten-Liste)", async () => {
    renderDialog();
    await pickFileWith([netflix, spotify]);
    await expectNoAxeViolations();
  });
});
