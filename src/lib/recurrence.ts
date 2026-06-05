import { addMonths, isBefore, startOfDay } from "date-fns";

export type Interval = "monthly" | "quarterly" | "yearly";

export const monthsPer: Record<Interval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

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
  const step = monthsPer[interval];
  let k = 0;
  let due = startOfDay(anchor);
  while (isBefore(due, f)) {
    k += 1;
    due = startOfDay(addMonths(anchor, k * step));
  }
  return due;
}

/** Alle Fälligkeiten im Zeitraum [from, until] (inklusive) — für die Kontodeckung. */
export function dueDatesWithin(anchor: Date, interval: Interval, from: Date, until: Date): Date[] {
  const f = startOfDay(from);
  const u = startOfDay(until);
  const step = monthsPer[interval];
  const a = startOfDay(anchor);
  const out: Date[] = [];
  let k = 0;
  let due = a;
  // erste Fälligkeit >= from finden (immer relativ zum Original-Anker addieren)
  while (isBefore(due, f)) {
    k += 1;
    due = startOfDay(addMonths(a, k * step));
  }
  // dann einsammeln, solange <= until
  while (!isBefore(u, due)) {
    out.push(due);
    k += 1;
    due = startOfDay(addMonths(a, k * step));
  }
  return out;
}
