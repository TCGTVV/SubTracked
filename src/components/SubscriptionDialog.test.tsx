import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSubscription, listPriceHistory, updateSubscription } from "../lib/db";
import type { Account, Subscription } from "../types";
import { SubscriptionDialog } from "./SubscriptionDialog";

vi.mock("../lib/db", () => ({
  addSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  listPriceHistory: vi.fn().mockResolvedValue([]),
}));

const mockAddSubscription = vi.mocked(addSubscription);
const mockUpdateSubscription = vi.mocked(updateSubscription);
const mockListPriceHistory = vi.mocked(listPriceHistory);

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
  {
    id: 2,
    name: "Sparkonto",
    note: "Reserve",
    currency: "EUR",
    balanceCents: 0,
    minBufferCents: 0,
    balanceUpdatedAt: null,
  },
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
    mockListPriceHistory.mockReset();
    mockListPriceHistory.mockResolvedValue([]);
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
    expect(screen.getByLabelText("Betrag")).toHaveValue("17,99");
    expect(screen.getByLabelText("Währung")).toHaveValue("EUR");
    expect(screen.getByLabelText("Konto")).toHaveValue("1");
    expect(screen.getByLabelText("Vorlauf (Tage)")).toHaveValue(7);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("zeichnet konstante Preis-Historien mittig statt auf der Unterkante", async () => {
    mockListPriceHistory.mockResolvedValue([
      {
        id: 2,
        subscriptionId: existingSub.id,
        amountCents: 1799,
        currency: "EUR",
        changedAt: "2026-02-01T00:00:00Z",
      },
      {
        id: 1,
        subscriptionId: existingSub.id,
        amountCents: 1799,
        currency: "EUR",
        changedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    const { container } = renderDialog(existingSub);

    await waitFor(() => {
      expect(screen.getByText("Preis-Historie (2 Einträge)")).toBeInTheDocument();
    });
    expect(screen.getByText("Konstant: 17,99 €")).toBeInTheDocument();

    const points = Array.from(container.querySelectorAll(".price-history-point"));
    expect(points).toHaveLength(2);
    expect(points.map((point) => point.getAttribute("cy"))).toEqual(["60", "60"]);
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

  it("zeigt feldnahe Fehlermeldung bei leerem Namen + fokussiert das Feld", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
    const nameInput = screen.getByLabelText("Name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveFocus();
    expect(screen.getByText("Bitte Namen eingeben.")).toBeInTheDocument();
  });

  it("zeigt feldnahe Fehlermeldung bei leerem Betrag", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte Betrag eingeben.")).toBeInTheDocument();
    expect(screen.getByLabelText("Betrag")).toHaveFocus();
  });

  it("zeigt feldnahe Fehlermeldung bei Betrag <= 0", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
    expect(screen.getByText(/Betrag muss größer als 0/)).toBeInTheDocument();
  });

  it("räumt den Validierungs-Fehler weg, sobald der User wieder tippt", async () => {
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    await Promise.resolve();
    expect(screen.getByText("Bitte Namen eingeben.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    expect(screen.queryByText("Bitte Namen eingeben.")).not.toBeInTheDocument();
  });

  it("zeigt Fehler bei Vorlauf außerhalb 0–365", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Vorlauf (Tage)"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
    expect(screen.getByText(/Vorlauf muss zwischen 0 und 365/)).toBeInTheDocument();
  });

  it("zeigt feldnahe Fehlermeldung bei ungueltigem Legacy-Datum", async () => {
    renderDialog({ ...existingSub, anchorDate: "2026-1-5" });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await Promise.resolve();
    expect(mockUpdateSubscription).not.toHaveBeenCalled();
    const anchorButton = screen.getByLabelText("Erste Fälligkeit");
    expect(anchorButton).toHaveAttribute("aria-invalid", "true");
    expect(anchorButton).toHaveFocus();
    expect(screen.getByText(/gültiges Datum im Format YYYY-MM-DD/)).toBeInTheDocument();
  });

  it("zeigt feldnahe Fehlermeldung bei unbekannter Waehrung", async () => {
    renderDialog({ ...existingSub, currency: "EURO" });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await Promise.resolve();
    expect(mockUpdateSubscription).not.toHaveBeenCalled();
    const currencySelect = screen.getByLabelText("Währung");
    expect(currencySelect).toHaveAttribute("aria-invalid", "true");
    expect(currencySelect).toHaveFocus();
    expect(screen.getByText(/erlaubte Währung/)).toBeInTheDocument();
  });

  it("akzeptiert Komma als Dezimaltrenner und rundet auf Cent", async () => {
    mockAddSubscription.mockResolvedValue(99);
    renderDialog(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "9,99" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledTimes(1);
    });
    expect(mockAddSubscription).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 999 }));
  });

  it("akzeptiert deutsche Tausender-Schreibweise (1.234,56)", async () => {
    mockAddSubscription.mockResolvedValue(99);
    renderDialog(null);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Versicherung" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "1.234,56" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledTimes(1);
    });
    expect(mockAddSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 123456 }),
    );
  });

  it("zeigt feldnahe Fehlermeldung bei ungueltiger Eingabe (Buchstaben)", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await Promise.resolve();
    expect(mockAddSubscription).not.toHaveBeenCalled();
    expect(screen.getByText(/Betrag ungültig/)).toBeInTheDocument();
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
