import { describe, expect, it } from "vitest";
import type { Account, Subscription } from "../types";
import { computeCoverage, computeMonthlyBaseline } from "./coverage";

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
  ...overrides,
});

const acc = (id: number, name: string): Account => ({ id, name, note: null });

const NOW = new Date(2026, 0, 1); // 2026-01-01 lokal

describe("computeCoverage", () => {
  it("listet alle monatlichen Fälligkeiten innerhalb der nächsten 6 Monate auf", () => {
    const result = computeCoverage([sub()], [acc(1, "Giro")], 6, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.account).toBe("Giro");
    expect(result[0]?.items).toHaveLength(6);
    expect(result[0]?.totalCents).toBe(6000);
  });

  it("gruppiert nach Konto-Name und sortiert Buckets nach totalCents (absteigend)", () => {
    const subs = [
      sub({ id: 1, accountId: 1, amountCents: 500 }),
      sub({ id: 2, accountId: 2, amountCents: 2000 }),
    ];
    const accounts = [acc(1, "Klein"), acc(2, "Groß")];
    const result = computeCoverage(subs, accounts, 3, NOW);
    expect(result.map((b) => b.account)).toEqual(["Groß", "Klein"]);
  });

  it("nutzt den Platzhalter '(kein Konto zugeordnet)' für Subs ohne accountId", () => {
    const result = computeCoverage([sub({ accountId: null })], [], 1, NOW);
    expect(result[0]?.account).toBe("(kein Konto zugeordnet)");
  });

  it("nutzt den Platzhalter '(unbekanntes Konto)' bei verwaister accountId", () => {
    const result = computeCoverage([sub({ accountId: 99 })], [acc(1, "Giro")], 1, NOW);
    expect(result[0]?.account).toBe("(unbekanntes Konto)");
  });

  it("sortiert items innerhalb eines Buckets nach Datum (aufsteigend)", () => {
    const subs = [
      sub({ id: 1, name: "B", anchorDate: "2026-01-20" }),
      sub({ id: 2, name: "A", anchorDate: "2026-01-05" }),
    ];
    const result = computeCoverage(subs, [acc(1, "Giro")], 1, NOW);
    const dates = result[0]?.items.map((i) => i.date) ?? [];
    expect(dates).toEqual([...dates].sort());
  });
});

describe("computeMonthlyBaseline", () => {
  it("normiert quartalsweise und jährliche Abos auf den Monatsbetrag", () => {
    const subs = [
      sub({ id: 1, accountId: 1, interval: "monthly", amountCents: 1000 }),
      sub({ id: 2, accountId: 1, interval: "quarterly", amountCents: 3000 }),
      sub({ id: 3, accountId: 1, interval: "yearly", amountCents: 12000 }),
    ];
    const result = computeMonthlyBaseline(subs, [acc(1, "Giro")]);
    expect(result).toEqual([{ account: "Giro", monthlyCents: 3000 }]);
  });

  it("rundet anteilige Cent-Beträge mathematisch (Math.round)", () => {
    // yearly 10000 cents / 12 = 833.33... → 833
    const result = computeMonthlyBaseline(
      [sub({ interval: "yearly", amountCents: 10000 })],
      [acc(1, "Giro")],
    );
    expect(result[0]?.monthlyCents).toBe(833);
  });

  it("summiert mehrere Abos im selben Konto vor dem Runden", () => {
    // 100/12 + 100/12 = 16.66... → 17 (gerundet erst zum Schluss)
    const subs = [
      sub({ id: 1, accountId: 1, interval: "yearly", amountCents: 100 }),
      sub({ id: 2, accountId: 1, interval: "yearly", amountCents: 100 }),
    ];
    const result = computeMonthlyBaseline(subs, [acc(1, "Giro")]);
    expect(result[0]?.monthlyCents).toBe(17);
  });

  it("sortiert Konten nach monatlicher Basislinie (absteigend)", () => {
    const subs = [
      sub({ id: 1, accountId: 1, amountCents: 500 }),
      sub({ id: 2, accountId: 2, amountCents: 2000 }),
    ];
    const result = computeMonthlyBaseline(subs, [acc(1, "Klein"), acc(2, "Groß")]);
    expect(result.map((r) => r.account)).toEqual(["Groß", "Klein"]);
  });
});
