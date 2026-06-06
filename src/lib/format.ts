import { format } from "date-fns";
import type { Subscription } from "../types";
import { nextDueDate } from "./recurrence";

// Smallest currency unit pro ISO-4217-Code. Bei Waehrungen ohne Subdivision
// (z.B. KRW, JPY) ist der Wert in der DB direkt die ganze Einheit, nicht ein
// Subunit. Default 100 deckt EUR/USD/GBP/CHF und die meisten anderen ab.
const CURRENCY_SUBDIVISIONS: Record<string, number> = {
  EUR: 100,
  USD: 100,
  GBP: 100,
  CHF: 100,
  KRW: 1,
};

export function formatAmount(cents: number, currency: string): string {
  const divisor = CURRENCY_SUBDIVISIONS[currency] ?? 100;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / divisor);
}

export function formatNextDue(sub: Subscription, now: Date = new Date()): string {
  const due = nextDueDate(new Date(sub.anchorDate), sub.interval, now);
  return format(due, "dd.MM.yyyy");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
