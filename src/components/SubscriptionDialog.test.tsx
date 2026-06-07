import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSubscription, updateSubscription } from "../lib/db";
import type { Account, Subscription } from "../types";
import { SubscriptionDialog } from "./SubscriptionDialog";

vi.mock("../lib/db", () => ({
  addSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}));

const mockAddSubscription = vi.mocked(addSubscription);
const mockUpdateSubscription = vi.mocked(updateSubscription);

const accounts: Account[] = [
  { id: 1, name: "Hauptkonto", note: null },
  { id: 2, name: "Sparkonto", note: "Reserve" },
];

const existingSub: Subscription = {
  id: 42,
  name: "Netflix",
  amountCents: 1799,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2026-01-15",
  leadDays: 7,
  active: true,
  notify: true,
};

function renderDialog(subscription: Subscription | null = null, onSaved = vi.fn()) {
  const ref = createRef<HTMLDialogElement>();
  const result = render(
    <SubscriptionDialog
      ref={ref}
      subscription={subscription}
      accounts={accounts}
      onSaved={onSaved}
    />,
  );
  // Geschlossener <dialog> ist accessibility-hidden — getByRole findet sonst nichts darin.
  ref.current?.setAttribute("open", "");
  return { ...result, ref, onSaved };
}

describe("SubscriptionDialog", () => {
  beforeEach(() => {
    mockAddSubscription.mockReset();
    mockUpdateSubscription.mockReset();
  });

  it("zeigt 'Neues Abo' als Titel im Neu-Modus", () => {
    renderDialog(null);
    expect(screen.getByRole("heading", { name: "Neues Abo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("zeigt 'Abo bearbeiten' und legt die Felder mit der existierenden Subscription vor", () => {
    renderDialog(existingSub);
    expect(screen.getByRole("heading", { name: "Abo bearbeiten" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Netflix");
    expect(screen.getByLabelText("Betrag")).toHaveValue(17.99);
    expect(screen.getByLabelText("Währung")).toHaveValue("EUR");
    expect(screen.getByLabelText("Konto")).toHaveValue("1");
    expect(screen.getByLabelText("Vorlauf (Tage)")).toHaveValue(7);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("ruft addSubscription mit gerundetem Cent-Betrag und onSaved im Neu-Modus", async () => {
    mockAddSubscription.mockResolvedValue(99);
    const { onSaved } = renderDialog(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "9.99" } });
    fireEvent.change(screen.getByLabelText("Konto"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledTimes(1);
    });
    expect(mockAddSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Spotify",
        amountCents: 999,
        currency: "EUR",
        accountId: 2,
        interval: "monthly",
        leadDays: 60,
        notify: true,
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("ruft updateSubscription mit ID + active im Edit-Modus", async () => {
    mockUpdateSubscription.mockResolvedValue(undefined);
    const { onSaved } = renderDialog(existingSub);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Netflix Premium" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mockUpdateSubscription).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        active: true,
        name: "Netflix Premium",
        amountCents: 1799,
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("blockiert Submit bei leerem Namen", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    // microtask drain, dann verifizieren dass nichts passiert ist
    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("blockiert Submit bei Betrag <= 0", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("setzt step und min auf '1' wenn Währung auf KRW gewechselt wird (Subdivisor 1)", () => {
    renderDialog(null);
    const amountInput = screen.getByLabelText("Betrag");
    expect(amountInput).toHaveAttribute("step", "0.01");
    expect(amountInput).toHaveAttribute("min", "0.01");

    fireEvent.change(screen.getByLabelText("Währung"), { target: { value: "KRW" } });
    expect(amountInput).toHaveAttribute("step", "1");
    expect(amountInput).toHaveAttribute("min", "1");
  });

  it("zeigt eine Fehler-Meldung an, wenn die DB-Operation fehlschlägt", async () => {
    mockAddSubscription.mockRejectedValue(new Error("DB ist down"));
    const { onSaved } = renderDialog(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "9.99" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/DB ist down/);
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeEnabled();
  });
});
