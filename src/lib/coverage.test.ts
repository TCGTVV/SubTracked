import { describe, expect, it } from "vitest";
import type { Account, Income, Subscription } from "../types";
import {
  computeCostSummary,
  computeCoverage,
  computeMonthlyBaseline,
  computeUpcoming,
} from "./coverage";

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
  ...overrides,
});

const acc = (id: number, name: string, overrides: Partial<Account> = {}): Account => ({
  id,
  name,
  note: null,
  currency: "EUR",
  balanceCents: 0,
  minBufferCents: 0,
  balanceUpdatedAt: null,
  ...overrides,
});

const income = (overrides: Partial<Income> = {}): Income => ({
  id: 1,
  name: "Gehalt",
  amountCents: 250000,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2026-01-30",
  active: true,
  oneTime: false,
  ...overrides,
});

const NOW = new Date(2026, 0, 1); // 2026-01-01 lokal

describe("computeCoverage", () => {
  it("listet alle monatlichen Fälligkeiten innerhalb der nächsten 6 Monate auf", () => {
    const result = computeCoverage([sub()], [acc(1, "Giro")], 6, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.account).toBe("Giro");
    expect(result[0]?.items).toHaveLength(6);
    expect(result[0]?.totalOutflowCents).toBe(6000);
  });

  it("zeigt auch Konten ohne anstehende Abflüsse mit Saldo an", () => {
    const result = computeCoverage([], [acc(1, "Sparkonto", { balanceCents: 50000 })], 6, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.account).toBe("Sparkonto");
    expect(result[0]?.startingBalanceCents).toBe(50000);
    expect(result[0]?.finalBalanceCents).toBe(50000);
    expect(result[0]?.items).toHaveLength(0);
  });

  it("sortiert Konten mit Aktivität vor leeren Konten", () => {
    const subs = [sub({ id: 1, accountId: 2, amountCents: 500 })];
    const accounts = [acc(1, "Leer"), acc(2, "Aktiv")];
    const result = computeCoverage(subs, accounts, 3, NOW);
    expect(result.map((b) => b.account)).toEqual(["Aktiv", "Leer"]);
  });

  it("nutzt den Platzhalter '(kein Konto zugeordnet)' für Subs ohne accountId", () => {
    const result = computeCoverage([sub({ accountId: null })], [], 1, NOW);
    expect(result[0]?.account).toBe("(kein Konto zugeordnet)");
    expect(result[0]?.accountId).toBeNull();
  });

  it("trennt Subs ohne Konto pro Währung statt Beträge zu mischen", () => {
    const subs = [
      sub({ id: 1, accountId: null, currency: "EUR", amountCents: 1000 }),
      sub({ id: 2, accountId: null, currency: "USD", amountCents: 2500 }),
    ];
    const result = computeCoverage(subs, [], 1, NOW);
    expect(result).toHaveLength(2);
    expect(result.map((b) => [b.account, b.currency, b.totalOutflowCents]).sort()).toEqual([
      ["(kein Konto zugeordnet)", "EUR", 1000],
      ["(kein Konto zugeordnet)", "USD", 2500],
    ]);
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

  it("skippt ungueltige Legacy-Datumswerte statt sie zu normalisieren", () => {
    const subs = [
      sub({ id: 1, name: "Invalid", anchorDate: "2026-1-5" }),
      sub({ id: 2, name: "Leap", anchorDate: "2025-02-29" }),
      sub({ id: 3, name: "Valid", anchorDate: "2026-01-10" }),
    ];
    const result = computeCoverage(subs, [acc(1, "Giro")], 1, NOW);
    expect(result[0]?.items.map((i) => i.subscription)).toEqual(["Valid"]);
  });

  it("schreibt Saldo pro Buchung fort (balanceAfterCents)", () => {
    const subs = [sub({ amountCents: 1000 })];
    const accounts = [acc(1, "Giro", { balanceCents: 5000 })];
    const result = computeCoverage(subs, accounts, 3, NOW);
    const balances = result[0]?.items.map((i) => i.balanceAfterCents);
    expect(balances).toEqual([4000, 3000, 2000]);
    expect(result[0]?.finalBalanceCents).toBe(2000);
  });

  it("markiert Buchungen unterhalb des Mindestpuffers (belowBuffer)", () => {
    const subs = [sub({ amountCents: 2000 })];
    const accounts = [acc(1, "Giro", { balanceCents: 5000, minBufferCents: 2000 })];
    const result = computeCoverage(subs, accounts, 3, NOW);
    // Saldi: 3000, 1000, -1000. Puffer 2000 → erst ab zweiter Buchung unter Puffer.
    const flags = result[0]?.items.map((i) => i.belowBuffer);
    expect(flags).toEqual([false, true, true]);
    expect(result[0]?.firstBelowBufferDate).toBe(result[0]?.items[1]?.date);
  });

  it("markiert Buchungen unter 0 (belowZero) und merkt sich das erste Datum", () => {
    const subs = [sub({ amountCents: 2000 })];
    const accounts = [acc(1, "Giro", { balanceCents: 3000 })];
    const result = computeCoverage(subs, accounts, 3, NOW);
    // Saldi: 1000, -1000, -3000. Erst ab zweiter Buchung negativ.
    expect(result[0]?.items.map((i) => i.belowZero)).toEqual([false, true, true]);
    expect(result[0]?.firstBelowZeroDate).toBe(result[0]?.items[1]?.date);
  });

  it("ignoriert Subs in fremder Währung und zählt sie separat", () => {
    const subs = [
      sub({ id: 1, currency: "EUR", amountCents: 1000 }),
      sub({ id: 2, currency: "USD", amountCents: 999 }),
      sub({ id: 3, currency: "KRW", amountCents: 5000 }),
    ];
    const accounts = [acc(1, "Giro", { currency: "EUR", balanceCents: 10000 })];
    const result = computeCoverage(subs, accounts, 1, NOW);
    expect(result[0]?.items).toHaveLength(1);
    expect(result[0]?.items[0]?.cents).toBe(1000);
    expect(result[0]?.foreignCurrencySubsCount).toBe(2);
  });

  it("übernimmt currency aus dem Konto", () => {
    const accounts = [acc(1, "KRW-Konto", { currency: "KRW", balanceCents: 100000 })];
    const subs = [sub({ currency: "KRW", amountCents: 5000 })];
    const result = computeCoverage(subs, accounts, 1, NOW);
    expect(result[0]?.currency).toBe("KRW");
  });

  it("rechnet einmalige Einnahmen nur an ihrem Datum ein", () => {
    const result = computeCoverage([], [acc(1, "Giro")], 3, NOW, [
      income({ name: "Bonus", amountCents: 50000, anchorDate: "2026-02-10", oneTime: true }),
    ]);
    expect(result[0]?.items.map((i) => [i.subscription, i.date, i.type, i.cents])).toEqual([
      ["Bonus", "2026-02-10", "income", 50000],
    ]);
    expect(result[0]?.totalInflowCents).toBe(50000);
  });

  it("ignoriert vergangene einmalige Einnahmen im Forecast", () => {
    const result = computeCoverage([], [acc(1, "Giro")], 3, NOW, [
      income({ name: "Alter Bonus", anchorDate: "2025-12-31", oneTime: true }),
    ]);
    expect(result[0]?.items).toHaveLength(0);
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
    expect(result).toEqual([{ account: "Giro", currency: "EUR", monthlyCents: 3000 }]);
  });

  it("normiert zweiwöchentliche Abos mit 26 Zahlungen pro Jahr", () => {
    const result = computeMonthlyBaseline(
      [sub({ interval: "biweekly", amountCents: 1200 })],
      [acc(1, "Giro")],
    );
    expect(result).toEqual([{ account: "Giro", currency: "EUR", monthlyCents: 2600 }]);
  });

  it("trennt Buckets pro Währung statt heimlich zu summieren", () => {
    const subs = [
      sub({ id: 1, accountId: 1, currency: "EUR", amountCents: 1000 }),
      sub({ id: 2, accountId: 1, currency: "USD", amountCents: 2000 }),
    ];
    const result = computeMonthlyBaseline(subs, [acc(1, "Giro")]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("rundet anteilige Cent-Beträge mathematisch (Math.round)", () => {
    const result = computeMonthlyBaseline(
      [sub({ interval: "yearly", amountCents: 10000 })],
      [acc(1, "Giro")],
    );
    expect(result[0]?.monthlyCents).toBe(833);
  });

  it("summiert mehrere Abos im selben Konto vor dem Runden", () => {
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

describe("computeUpcoming", () => {
  it("listet Fälligkeiten innerhalb der nächsten N Tage chronologisch", () => {
    const subs = [
      sub({ id: 1, name: "Netflix", anchorDate: "2026-01-15" }),
      sub({ id: 2, name: "Strom", anchorDate: "2026-01-05", amountCents: 5000 }),
    ];
    const result = computeUpcoming(subs, [acc(1, "Giro")], 30, NOW);
    expect(result.map((i) => i.subscription)).toEqual(["Strom", "Netflix"]);
    expect(result.map((i) => i.date)).toEqual(["2026-01-05", "2026-01-15"]);
  });

  it("liefert keine Fälligkeiten ausserhalb des Fensters", () => {
    const result = computeUpcoming([sub({ anchorDate: "2026-03-15" })], [acc(1, "Giro")], 30, NOW);
    expect(result).toHaveLength(0);
  });

  it("setzt accountName auf null, wenn kein Konto zugeordnet ist", () => {
    const result = computeUpcoming([sub({ accountId: null })], [], 30, NOW);
    expect(result[0]?.accountName).toBeNull();
  });

  it("uebernimmt die Sub-Waehrung pro Item (kein heimliches Mappen)", () => {
    const subs = [
      sub({ id: 1, currency: "EUR", amountCents: 1000, anchorDate: "2026-01-10" }),
      sub({ id: 2, currency: "USD", amountCents: 999, anchorDate: "2026-01-20" }),
    ];
    const result = computeUpcoming(subs, [acc(1, "Giro")], 30, NOW);
    expect(result.map((i) => i.currency)).toEqual(["EUR", "USD"]);
  });

  it("skippt ungueltige Legacy-Datumswerte", () => {
    const subs = [
      sub({ id: 1, name: "Invalid", anchorDate: "2026-1-5" }),
      sub({ id: 2, name: "Leap", anchorDate: "2025-02-29" }),
      sub({ id: 3, name: "Valid", anchorDate: "2026-01-10" }),
    ];
    const result = computeUpcoming(subs, [acc(1, "Giro")], 30, NOW);
    expect(result.map((i) => i.subscription)).toEqual(["Valid"]);
  });

  it("uebertraegt notify, damit der Caller stumme Subs markieren kann", () => {
    const result = computeUpcoming([sub({ notify: false })], [acc(1, "Giro")], 30, NOW);
    expect(result[0]?.notify).toBe(false);
  });

  it("zeigt einmalige Einnahmen nur im passenden Fenster", () => {
    const result = computeUpcoming([], [acc(1, "Giro")], 30, NOW, [
      income({ name: "Bonus", amountCents: 50000, anchorDate: "2026-01-20", oneTime: true }),
    ]);
    expect(result.map((i) => [i.subscription, i.date, i.type])).toEqual([
      ["Bonus", "2026-01-20", "income"],
    ]);

    const past = computeUpcoming([], [acc(1, "Giro")], 30, NOW, [
      income({ name: "Alter Bonus", anchorDate: "2025-12-31", oneTime: true }),
    ]);
    expect(past).toHaveLength(0);
  });
});

describe("computeCostSummary", () => {
  it("liefert leeres Array ohne Abos", () => {
    expect(computeCostSummary([])).toEqual([]);
  });

  it("normiert Intervalle auf Monats- und Jahresbasis", () => {
    const result = computeCostSummary([
      sub({ id: 1, amountCents: 1200, interval: "monthly" }),
      sub({ id: 2, amountCents: 1200, interval: "yearly" }), // 100/Monat
      sub({ id: 3, amountCents: 1300, interval: "quarterly" }), // ~433.33/Monat → round
    ]);
    expect(result).toHaveLength(1);
    const eur = result[0];
    expect(eur.currency).toBe("EUR");
    expect(eur.subscriptionCount).toBe(3);
    // 1200 + 100 + 433.33 = 1733.33 → 1733
    expect(eur.monthlyCents).toBe(1733);
    expect(eur.yearlyCents).toBe(Math.round((1200 + 1200 / 12 + 1300 / 3) * 12));
  });

  it("rechnet weekly/biweekly korrekt aufs Monatsmittel", () => {
    const result = computeCostSummary([sub({ amountCents: 1000, interval: "weekly" })]);
    // 1000 * 52 / 12 = 4333.33 → 4333
    expect(result[0].monthlyCents).toBe(Math.round((1000 * 52) / 12));
  });

  it("trennt Währungen, summiert nicht über Kurse hinweg", () => {
    const result = computeCostSummary([
      sub({ id: 1, amountCents: 1000, currency: "EUR" }),
      sub({ id: 2, amountCents: 500000, currency: "KRW" }),
    ]);
    expect(result.map((r) => r.currency).sort()).toEqual(["EUR", "KRW"]);
    // Sortierung: höchster Monatsbetrag zuerst → KRW (500000) vor EUR (1000)
    expect(result[0].currency).toBe("KRW");
  });

  it("listet die teuersten Abos absteigend, gekürzt auf topN", () => {
    const subs = [
      sub({ id: 1, name: "A", amountCents: 100 }),
      sub({ id: 2, name: "B", amountCents: 900 }),
      sub({ id: 3, name: "C", amountCents: 500 }),
    ];
    const result = computeCostSummary(subs, 2);
    expect(result[0].top.map((t) => t.name)).toEqual(["B", "C"]);
    expect(result[0].top).toHaveLength(2);
  });

  it("schlüsselt nach Kategorie auf (null = ohne Kategorie), absteigend", () => {
    const result = computeCostSummary([
      sub({ id: 1, amountCents: 300, category: "Streaming" }),
      sub({ id: 2, amountCents: 700, category: "Streaming" }),
      sub({ id: 3, amountCents: 500, category: null }),
    ]);
    const cats = result[0].categories;
    expect(cats.map((c) => [c.category, c.monthlyCents, c.count])).toEqual([
      ["Streaming", 1000, 2],
      [null, 500, 1],
    ]);
  });
});

describe("Einmalige Ausgaben (oneTime)", () => {
  it("computeCoverage bucht eine oneTime-Ausgabe genau einmal am anchorDate", () => {
    const subs = [sub({ oneTime: true, anchorDate: "2026-03-10", amountCents: 5000 })];
    const result = computeCoverage(subs, [acc(1, "Giro", { balanceCents: 20000 })], 6, NOW);
    expect(result[0]?.items).toHaveLength(1);
    expect(result[0]?.items[0]?.date).toBe("2026-03-10");
    expect(result[0]?.totalOutflowCents).toBe(5000);
  });

  it("computeCoverage ignoriert eine oneTime-Ausgabe außerhalb des Fensters", () => {
    const subs = [sub({ oneTime: true, anchorDate: "2027-01-10" })];
    const result = computeCoverage(subs, [acc(1, "Giro")], 6, NOW);
    expect(result[0]?.items ?? []).toHaveLength(0);
  });

  it("computeUpcoming zeigt eine oneTime-Ausgabe als einzelne Buchung", () => {
    const subs = [sub({ oneTime: true, anchorDate: "2026-01-20", amountCents: 5000 })];
    const items = computeUpcoming(subs, [acc(1, "Giro")], 30, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.date).toBe("2026-01-20");
    expect(items[0]?.type).toBe("outflow");
  });

  it("computeMonthlyBaseline schließt oneTime-Ausgaben aus", () => {
    const subs = [
      sub({ id: 1, amountCents: 1000 }),
      sub({ id: 2, oneTime: true, amountCents: 9999 }),
    ];
    const baseline = computeMonthlyBaseline(subs, [acc(1, "Giro")]);
    // Nur das wiederkehrende Abo (1000) zählt, die Einmalausgabe nicht.
    expect(baseline[0]?.monthlyCents).toBe(1000);
  });

  it("computeCostSummary schließt oneTime-Ausgaben aus", () => {
    const subs = [
      sub({ id: 1, amountCents: 1000 }),
      sub({ id: 2, oneTime: true, amountCents: 9999 }),
    ];
    const summary = computeCostSummary(subs);
    expect(summary[0]?.subscriptionCount).toBe(1);
    expect(summary[0]?.monthlyCents).toBe(1000);
  });
});
