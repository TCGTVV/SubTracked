import { describe, expect, it } from "vitest";
import { dueDatesWithin, monthsPer, nextDueDate } from "./recurrence";

// Lokale Mitternacht, damit Tests timezone-unabhängig sind.
// `new Date("YYYY-MM-DD")` würde UTC-Mitternacht erzeugen und mit startOfDay() kollidieren.
const d = (year: number, month: number, day: number) => new Date(year, month - 1, day);

describe("monthsPer", () => {
  it("mappt Intervalle auf die korrekten Monatsfaktoren", () => {
    expect(monthsPer.monthly).toBe(1);
    expect(monthsPer.quarterly).toBe(3);
    expect(monthsPer.yearly).toBe(12);
  });
});

describe("nextDueDate", () => {
  it("liefert den Anker selbst, wenn er heute oder in der Zukunft liegt", () => {
    expect(nextDueDate(d(2026, 8, 15), "monthly", d(2026, 6, 5))).toEqual(d(2026, 8, 15));
  });

  it("springt monatlich auf den nächsten Termin nach `from`", () => {
    expect(nextDueDate(d(2026, 1, 15), "monthly", d(2026, 3, 20))).toEqual(d(2026, 4, 15));
  });

  it("springt quartalsweise korrekt (anchor + 3 Monate)", () => {
    expect(nextDueDate(d(2026, 1, 10), "quarterly", d(2026, 2, 15))).toEqual(d(2026, 4, 10));
  });

  it("springt jährlich korrekt (anchor + 12 Monate)", () => {
    expect(nextDueDate(d(2025, 3, 20), "yearly", d(2026, 1, 1))).toEqual(d(2026, 3, 20));
  });

  it("driftet bei monatlich mit Anker 31. NICHT — addiert immer vom Original-Anker", () => {
    // Naiv iterativ: 31.01 -> 28.02 -> 28.03 (falsch). Anker-additiv: 31.01 + 2 Monate = 31.03.
    expect(nextDueDate(d(2025, 1, 31), "monthly", d(2025, 3, 15))).toEqual(d(2025, 3, 31));
  });
});

describe("dueDatesWithin", () => {
  it("liefert genau die Fälligkeiten innerhalb des Zeitraums (inklusiv)", () => {
    expect(dueDatesWithin(d(2026, 1, 15), "monthly", d(2026, 1, 1), d(2026, 6, 30))).toEqual([
      d(2026, 1, 15),
      d(2026, 2, 15),
      d(2026, 3, 15),
      d(2026, 4, 15),
      d(2026, 5, 15),
      d(2026, 6, 15),
    ]);
  });

  it("inkludiert den Endpunkt, wenn er exakt auf eine Fälligkeit fällt", () => {
    expect(dueDatesWithin(d(2026, 1, 15), "monthly", d(2026, 1, 1), d(2026, 2, 15))).toEqual([
      d(2026, 1, 15),
      d(2026, 2, 15),
    ]);
  });

  it("liefert eine leere Liste, wenn der Zeitraum vor dem Anker liegt", () => {
    expect(dueDatesWithin(d(2026, 12, 1), "monthly", d(2026, 1, 1), d(2026, 6, 30))).toEqual([]);
  });

  it("erkennt jährliche Fälligkeiten korrekt", () => {
    expect(dueDatesWithin(d(2024, 3, 20), "yearly", d(2026, 1, 1), d(2027, 12, 31))).toEqual([
      d(2026, 3, 20),
      d(2027, 3, 20),
    ]);
  });

  it("driftet beim 31. Januar nicht über mehrere Monate hinweg", () => {
    // Anker-Additiv-Beweis: ein naiv iterativer Algorithmus würde ab Februar permanent
    // auf den 28. fallen. Wir wollen die monatsechten Tage zurück.
    expect(dueDatesWithin(d(2025, 1, 31), "monthly", d(2025, 2, 1), d(2025, 7, 31))).toEqual([
      d(2025, 2, 28),
      d(2025, 3, 31),
      d(2025, 4, 30),
      d(2025, 5, 31),
      d(2025, 6, 30),
      d(2025, 7, 31),
    ]);
  });
});
