import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Subscription } from "../types";
import { OverviewSection } from "./OverviewSection";

const accounts: Account[] = [
  { id: 1, name: "Hauptkonto", note: null },
  { id: 2, name: "Sparkonto", note: null },
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

  it("rendert nichts, wenn keine Subscriptions vorhanden sind", () => {
    const { container } = render(<OverviewSection subscriptions={[]} accounts={accounts} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt die Monatliche-Baseline-Sektion mit dem normalisierten Betrag pro Konto", () => {
    const subs = [
      makeSub({ id: 1, name: "Netflix", amountCents: 1799, interval: "monthly", accountId: 1 }),
      // Quarterly 30 EUR → 10 EUR/Monat
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
    expect(list).not.toBeNull();
    expect(list?.textContent).toMatch(/Hauptkonto/);
    expect(list?.textContent).toMatch(/17,99/);
    expect(list?.textContent).toMatch(/Sparkonto/);
    expect(list?.textContent).toMatch(/10,00/);
  });

  it("zeigt eine Gesamt-Zeile, sobald mehr als ein Konto belastet wird", () => {
    const subs = [
      makeSub({ id: 1, amountCents: 1000, accountId: 1 }),
      makeSub({ id: 2, name: "Misc", amountCents: 500, accountId: 2 }),
    ];
    render(<OverviewSection subscriptions={subs} accounts={accounts} />);
    const baselineHeading = screen.getByRole("heading", { name: "Monatliche Baseline" });
    expect(baselineHeading.parentElement?.textContent).toMatch(/Gesamt/);
  });

  it("zeigt keine Gesamt-Zeile bei genau einem Konto", () => {
    const subs = [makeSub({ id: 1, accountId: 1 })];
    render(<OverviewSection subscriptions={subs} accounts={accounts} />);
    const baselineHeading = screen.getByRole("heading", { name: "Monatliche Baseline" });
    expect(baselineHeading.parentElement?.textContent).not.toMatch(/Gesamt/);
  });

  it("rendert ein details-Element pro Konto mit der formatierten Summe der anstehenden Abflüsse", () => {
    const subs = [makeSub({ id: 1, name: "Netflix", amountCents: 1799, accountId: 1 })];
    render(<OverviewSection subscriptions={subs} accounts={accounts} months={6} />);

    const coverageHeading = screen.getByRole("heading", {
      name: /Anstehende Abflüsse \(6 Monate\)/,
    });
    const coverageSection = coverageHeading.parentElement;
    expect(coverageSection).not.toBeNull();

    const summary = within(coverageSection as HTMLElement)
      .getByText("Hauptkonto")
      .closest("summary");
    expect(summary).not.toBeNull();
    // 6 Monate monthly = 6 × 17,99 EUR = 107,94 EUR
    expect(summary?.textContent).toMatch(/107,94/);
  });

  it("rendert pro Item Datum (dd.MM.yyyy) und formatierten Betrag", () => {
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

    const coverageSection = screen.getByRole("heading", {
      name: /Anstehende Abflüsse/,
    }).parentElement;
    expect(coverageSection).not.toBeNull();
    const details = within(coverageSection as HTMLElement)
      .getByText("Hauptkonto")
      .closest("details");
    expect(details).not.toBeNull();
    const itemList = within(details as HTMLElement).getByRole("list");
    expect(itemList.textContent).toMatch(/Netflix/);
    expect(itemList.textContent).toMatch(/01\.07\.2026/);
    expect(itemList.textContent).toMatch(/17,99/);
  });
});
