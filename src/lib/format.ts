import { format } from "date-fns";
import type { Subscription } from "../types";
import { nextDueDate } from "./recurrence";

export function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatNextDue(sub: Subscription, now: Date = new Date()): string {
  const due = nextDueDate(new Date(sub.anchorDate), sub.interval, now);
  return format(due, "dd.MM.yyyy");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
