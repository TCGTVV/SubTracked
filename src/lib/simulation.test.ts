import { describe, expect, it } from "vitest";
import type { Account, Income, Subscription } from "../types";
import { computeSimulation } from "./simulation";

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
  pendingAmountCents: null,
  pendingFrom: null,
  ...overrides,
});

const acc = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  name: "Giro",
  note: null,
  currency: "EUR",
  balanceCents: 0,
  minBufferCents: 0,
  balanceUpdatedAt: null,
  ...overrides,
});

const NOW = new Date(2026, 0, 1);
const none = new Set<number>();

describe("computeSimulation", () => {
  it("ohne ausgeblendete Abos ist vorher gleich nachher", () => {
    const r = computeSimulation([sub()], [acc({ balanceCents: 100000 })], [], none, 6, NOW);
    expect(r.excluded).toEqual([]);
    expect(r.costs).toEqual([
      {
        currency: "EUR",
        monthlyBeforeCents: 1000,
        monthlyAfterCents: 1000,
        yearlyBeforeCents: 12000,
        yearlyAfterCents: 12000,
      },
    ]);
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]?.changed).toBe(false);
  });

  it("zieht ausgeblendete Abos von Monats- und Jahreskosten ab", () => {
    const subs = [sub({ id: 1, amountCents: 1000 }), sub({ id: 2, amountCents: 500 })];
    const r = computeSimulation(subs, [acc({ balanceCents: 100000 })], [], new Set([2]), 6, NOW);
    expect(r.excluded.map((s) => s.id)).toEqual([2]);
    expect(r.costs[0]).toMatchObject({
      monthlyBeforeCents: 1500,
      monthlyAfterCents: 1000,
      yearlyBeforeCents: 18000,
      yearlyAfterCents: 12000,
    });
  });

  it("behandelt Währungen getrennt, auch wenn eine Währung ganz wegfällt", () => {
    const subs = [
      sub({ id: 1, amountCents: 1000, currency: "EUR" }),
      sub({ id: 2, amountCents: 700, currency: "USD", accountId: null }),
    ];
    const r = computeSimulation(subs, [acc()], [], new Set([2]), 6, NOW);
    expect(r.costs.map((c) => c.currency)).toEqual(["EUR", "USD"]);
    expect(r.costs[1]).toMatchObject({ monthlyBeforeCents: 700, monthlyAfterCents: 0 });
  });

  it("zeigt, wenn die Kündigung ein Konto vom Minus rettet", () => {
    // Saldo 1.500 €, Netflix 1.000 €/Monat → Konto im Minus nach der 2. Buchung.
    const subs = [sub({ id: 1, amountCents: 100000 })];
    const accounts = [acc({ balanceCents: 150000 })];
    const r = computeSimulation(subs, accounts, [], new Set([1]), 6, NOW);
    const a = r.accounts[0];
    expect(a?.before.kind).toBe("danger");
    expect(a?.before.date).toBe("2026-02-15");
    expect(a?.after).toMatchObject({ kind: "ok", date: null, finalBalanceCents: 150000 });
    expect(a?.changed).toBe(true);
  });

  it("verschiebt die Unterschreitung, wenn nur ein Teil der Abos wegfällt", () => {
    const subs = [
      sub({ id: 1, amountCents: 60000 }),
      sub({ id: 2, amountCents: 60000, anchorDate: "2026-01-20" }),
    ];
    const accounts = [acc({ balanceCents: 130000 })];
    const r = computeSimulation(subs, accounts, [], new Set([2]), 6, NOW);
    const a = r.accounts[0];
    expect(a?.before.kind).toBe("danger");
    expect(a?.after.kind).toBe("danger");
    expect(a?.after.date && a.before.date && a.after.date > a.before.date).toBe(true);
    expect(a?.changed).toBe(true);
  });

  it("berücksichtigt Einnahmen in beiden Prognosen", () => {
    const incomes: Income[] = [
      {
        id: 1,
        name: "Gehalt",
        amountCents: 100000,
        currency: "EUR",
        accountId: 1,
        interval: "monthly",
        anchorDate: "2026-01-02",
        active: true,
        oneTime: false,
      },
    ];
    const r = computeSimulation(
      [sub({ amountCents: 50000 })],
      [acc({ balanceCents: 0 })],
      incomes,
      new Set([1]),
      6,
      NOW,
    );
    expect(r.accounts[0]?.before.kind).toBe("ok");
    expect(r.accounts[0]?.after.finalBalanceCents).toBeGreaterThan(
      r.accounts[0]?.before.finalBalanceCents ?? 0,
    );
  });

  it("ignoriert unbekannte IDs und den Sammelbucket ohne Konto", () => {
    const subs = [sub({ id: 1, accountId: null })];
    const r = computeSimulation(subs, [], [], new Set([1, 999]), 6, NOW);
    expect(r.excluded.map((s) => s.id)).toEqual([1]);
    expect(r.accounts).toEqual([]);
  });
});
