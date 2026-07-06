import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmAccountBalance } from "../lib/db";
import type { Account } from "../types";
import { BalanceFreshnessWarning } from "./BalanceFreshnessWarning";

vi.mock("../lib/db", () => ({
  confirmAccountBalance: vi.fn(),
}));

const mockConfirmAccountBalance = vi.mocked(confirmAccountBalance);

/** SQLite-Datetime (UTC) vor `days` Tagen, z.B. "2026-06-16 09:00:00". */
function sqliteDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    name: "Girokonto",
    note: null,
    currency: "EUR",
    balanceCents: 50_000,
    minBufferCents: 0,
    balanceUpdatedAt: sqliteDaysAgo(20),
    ...overrides,
  };
}

function renderWarning(accounts: Account[]) {
  const onOpenAccounts = vi.fn();
  const onChanged = vi.fn();
  render(
    <BalanceFreshnessWarning
      accounts={accounts}
      onOpenAccounts={onOpenAccounts}
      onChanged={onChanged}
    />,
  );
  return { onOpenAccounts, onChanged };
}

describe("BalanceFreshnessWarning", () => {
  beforeEach(() => {
    mockConfirmAccountBalance.mockReset();
  });

  it("rendert nichts, wenn alle Salden frisch sind", () => {
    renderWarning([account({ balanceUpdatedAt: sqliteDaysAgo(5) })]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rendert nichts für Konten ohne Zeitstempel (Legacy-Rows)", () => {
    renderWarning([account({ balanceUpdatedAt: null })]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warnt ab 14 Tagen mit Konto-Name und Alter des Saldos", () => {
    renderWarning([account()]);

    expect(screen.getByRole("alert")).toHaveTextContent(/Forecast unsicher/);
    expect(screen.getByText("Girokonto")).toBeInTheDocument();
    expect(screen.getByText(/Saldo seit 20 Tagen nicht aktualisiert/)).toBeInTheDocument();
  });

  it("listet mehrere veraltete Konten, ältester Saldo zuerst", () => {
    renderWarning([
      account({ id: 1, name: "Girokonto", balanceUpdatedAt: sqliteDaysAgo(20) }),
      account({ id: 2, name: "Tagesgeld", balanceUpdatedAt: sqliteDaysAgo(40) }),
      account({ id: 3, name: "Frisch", balanceUpdatedAt: sqliteDaysAgo(1) }),
    ]);

    expect(screen.getByRole("alert")).toHaveTextContent(/2 Kontostände sind nicht mehr aktuell/);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Tagesgeld");
    expect(items[1]).toHaveTextContent("Girokonto");
    expect(screen.queryByText("Frisch")).not.toBeInTheDocument();
  });

  it("bestätigt den Saldo per 'Stimmt noch' und lädt die Konten neu", async () => {
    mockConfirmAccountBalance.mockResolvedValue(undefined);
    const { onChanged } = renderWarning([account({ id: 7 })]);

    fireEvent.click(screen.getByRole("button", { name: "Saldo von Girokonto bestätigen" }));

    await waitFor(() => {
      expect(mockConfirmAccountBalance).toHaveBeenCalledWith(7);
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("zeigt einen Fehler, wenn das Bestätigen fehlschlägt", async () => {
    mockConfirmAccountBalance.mockRejectedValue(new Error("Konto 7 existiert nicht"));
    const { onChanged } = renderWarning([account({ id: 7 })]);

    fireEvent.click(screen.getByRole("button", { name: "Saldo von Girokonto bestätigen" }));

    await waitFor(() => {
      expect(screen.getByText(/Konto 7 existiert nicht/)).toBeInTheDocument();
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("öffnet den Konten-Dialog über 'Saldo aktualisieren'", () => {
    const { onOpenAccounts } = renderWarning([account()]);

    fireEvent.click(screen.getByRole("button", { name: "Saldo aktualisieren" }));
    expect(onOpenAccounts).toHaveBeenCalledOnce();
  });
});
