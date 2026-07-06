import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { PiggyBank } from "lucide-react";
import { computeArchivedSavings } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  /** Bezugszeitpunkt (Default: heute) — überschreibbar für deterministische Tests. */
  now?: Date;
}

/**
 * „Gespart seit Kündigung": zeigt pro Währung, was archivierte Abos seit ihrer
 * Archivierung nicht mehr gekostet haben (Monatsäquivalent × volle Monate).
 * Abos, die vor Migration 0013 archiviert wurden, haben keinen Zeitstempel
 * und tauchen nicht auf.
 */
export function ArchivedSavingsSection({ subscriptions, now }: Props) {
  const summaries = computeArchivedSavings(subscriptions, now ?? new Date());
  if (summaries.length === 0) return null;

  const multiCurrency = summaries.length > 1;

  return (
    <section className="flex flex-col gap-6">
      {summaries.map((s) => (
        <div key={s.currency} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-fluid-lg font-semibold">
              <PiggyBank className="size-5 text-success" />
              Gespart seit Kündigung{multiCurrency ? ` (${s.currency})` : ""}
            </h2>
            <p className="flex flex-wrap items-baseline gap-x-2 text-fluid-2xl font-semibold tabular-nums">
              <span className="text-success">{formatAmount(s.totalCents, s.currency)}</span>
              <span className="text-fluid-sm font-normal text-muted-foreground">
                seit Archivierung nicht mehr ausgegeben
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Monatsäquivalent × volle Monate seit Archivierung.
            </p>
          </div>

          <ul className="flex flex-col divide-y">
            {s.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    archiviert am {format(parseISO(item.archivedOn), "dd.MM.yyyy", { locale: de })}
                    {" · "}
                    {formatAmount(item.monthlyCents, s.currency)}/Monat
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">
                  {item.monthsElapsed === 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      noch kein voller Monat
                    </span>
                  ) : (
                    formatAmount(item.savedCents, s.currency)
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
