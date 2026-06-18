import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Subscription } from "../types";
import { OverviewSection } from "./OverviewSection";

const accounts: Account[] = [
  {
    id: 1,
    name: "Hauptkonto",
    note: null,
    currency: "EUR",
    balanceCents: 50000,
    minBufferCents: 0,
    balanceUpdatedAt: null,
  },
  {
    id: 2,
    name: "Sparkonto",
    note: null,
    currency: "EUR",
    balanceCents: 20000,
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
    anchorDate: "2026-07-01",
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

describe("OverviewSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rendert nichts, wenn weder Subscriptions noch Konten vorhanden sind", () => {
    const { container } = render(<OverviewSection subscriptions={[]} accounts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt die Monatliche-Baseline-Sektion mit dem normalisierten Betrag pro Konto", () => {
    const subs = [
      makeSub({ id: 1, name: "Netflix", amountCents: 1799, interval: "monthly", accountId: 1 }),
      makeSub({
        id: 2,
        name: "Cloud",
        amountCents: 3000,
        interval: "quarterly",
        accountId: 2,
      }),
    ];
    render(<OverviewSection subscriptions={subs} accounts={accounts} />);
    expect(screen.getByRole("heading", { name: "Monatliche Baseline" })).toBeInTheDocument();

    const list = screen.getByRole("heading", { name: "Monatliche Baseline" }).parentElement;
    expect(list?.textContent).toMatch(/Hauptkonto/);
    expect(list?.textContent).toMatch(/17,99/);
    expect(list?.textContent).toMatch(/Sparkonto/);
    expect(list?.textContent).toMatch(/10,00/);
  });

  it("zeigt Konten-Saldo und Forecast in der Coverage-Sektion", () => {
    const subs = [makeSub({ id: 1, name: "Netflix", amountCents: 1799, accountId: 1 })];
    render(<OverviewSection subscriptions={subs} accounts={accounts} months={6} />);

    const coverageSection = screen.getByRole("heading", { name: /Cashflow/ })
      .parentElement as HTMLElement;
    const summary = within(coverageSection).getByText("Hauptkonto").closest("summary");
    expect(summary).not.toBeNull();
    // 500,00 EUR Saldo, danach 6 × 17,99 EUR = 107,94 EUR abfluss → 392,06 EUR final
    expect(summary?.textContent).toMatch(/500,00/);
    expect(summary?.textContent).toMatch(/392,06/);
    expect(summary?.textContent).toMatch(/107,94/);
  });

  it("rendert pro Item Datum (dd.MM.yyyy), Betrag und Saldo danach", () => {
    const subs = [
      makeSub({
        id: 1,
        name: "Netflix",
        amountCents: 1799,
        interval: "monthly",
        anchorDate: "2026-07-01",
        accountId: 1,
      }),
    ];
    render(<OverviewSection subscriptions={subs} accounts={accounts} months={1} />);

    const coverageSection = screen.getByRole("heading", { name: /Cashflow/ })
      .parentElement as HTMLElement;
    const details = within(coverageSection).getByText("Hauptkonto").closest("details");
    expect(details).not.toBeNull();
    const itemList = within(details as HTMLElement).getByRole("list");
    expect(itemList.textContent).toMatch(/Netflix/);
    expect(itemList.textContent).toMatch(/01\.07\.2026/);
    expect(itemList.textContent).toMatch(/17,99/);
    // Saldo danach: 500,00 - 17,99 = 482,01
    expect(itemList.textContent).toMatch(/482,01/);
  });

  it("warnt, wenn der Saldo unter den Mindestpuffer fällt", () => {
    const tight: Account[] = [
      {
        id: 1,
        name: "Knapp",
        note: null,
        currency: "EUR",
        balanceCents: 3000,
        minBufferCents: 2000,
        balanceUpdatedAt: null,
      },
    ];
    const subs = [makeSub({ id: 1, amountCents: 2000, accountId: 1 })];
    const { container } = render(
      <OverviewSection subscriptions={subs} accounts={tight} months={3} />,
    );
    // Saldi: 1000, -1000, -3000. Erste Buchung unter Puffer ist sofort, erste unter 0 die zweite.
    const warning = container.querySelector(".coverage-warning-danger");
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toMatch(/unter 0/);
  });

  it("zeigt Hinweis, wenn Subs in fremder Währung ignoriert werden", () => {
    const subs = [
      makeSub({ id: 1, currency: "EUR", amountCents: 1000, accountId: 1 }),
      makeSub({ id: 2, currency: "USD", amountCents: 999, accountId: 1 }),
    ];
    render(<OverviewSection subscriptions={subs} accounts={accounts} months={1} />);
    const details = screen.getByText("Hauptkonto").closest("details");
    expect(details?.textContent).toMatch(/1 Abo in anderer Währung/);
  });
});
