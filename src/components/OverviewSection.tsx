import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { computeCoverage, computeMonthlyBaseline } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Account, Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  months?: number;
}

export function OverviewSection({ subscriptions, accounts, months = 6 }: Props) {
  if (subscriptions.length === 0) return null;

  const baseline = computeMonthlyBaseline(subscriptions, accounts);
  const coverage = computeCoverage(subscriptions, accounts, months);
  const totalMonthly = baseline.reduce((sum, b) => sum + b.monthlyCents, 0);

  return (
    <section className="overview">
      <div className="overview-section">
        <h2>Monatliche Baseline</h2>
        <p className="overview-hint">
          Was im Schnitt pro Monat fix abgeht (jährliche und quartalsweise Beträge auf monatlich
          normiert). Hilft, das Konto-Polster zu kalibrieren.
        </p>
        <ul className="baseline-list">
          {baseline.map((b) => (
            <li key={b.account} className="baseline-item">
              <span className="baseline-account">{b.account}</span>
              <span className="baseline-amount">{formatAmount(b.monthlyCents, "EUR")}/Monat</span>
            </li>
          ))}
          {baseline.length > 1 && (
            <li className="baseline-item baseline-total">
              <span className="baseline-account">Gesamt</span>
              <span className="baseline-amount">{formatAmount(totalMonthly, "EUR")}/Monat</span>
            </li>
          )}
        </ul>
      </div>

      <div className="overview-section">
        <h2>Anstehende Abflüsse ({months} Monate)</h2>
        {coverage.length === 0 ? (
          <p className="empty">Keine anstehenden Buchungen.</p>
        ) : (
          coverage.map((account) => (
            <details key={account.account} className="coverage-account">
              <summary>
                <span className="coverage-name">{account.account}</span>
                <span className="coverage-total">{formatAmount(account.totalCents, "EUR")}</span>
              </summary>
              <ul className="coverage-items">
                {account.items.map((it) => (
                  <li key={`${it.subscription}-${it.date}`} className="coverage-row">
                    <span className="coverage-row-name">{it.subscription}</span>
                    <span className="coverage-row-date">
                      {format(parseISO(it.date), "dd.MM.yyyy", { locale: de })}
                    </span>
                    <span className="coverage-row-amount">{formatAmount(it.cents, "EUR")}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
