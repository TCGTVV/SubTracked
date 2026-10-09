import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { SkipForward } from "lucide-react";
import { computeUpcoming } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import { cn } from "../lib/utils";
import type { Account, Income, Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  incomes?: Income[];
  days?: number;
  /** Lässt den Termin entfallen (z.B. „Dienst pausiert"). Ohne Handler kein Button. */
  onSkip?: (subscriptionId: number, dueDate: string) => void;
}

export function UpcomingSection({
  subscriptions,
  accounts,
  incomes = [],
  days = 30,
  onSkip,
}: Props) {
  const items = computeUpcoming(subscriptions, accounts, days, new Date(), incomes);
  const recurringIds = new Set(subscriptions.filter((s) => !s.oneTime).map((s) => s.id));

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-fluid-base font-semibold">Demnächst ({days} Tage)</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Fälligkeiten in den nächsten {days} Tagen.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => (
            <li
              key={`${it.type}-${it.subscriptionId}-${it.date}`}
              className={cn(
                "grid items-baseline gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 hover:bg-muted/60",
                onSkip
                  ? "grid-cols-[3rem_1fr_auto_1.75rem] sm:grid-cols-[3rem_1fr_auto_auto_1.75rem]"
                  : "grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_auto_auto]",
              )}
            >
              <span className="text-sm tabular-nums text-muted-foreground">
                {format(parseISO(it.date), "dd.MM.", { locale: de })}
              </span>
              <span className="truncate text-sm font-medium">
                {it.subscription}
                {it.type === "outflow" && !it.notify && (
                  <span className="text-muted-foreground" title="Erinnerungen für dieses Abo aus">
                    {" "}
                    · stumm
                  </span>
                )}
              </span>
              <span className="hidden truncate text-sm text-muted-foreground sm:block">
                {it.accountName ?? "(kein Konto)"}
              </span>
              <span
                className={cn(
                  "text-right text-sm font-semibold tabular-nums",
                  it.type === "income" ? "text-success" : "text-foreground",
                )}
              >
                {it.type === "income" ? "+" : "−"}
                {formatAmount(it.cents, it.currency)}
              </span>
              {onSkip &&
                (it.type === "outflow" && recurringIds.has(it.subscriptionId) ? (
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center self-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onSkip(it.subscriptionId, it.date)}
                    aria-label={`${it.subscription} am ${format(parseISO(it.date), "dd.MM.", { locale: de })} überspringen`}
                    title="Diese Abbuchung überspringen (z.B. Dienst pausiert)"
                  >
                    <SkipForward className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="size-7" aria-hidden="true" />
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
