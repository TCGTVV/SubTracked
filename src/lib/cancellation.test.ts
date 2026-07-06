import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import { cancelDeadline } from "./cancellation";

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 1,
    name: "Test",
    amountCents: 1000,
    currency: "EUR",
    accountId: null,
    interval: "monthly",
    anchorDate: "2026-01-15",
    leadDays: 60,
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

describe("cancelDeadline", () => {
  it("returns null when no cancellation is tracked", () => {
    expect(cancelDeadline(sub({}), new Date("2026-06-01"))).toBeNull();
  });

  it("returns the fixed date for cancelMode 'date'", () => {
    const s = sub({ cancelMode: "date", cancelDate: "2026-12-01" });
    expect(cancelDeadline(s, new Date("2026-06-01"))).toBe("2026-12-01");
  });

  it("returns the fixed date even when it lies in the past", () => {
    const s = sub({ cancelMode: "date", cancelDate: "2026-12-01" });
    expect(cancelDeadline(s, new Date("2027-03-01"))).toBe("2026-12-01");
  });

  it("subtracts a day-based period from the next due date", () => {
    const s = sub({
      anchorDate: "2026-01-15",
      interval: "monthly",
      cancelMode: "period",
      cancelPeriodValue: 7,
      cancelPeriodUnit: "days",
    });
    // nächste Fälligkeit ab 2026-06-01 ist 2026-06-15, minus 7 Tage = 2026-06-08
    expect(cancelDeadline(s, new Date("2026-06-01"))).toBe("2026-06-08");
  });

  it("subtracts a week-based period (boundary: deadline equals today)", () => {
    const s = sub({
      anchorDate: "2026-01-15",
      interval: "monthly",
      cancelMode: "period",
      cancelPeriodValue: 2,
      cancelPeriodUnit: "weeks",
    });
    // 2026-06-15 minus 14 Tage = 2026-06-01 (== from, gilt noch)
    expect(cancelDeadline(s, new Date("2026-06-01"))).toBe("2026-06-01");
  });

  it("subtracts months date-additively (3 months before a yearly renewal)", () => {
    const s = sub({
      anchorDate: "2026-12-01",
      interval: "yearly",
      cancelMode: "period",
      cancelPeriodValue: 3,
      cancelPeriodUnit: "months",
    });
    expect(cancelDeadline(s, new Date("2026-06-01"))).toBe("2026-09-01");
  });

  it("advances to the next renewal when the current cycle's deadline has passed", () => {
    const s = sub({
      anchorDate: "2026-12-01",
      interval: "yearly",
      cancelMode: "period",
      cancelPeriodValue: 3,
      cancelPeriodUnit: "months",
    });
    // 2026-09-01 ist verstrichen -> Frist der nächsten Verlängerung (2027-12-01)
    expect(cancelDeadline(s, new Date("2026-10-01"))).toBe("2027-09-01");
  });

  it("works for biweekly intervals", () => {
    const s = sub({
      anchorDate: "2026-06-01",
      interval: "biweekly",
      cancelMode: "period",
      cancelPeriodValue: 3,
      cancelPeriodUnit: "days",
    });
    // Fälligkeiten ab 2026-06-10: 2026-06-15, minus 3 Tage = 2026-06-12
    expect(cancelDeadline(s, new Date("2026-06-10"))).toBe("2026-06-12");
  });
});
