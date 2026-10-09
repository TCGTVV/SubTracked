import type { Account, Income, Subscription } from "../types";
import { computeCostSummary, computeCoverage } from "./coverage";

/** Prognose-Ausblick eines Kontos über den Coverage-Horizont. */
export interface AccountOutlook {
  /** `ok` = gedeckt, `warn` = Mindestpuffer unterschritten, `danger` = Konto im Minus. */
  kind: "ok" | "warn" | "danger";
  /** Erstes Datum der Unterschreitung (ISO), bei `ok` null. */
  date: string | null;
  finalBalanceCents: number;
}

export interface SimulatedAccount {
  accountId: number;
  account: string;
  currency: string;
  before: AccountOutlook;
  after: AccountOutlook;
  /** Ändert sich Art oder Datum der ersten Unterschreitung? */
  changed: boolean;
}

interface SimulatedCost {
  currency: string;
  monthlyBeforeCents: number;
  monthlyAfterCents: number;
  yearlyBeforeCents: number;
  yearlyAfterCents: number;
}

export interface SimulationResult {
  /** Die tatsächlich ausgeblendeten (aktiven, vorhandenen) Abos. */
  excluded: Subscription[];
  costs: SimulatedCost[];
  accounts: SimulatedAccount[];
}

function outlookOf(c: {
  firstBelowZeroDate: string | null;
  firstBelowBufferDate: string | null;
  finalBalanceCents: number;
}): AccountOutlook {
  if (c.firstBelowZeroDate) {
    return { kind: "danger", date: c.firstBelowZeroDate, finalBalanceCents: c.finalBalanceCents };
  }
  if (c.firstBelowBufferDate) {
    return { kind: "warn", date: c.firstBelowBufferDate, finalBalanceCents: c.finalBalanceCents };
  }
  return { kind: "ok", date: null, finalBalanceCents: c.finalBalanceCents };
}

/**
 * Was-wäre-wenn: Wie ändern sich Kosten und Kontoprognose, wenn die Abos in
 * `excludedIds` wegfielen (Kündigungs-Entscheidungshilfe)? Rein rechnerisch auf
 * den übergebenen (aktiven) Listen — es wird nichts gespeichert oder verändert.
 *
 * Kosten pro Währung getrennt wie in `computeCostSummary`; Konten-Ausblick über
 * `computeCoverage` mit denselben Einnahmen, einmal mit allen und einmal ohne die
 * ausgeblendeten Abos. Nur echte Konten (kein „(kein Konto)"-Sammelbucket).
 */
export function computeSimulation(
  subscriptions: Subscription[],
  accounts: Account[],
  incomes: Income[],
  excludedIds: ReadonlySet<number>,
  months = 6,
  now: Date = new Date(),
): SimulationResult {
  const excluded = subscriptions.filter((s) => excludedIds.has(s.id));
  const remaining = subscriptions.filter((s) => !excludedIds.has(s.id));

  const before = computeCostSummary(subscriptions);
  const after = computeCostSummary(remaining);
  const currencies = [...new Set([...before, ...after].map((s) => s.currency))].sort();
  const costs: SimulatedCost[] = currencies.map((currency) => {
    const b = before.find((s) => s.currency === currency);
    const a = after.find((s) => s.currency === currency);
    return {
      currency,
      monthlyBeforeCents: b?.monthlyCents ?? 0,
      monthlyAfterCents: a?.monthlyCents ?? 0,
      yearlyBeforeCents: b?.yearlyCents ?? 0,
      yearlyAfterCents: a?.yearlyCents ?? 0,
    };
  });

  const coverageBefore = computeCoverage(subscriptions, accounts, months, now, incomes);
  const coverageAfter = computeCoverage(remaining, accounts, months, now, incomes);
  const afterById = new Map(coverageAfter.map((c) => [c.accountId, c]));

  const simulatedAccounts: SimulatedAccount[] = [];
  for (const b of coverageBefore) {
    if (b.accountId == null) continue;
    const a = afterById.get(b.accountId);
    if (!a) continue;
    const beforeOutlook = outlookOf(b);
    const afterOutlook = outlookOf(a);
    simulatedAccounts.push({
      accountId: b.accountId,
      account: b.account,
      currency: b.currency,
      before: beforeOutlook,
      after: afterOutlook,
      changed: beforeOutlook.kind !== afterOutlook.kind || beforeOutlook.date !== afterOutlook.date,
    });
  }

  return { excluded, costs, accounts: simulatedAccounts };
}
