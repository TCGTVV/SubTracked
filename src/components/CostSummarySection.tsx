import { computeCostSummary } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
}

/**
 * Prominenter Kosten-Überblick über alle übergebenen (aktiven) Abos: Kennzahl
 * „X/Monat · Y/Jahr", teuerste Abos und Aufschlüsselung pro Kategorie — getrennt
 * pro Währung (keine heimliche Umrechnung).
 */
export function CostSummarySection({ subscriptions }: Props) {
  const summaries = computeCostSummary(subscriptions);
  if (summaries.length === 0) return null;

  const multiCurrency = summaries.length > 1;

  return (
    <section className="flex flex-col gap-6">
      {summaries.map((s) => (
        <div key={s.currency} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-fluid-lg font-semibold">
              Abo-Kosten{multiCurrency ? ` (${s.currency})` : ""}
            </h2>
            <p className="flex flex-wrap items-baseline gap-x-2 text-fluid-2xl font-semibold tabular-nums">
              <span>{formatAmount(s.monthlyCents, s.currency)}</span>
              <span className="text-fluid-sm font-normal text-muted-foreground">/Monat</span>
              <span className="text-muted-foreground">·</span>
              <span>{formatAmount(s.yearlyCents, s.currency)}</span>
              <span className="text-fluid-sm font-normal text-muted-foreground">/Jahr</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {s.subscriptionCount === 1 ? "1 aktives Abo" : `${s.subscriptionCount} aktive Abos`}{" "}
              (jährliche und unterjährige Beträge auf monatlich normiert)
            </p>
          </div>

          {s.top.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">Teuerste Abos</h3>
              <ul className="flex flex-col divide-y">
                {s.top.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate font-medium">{t.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatAmount(t.monthlyCents, s.currency)}/Monat
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.categories.length > 1 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">Nach Kategorie</h3>
              <ul className="flex flex-col divide-y">
                {s.categories.map((c) => (
                  <li
                    key={c.category ?? "__none__"}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="truncate">
                      {c.category ?? <span className="text-muted-foreground">Ohne Kategorie</span>}
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                        {c.count === 1 ? "1 Abo" : `${c.count} Abos`}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatAmount(c.monthlyCents, s.currency)}/Monat
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
