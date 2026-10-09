import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test-utils/axe";
import type { Account, Subscription } from "../types";
import { SimulationSection } from "./SimulationSection";

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  name: "Hauptkonto",
  note: null,
  currency: "EUR",
  balanceCents: 150000,
  minBufferCents: 0,
  balanceUpdatedAt: null,
  ...overrides,
});

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  name: "Netflix",
  amountCents: 100000,
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
});

describe("SimulationSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rendert nichts, solange kein Abo ausgeblendet ist", () => {
    const { container } = render(
      <SimulationSection
        subscriptions={[sub()]}
        accounts={[account()]}
        incomes={[]}
        excludedIds={new Set()}
        onReset={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt Ersparnis und die gerettete Kontoprognose", () => {
    render(
      <SimulationSection
        subscriptions={[sub()]}
        accounts={[account()]}
        incomes={[]}
        excludedIds={new Set([1])}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: /Was wäre, wenn/ })).toBeInTheDocument();
    expect(screen.getByText(/Ohne Netflix/)).toBeInTheDocument();
    expect(screen.getByText(/Du sparst/)).toHaveTextContent(/1\.000,00\s*€\/Monat/);
    expect(screen.getByText(/Du sparst/)).toHaveTextContent(/12\.000,00\s*€\/Jahr/);
    const line = screen.getByText("Hauptkonto").closest("li");
    expect(line).toHaveTextContent(/im Minus ab \d{2}\.\d{2}\.\d{4}/);
    expect(line).toHaveTextContent(/gedeckt/);
  });

  it("meldet, wenn sich die Kontoprognose nicht ändert", () => {
    render(
      <SimulationSection
        subscriptions={[sub({ amountCents: 500 })]}
        accounts={[account({ balanceCents: 10000000 })]}
        incomes={[]}
        excludedIds={new Set([1])}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/Keine Änderung an der Kontoprognose/)).toBeInTheDocument();
  });

  it("ruft onReset beim Zurücksetzen", () => {
    const onReset = vi.fn();
    render(
      <SimulationSection
        subscriptions={[sub()]}
        accounts={[account()]}
        incomes={[]}
        excludedIds={new Set([1])}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Simulation zurücksetzen" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("hat keine axe-Verstöße", async () => {
    // axe-core nutzt interne Timer und hängt unter Fake-Timers.
    vi.useRealTimers();
    render(
      <SimulationSection
        subscriptions={[sub()]}
        accounts={[account()]}
        incomes={[]}
        excludedIds={new Set([1])}
        onReset={vi.fn()}
      />,
    );
    await expectNoAxeViolations();
  });
});
