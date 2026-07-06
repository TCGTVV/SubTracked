import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import { ArchivedSavingsSection } from "./ArchivedSavingsSection";

const now = new Date(2026, 0, 1); // 2026-01-01 lokal

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  name: "Netflix",
  amountCents: 1799,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2025-01-15",
  leadDays: 3,
  active: false,
  notify: true,
  cancelMode: null,
  cancelPeriodValue: null,
  cancelPeriodUnit: null,
  cancelDate: null,
  category: null,
  oneTime: false,
  archivedAt: "2025-09-01 10:00:00",
  pendingAmountCents: null,
  pendingFrom: null,
  ...overrides,
});

function renderSection(subscriptions: Subscription[]) {
  return render(<ArchivedSavingsSection subscriptions={subscriptions} now={now} />);
}

describe("ArchivedSavingsSection", () => {
  it("rendert nichts ohne archivierte Abos mit Zeitstempel", () => {
    renderSection([sub({ active: true, archivedAt: null })]);
    expect(screen.queryByText(/Gespart seit Kündigung/)).not.toBeInTheDocument();
  });

  it("zeigt Gesamtersparnis und Details pro archiviertem Abo", () => {
    renderSection([sub()]);

    expect(screen.getByText(/Gespart seit Kündigung/)).toBeInTheDocument();
    // 4 volle Monate à 17,99 € = 71,96 € — Total und Zeile zeigen denselben Betrag.
    expect(screen.getAllByText(/71,96/)).toHaveLength(2);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText(/archiviert am 01\.09\.2025/)).toBeInTheDocument();
    expect(screen.getByText(/17,99.*\/Monat/)).toBeInTheDocument();
  });

  it("zeigt frisch Archivierte mit Hinweis statt Betrag", () => {
    renderSection([sub({ archivedAt: "2025-12-20 08:00:00" })]);
    expect(screen.getByText("noch kein voller Monat")).toBeInTheDocument();
  });

  it("rendert pro Währung eine eigene Karte", () => {
    renderSection([
      sub({ id: 1 }),
      sub({ id: 2, name: "US-Dienst", currency: "USD", amountCents: 900 }),
    ]);

    expect(screen.getByText("Gespart seit Kündigung (EUR)")).toBeInTheDocument();
    expect(screen.getByText("Gespart seit Kündigung (USD)")).toBeInTheDocument();
  });
});
