import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ReconcileFinding,
  reconcileCsv,
  setSubscriptionActive,
  updateSubscription,
} from "../lib/db";
import { expectNoAxeViolations } from "../test-utils/axe";
import type { Subscription } from "../types";
import { CsvReconcileDialog } from "./CsvReconcileDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  reconcileCsv: vi.fn(),
  updateSubscription: vi.fn(),
  setSubscriptionActive: vi.fn(),
}));

const mockOpenFileDialog = vi.mocked(openFileDialog);
const mockReconcileCsv = vi.mocked(reconcileCsv);
const mockUpdateSubscription = vi.mocked(updateSubscription);
const mockSetSubscriptionActive = vi.mocked(setSubscriptionActive);

const netflix: Subscription = {
  id: 1,
  name: "Netflix",
  amountCents: 1799,
  currency: "EUR",
  accountId: null,
  interval: "monthly",
  anchorDate: "2026-06-15",
  leadDays: 60,
  active: true,
  notify: true,
  cancelMode: null,
  cancelPeriodValue: null,
  cancelPeriodUnit: null,
  cancelDate: null,
  category: null,
  oneTime: false,
  archivedAt: null,
  pendingAmountCents: null,
  pendingFrom: null,
};

const priceFinding: ReconcileFinding = {
  subscriptionId: 1,
  subscriptionName: "Netflix",
  kind: "price_changed",
  expectedAmountCents: 1799,
  actualAmountCents: 1999,
  lastChargeDate: "2026-06-15",
  matchedCount: 3,
};

const cancelledFinding: ReconcileFinding = {
  subscriptionId: 1,
  subscriptionName: "Netflix",
  kind: "possibly_cancelled",
  expectedAmountCents: 1799,
  actualAmountCents: null,
  lastChargeDate: "2026-03-15",
  matchedCount: 2,
};

function renderDialog(subs: Subscription[] = [netflix]) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(<CsvReconcileDialog open subs={subs} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged };
}

/** Wählt eine Datei über den gemockten Datei-Dialog und lässt den Abgleich `rows` liefern. */
async function pickFileWith(rows: ReconcileFinding[]) {
  mockOpenFileDialog.mockResolvedValue("/tmp/umsaetze.csv");
  mockReconcileCsv.mockResolvedValue(rows);
  fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
  await waitFor(() => expect(mockReconcileCsv).toHaveBeenCalled());
}

describe("CsvReconcileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ruft reconcileCsv nicht auf, wenn die Datei-Auswahl abgebrochen wird", async () => {
    renderDialog();
    mockOpenFileDialog.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
    await waitFor(() => expect(mockOpenFileDialog).toHaveBeenCalled());
    expect(mockReconcileCsv).not.toHaveBeenCalled();
  });

  it("zeigt eine Preisänderung mit Ist- und Soll-Betrag", async () => {
    renderDialog();
    await pickFileWith([priceFinding]);

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText(/19,99\s*€ statt 17,99\s*€ abgebucht/)).toBeInTheDocument();
    expect(screen.getByText(/3 passende Buchungen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preis übernehmen" })).toBeEnabled();
  });

  it("zeigt einen Kündigungs-Verdacht mit Archivieren-Aktion", async () => {
    renderDialog();
    await pickFileWith([cancelledFinding]);

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText(/nicht mehr abgebucht \(zuletzt 2026-03-15\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivieren" })).toBeEnabled();
  });

  it("meldet, wenn keine Abweichungen gefunden wurden", async () => {
    renderDialog();
    await pickFileWith([]);
    expect(await screen.findByText(/Keine Abweichungen gefunden/)).toBeInTheDocument();
  });

  it("zeigt eine Fehler-Meldung, wenn der Abgleich fehlschlägt", async () => {
    renderDialog();
    mockOpenFileDialog.mockResolvedValue("/tmp/kaputt.csv");
    mockReconcileCsv.mockRejectedValue(new Error("Keine Datums-Spalte gefunden."));
    fireEvent.click(screen.getByRole("button", { name: "CSV-Datei wählen" }));
    expect(await screen.findByText(/Keine Datums-Spalte gefunden/)).toBeInTheDocument();
  });

  it("übernimmt den neuen Preis über updateSubscription und meldet Erfolg", async () => {
    const { onChanged } = renderDialog();
    await pickFileWith([priceFinding]);
    mockUpdateSubscription.mockResolvedValue();

    fireEvent.click(await screen.findByRole("button", { name: "Preis übernehmen" }));

    await waitFor(() =>
      expect(mockUpdateSubscription).toHaveBeenCalledWith({ ...netflix, amountCents: 1999 }),
    );
    expect(await screen.findByText(/Preis übernommen/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("archiviert bei Kündigungs-Verdacht über setSubscriptionActive", async () => {
    const { onChanged } = renderDialog();
    await pickFileWith([cancelledFinding]);
    mockSetSubscriptionActive.mockResolvedValue();

    fireEvent.click(await screen.findByRole("button", { name: "Archivieren" }));

    await waitFor(() => expect(mockSetSubscriptionActive).toHaveBeenCalledWith(1, false));
    expect(await screen.findByText(/Archiviert/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("zeigt einen Fehler und lässt die Aktion offen, wenn die Übernahme fehlschlägt", async () => {
    const { onChanged } = renderDialog();
    await pickFileWith([priceFinding]);
    mockUpdateSubscription.mockRejectedValue(new Error("Betrag muss größer als 0 sein."));

    fireEvent.click(await screen.findByRole("button", { name: "Preis übernehmen" }));

    expect(await screen.findByText(/Betrag muss größer als 0 sein/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preis übernehmen" })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ruft onClose beim Klick auf 'Schließen'", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("hat keine axe-Verstöße (Befund-Liste)", async () => {
    renderDialog();
    await pickFileWith([priceFinding, { ...cancelledFinding, subscriptionId: 2 }]);
    await screen.findByText(/statt/);
    await expectNoAxeViolations();
  });
});
