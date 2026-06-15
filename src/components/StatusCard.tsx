import { addMonths, format, parseISO, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { computeCoverage } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import { cn } from "../lib/utils";
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

const STYLES = {
  ok: {
    wrap: "border-success/30 bg-success/10 text-success-foreground",
    icon: "text-success",
    accent: "from-success/15",
  },
  warn: {
    wrap: "border-warning/40 bg-warning/10 text-warning-foreground",
    icon: "text-warning",
    accent: "from-warning/15",
  },
  danger: {
    wrap: "border-destructive/40 bg-destructive/10 text-foreground",
    icon: "text-destructive",
    accent: "from-destructive/15",
  },
} as const;

export function StatusCard({ subscriptions, accounts, incomes, months = 6 }: Props) {
  const status = deriveStatus(subscriptions, accounts, incomes, months);
  if (!status) return null;

  const s = STYLES[status.kind];

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-4 shadow-sm",
        s.wrap,
        s.accent,
      )}
    >
      {status.kind === "ok" && <CheckCircle2 className={cn("size-6 shrink-0", s.icon)} />}
      {status.kind === "warn" && <AlertTriangle className={cn("size-6 shrink-0", s.icon)} />}
      {status.kind === "danger" && <XCircle className={cn("size-6 shrink-0", s.icon)} />}

      <p className="text-fluid-sm leading-snug text-foreground">
        {status.kind === "ok" && (
          <>
            Alle Konten gedeckt bis{" "}
            <strong>{format(parseISO(status.safeUntil), "MMMM yyyy", { locale: de })}</strong>
          </>
        )}
        {status.kind === "warn" && (
          <>
            <strong>{status.accountName}</strong> fällt am{" "}
            <strong>{format(parseISO(status.date), "dd.MM.yyyy", { locale: de })}</strong> unter
            Mindestpuffer {" · "} Endstand: {formatAmount(status.balanceCents, status.currency)}
          </>
        )}
        {status.kind === "danger" && (
          <>
            <strong>{status.accountName}</strong> fällt am{" "}
            <strong>{format(parseISO(status.date), "dd.MM.yyyy", { locale: de })}</strong> unter 0
            {" · "} Endstand: {formatAmount(status.balanceCents, status.currency)}
          </>
        )}
      </p>
    </div>
  );
}
