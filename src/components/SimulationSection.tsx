import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { FlaskConical } from "lucide-react";
import { formatAmount } from "../lib/format";
import type { RateLike } from "../lib/rates";
import { type AccountOutlook, computeSimulation, type SimulatedAccount } from "../lib/simulation";
import type { Account, Income, Subscription } from "../types";
import { Button } from "./ui/button";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  incomes: Income[];
  /** IDs der Abos, die testweise wegfallen. */
  excludedIds: ReadonlySet<number>;
  onReset: () => void;
  rates?: readonly RateLike[];
  months?: number;
}

function describeOutlook(o: AccountOutlook): string {
  if (o.kind === "ok") return "gedeckt";
  const date = o.date ? format(parseISO(o.date), "dd.MM.yyyy", { locale: de }) : "";
  return o.kind === "danger" ? `im Minus ab ${date}` : `unter Mindestpuffer ab ${date}`;
}

function outlookTone(o: AccountOutlook): string {
  if (o.kind === "danger") return "text-destructive";
  if (o.kind === "warn") return "text-warning";
  return "text-success";
}

function AccountLine({ a }: { a: SimulatedAccount }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
      <span className="font-medium">{a.account}</span>
      <span className="text-sm tabular-nums">
        <span className={outlookTone(a.before)}>{describeOutlook(a.before)}</span>
        <span className="px-1.5 text-muted-foreground" aria-hidden="true">
          →
        </span>
        <span className="sr-only"> wird zu </span>
        <span className={outlookTone(a.after)}>{describeOutlook(a.after)}</span>
        {a.changed ? null : <span className="text-muted-foreground"> (unverändert)</span>}
      </span>
    </li>
  );
}

/**
 * Was-wäre-wenn-Simulation: zeigt, wie sich Fixkosten und Kontoprognose ändern, wenn die
 * gewählten Abos wegfielen. Reine Anzeige — nichts wird gespeichert; „Zurücksetzen" verwirft
 * die Auswahl. Erscheint nur, solange mindestens ein Abo ausgeblendet ist.
 */
export function SimulationSection({
  subscriptions,
  accounts,
  incomes,
  excludedIds,
  onReset,
  rates = [],
  months = 6,
}: Props) {
  const result = computeSimulation(
    subscriptions,
    accounts,
    incomes,
    excludedIds,
    months,
    new Date(),
    rates,
  );
  if (result.excluded.length === 0) return null;

  const multiCurrency = result.costs.length > 1;
  const changedAccounts = result.accounts.filter((a) => a.changed);

  return (
    <section
      aria-labelledby="simulation-heading"
      className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-primary/5 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="simulation-heading"
            className="flex items-center gap-2 text-fluid-lg font-semibold"
          >
            <FlaskConical className="size-5 text-primary" aria-hidden="true" />
            Was wäre, wenn …
          </h2>
          <p className="text-sm text-muted-foreground">
            Ohne {result.excluded.map((s) => s.name).join(", ")} — nur eine Rechnung, es wird nichts
            gespeichert oder gekündigt.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          Simulation zurücksetzen
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Fixkosten</h3>
        <ul className="flex flex-col divide-y">
          {result.costs.map((c) => {
            const monthlySaving = c.monthlyBeforeCents - c.monthlyAfterCents;
            const yearlySaving = c.yearlyBeforeCents - c.yearlyAfterCents;
            return (
              <li key={c.currency} className="flex flex-col gap-1 py-2">
                <span className="text-lg font-semibold tabular-nums">
                  Du sparst {formatAmount(monthlySaving, c.currency)}/Monat ·{" "}
                  {formatAmount(yearlySaving, c.currency)}/Jahr
                  {multiCurrency ? ` (${c.currency})` : ""}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  Monatlich {formatAmount(c.monthlyBeforeCents, c.currency)} →{" "}
                  {formatAmount(c.monthlyAfterCents, c.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {result.accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Kontoprognose ({months} Monate)
          </h3>
          {changedAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Änderung an der Kontoprognose — alle Konten verhalten sich wie bisher.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {changedAccounts.map((a) => (
                <AccountLine key={a.accountId} a={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
