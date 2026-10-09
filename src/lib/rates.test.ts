import { describe, expect, it } from "vitest";
import { convertCents, findRate, formatRate, parseRateInput } from "./rates";

const rates = [
  { fromCurrency: "USD", toCurrency: "EUR", rateMicros: 920_000 }, // 1 USD = 0,92 EUR
  { fromCurrency: "EUR", toCurrency: "KRW", rateMicros: 1_500_000_000 }, // 1 EUR = 1.500 KRW
];

describe("findRate", () => {
  it("braucht für gleiche Währungen keinen Kurs", () => {
    expect(findRate([], "EUR", "EUR")).toEqual({ factor: 1, inverted: false });
  });

  it("findet den direkt hinterlegten Kurs", () => {
    expect(findRate(rates, "USD", "EUR")).toEqual({ factor: 0.92, inverted: false });
  });

  it("nutzt den Kehrwert, wenn nur der Gegenkurs hinterlegt ist", () => {
    const lookup = findRate(rates, "EUR", "USD");
    expect(lookup?.inverted).toBe(true);
    expect(lookup?.factor).toBeCloseTo(1 / 0.92, 10);
  });

  it("bevorzugt den direkten Kurs vor dem Kehrwert", () => {
    const both = [...rates, { fromCurrency: "EUR", toCurrency: "USD", rateMicros: 1_100_000 }];
    expect(findRate(both, "EUR", "USD")).toEqual({ factor: 1.1, inverted: false });
  });

  it("liefert null ohne passenden Kurs — nie ein Raten über Dritte", () => {
    // USD→KRW ließe sich über EUR rechnen; das geschieht bewusst nicht.
    expect(findRate(rates, "USD", "KRW")).toBeNull();
    expect(findRate([], "USD", "EUR")).toBeNull();
  });
});

describe("convertCents", () => {
  it("rechnet USD-Cent in EUR-Cent um", () => {
    // 10,00 USD × 0,92 = 9,20 EUR
    expect(convertCents(1000, "USD", "EUR", { factor: 0.92, inverted: false })).toBe(920);
  });

  it("berücksichtigt unterschiedliche Subdivisionen (EUR 100 → KRW 1)", () => {
    // 10,00 EUR × 1.500 = 15.000 KRW (Zero-Decimal-Währung)
    expect(convertCents(1000, "EUR", "KRW", { factor: 1500, inverted: false })).toBe(15000);
  });

  it("berücksichtigt die Gegenrichtung (KRW 1 → EUR 100)", () => {
    // 15.000 KRW / 1.500 = 10,00 EUR = 1000 Cent
    expect(convertCents(15000, "KRW", "EUR", { factor: 1 / 1500, inverted: true })).toBe(1000);
  });

  it("rundet auf die kleinste Einheit", () => {
    // 9,99 USD × 0,92 = 9,1908 EUR → 919 Cent
    expect(convertCents(999, "USD", "EUR", { factor: 0.92, inverted: false })).toBe(919);
  });

  it("lässt gleiche Währungen unverändert", () => {
    expect(convertCents(1234, "EUR", "EUR", { factor: 1, inverted: false })).toBe(1234);
  });
});

describe("parseRateInput", () => {
  it.each([
    ["1,0850", 1_085_000],
    ["1.0850", 1_085_000],
    ["0,92", 920_000],
    ["160", 160_000_000],
    [" 1,5 ", 1_500_000],
    ["0,000001", 1],
  ])("parst %s", (input, expected) => {
    expect(parseRateInput(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "0",
    "0,0",
    "-1,2",
    "1,2,3",
    "1.234,56",
    "1,1234567",
    "1e3",
  ])("lehnt %j ab", (input) => {
    expect(parseRateInput(input)).toBeNull();
  });
});

describe("formatRate", () => {
  it("formatiert mit deutschem Dezimalkomma und ohne Rauschen", () => {
    expect(formatRate(1_085_000)).toBe("1,085");
    expect(formatRate(920_000)).toBe("0,92");
    expect(formatRate(1_500_000_000)).toBe("1.500,00");
  });
});
