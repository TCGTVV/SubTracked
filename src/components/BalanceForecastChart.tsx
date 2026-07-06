import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import type { AccountCoverage, CoverageItem } from "../lib/coverage";
import { formatAmount } from "../lib/format";

interface Props {
  account: AccountCoverage;
  /** Startpunkt der Prognose (= "heute" aus computeCoverage). */
  from: Date;
  /** Prognose-Horizont in Monaten (= months aus computeCoverage). */
  months: number;
}

const WIDTH = 560;
const HEIGHT = 170;
const PAD_X = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;

/** Punktfarbe = Zustand des Saldos NACH der Buchung (deckungsgleich mit der Buchungsliste). */
function dotClass(it: CoverageItem): string {
  if (it.belowZero) return "fill-destructive";
  if (it.belowBuffer) return "fill-warning";
  if (it.type === "income") return "fill-success";
  return "fill-primary";
}

/**
 * Saldo-Verlaufs-Chart pro Konto: Step-Linie des prognostizierten Saldos über den
 * Coverage-Horizont, mit Null- und Puffer-Linie. Reines SVG, analog PriceHistoryGraph.
 */
export function BalanceForecastChart({ account, from, months }: Props) {
  if (account.accountId == null || account.items.length === 0) return null;

  const end = addMonths(from, months);
  const totalDays = Math.max(differenceInCalendarDays(end, from), 1);
  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const balances = account.items.map((it) => it.balanceAfterCents);
  const buffer = account.minBufferCents;
  const domainValues = [0, account.startingBalanceCents, ...balances];
  if (buffer > 0) domainValues.push(buffer);
  const rawMin = Math.min(...domainValues);
  const rawMax = Math.max(...domainValues);
  const pad = (rawMax - rawMin || 1) * 0.08;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;
  const range = domainMax - domainMin;

  const x = (isoDate: string) =>
    PAD_X +
    (Math.min(Math.max(differenceInCalendarDays(parseISO(isoDate), from), 0), totalDays) /
      totalDays) *
      innerWidth;
  const y = (cents: number) => PAD_TOP + innerHeight - ((cents - domainMin) / range) * innerHeight;

  const startPoint = { x: PAD_X, y: y(account.startingBalanceCents) };
  const itemPoints = account.items.map((it) => ({ it, x: x(it.date), y: y(it.balanceAfterCents) }));

  // Step-Linie: Saldo bleibt bis zur nächsten Buchung konstant, springt dort auf den neuen Wert
  // und läuft nach der letzten Buchung waagerecht bis zum Horizont-Ende weiter.
  const path = [
    `M ${startPoint.x} ${startPoint.y}`,
    ...itemPoints.map((p) => `H ${p.x} V ${p.y}`),
    `H ${WIDTH - PAD_X}`,
  ].join(" ");

  const yZero = y(0);
  const yBuffer = buffer > 0 ? y(buffer) : null;
  const showZeroLabel = yBuffer === null || yZero - yBuffer > 12;
  const hasNegativeBalance = rawMin < 0;
  const monthTicks = Array.from({ length: Math.max(months - 1, 0) }, (_, i) =>
    x(format(addMonths(from, i + 1), "yyyy-MM-dd")),
  );

  return (
    <div className="flex flex-col gap-1" data-testid="balance-forecast-chart">
      <h3 className="text-xs font-medium text-muted-foreground">Saldo-Verlauf</h3>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" className="w-full">
        <title>{`Saldo-Verlauf ${account.account}`}</title>

        {/* Warnzonen: unter Puffer (immer als Schwelle sichtbar), unter 0 nur wenn erreicht */}
        {yBuffer !== null && (
          <rect
            className="fill-warning/10"
            x={PAD_X}
            y={yBuffer}
            width={innerWidth}
            height={Math.max(yZero - yBuffer, 0)}
          />
        )}
        {hasNegativeBalance && (
          <rect
            className="fill-destructive/10"
            x={PAD_X}
            y={yZero}
            width={innerWidth}
            height={Math.max(HEIGHT - PAD_BOTTOM - yZero, 0)}
          />
        )}

        {/* Monats-Gitter (dezent) + Grundlinie */}
        {monthTicks.map((tickX) => (
          <line
            key={tickX}
            className="stroke-border"
            x1={tickX}
            y1={PAD_TOP}
            x2={tickX}
            y2={HEIGHT - PAD_BOTTOM}
          />
        ))}
        <line
          className="stroke-border"
          x1={PAD_X}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_BOTTOM}
        />

        {/* Puffer-Linie (gestrichelt) und Null-Linie, jeweils mit Text-Label */}
        {yBuffer !== null && (
          <>
            <line
              className="stroke-warning"
              strokeDasharray="4 3"
              x1={PAD_X}
              y1={yBuffer}
              x2={WIDTH - PAD_X}
              y2={yBuffer}
            />
            <text
              className="fill-muted-foreground"
              fontSize={9}
              textAnchor="end"
              x={WIDTH - PAD_X - 2}
              y={yBuffer - 3}
            >
              Puffer
            </text>
          </>
        )}
        <line
          className="stroke-destructive/60"
          x1={PAD_X}
          y1={yZero}
          x2={WIDTH - PAD_X}
          y2={yZero}
        />
        {showZeroLabel && (
          <text
            className="fill-muted-foreground"
            fontSize={9}
            textAnchor="end"
            x={WIDTH - PAD_X - 2}
            y={yZero - 3}
          >
            0
          </text>
        )}

        {/* Saldo-Step-Linie + Buchungspunkte mit Tooltip */}
        <path className="fill-none stroke-primary stroke-2" d={path} />
        <g>
          <title>{`Heute: ${formatAmount(account.startingBalanceCents, account.currency)}`}</title>
          <circle className="fill-primary" cx={startPoint.x} cy={startPoint.y} r={3} />
        </g>
        {itemPoints.map(({ it, x: cx, y: cy }) => (
          <g key={`${it.type}-${it.subscriptionId}-${it.date}`}>
            <title>
              {`${format(parseISO(it.date), "dd.MM.yyyy", { locale: de })} · ${it.subscription}: ${
                it.type === "income" ? "+" : "−"
              }${formatAmount(it.cents, account.currency)} → ${formatAmount(it.balanceAfterCents, account.currency)}`}
            </title>
            <circle cx={cx} cy={cy} r={9} fill="transparent" />
            <circle className={dotClass(it)} cx={cx} cy={cy} r={3} />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{format(from, "dd.MM.yyyy", { locale: de })}</span>
        <span>{format(end, "dd.MM.yyyy", { locale: de })}</span>
      </div>
    </div>
  );
}
