import { addDays, addMonths, startOfDay } from "date-fns";
import type { Account, Income, Subscription } from "../types";
import { parseStrictISODate, toISODateLocal } from "./format";
import { dueDatesWithin, monthsPer } from "./recurrence";

export interface CoverageItem {
  /** "income" for positive cashflow entries, "outflow" for subscriptions. */
  type: "outflow" | "income";
  subscriptionId: number;
  subscription: string;
  date: string; // ISO YYYY-MM-DD
  cents: number;
  balanceAfterCents: number;
  belowBuffer: boolean;
  belowZero: boolean;
}

export interface AccountCoverage {
  accountId: number | null;
  account: string;
  currency: string;
  startingBalanceCents: number;
  minBufferCents: number;
  totalOutflowCents: number;
  totalInflowCents: number;
  finalBalanceCents: number;
  /** Erste Buchung, nach der der Saldo unter den Mindestpuffer fällt (null = nie). */
  firstBelowBufferDate: string | null;
  /** Erste Buchung, nach der der Saldo unter 0 fällt (null = nie). */
  firstBelowZeroDate: string | null;
  /** Subs in einer anderen Währung als das Konto — werden ignoriert, aber gezählt. */
  foreignCurrencySubsCount: number;
  items: CoverageItem[];
}

const UNASSIGNED_KEY = "__unassigned__";
const UNASSIGNED_LABEL = "(kein Konto zugeordnet)";

function incomeDatesWithin(income: Income, from: Date, until: Date): Date[] {
  const anchor = parseStrictISODate(income.anchorDate);
  if (!anchor) return [];
  if (!income.oneTime) return dueDatesWithin(anchor, income.interval, from, until);
  return anchor >= from && anchor <= until ? [anchor] : [];
}

function monthlyEquivalentCents(sub: Subscription): number {
  if (sub.interval === "weekly") return (sub.amountCents * 52) / 12;
  if (sub.interval === "biweekly") return (sub.amountCents * 26) / 12;
  return sub.amountCents / monthsPer[sub.interval];
}

/**
 * Anstehende Abflüsse je Konto über die nächsten `months` Monate, plus Saldo-Forecast
 * pro Buchung und Frühwarnung für Mindestpuffer / Konto-im-Minus.
 *
 * Multi-Currency-Schnitt: jedes Konto rechnet nur in seiner eigenen Währung; Subs in
 * fremder Währung werden ignoriert und nur als Zähler ausgewiesen. Subs ohne Konto
 * landen in Sammel-Buckets pro Währung, damit Beträge nie gemischt werden.
 */
export function computeCoverage(
  subscriptions: Subscription[],
  accounts: Account[],
  months = 6,
  now: Date = new Date(),
  incomes: Income[] = [],
): AccountCoverage[] {
  const from = startOfDay(now);
  const until = addMonths(from, months);
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const buckets = new Map<string, AccountCoverage>();

  // Seed Buckets fuer alle bekannten Konten, damit Saldo + Warnungen auch ohne anstehende
  // Buchungen sichtbar bleiben.
  for (const a of accounts) {
    buckets.set(String(a.id), {
      accountId: a.id,
      account: a.name,
      currency: a.currency,
      startingBalanceCents: a.balanceCents,
      minBufferCents: a.minBufferCents,
      totalOutflowCents: 0,
      totalInflowCents: 0,
      finalBalanceCents: a.balanceCents,
      firstBelowBufferDate: null,
      firstBelowZeroDate: null,
      foreignCurrencySubsCount: 0,
      items: [],
    });
  }

  // Erst Items sammeln (pro Konto), dann nach Datum sortieren, dann Saldo fortschreiben.
  const itemsByBucket = new Map<
    string,
    Omit<CoverageItem, "balanceAfterCents" | "belowBuffer" | "belowZero">[]
  >();

  for (const sub of subscriptions) {
    const account = sub.accountId != null ? accById.get(sub.accountId) : undefined;
    const key = account ? String(account.id) : `${UNASSIGNED_KEY}:${sub.currency}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        accountId: account ? account.id : null,
        account: account ? account.name : UNASSIGNED_LABEL,
        currency: account ? account.currency : sub.currency,
        startingBalanceCents: 0,
        minBufferCents: 0,
        totalOutflowCents: 0,
        totalInflowCents: 0,
        finalBalanceCents: 0,
        firstBelowBufferDate: null,
        firstBelowZeroDate: null,
        foreignCurrencySubsCount: 0,
        items: [],
      };
      buckets.set(key, bucket);
    }

    // Fremdwaehrung: nur zaehlen, nicht einrechnen. Saldo/Forecast bleiben ehrlich.
    if (account && sub.currency !== account.currency) {
      bucket.foreignCurrencySubsCount += 1;
      continue;
    }

    const list = itemsByBucket.get(key) ?? [];
    const anchor = parseStrictISODate(sub.anchorDate);
    if (!anchor) continue;
    for (const d of dueDatesWithin(anchor, sub.interval, from, until)) {
      list.push({
        type: "outflow",
        subscriptionId: sub.id,
        subscription: sub.name,
        date: toISODateLocal(d),
        cents: sub.amountCents,
      });
    }
    itemsByBucket.set(key, list);
  }

  for (const inc of incomes) {
    if (!inc.active) continue;
    const account = inc.accountId != null ? accById.get(inc.accountId) : undefined;
    const key = account ? String(account.id) : `${UNASSIGNED_KEY}:${inc.currency}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        accountId: account ? account.id : null,
        account: account ? account.name : UNASSIGNED_LABEL,
        currency: account ? account.currency : inc.currency,
        startingBalanceCents: 0,
        minBufferCents: 0,
        totalOutflowCents: 0,
        totalInflowCents: 0,
        finalBalanceCents: 0,
        firstBelowBufferDate: null,
        firstBelowZeroDate: null,
        foreignCurrencySubsCount: 0,
        items: [],
      };
      buckets.set(key, bucket);
    }

    if (account && inc.currency !== account.currency) {
      bucket.foreignCurrencySubsCount += 1;
      continue;
    }

    const list = itemsByBucket.get(key) ?? [];
    for (const d of incomeDatesWithin(inc, from, until)) {
      list.push({
        type: "income",
        subscriptionId: inc.id,
        subscription: inc.name,
        date: toISODateLocal(d),
        cents: inc.amountCents,
      });
    }
    itemsByBucket.set(key, list);
  }

  for (const [key, raw] of itemsByBucket) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    raw.sort((a, b) => a.date.localeCompare(b.date));

    let running = bucket.startingBalanceCents;
    for (const it of raw) {
      if (it.type === "income") {
        running += it.cents;
        bucket.totalInflowCents += it.cents;
      } else {
        running -= it.cents;
        bucket.totalOutflowCents += it.cents;
      }
      const belowZero = running < 0;
      const belowBuffer = running < bucket.minBufferCents;
      if (belowZero && bucket.firstBelowZeroDate === null) bucket.firstBelowZeroDate = it.date;
      if (belowBuffer && bucket.firstBelowBufferDate === null)
        bucket.firstBelowBufferDate = it.date;
      bucket.items.push({ ...it, balanceAfterCents: running, belowBuffer, belowZero });
    }
    bucket.finalBalanceCents = running;
  }

  return [...buckets.values()].sort((a, b) => {
    // Konten mit anstehenden Buchungen oder Warnungen zuerst, sonst nach Saldo absteigend.
    const aActive = a.items.length > 0 ? 1 : 0;
    const bActive = b.items.length > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return b.totalOutflowCents - a.totalOutflowCents;
  });
}

export interface MonthlyBaseline {
  account: string;
  currency: string;
  monthlyCents: number;
}

/**
 * Monatlich gebundene Fixkosten je (Konto, Währung). Subs in einer anderen Währung als
 * ihr Konto werden separat aufgeführt, damit nie über Währungen hinweg summiert wird.
 */
export function computeMonthlyBaseline(
  subscriptions: Subscription[],
  accounts: Account[],
): MonthlyBaseline[] {
  const accById = new Map(accounts.map((a) => [a.id, a]));
  // Key: "<account-label>__<currency>"
  const buckets = new Map<string, MonthlyBaseline>();

  for (const sub of subscriptions) {
    const account = sub.accountId != null ? accById.get(sub.accountId) : undefined;
    const label = account ? account.name : UNASSIGNED_LABEL;
    const currency = sub.currency;
    const key = `${label}__${currency}`;
    const monthly = monthlyEquivalentCents(sub);
    const bucket = buckets.get(key) ?? { account: label, currency, monthlyCents: 0 };
    bucket.monthlyCents += monthly;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, monthlyCents: Math.round(b.monthlyCents) }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/** Kosten-Aufschlüsselung einer Kategorie (auf Monatsbasis normiert). */
export interface CategoryCost {
  /** Kategorie-Label; null = ohne Kategorie. */
  category: string | null;
  monthlyCents: number;
  count: number;
}

/** Ein teures Abo im Kosten-Überblick (auf Monatsbasis normiert). */
export interface TopSubscriptionCost {
  id: number;
  name: string;
  monthlyCents: number;
}

/** Kosten-Überblick pro Währung. */
export interface CurrencyCostSummary {
  currency: string;
  monthlyCents: number;
  yearlyCents: number;
  subscriptionCount: number;
  /** Teuerste Abos (Monatsbasis), absteigend, auf `topN` gekürzt. */
  top: TopSubscriptionCost[];
  /** Aufschlüsselung pro Kategorie, absteigend nach Monatsbetrag. */
  categories: CategoryCost[];
}

/**
 * Kosten-Überblick über die übergebenen Abos: monatliches und jährliches Äquivalent,
 * teuerste Abos und Aufschlüsselung pro Kategorie.
 *
 * Multi-Currency wie bei `computeCoverage`: pro Währung getrennt summiert, nie heimlich
 * umgerechnet. Jahreswert = Monatswert × 12 (konsistent mit der Monatszahl).
 *
 * Nur aktive Abos einzurechnen ist Aufrufer-Verantwortung (archivierte vorher rausfiltern).
 */
export function computeCostSummary(subscriptions: Subscription[], topN = 5): CurrencyCostSummary[] {
  const byCurrency = new Map<
    string,
    {
      monthly: number;
      count: number;
      categories: Map<string | null, { monthly: number; count: number }>;
      subs: TopSubscriptionCost[];
    }
  >();

  for (const sub of subscriptions) {
    const monthly = monthlyEquivalentCents(sub);
    let entry = byCurrency.get(sub.currency);
    if (!entry) {
      entry = { monthly: 0, count: 0, categories: new Map(), subs: [] };
      byCurrency.set(sub.currency, entry);
    }
    entry.monthly += monthly;
    entry.count += 1;
    entry.subs.push({ id: sub.id, name: sub.name, monthlyCents: monthly });

    const catKey = sub.category ?? null;
    const cat = entry.categories.get(catKey) ?? { monthly: 0, count: 0 };
    cat.monthly += monthly;
    cat.count += 1;
    entry.categories.set(catKey, cat);
  }

  return [...byCurrency.entries()]
    .map(([currency, e]) => ({
      currency,
      monthlyCents: Math.round(e.monthly),
      yearlyCents: Math.round(e.monthly * 12),
      subscriptionCount: e.count,
      top: e.subs
        .sort((a, b) => b.monthlyCents - a.monthlyCents)
        .slice(0, topN)
        .map((s) => ({ ...s, monthlyCents: Math.round(s.monthlyCents) })),
      categories: [...e.categories.entries()]
        .map(([category, c]) => ({
          category,
          monthlyCents: Math.round(c.monthly),
          count: c.count,
        }))
        .sort((a, b) => b.monthlyCents - a.monthlyCents),
    }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents);
}

export interface UpcomingItem {
  type: "outflow" | "income";
  subscriptionId: number;
  subscription: string;
  /** ISO YYYY-MM-DD */
  date: string;
  cents: number;
  currency: string;
  accountName: string | null;
  notify: boolean;
}

/**
 * Alle Faelligkeiten der naechsten `days` Tage ueber alle uebergebenen Subscriptions,
 * chronologisch sortiert. Reine Funktion. Aufrufer soll nur aktive Subs uebergeben —
 * archivierte landen sonst trotzdem in der Liste, was den primaeren Arbeitsmodus
 * mit Phantom-Buchungen verschmutzen wuerde.
 */
export function computeUpcoming(
  subscriptions: Subscription[],
  accounts: Account[],
  days = 30,
  now: Date = new Date(),
  incomes: Income[] = [],
): UpcomingItem[] {
  const from = startOfDay(now);
  const until = addDays(from, days);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const items: UpcomingItem[] = [];

  for (const sub of subscriptions) {
    const accountName =
      sub.accountId != null ? (accName.get(sub.accountId) ?? "(unbekanntes Konto)") : null;
    const anchor = parseStrictISODate(sub.anchorDate);
    if (!anchor) continue;
    for (const d of dueDatesWithin(anchor, sub.interval, from, until)) {
      items.push({
        type: "outflow",
        subscriptionId: sub.id,
        subscription: sub.name,
        date: toISODateLocal(d),
        cents: sub.amountCents,
        currency: sub.currency,
        accountName,
        notify: sub.notify,
      });
    }
  }

  for (const inc of incomes) {
    if (!inc.active) continue;
    const accountName =
      inc.accountId != null ? (accName.get(inc.accountId) ?? "(unbekanntes Konto)") : null;
    for (const d of incomeDatesWithin(inc, from, until)) {
      items.push({
        type: "income",
        subscriptionId: inc.id,
        subscription: inc.name,
        date: toISODateLocal(d),
        cents: inc.amountCents,
        currency: inc.currency,
        accountName,
        notify: false,
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}
