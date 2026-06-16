import { addDays, addMonths, isBefore, startOfDay } from "date-fns";
import type { Interval } from "../types";

// Re-Export, damit bestehende Importe aus "./recurrence" weiter funktionieren.
// Single Source of Truth ist `src/types.ts`.
export type { Interval };

/** Tag-basierte Intervalle (reine Tagesarithmetik, kein Monatstag-Drift). */
const DAY_STEPS = {
  weekly: 7,
  biweekly: 14,
} as const satisfies Partial<Record<Interval, number>>;

type DayInterval = keyof typeof DAY_STEPS;

export const monthsPer: Record<Exclude<Interval, DayInterval>, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export const INTERVAL_OPTIONS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "weekly", label: "Wöchentlich" },
  { value: "biweekly", label: "Zweiwöchentlich" },
  { value: "monthly", label: "Monatlich" },
  { value: "bimonthly", label: "Alle 2 Monate" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "semiannual", label: "Halbjährlich" },
  { value: "yearly", label: "Jährlich" },
];

function addInterval(anchor: Date, interval: Interval, k: number): Date {
  if (interval in DAY_STEPS) return addDays(anchor, k * DAY_STEPS[interval as DayInterval]);
  return addMonths(anchor, k * monthsPer[interval as Exclude<Interval, DayInterval>]);
}

/**
 * Nächstes Fälligkeitsdatum am oder nach `from`.
 *
 * Wichtig: Wir addieren IMMER auf das ursprüngliche Ankerdatum (anchor + k*step),
 * niemals iterativ auf das Zwischenergebnis. Sonst driftet der Monatstag weg
 * (31.01. -> 28.02. -> 28.03. statt korrekt 31.03.). date-fns klemmt den
 * Monatstag jeweils relativ zum Original sauber ab.
 */
export function nextDueDate(anchor: Date, interval: Interval, from: Date = new Date()): Date {
  const f = startOfDay(from);
  let k = 0;
  let due = startOfDay(anchor);
  while (isBefore(due, f)) {
    k += 1;
    due = startOfDay(addInterval(anchor, interval, k));
  }
  return due;
}

/** Alle Fälligkeiten im Zeitraum [from, until] (inklusive) — für die Kontodeckung. */
export function dueDatesWithin(anchor: Date, interval: Interval, from: Date, until: Date): Date[] {
  const f = startOfDay(from);
  const u = startOfDay(until);
  const a = startOfDay(anchor);
  const out: Date[] = [];
  let k = 0;
  let due = a;
  // erste Fälligkeit >= from finden (immer relativ zum Original-Anker addieren)
  while (isBefore(due, f)) {
    k += 1;
    due = startOfDay(addInterval(a, interval, k));
  }
  // dann einsammeln, solange <= until
  while (!isBefore(u, due)) {
    out.push(due);
    k += 1;
    due = startOfDay(addInterval(a, interval, k));
  }
  return out;
}
