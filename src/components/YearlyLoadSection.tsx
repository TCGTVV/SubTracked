import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { computeYearlyLoad, type YearlyLoadSummary } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  /** Startpunkt (Default: heute) — überschreibbar für deterministische Tests. */
  from?: Date;
}

const WIDTH = 560;
const HEIGHT = 150;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 18;
const BAR_GAP = 8;

function monthDate(load: { month: string }): Date {
  return parseISO(`${load.month}-01`);
}

function YearlyLoadChart({ summary }: { summary: YearlyLoadSummary }) {
  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const baselineY = HEIGHT - PAD_BOTTOM;
  const slot = innerWidth / 12;
  const barWidth = slot - BAR_GAP;
  const max = summary.maxCents || 1;
  const avg = summary.totalCents / 12;
  const yAvg = baselineY - (avg / max) * innerHeight;
  const maxIndex = summary.months.findIndex((m) => m.cents === summary.maxCents);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" className="w-full">
      <title>{`Jahresbelastung (${summary.currency})`}</title>

      {/* Ø-Linie: der Vergleichswert, den die monatliche Baseline suggeriert */}
      <line
        className="stroke-muted-foreground/50"
        strokeDasharray="4 3"
        x1={PAD_X}
        y1={yAvg}
        x2={WIDTH - PAD_X}
        y2={yAvg}
      />
      <text
        className="fill-muted-foreground"
        fontSize={9}
        textAnchor="end"
        x={WIDTH - PAD_X - 2}
        y={yAvg - 3}
      >
        {`Ø ${formatAmount(Math.round(avg), summary.currency)}`}
      </text>

      <line className="stroke-border" x1={PAD_X} y1={baselineY} x2={WIDTH - PAD_X} y2={baselineY} />

      {summary.months.map((m, i) => {
        const x = PAD_X + i * slot + BAR_GAP / 2;
        const barHeight = (m.cents / max) * innerHeight;
        const labelX = x + barWidth / 2;
        return (
          <g key={m.month}>
            {m.cents > 0 && (
              <>
                <title>
                  {`${format(monthDate(m), "MMMM yyyy", { locale: de })}: ${formatAmount(m.cents, summary.currency)} (${m.count} Posten)`}
                </title>
                <rect
                  className="fill-primary"
                  x={x}
                  y={baselineY - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                />
              </>
            )}
            {i === maxIndex && m.cents > 0 && (
              <text
                className="fill-foreground font-medium"
                fontSize={9}
                textAnchor="middle"
                x={labelX}
                y={Math.max(baselineY - barHeight - 4, 9)}
              >
                {formatAmount(m.cents, summary.currency)}
              </text>
            )}
            <text
              className="fill-muted-foreground"
              fontSize={9}
              textAnchor="middle"
              x={labelX}
              y={HEIGHT - 6}
            >
              {format(monthDate(m), "MMM", { locale: de })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Jahres-Belastungsübersicht: Summe aller Fälligkeiten pro Kalendermonat über die
 * nächsten 12 Monate, pro Währung. Macht sichtbar, wo sich jährliche/halbjährliche
 * Posten ballen — genau das, was die monatliche Baseline wegglättet.
 */
export function YearlyLoadSection({ subscriptions, from }: Props) {
  const summaries = computeYearlyLoad(subscriptions, from ?? new Date());
  if (summaries.length === 0) return null;

  const multiCurrency = summaries.length > 1;

  return (
    <section className="flex flex-col gap-6">
      {summaries.map((s) => (
        <div key={s.currency} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-fluid-lg font-semibold">
              Jahresbelastung{multiCurrency ? ` (${s.currency})` : ""}
            </h2>
            <p className="text-sm text-muted-foreground">
              Summe aller Fälligkeiten pro Monat über die nächsten 12 Monate — jährliche und
              unterjährige Posten erscheinen in dem Monat, in dem sie wirklich abgebucht werden.
            </p>
          </div>

          <YearlyLoadChart summary={s} />

          {s.months[0] && s.months[11] && (
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{format(monthDate(s.months[0]), "MMM yyyy", { locale: de })}</span>
              <span>{format(monthDate(s.months[11]), "MMM yyyy", { locale: de })}</span>
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Werte als Liste</summary>
            <ul className="mt-2 flex flex-col divide-y">
              {s.months.map((m) => (
                <li key={m.month} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{format(monthDate(m), "MMMM yyyy", { locale: de })}</span>
                  <span className="tabular-nums">
                    {formatAmount(m.cents, s.currency)}
                    {m.count > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {m.count === 1 ? "1 Posten" : `${m.count} Posten`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </section>
  );
}
