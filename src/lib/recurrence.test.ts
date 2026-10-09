import { describe, expect, it } from "vitest";
import { dueDatesWithin, monthsPer, nextDueDate, nextDueDateSkipping } from "./recurrence";

// Lokale Mitternacht, damit Tests timezone-unabhängig sind.
// `new Date("YYYY-MM-DD")` würde UTC-Mitternacht erzeugen und mit startOfDay() kollidieren.
const d = (year: number, month: number, day: number) => new Date(year, month - 1, day);

describe("monthsPer", () => {
  it("mappt Intervalle auf die korrekten Monatsfaktoren", () => {
    expect(monthsPer.monthly).toBe(1);
    expect(monthsPer.bimonthly).toBe(2);
    expect(monthsPer.quarterly).toBe(3);
    expect(monthsPer.semiannual).toBe(6);
    expect(monthsPer.yearly).toBe(12);
    expect("biweekly" in monthsPer).toBe(false);
    expect("weekly" in monthsPer).toBe(false);
  });
});

describe("nextDueDateSkipping", () => {
  const anchor = d(2026, 1, 15);

  it("verhält sich ohne Skips wie nextDueDate", () => {
    expect(nextDueDateSkipping(anchor, "monthly", d(2026, 3, 20), undefined)).toEqual(
      nextDueDate(anchor, "monthly", d(2026, 3, 20)),
    );
    expect(nextDueDateSkipping(anchor, "monthly", d(2026, 3, 20), [])).toEqual(d(2026, 4, 15));
  });

  it("überspringt einen einzelnen Termin", () => {
    expect(nextDueDateSkipping(anchor, "monthly", d(2026, 3, 20), ["2026-04-15"])).toEqual(
      d(2026, 5, 15),
    );
  });

  it("überspringt mehrere aufeinanderfolgende Termine", () => {
    expect(
      nextDueDateSkipping(anchor, "monthly", d(2026, 3, 20), ["2026-04-15", "2026-05-15"]),
    ).toEqual(d(2026, 6, 15));
  });

  it("ignoriert Skips, die nicht der nächste Termin sind", () => {
    expect(nextDueDateSkipping(anchor, "monthly", d(2026, 3, 20), ["2026-06-15"])).toEqual(
      d(2026, 4, 15),
    );
  });

  it("bleibt monatsend-treu (anker-additiv) über übersprungene Termine hinweg", () => {
    expect(nextDueDateSkipping(d(2025, 1, 31), "monthly", d(2025, 2, 1), ["2025-02-28"])).toEqual(
      d(2025, 3, 31),
    );
  });

  it("bricht bei absurd vielen aufeinanderfolgenden Skips ab statt endlos zu suchen", () => {
    const skipped: string[] = [];
    for (let i = 0; i < 200; i++) {
      const date = nextDueDate(anchor, "weekly", new Date(2026, 0, 15 + 7 * i));
      skipped.push(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      );
    }
    expect(() => nextDueDateSkipping(anchor, "weekly", anchor, skipped)).not.toThrow();
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

  it("springt zweiwöchentlich in 14-Tage-Schritten", () => {
    expect(nextDueDate(d(2026, 1, 5), "biweekly", d(2026, 1, 18))).toEqual(d(2026, 1, 19));
    expect(nextDueDate(d(2026, 1, 5), "biweekly", d(2026, 2, 2))).toEqual(d(2026, 2, 2));
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

  it("sammelt zweiwöchentliche Fälligkeiten im Zeitraum", () => {
    expect(dueDatesWithin(d(2026, 1, 5), "biweekly", d(2026, 1, 1), d(2026, 2, 3))).toEqual([
      d(2026, 1, 5),
      d(2026, 1, 19),
      d(2026, 2, 2),
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
