import { addMonths, format, parseISO, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { computeCoverage } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Account, Income, Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  incomes: Income[];
  months?: number;
}

type Status =
  | { kind: "ok"; safeUntil: string }
  | { kind: "warn"; accountName: string; date: string; currency: string; balanceCents: number }
  | { kind: "danger"; accountName: string; date: string; currency: string; balanceCents: number };

function deriveStatus(
  subscriptions: Subscription[],
  accounts: Account[],
  incomes: Income[],
  months: number,
): Status | null {
  if (accounts.length === 0) return null;

  const coverage = computeCoverage(subscriptions, accounts, months, new Date(), incomes);
  const accountCoverages = coverage.filter((c) => c.accountId != null);
  if (accountCoverages.length === 0) return null;

  // Earliest danger date across all accounts.
  let earliestDanger: { date: string; name: string; currency: string; balance: number } | null =
    null;
  let earliestWarn: { date: string; name: string; currency: string; balance: number } | null = null;

  for (const c of accountCoverages) {
    if (c.firstBelowZeroDate) {
      if (!earliestDanger || c.firstBelowZeroDate < earliestDanger.date) {
        earliestDanger = {
          date: c.firstBelowZeroDate,
          name: c.account,
          currency: c.currency,
          balance: c.finalBalanceCents,
        };
      }
    } else if (c.firstBelowBufferDate) {
      if (!earliestWarn || c.firstBelowBufferDate < earliestWarn.date) {
        earliestWarn = {
          date: c.firstBelowBufferDate,
          name: c.account,
          currency: c.currency,
          balance: c.finalBalanceCents,
        };
      }
    }
  }

  if (earliestDanger) {
    return {
      kind: "danger",
      accountName: earliestDanger.name,
      date: earliestDanger.date,
      currency: earliestDanger.currency,
      balanceCents: earliestDanger.balance,
    };
  }
  if (earliestWarn) {
    return {
      kind: "warn",
      accountName: earliestWarn.name,
      date: earliestWarn.date,
      currency: earliestWarn.currency,
      balanceCents: earliestWarn.balance,
    };
  }

  const safeUntil = addMonths(startOfDay(new Date()), months);
  return { kind: "ok", safeUntil: safeUntil.toISOString().slice(0, 10) };
}

export function StatusCard({ subscriptions, accounts, incomes, months = 6 }: Props) {
  const status = deriveStatus(subscriptions, accounts, incomes, months);
  if (!status) return null;

  if (status.kind === "ok") {
    return (
      <div className="status-card status-card-ok">
        <span className="status-card-icon">✓</span>
        <span className="status-card-text">
          Alle Konten gedeckt bis{" "}
          <strong>{format(parseISO(status.safeUntil), "MMMM yyyy", { locale: de })}</strong>
        </span>
      </div>
    );
  }

  if (status.kind === "warn") {
    return (
      <div className="status-card status-card-warn">
        <span className="status-card-icon">⚠</span>
        <span className="status-card-text">
          <strong>{status.accountName}</strong> fällt am{" "}
          <strong>{format(parseISO(status.date), "dd.MM.yyyy", { locale: de })}</strong> unter
          Mindestpuffer
          {" · "}
          Endstand: {formatAmount(status.balanceCents, status.currency)}
        </span>
      </div>
    );
  }

  return (
    <div className="status-card status-card-danger">
      <span className="status-card-icon">✕</span>
      <span className="status-card-text">
        <strong>{status.accountName}</strong> fällt am{" "}
        <strong>{format(parseISO(status.date), "dd.MM.yyyy", { locale: de })}</strong> unter 0
        {" · "}
        Endstand: {formatAmount(status.balanceCents, status.currency)}
      </span>
    </div>
  );
}
