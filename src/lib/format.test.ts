import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import {
  formatAmount,
  formatNextDue,
  isCurrencyOption,
  isStrictISODate,
  parseAmountInput,
  parseSignedAmountInput,
  parseStrictISODate,
  todayISO,
  toISODateLocal,
} from "./format";

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

  it("behandelt Waehrungen ohne Subdivision (KRW) als ganze Einheit", () => {
    // KRW hat kein "Cent" - der DB-Wert ist direkt Won, nicht Won/100.
    // Intl gibt KRW ohne Decimal-Stellen aus; das Symbol ist Won (₩) oder KRW.
    expect(formatAmount(1500, "KRW")).toMatch(/1\.500/);
    expect(formatAmount(1500, "KRW")).toMatch(/₩|KRW/);
    expect(formatAmount(1500, "KRW")).not.toMatch(/15,00|15\.00/);
  });

  it("crasht nicht bei unbekannten Legacy-Waehrungen", () => {
    expect(formatAmount(1234, "EURO")).toBe("12,34 EURO");
    expect(formatAmount(1234, "")).toBe("12,34 ?");
  });
});

describe("currency/date validators", () => {
  it("erkennt erlaubte Waehrungen", () => {
    expect(isCurrencyOption("EUR")).toBe(true);
    expect(isCurrencyOption("KRW")).toBe(true);
    expect(isCurrencyOption("BTC")).toBe(false);
    expect(isCurrencyOption("eur")).toBe(false);
  });

  it("validiert ISO-Datumswerte strikt", () => {
    expect(isStrictISODate("2026-06-08")).toBe(true);
    expect(isStrictISODate("2026-6-8")).toBe(false);
    expect(isStrictISODate("2026-06-8")).toBe(false);
    expect(isStrictISODate("08.06.2026")).toBe(false);
    expect(isStrictISODate("2025-02-29")).toBe(false);
  });

  it("parst strikte ISO-Datumswerte als lokale Dates", () => {
    const parsed = parseStrictISODate("2026-06-08");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(8);
    expect(parseStrictISODate("2026-6-8")).toBeNull();
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

  it("normalisiert ungueltige Legacy-Datumswerte nicht still", () => {
    const now = new Date(2026, 0, 1);
    expect(formatNextDue(sub({ anchorDate: "2026-1-5" }), now)).toBe("Ungültiges Datum");
    expect(formatNextDue(sub({ anchorDate: "2025-02-29" }), now)).toBe("Ungültiges Datum");
  });
});

describe("todayISO", () => {
  it("liefert das heutige Datum im yyyy-MM-dd-Format", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toISODateLocal", () => {
  it("serialisiert Date via lokale Getter, nicht via UTC", () => {
    // Regression-Schutz fuer den TZ-Bug in coverage.ts: lokale Mitternacht in
    // Europe/Berlin (UTC+1/+2) wuerde via toISOString().slice(0,10) den Vortag
    // liefern. toISODateLocal nutzt explizit getFullYear/getMonth/getDate.
    const d = new Date(2026, 0, 20);
    expect(toISODateLocal(d)).toBe("2026-01-20");

    const newYear = new Date(2026, 0, 1);
    expect(toISODateLocal(newYear)).toBe("2026-01-01");

    // Monats- und Tagespad: einstellige Werte muessen mit Null gepadded sein.
    const padded = new Date(2026, 2, 5);
    expect(toISODateLocal(padded)).toBe("2026-03-05");
  });
});

describe("parseAmountInput", () => {
  it("akzeptiert reine Ziffern", () => {
    expect(parseAmountInput("12")).toBe(12);
    expect(parseAmountInput("1234")).toBe(1234);
    expect(parseAmountInput("0")).toBe(0);
  });

  it("akzeptiert einzelnes Komma als deutschen Dezimaltrenner", () => {
    expect(parseAmountInput("12,99")).toBeCloseTo(12.99);
    expect(parseAmountInput("0,5")).toBeCloseTo(0.5);
    expect(parseAmountInput("1234,56")).toBeCloseTo(1234.56);
  });

  it("akzeptiert einzelnen Punkt als englischen Dezimaltrenner", () => {
    expect(parseAmountInput("12.99")).toBeCloseTo(12.99);
    expect(parseAmountInput("0.5")).toBeCloseTo(0.5);
  });

  it("interpretiert einzelnes Trennzeichen mit 3 Stellen danach als Tausender", () => {
    // Klassischer Konflikt: '1,234' ist meistens engl. Tausender, nicht 1.234 EUR
    expect(parseAmountInput("1,234")).toBe(1234);
    expect(parseAmountInput("1.234")).toBe(1234);
    expect(parseAmountInput("12,345")).toBe(12345);
  });

  it("akzeptiert deutsche Tausender + Komma-Dezimal", () => {
    expect(parseAmountInput("1.234,56")).toBeCloseTo(1234.56);
    expect(parseAmountInput("1.234.567,89")).toBeCloseTo(1234567.89);
  });

  it("akzeptiert englische Tausender + Punkt-Dezimal", () => {
    expect(parseAmountInput("1,234.56")).toBeCloseTo(1234.56);
    expect(parseAmountInput("1,234,567.89")).toBeCloseTo(1234567.89);
  });

  it("ignoriert Whitespace am Rand", () => {
    expect(parseAmountInput("  12,99  ")).toBeCloseTo(12.99);
    expect(parseAmountInput("\t1234\n")).toBe(1234);
  });

  it("gibt null bei leerem Input zurueck", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("   ")).toBeNull();
  });

  it("gibt null bei ungueltigen Zeichen zurueck", () => {
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("12abc")).toBeNull();
    expect(parseAmountInput("12 34")).toBeNull(); // Leerzeichen mittendrin
    expect(parseAmountInput("-12")).toBeNull(); // Minus blockiert
    expect(parseAmountInput("+12")).toBeNull(); // Plus blockiert
    expect(parseAmountInput("12€")).toBeNull();
  });

  it("behandelt mehrere Trenner derselben Sorte als Tausender", () => {
    expect(parseAmountInput("1.234.567")).toBe(1234567);
    expect(parseAmountInput("1,234,567")).toBe(1234567);
  });

  it("akzeptiert Punkt/Komma am Anfang oder Ende als Dezimaltrenner", () => {
    expect(parseAmountInput(",5")).toBeCloseTo(0.5);
    expect(parseAmountInput(".5")).toBeCloseTo(0.5);
    expect(parseAmountInput("5,")).toBe(5);
    expect(parseAmountInput("5.")).toBe(5);
  });
});

describe("parseSignedAmountInput", () => {
  it("akzeptiert negative lokalisierte Zahlen", () => {
    expect(parseSignedAmountInput("-12")).toBe(-12);
    expect(parseSignedAmountInput("-12,99")).toBeCloseTo(-12.99);
    expect(parseSignedAmountInput("-1.234,56")).toBeCloseTo(-1234.56);
  });

  it("akzeptiert positive Zahlen ohne Vorzeichen wie parseAmountInput", () => {
    expect(parseSignedAmountInput("12,99")).toBeCloseTo(12.99);
    expect(parseSignedAmountInput("1,234.56")).toBeCloseTo(1234.56);
  });

  it("blockiert Plus und strukturell ungueltige negative Eingaben", () => {
    expect(parseSignedAmountInput("+12")).toBeNull();
    expect(parseSignedAmountInput("-")).toBeNull();
    expect(parseSignedAmountInput("-abc")).toBeNull();
  });
});
