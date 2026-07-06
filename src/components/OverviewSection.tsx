import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronRight } from "lucide-react";
import { type AccountCoverage, computeCoverage, computeMonthlyBaseline } from "../lib/coverage";
import { daysSince, formatAmount } from "../lib/format";
import { cn } from "../lib/utils";
import type { Account, Income, Subscription } from "../types";
import { BalanceForecastChart } from "./BalanceForecastChart";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  incomes?: Income[];
  months?: number;
}

function statusBadge(c: AccountCoverage): { label: string; tone: "ok" | "warn" | "danger" } | null {
  if (c.accountId == null) return null;
  if (c.firstBelowZeroDate) {
    return {
      tone: "danger",
      label: `Konto fällt am ${format(parseISO(c.firstBelowZeroDate), "dd.MM.yyyy", { locale: de })} unter 0`,
    };
  }
  if (c.firstBelowBufferDate) {
    return {
      tone: "warn",
      label: `Saldo fällt am ${format(parseISO(c.firstBelowBufferDate), "dd.MM.yyyy", { locale: de })} unter Puffer`,
    };
  }
  return null;
}

export function OverviewSection({ subscriptions, accounts, incomes = [], months = 6 }: Props) {
  if (subscriptions.length === 0 && accounts.length === 0 && incomes.length === 0) return null;

  const baseline = computeMonthlyBaseline(subscriptions, accounts);
  const today = new Date();
  const coverage = computeCoverage(subscriptions, accounts, months, today, incomes);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-fluid-lg font-semibold">Monatliche Baseline</h2>
        <p className="-mt-1 text-sm text-muted-foreground">
          Was im Schnitt pro Monat fix abgeht (jährliche und quartalsweise Beträge auf monatlich
          normiert). Hilft, das Konto-Polster zu kalibrieren.
        </p>
        {baseline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Abos.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {baseline.map((b) => (
              <li
                key={`${b.account}-${b.currency}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="font-medium">
                  {b.account}
                  {baseline.some(
                    (other) => other.account === b.account && other.currency !== b.currency,
                  ) && <> ({b.currency})</>}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatAmount(b.monthlyCents, b.currency)}/Monat
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-fluid-lg font-semibold">Cashflow ({months} Monate)</h2>
        {coverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Konten angelegt.</p>
        ) : (
          coverage.map((account) => {
            const badge = statusBadge(account);
            return (
              <details
                key={account.accountId ?? `${account.account}-${account.currency}`}
                className={cn(
                  "group rounded-lg border bg-background/50",
                  badge?.tone === "danger" && "border-destructive/40",
                  badge?.tone === "warn" && "border-warning/40",
                )}
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="font-medium">{account.account}</span>
                  {account.accountId != null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Saldo heute: {formatAmount(account.startingBalanceCents, account.currency)}
                      {account.items.length > 0 && (
                        <>
                          {" → "}
                          {formatAmount(account.finalBalanceCents, account.currency)}
                        </>
                      )}
                      {(() => {
                        const days = daysSince(
                          accounts.find((a) => a.id === account.accountId)?.balanceUpdatedAt ??
                            null,
                        );
                        return days !== null && days >= 7 ? (
                          <span className="text-warning">
                            {" · "}vor {days} {days === 1 ? "Tag" : "Tagen"} aktualisiert
                          </span>
                        ) : null;
                      })()}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2 text-sm font-semibold tabular-nums">
                    {account.totalInflowCents > 0 && (
                      <span className="text-success">
                        +{formatAmount(account.totalInflowCents, account.currency)}
                      </span>
                    )}
                    {account.totalOutflowCents > 0 && (
                      <span className="text-primary">
                        −{formatAmount(account.totalOutflowCents, account.currency)}
                      </span>
                    )}
                  </span>
                </summary>

                <div className="flex flex-col gap-2 px-3 pb-3">
                  {badge && (
                    <p
                      className={cn(
                        "coverage-warning rounded-md px-3 py-2 text-sm font-medium",
                        badge.tone === "danger"
                          ? "coverage-warning-danger bg-destructive/10 text-destructive"
                          : "coverage-warning-warn bg-warning/10 text-warning",
                      )}
                      role="alert"
                    >
                      ⚠️ {badge.label}
                    </p>
                  )}

                  {account.foreignCurrencySubsCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {account.foreignCurrencySubsCount === 1
                        ? "1 Abo in anderer Währung wird hier nicht berücksichtigt."
                        : `${account.foreignCurrencySubsCount} Abos in anderer Währung werden hier nicht berücksichtigt.`}
                    </p>
                  )}

                  <BalanceForecastChart account={account} from={today} months={months} />

                  {account.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine anstehenden Buchungen.</p>
                  ) : (
                    <ul className="flex flex-col divide-y text-sm">
                      {account.items.map((it) => (
                        <li
                          key={`${it.type}-${it.subscriptionId}-${it.date}`}
                          className={cn(
                            "grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5",
                            it.type !== "income" && it.belowZero && "text-destructive",
                            it.type !== "income" &&
                              !it.belowZero &&
                              it.belowBuffer &&
                              "text-warning",
                          )}
                        >
                          <span className="truncate">{it.subscription}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {format(parseISO(it.date), "dd.MM.yyyy", { locale: de })}
                          </span>
                          <span
                            className={cn(
                              "text-right tabular-nums",
                              it.type === "income" ? "text-success" : "",
                            )}
                          >
                            {it.type === "income"
                              ? `+${formatAmount(it.cents, account.currency)}`
                              : `−${formatAmount(it.cents, account.currency)}`}
                            {account.accountId != null && (
                              <span className="ml-2 text-muted-foreground">
                                → {formatAmount(it.balanceAfterCents, account.currency)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}
