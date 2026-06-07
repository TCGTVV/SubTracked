import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount, countSubsForAccount, deleteAccount } from "../lib/db";
import type { Account } from "../types";
import { AccountsDialog } from "./AccountsDialog";

vi.mock("../lib/db", () => ({
  addAccount: vi.fn(),
  countSubsForAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

const mockAddAccount = vi.mocked(addAccount);
const mockCountSubsForAccount = vi.mocked(countSubsForAccount);
const mockDeleteAccount = vi.mocked(deleteAccount);

const accounts: Account[] = [
  { id: 1, name: "Hauptkonto", note: "IBAN ...4711" },
  { id: 2, name: "Sparkonto", note: null },
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

  it("rendert pro Konto Name, optionale Notiz und einen Löschen-Button mit Aria-Label", () => {
    renderDialog();
    expect(screen.getByText("Hauptkonto")).toBeInTheDocument();
    expect(screen.getByText("IBAN ...4711")).toBeInTheDocument();
    expect(screen.getByText("Sparkonto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konto Hauptkonto löschen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konto Sparkonto löschen" })).toBeInTheDocument();
  });

  it("ruft addAccount mit name+note auf und meldet onChanged + leert das Formular", async () => {
    mockAddAccount.mockResolvedValue(99);
    const { onChanged } = renderDialog([]);

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const noteInput = screen.getByLabelText("Notiz (optional)") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Reisekonto" } });
    fireEvent.change(noteInput, { target: { value: "Karte X" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith("Reisekonto", "Karte X");
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(nameInput.value).toBe("");
    expect(noteInput.value).toBe("");
  });

  it("ruft addAccount mit undefined als Notiz, wenn das Notiz-Feld leer bleibt", async () => {
    mockAddAccount.mockResolvedValue(99);
    renderDialog([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith("Test", undefined);
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

  it("löscht das Konto nicht, wenn der User die Confirm-Dialog ablehnt", async () => {
    mockCountSubsForAccount.mockResolvedValue(0);
    confirmSpy.mockImplementation(() => false);
    const { onChanged } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Konto Hauptkonto löschen" }));

    await waitFor(() => {
      expect(mockCountSubsForAccount).toHaveBeenCalledWith(1);
    });
    expect(confirmSpy).toHaveBeenCalled();
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
