import { addDays, addMonths, isBefore, startOfDay } from "date-fns";

export type Interval = "monthly" | "biweekly" | "quarterly" | "yearly";

export const monthsPer: Record<Exclude<Interval, "biweekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export const INTERVAL_OPTIONS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "monthly", label: "Monatlich" },
  { value: "biweekly", label: "Zweiwöchentlich" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "yearly", label: "Jährlich" },
];

const BIWEEKLY_DAYS = 14;

function addInterval(anchor: Date, interval: Interval, k: number): Date {
  if (interval === "biweekly") return addDays(anchor, k * BIWEEKLY_DAYS);
  return addMonths(anchor, k * monthsPer[interval]);
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
