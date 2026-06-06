import { addMonths, startOfDay } from "date-fns";
import type { Account, Subscription } from "../types";
import { dueDatesWithin, monthsPer } from "./recurrence";

export interface CoverageItem {
  subscriptionId: number;
  subscription: string;
  date: string; // ISO
  cents: number;
}

export interface AccountCoverage {
  account: string;
  totalCents: number;
  items: CoverageItem[];
}

/**
 * Anstehende Abflüsse je Konto über die nächsten `months` Monate.
 * Reine Funktion — kein DB-Zugriff, gut testbar.
 */
export function computeCoverage(
  subscriptions: Subscription[],
  accounts: Account[],
  months = 6,
  now: Date = new Date(),
): AccountCoverage[] {
  const from = startOfDay(now);
  const until = addMonths(from, months);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const buckets = new Map<string, AccountCoverage>();

  for (const sub of subscriptions) {
    const label =
      sub.accountId != null
        ? (accName.get(sub.accountId) ?? "(unbekanntes Konto)")
        : "(kein Konto zugeordnet)";

    const bucket = buckets.get(label) ?? { account: label, totalCents: 0, items: [] };

    for (const d of dueDatesWithin(new Date(sub.anchorDate), sub.interval, from, until)) {
      bucket.totalCents += sub.amountCents;
      bucket.items.push({
        subscriptionId: sub.id,
        subscription: sub.name,
        date: d.toISOString().slice(0, 10),
        cents: sub.amountCents,
      });
    }
    buckets.set(label, bucket);
  }

  for (const b of buckets.values()) {
    b.items.sort((a, c) => a.date.localeCompare(c.date));
  }
  return [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export interface MonthlyBaseline {
  account: string;
  monthlyCents: number;
}

/**
 * Monatlich gebundene Fixkosten je Konto: Quartalsweise/4, Jährlich/12 etc.
 * werden auf eine monatliche Basislinie normiert. Reine Funktion.
 * Hinweis: summiert über Währungen hinweg (siehe Backlog "Mehrwährungs-Handling").
 */
export function computeMonthlyBaseline(
  subscriptions: Subscription[],
  accounts: Account[],
): MonthlyBaseline[] {
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const buckets = new Map<string, number>();

  for (const sub of subscriptions) {
    const label =
      sub.accountId != null
        ? (accName.get(sub.accountId) ?? "(unbekanntes Konto)")
        : "(kein Konto zugeordnet)";
    const monthly = sub.amountCents / monthsPer[sub.interval];
    buckets.set(label, (buckets.get(label) ?? 0) + monthly);
  }

  return [...buckets.entries()]
    .map(([account, cents]) => ({ account, monthlyCents: Math.round(cents) }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents);
}
