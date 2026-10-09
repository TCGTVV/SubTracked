import { addDays, getDay, startOfDay } from "date-fns";
import type { ShiftRule } from "../types";

// Bankarbeitstage und Termin-Verschiebung. Spiegel zu `src-tauri/src/bankdays.rs`; beide
// Seiten laufen gegen `tests/fixtures/bankday-vectors.json` (siehe bankdays.test.ts).
//
// Bankarbeitstag = Mo–Fr außer den bundeseinheitlichen Feiertagen: Neujahr, Karfreitag,
// Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, 3. Oktober, 1. und 2.
// Weihnachtstag. Regionale Feiertage zählen bewusst nicht (die App kennt kein Bundesland).

export const SHIFT_RULE_OPTIONS: { value: ShiftRule; label: string }[] = [
  { value: "none", label: "Keine Verschiebung" },
  { value: "next", label: "Nächster Bankarbeitstag" },
  { value: "previous", label: "Voriger Bankarbeitstag" },
];

/** Ostersonntag (Gregorianisch, „anonymer" Algorithmus nach Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Bundeseinheitlicher Feiertag? */
export function isBankHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (
    (month === 1 && day === 1) ||
    (month === 5 && day === 1) ||
    (month === 10 && day === 3) ||
    (month === 12 && (day === 25 || day === 26))
  ) {
    return true;
  }
  const easter = easterSunday(date.getFullYear());
  const t = startOfDay(date).getTime();
  // Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag
  return [-2, 1, 39, 50].some((offset) => addDays(easter, offset).getTime() === t);
}

export function isBankDay(date: Date): boolean {
  const weekday = getDay(date); // 0 = Sonntag, 6 = Samstag
  return weekday !== 0 && weekday !== 6 && !isBankHoliday(date);
}

/**
 * Verschiebt `date` gemäß Regel: `none`/undefined unverändert, `next` auf den nächsten und
 * `previous` auf den vorigen Bankarbeitstag (ist `date` selbst einer, bleibt es).
 */
export function shiftToBankDay(date: Date, rule: ShiftRule | undefined): Date {
  if (rule !== "next" && rule !== "previous") return date;
  const step = rule === "next" ? 1 : -1;
  let d = startOfDay(date);
  while (!isBankDay(d)) d = addDays(d, step);
  return d;
}
