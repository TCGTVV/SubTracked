import type { Subscription } from "../types";
import { parseStrictISODate } from "./format";
import { nextDueDate } from "./recurrence";

/** null = alle Konten, "none" = nur Subs ohne Konto, number = bestimmtes Konto. */
export type AccountFilter = null | "none" | number;

/** null = alle, "on" = nur mit Erinnerung, "off" = nur stumm. */
export type NotifyFilter = null | "on" | "off";

export type SortKey =
  | "name-asc"
  | "name-desc"
  | "due-asc"
  | "due-desc"
  | "amount-asc"
  | "amount-desc";

export interface SubListOptions {
  account: AccountFilter;
  /** null = alle, sonst ISO-4217-Code wie "EUR". */
  currency: string | null;
  notify: NotifyFilter;
  sort: SortKey;
}

export const DEFAULT_SUB_LIST_OPTIONS: SubListOptions = {
  account: null,
  currency: null,
  notify: null,
  sort: "name-asc",
};

/**
 * Wendet Filter und Sortierung an. Reine Funktion — keine DB, kein State.
 * `now` ist injizierbar fuer deterministische Tests; default `new Date()`.
 */
export function applyFilterAndSort(
  subs: Subscription[],
  options: SubListOptions,
  now: Date = new Date(),
): Subscription[] {
  const filtered = subs.filter((s) => {
    if (options.account === "none" && s.accountId !== null) return false;
    if (typeof options.account === "number" && s.accountId !== options.account) return false;
    if (options.currency !== null && s.currency !== options.currency) return false;
    if (options.notify === "on" && !s.notify) return false;
    if (options.notify === "off" && s.notify) return false;
    return true;
  });

  const dueCache = new Map<number, number | null>();
  function due(sub: Subscription): number | null {
    let cached = dueCache.get(sub.id);
    if (cached === undefined) {
      const anchor = parseStrictISODate(sub.anchorDate);
      cached = anchor ? nextDueDate(anchor, sub.interval, now).getTime() : null;
      dueCache.set(sub.id, cached);
    }
    return cached;
  }

  function compareDue(a: Subscription, b: Subscription, direction: 1 | -1): number {
    const aDue = due(a);
    const bDue = due(b);
    if (aDue === null && bDue === null) return a.name.localeCompare(b.name, "de");
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return direction * (aDue - bDue);
  }

  const sorted = [...filtered];
  switch (options.sort) {
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "de"));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name, "de"));
      break;
    case "due-asc":
      sorted.sort((a, b) => compareDue(a, b, 1));
      break;
    case "due-desc":
      sorted.sort((a, b) => compareDue(a, b, -1));
      break;
    case "amount-asc":
      sorted.sort((a, b) => a.amountCents - b.amountCents);
      break;
    case "amount-desc":
      sorted.sort((a, b) => b.amountCents - a.amountCents);
      break;
  }

  return sorted;
}

/** Liefert die in den Subs vorkommenden Waehrungen, alphabetisch sortiert. */
export function uniqueCurrencies(subs: Subscription[]): string[] {
  return [...new Set(subs.map((s) => s.currency))].sort();
}

/** Sind in der Liste Subs ohne Konto-Zuordnung? */
export function hasUnassignedSubs(subs: Subscription[]): boolean {
  return subs.some((s) => s.accountId === null);
}
