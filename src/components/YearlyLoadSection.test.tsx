import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import { YearlyLoadSection } from "./YearlyLoadSection";

const from = new Date(2026, 0, 1); // 2026-01-01 lokal

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  name: "Test",
  amountCents: 1000,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2026-01-15",
  leadDays: 3,
  active: true,
  notify: true,
  cancelMode: null,
  cancelPeriodValue: null,
  cancelPeriodUnit: null,
  cancelDate: null,
  category: null,
  oneTime: false,
  archivedAt: null,
  ...overrides,
});

function renderSection(subscriptions: Subscription[]) {
  return render(<YearlyLoadSection subscriptions={subscriptions} from={from} />);
}

describe("YearlyLoadSection", () => {
  it("rendert nichts ohne Abos", () => {
    renderSection([]);
    expect(screen.queryByText(/Jahresbelastung/)).not.toBeInTheDocument();
  });

  it("rendert für ein monatliches Abo zwölf Balken und die Ø-Linie", () => {
    const { container } = renderSection([sub()]);

    expect(screen.getByText("Jahresbelastung")).toBeInTheDocument();
    expect(container.querySelectorAll("rect.fill-primary")).toHaveLength(12);
    expect(
      screen.getByText((content) => content.startsWith("Ø"), { selector: "text" }),
    ).toBeInTheDocument();
  });

  it("zeigt ein Jahres-Abo als einzelnen Balken mit Monats-Tooltip", () => {
    const { container } = renderSection([
      sub({ interval: "yearly", anchorDate: "2026-03-20", amountCents: 80_000 }),
    ]);

    expect(container.querySelectorAll("rect.fill-primary")).toHaveLength(1);
    const titles = Array.from(container.querySelectorAll("title"), (t) => t.textContent ?? "");
    expect(titles.some((t) => /März 2026: .*\(1 Posten\)/.test(t))).toBe(true);
  });

  it("beschriftet den teuersten Monat direkt am Balken", () => {
    const { container } = renderSection([
      sub({ id: 1, anchorDate: "2026-01-15", amountCents: 1000 }),
      sub({ id: 2, interval: "yearly", anchorDate: "2026-06-01", amountCents: 80_000 }),
    ]);

    const directLabel = container.querySelector("text.fill-foreground");
    expect(directLabel?.textContent).toMatch(/810,00/);
  });

  it("rendert pro Währung eine eigene Karte mit Währungs-Suffix", () => {
    renderSection([
      sub({ id: 1, currency: "EUR" }),
      sub({ id: 2, currency: "USD", amountCents: 2000 }),
    ]);

    expect(screen.getByText("Jahresbelastung (EUR)", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Jahresbelastung (USD)", { selector: "h2" })).toBeInTheDocument();
  });

  it("bietet alle zwölf Monatswerte als Liste an", () => {
    const { container } = renderSection([sub()]);

    expect(screen.getByText("Werte als Liste")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(12);
    expect(screen.getByText("Januar 2026")).toBeInTheDocument();
    expect(screen.getByText("Dezember 2026")).toBeInTheDocument();
  });
});
