import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import { CostSummarySection } from "./CostSummarySection";

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
    oneTime: false,
    archivedAt: null,
    pendingAmountCents: null,
    pendingFrom: null,
    ...overrides,
  };
}

describe("CostSummarySection", () => {
  it("rendert nichts ohne Abos", () => {
    const { container } = render(<CostSummarySection subscriptions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt die Monats- und Jahres-Kennzahl", () => {
    const { container } = render(
      <CostSummarySection subscriptions={[makeSub({ amountCents: 1000, interval: "monthly" })]} />,
    );
    expect(container.textContent).toMatch(/10,00.*\/Monat/); // 10/Monat
    expect(container.textContent).toMatch(/120,00.*\/Jahr/); // 120/Jahr
  });

  it("listet die teuersten Abos", () => {
    render(
      <CostSummarySection
        subscriptions={[
          makeSub({ id: 1, name: "Günstig", amountCents: 500 }),
          makeSub({ id: 2, name: "Teuer", amountCents: 5000 }),
        ]}
      />,
    );
    expect(screen.getByText("Teuerste Abos")).toBeInTheDocument();
    expect(screen.getByText("Teuer")).toBeInTheDocument();
  });

  it("zeigt die Kategorie-Aufschlüsselung ab mehr als einer Kategorie", () => {
    render(
      <CostSummarySection
        subscriptions={[
          makeSub({ id: 1, amountCents: 1000, category: "Streaming" }),
          makeSub({ id: 2, amountCents: 500, category: null }),
        ]}
      />,
    );
    expect(screen.getByText("Nach Kategorie")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(screen.getByText("Ohne Kategorie")).toBeInTheDocument();
  });

  it("blendet die Kategorie-Sektion bei nur einer Kategorie aus", () => {
    render(<CostSummarySection subscriptions={[makeSub({ category: "Streaming" })]} />);
    expect(screen.queryByText("Nach Kategorie")).not.toBeInTheDocument();
  });

  it("trennt nach Währung", () => {
    render(
      <CostSummarySection
        subscriptions={[
          makeSub({ id: 1, currency: "EUR", amountCents: 1000 }),
          makeSub({ id: 2, currency: "USD", amountCents: 2000 }),
        ]}
      />,
    );
    expect(screen.getByText("Abo-Kosten (EUR)")).toBeInTheDocument();
    expect(screen.getByText("Abo-Kosten (USD)")).toBeInTheDocument();
  });
});
