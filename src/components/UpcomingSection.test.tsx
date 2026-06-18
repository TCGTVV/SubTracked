import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Subscription } from "../types";
import { UpcomingSection } from "./UpcomingSection";

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

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    name: "Netflix",
    amountCents: 1799,
    currency: "EUR",
    accountId: 1,
    interval: "monthly",
    anchorDate: "2026-06-20",
    leadDays: 7,
    active: true,
    notify: true,
    cancelMode: null,
    cancelPeriodValue: null,
    cancelPeriodUnit: null,
    cancelDate: null,
    category: null,
    ...overrides,
  };
}

describe("UpcomingSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("zeigt einen Empty-State, wenn keine Fälligkeiten im Fenster", () => {
    render(<UpcomingSection subscriptions={[]} accounts={accounts} />);
    expect(screen.getByText(/Keine Fälligkeiten in den nächsten 30 Tagen/)).toBeInTheDocument();
  });

  it("rendert Datum (dd.MM.), Name, Konto und Betrag pro Fälligkeit", () => {
    render(
      <UpcomingSection
        subscriptions={[makeSub({ anchorDate: "2026-06-20", amountCents: 1799 })]}
        accounts={accounts}
      />,
    );
    const row = screen.getByText("Netflix").closest("li");
    expect(row?.textContent).toMatch(/20\.06\./);
    expect(row?.textContent).toMatch(/Hauptkonto/);
    expect(row?.textContent).toMatch(/17,99/);
  });

  it("markiert stumme Abos mit '· stumm'", () => {
    render(<UpcomingSection subscriptions={[makeSub({ notify: false })]} accounts={accounts} />);
    expect(screen.getByText(/· stumm/)).toBeInTheDocument();
  });

  it("zeigt '(kein Konto)' wenn das Abo keinem Konto zugeordnet ist", () => {
    render(<UpcomingSection subscriptions={[makeSub({ accountId: null })]} accounts={accounts} />);
    expect(screen.getByText("(kein Konto)")).toBeInTheDocument();
  });

  it("respektiert den days-Parameter", () => {
    // Sub am 25.07., Fenster 7 Tage → leer
    render(
      <UpcomingSection
        subscriptions={[makeSub({ anchorDate: "2026-07-25" })]}
        accounts={accounts}
        days={7}
      />,
    );
    expect(screen.getByText(/Keine Fälligkeiten in den nächsten 7 Tagen/)).toBeInTheDocument();
  });
});
