import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount, countSubsForAccount, deleteAccount, updateAccount } from "../lib/db";
import type { Account } from "../types";
import { AccountsDialog } from "./AccountsDialog";

vi.mock("../lib/db", () => ({
  addAccount: vi.fn(),
  countSubsForAccount: vi.fn(),
  deleteAccount: vi.fn(),
  updateAccount: vi.fn(),
}));

const mockAddAccount = vi.mocked(addAccount);
const mockCountSubsForAccount = vi.mocked(countSubsForAccount);
const mockDeleteAccount = vi.mocked(deleteAccount);
const mockUpdateAccount = vi.mocked(updateAccount);

const accounts: Account[] = [
  {
    id: 1,
    name: "Hauptkonto",
    note: "IBAN ...4711",
    currency: "EUR",
    balanceCents: 50000,
    minBufferCents: 10000,
  },
  {
    id: 2,
    name: "Sparkonto",
    note: null,
    currency: "EUR",
    balanceCents: 0,
    minBufferCents: 0,
  },
];

function renderDialog(accountsProp: Account[] = accounts, onChanged = vi.fn()) {
  const ref = createRef<HTMLDialogElement>();
  const result = render(<AccountsDialog ref={ref} accounts={accountsProp} onChanged={onChanged} />);
  ref.current?.setAttribute("open", "");
  return { ...result, ref, onChanged };
}

describe("AccountsDialog", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAddAccount.mockReset();
    mockCountSubsForAccount.mockReset();
    mockDeleteAccount.mockReset();
    mockUpdateAccount.mockReset();
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("zeigt den Empty-State, wenn noch keine Konten existieren", () => {
    renderDialog([]);
    expect(screen.getByText("Noch keine Konten angelegt.")).toBeInTheDocument();
  });

  it("zeigt Saldo und Puffer pro Konto an", () => {
    renderDialog();
    const haupt = screen.getByText("Hauptkonto").closest(".account-item");
    expect(haupt?.textContent).toMatch(/500,00/);
    expect(haupt?.textContent).toMatch(/100,00/); // Puffer
  });

  it("ruft addAccount mit Name, Saldo und Währung auf", async () => {
    mockAddAccount.mockResolvedValue(99);
    const { onChanged } = renderDialog([]);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reisekonto" } });
    fireEvent.change(screen.getByLabelText("Aktueller Saldo"), { target: { value: "250,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith({
        name: "Reisekonto",
        note: undefined,
        currency: "EUR",
        balanceCents: 25050,
        minBufferCents: 0,
      });
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("akzeptiert leeren Saldo als 0", async () => {
    mockAddAccount.mockResolvedValue(99);
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith(
        expect.objectContaining({ balanceCents: 0, minBufferCents: 0 }),
      );
    });
  });

  it("akzeptiert negativen Saldo als Konto-im-Minus", async () => {
    mockAddAccount.mockResolvedValue(99);
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Giro" } });
    fireEvent.change(screen.getByLabelText("Aktueller Saldo"), { target: { value: "-125,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith(
        expect.objectContaining({ balanceCents: -12550 }),
      );
    });
  });

  it("zeigt eine Validierungs-Meldung bei ungültigem Saldo", async () => {
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Aktueller Saldo"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Saldo ungültig/);
    });
    expect(mockAddAccount).not.toHaveBeenCalled();
  });

  it("blockiert negativen Mindestpuffer", async () => {
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Mindestpuffer (optional)"), {
      target: { value: "-100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Mindestpuffer darf nicht negativ/);
    });
    expect(mockAddAccount).not.toHaveBeenCalled();
  });

  it("startet den Edit-Mode mit vorgefüllten Werten beim Klick auf Bearbeiten", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Konto Hauptkonto bearbeiten" }));
    expect(screen.getByRole("heading", { name: "Konto bearbeiten" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Hauptkonto");
    const balanceInput = screen.getByLabelText("Aktueller Saldo") as HTMLInputElement;
    expect(balanceInput.value).toMatch(/500/);
  });

  it("ruft updateAccount auf, wenn im Edit-Mode gespeichert wird", async () => {
    mockUpdateAccount.mockResolvedValue(undefined);
    const { onChanged } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Konto Hauptkonto bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Aktueller Saldo"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, balanceCents: 60000, name: "Hauptkonto" }),
      );
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("kann einen bestehenden negativen Saldo unverändert speichern", async () => {
    mockUpdateAccount.mockResolvedValue(undefined);
    const overdraft: Account[] = [
      {
        id: 3,
        name: "Giro im Minus",
        note: null,
        currency: "EUR",
        balanceCents: -1500,
        minBufferCents: 0,
      },
    ];
    renderDialog(overdraft);
    fireEvent.click(screen.getByRole("button", { name: "Konto Giro im Minus bearbeiten" }));
    const balanceInput = screen.getByLabelText("Aktueller Saldo") as HTMLInputElement;
    expect(balanceInput.value).toMatch(/-15/);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, balanceCents: -1500 }),
      );
    });
  });

  it("blockiert Add bei leerem Namen (Submit-Button disabled, keine DB-Operation)", async () => {
    renderDialog([]);
    const submit = screen.getByRole("button", { name: "Hinzufügen" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    await Promise.resolve();
    expect(mockAddAccount).not.toHaveBeenCalled();
  });

  it("blockiert Löschen mit Alert, wenn noch Abos auf dem Konto liegen", async () => {
    mockCountSubsForAccount.mockResolvedValue(3);
    const { onChanged } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Konto Hauptkonto löschen" }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(alertSpy.mock.calls[0][0]).toMatch(/3 Abos verweisen/);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("löscht das Konto und ruft onChanged, wenn der User Confirm bestätigt", async () => {
    mockCountSubsForAccount.mockResolvedValue(0);
    mockDeleteAccount.mockResolvedValue(undefined);
    const { onChanged } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Konto Hauptkonto löschen" }));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledWith(1);
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("zeigt einen Error-Banner, wenn addAccount fehlschlägt", async () => {
    mockAddAccount.mockRejectedValue(new Error("Konto-Konflikt"));
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Konto-Konflikt/);
    });
  });
});
