import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addIncome, updateIncome } from "../lib/db";
import { expectNoAxeViolations } from "../test-utils/axe";
import type { Account, Income } from "../types";
import { IncomeDialog } from "./IncomeDialog";

vi.mock("../lib/db", () => ({
  addIncome: vi.fn(),
  updateIncome: vi.fn(),
}));

const mockAddIncome = vi.mocked(addIncome);
const mockUpdateIncome = vi.mocked(updateIncome);

const accounts: Account[] = [
  {
    id: 1,
    name: "Hauptkonto",
    note: null,
    currency: "EUR",
    balanceCents: 0,
    minBufferCents: 0,
    balanceUpdatedAt: null,
  },
];

const salary: Income = {
  id: 5,
  name: "Gehalt",
  amountCents: 250000,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2026-01-30",
  active: true,
  oneTime: false,
};

function renderDialog(income: Income | null) {
  const onSaved = vi.fn();
  render(
    <IncomeDialog open income={income} accounts={accounts} onClose={vi.fn()} onSaved={onSaved} />,
  );
  return { onSaved };
}

describe("IncomeDialog", () => {
  beforeEach(() => {
    mockAddIncome.mockReset();
    mockUpdateIncome.mockReset();
  });

  it("legt eine neue Einnahme ohne Verschiebung an (Default 'none')", async () => {
    mockAddIncome.mockResolvedValue(1);
    const { onSaved } = renderDialog(null);

    expect(screen.getByLabelText("Wochenende / Feiertag")).toHaveTextContent("Keine Verschiebung");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bonus" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(mockAddIncome).toHaveBeenCalledTimes(1));
    expect(mockAddIncome).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bonus", amountCents: 10000, shiftRule: "none" }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("zeigt die gespeicherte Regel und behält sie beim Speichern", async () => {
    mockUpdateIncome.mockResolvedValue(undefined);
    renderDialog({ ...salary, shiftRule: "previous" });

    expect(screen.getByLabelText("Wochenende / Feiertag")).toHaveTextContent(
      "Voriger Bankarbeitstag",
    );
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(mockUpdateIncome).toHaveBeenCalledTimes(1));
    expect(mockUpdateIncome).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, shiftRule: "previous" }),
    );
  });

  it("hat keine axe-Verstöße", async () => {
    renderDialog({ ...salary, shiftRule: "next" });
    await expectNoAxeViolations();
  });
});
