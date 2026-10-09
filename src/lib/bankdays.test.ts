import { describe, expect, it } from "vitest";
import vectorsJson from "../../tests/fixtures/bankday-vectors.json";
import type { ShiftRule } from "../types";
import { easterSunday, isBankDay, isBankHoliday, shiftToBankDay } from "./bankdays";
import { parseStrictISODate, toISODateLocal } from "./format";

// Geteilte Vektoren mit `src-tauri/src/bankdays.rs` — beide Seiten müssen jeden Eintrag
// gleich beantworten (Easter-Algorithmus, Feiertagsmenge je Jahr, Verschiebung).

interface HolidayYear {
  year: number;
  easter: string;
  dates: string[];
}
interface ShiftVector {
  name: string;
  date: string;
  rule: string;
  expected: string;
}
const vectors = vectorsJson as unknown as { holidays: HolidayYear[]; shift: ShiftVector[] };

const day = (iso: string): Date => {
  const parsed = parseStrictISODate(iso);
  if (!parsed) throw new Error(`Ungültiges Datum in Fixture: ${iso}`);
  return parsed;
};

describe("bankdays (geteilte Vektoren)", () => {
  it("Fixture enthält Vektoren", () => {
    expect(vectors.holidays.length).toBeGreaterThan(0);
    expect(vectors.shift.length).toBeGreaterThan(0);
  });

  it.each(vectors.holidays)("Ostern und Feiertage $year stimmen mit der Fixture überein", (y) => {
    expect(toISODateLocal(easterSunday(y.year))).toBe(y.easter);
    const found: string[] = [];
    for (let d = new Date(y.year, 0, 1); d.getFullYear() === y.year; d.setDate(d.getDate() + 1)) {
      if (isBankHoliday(d)) found.push(toISODateLocal(d));
    }
    expect(found).toEqual(y.dates);
  });

  it.each(vectors.shift)("$name", (v) => {
    const shifted = shiftToBankDay(day(v.date), v.rule as ShiftRule);
    expect(toISODateLocal(shifted)).toBe(v.expected);
  });
});

describe("bankdays (Eigenschaften)", () => {
  it("next/previous landen immer auf einem Bankarbeitstag, nie in die falsche Richtung", () => {
    for (let d = new Date(2025, 0, 1); d < new Date(2031, 0, 1); d.setDate(d.getDate() + 1)) {
      const next = shiftToBankDay(d, "next");
      const prev = shiftToBankDay(d, "previous");
      expect(isBankDay(next)).toBe(true);
      expect(isBankDay(prev)).toBe(true);
      expect(next.getTime()).toBeGreaterThanOrEqual(new Date(d).setHours(0, 0, 0, 0));
      expect(prev.getTime()).toBeLessThanOrEqual(new Date(d).setHours(0, 0, 0, 0));
    }
  });

  it("none und undefined verschieben nie", () => {
    const saturday = day("2026-01-31");
    expect(shiftToBankDay(saturday, "none")).toBe(saturday);
    expect(shiftToBankDay(saturday, undefined)).toBe(saturday);
  });
});
