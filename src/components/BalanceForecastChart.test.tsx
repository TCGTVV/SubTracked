import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AccountCoverage, CoverageItem } from "../lib/coverage";
import { BalanceForecastChart } from "./BalanceForecastChart";

const from = new Date("2026-07-01T00:00:00Z");

function makeItem(overrides: Partial<CoverageItem> = {}): CoverageItem {
  return {
    type: "outflow",
    subscriptionId: 1,
    subscription: "Netflix",
    date: "2026-08-01",
    cents: 1799,
    balanceAfterCents: 48_201,
    belowBuffer: false,
    belowZero: false,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AccountCoverage> = {}): AccountCoverage {
  return {
    accountId: 1,
    account: "Girokonto",
    currency: "EUR",
    startingBalanceCents: 50_000,
    minBufferCents: 20_000,
    totalOutflowCents: 1799,
    totalInflowCents: 0,
    finalBalanceCents: 48_201,
    firstBelowBufferDate: null,
    firstBelowZeroDate: null,
    foreignCurrencySubsCount: 0,
    items: [makeItem()],
    ...overrides,
  };
}

function renderChart(account: AccountCoverage, months = 6) {
  return render(<BalanceForecastChart account={account} from={from} months={months} />);
}

describe("BalanceForecastChart", () => {
  it("rendert nichts für die Gruppe ohne Konto (accountId null)", () => {
    renderChart(makeAccount({ accountId: null }));
    expect(screen.queryByTestId("balance-forecast-chart")).not.toBeInTheDocument();
  });

  it("rendert nichts ohne anstehende Buchungen", () => {
    renderChart(makeAccount({ items: [] }));
    expect(screen.queryByTestId("balance-forecast-chart")).not.toBeInTheDocument();
  });

  it("rendert Überschrift, Step-Linie und den Zeitraum des Horizonts", () => {
    const { container } = renderChart(makeAccount(), 6);

    expect(screen.getByText("Saldo-Verlauf")).toBeInTheDocument();
    expect(screen.getByText("01.07.2026")).toBeInTheDocument();
    expect(screen.getByText("01.01.2027")).toBeInTheDocument();
    const path = container.querySelector("path.stroke-primary");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toMatch(/^M /);
  });

  it("zeigt Puffer- und Null-Linie mit Labels, wenn ein Puffer gesetzt ist", () => {
    renderChart(makeAccount({ minBufferCents: 20_000 }));

    expect(screen.getByText("Puffer")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("zeigt keine Puffer-Linie ohne Mindestpuffer", () => {
    renderChart(makeAccount({ minBufferCents: 0 }));

    expect(screen.queryByText("Puffer")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("färbt Buchungspunkte nach Saldo-Zustand und Einnahmen grün", () => {
    const { container } = renderChart(
      makeAccount({
        items: [
          makeItem(),
          makeItem({
            subscriptionId: 2,
            subscription: "Gehalt",
            type: "income",
            date: "2026-08-15",
            cents: 100_000,
            balanceAfterCents: 148_201,
          }),
          makeItem({
            subscriptionId: 3,
            subscription: "Miete",
            date: "2026-09-01",
            cents: 130_000,
            balanceAfterCents: 18_201,
            belowBuffer: true,
          }),
          makeItem({
            subscriptionId: 4,
            subscription: "Versicherung",
            date: "2026-10-01",
            cents: 25_000,
            balanceAfterCents: -6_799,
            belowBuffer: true,
            belowZero: true,
          }),
        ],
      }),
    );

    expect(container.querySelectorAll("circle.fill-warning")).toHaveLength(1);
    expect(container.querySelectorAll("circle.fill-destructive")).toHaveLength(1);
    expect(container.querySelectorAll("circle.fill-success")).toHaveLength(1);
    // Startpunkt + unauffällige Buchung bleiben in der Serienfarbe.
    expect(container.querySelectorAll("circle.fill-primary")).toHaveLength(2);
  });

  it("markiert die Unter-Null-Zone nur, wenn der Saldo tatsächlich negativ wird", () => {
    const ok = renderChart(makeAccount());
    expect(ok.container.querySelector("rect.fill-destructive\\/10")).toBeNull();
    ok.unmount();

    const negative = renderChart(
      makeAccount({
        items: [makeItem({ cents: 60_000, balanceAfterCents: -10_000, belowZero: true })],
      }),
    );
    expect(negative.container.querySelector("rect.fill-destructive\\/10")).not.toBeNull();
  });

  it("hängt an jeden Buchungspunkt einen Tooltip mit Betrag und Folgesaldo", () => {
    const { container } = renderChart(makeAccount());

    const titles = Array.from(container.querySelectorAll("title"), (t) => t.textContent ?? "");
    expect(titles.some((t) => /Heute:/.test(t))).toBe(true);
    expect(titles.some((t) => /01\.08\.2026 · Netflix: −.*→/.test(t))).toBe(true);
  });
});
