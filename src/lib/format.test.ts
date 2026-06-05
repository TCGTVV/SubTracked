import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import { formatAmount, formatNextDue, todayISO } from "./format";

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  name: "Test",
  amountCents: 1000,
  currency: "EUR",
  accountId: null,
  interval: "monthly",
  anchorDate: "2026-01-15",
  leadDays: 3,
  active: true,
  notify: true,
  ...overrides,
});

describe("formatAmount", () => {
  it("zeigt Cent als EUR im deutschen Format", () => {
    // Intl.NumberFormat nutzt ggf. NBSP zwischen Zahl und Währungssymbol — \s* ist tolerant.
    expect(formatAmount(999, "EUR")).toMatch(/^9,99\s*€$/);
    expect(formatAmount(1000, "EUR")).toMatch(/^10,00\s*€$/);
    expect(formatAmount(123456, "EUR")).toMatch(/^1\.234,56\s*€$/);
  });

  it("wechselt das Währungssymbol je nach Currency", () => {
    expect(formatAmount(1000, "USD")).toMatch(/10,00/);
    expect(formatAmount(1000, "USD")).toMatch(/\$|USD/);
  });

  it("behandelt 0 Cent korrekt", () => {
    expect(formatAmount(0, "EUR")).toMatch(/^0,00\s*€$/);
  });
});

describe("formatNextDue", () => {
  it("gibt das nächste Fälligkeitsdatum im deutschen dd.MM.yyyy-Format aus", () => {
    const now = new Date(2026, 5, 5); // 2026-06-05 lokal
    expect(formatNextDue(sub({ anchorDate: "2026-01-15" }), now)).toBe("15.06.2026");
  });

  it("zeigt den Anker selbst, wenn er in der Zukunft liegt", () => {
    const now = new Date(2026, 0, 1);
    expect(formatNextDue(sub({ anchorDate: "2026-08-20" }), now)).toBe("20.08.2026");
  });
});

describe("todayISO", () => {
  it("liefert das heutige Datum im yyyy-MM-dd-Format", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
