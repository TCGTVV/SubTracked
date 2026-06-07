import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { type AccountCoverage, computeCoverage, computeMonthlyBaseline } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Account, Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
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

export function OverviewSection({ subscriptions, accounts, months = 6 }: Props) {
  if (subscriptions.length === 0 && accounts.length === 0) return null;

  const baseline = computeMonthlyBaseline(subscriptions, accounts);
  const coverage = computeCoverage(subscriptions, accounts, months);

  return (
    <section className="overview">
      <div className="overview-section">
        <h2>Monatliche Baseline</h2>
        <p className="overview-hint">
          Was im Schnitt pro Monat fix abgeht (jährliche und quartalsweise Beträge auf monatlich
          normiert). Hilft, das Konto-Polster zu kalibrieren.
        </p>
        {baseline.length === 0 ? (
          <p className="empty">Noch keine Abos.</p>
        ) : (
          <ul className="baseline-list">
            {baseline.map((b) => (
              <li key={`${b.account}-${b.currency}`} className="baseline-item">
                <span className="baseline-account">
                  {b.account}
                  {baseline.some(
                    (other) => other.account === b.account && other.currency !== b.currency,
                  ) && <> ({b.currency})</>}
                </span>
                <span className="baseline-amount">
                  {formatAmount(b.monthlyCents, b.currency)}/Monat
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overview-section">
        <h2>Anstehende Abflüsse ({months} Monate)</h2>
        {coverage.length === 0 ? (
          <p className="empty">Keine Konten angelegt.</p>
        ) : (
          coverage.map((account) => {
            const badge = statusBadge(account);
            return (
              <details
                key={account.accountId ?? account.account}
                className={`coverage-account${badge ? ` coverage-${badge.tone}` : ""}`}
              >
                <summary>
                  <span className="coverage-name">{account.account}</span>
                  {account.accountId != null && (
                    <span className="coverage-balance">
                      Saldo heute: {formatAmount(account.startingBalanceCents, account.currency)}
                      {account.items.length > 0 && (
                        <>
                          {" → "}
                          {formatAmount(account.finalBalanceCents, account.currency)}
                        </>
                      )}
                    </span>
                  )}
                  <span className="coverage-total">
                    {formatAmount(account.totalOutflowCents, account.currency)}
                  </span>
                </summary>

                {badge && (
                  <p className={`coverage-warning coverage-warning-${badge.tone}`} role="alert">
                    ⚠️ {badge.label}
                  </p>
                )}

                {account.foreignCurrencySubsCount > 0 && (
                  <p className="coverage-hint">
                    {account.foreignCurrencySubsCount === 1
                      ? "1 Abo in anderer Währung wird hier nicht berücksichtigt."
                      : `${account.foreignCurrencySubsCount} Abos in anderer Währung werden hier nicht berücksichtigt.`}
                  </p>
                )}

                {account.items.length === 0 ? (
                  <p className="empty">Keine anstehenden Buchungen.</p>
                ) : (
                  <ul className="coverage-items">
                    {account.items.map((it) => (
                      <li
                        key={`${it.subscriptionId}-${it.date}`}
                        className={`coverage-row${it.belowZero ? " coverage-row-danger" : it.belowBuffer ? " coverage-row-warn" : ""}`}
                      >
                        <span className="coverage-row-name">{it.subscription}</span>
                        <span className="coverage-row-date">
                          {format(parseISO(it.date), "dd.MM.yyyy", { locale: de })}
                        </span>
                        <span className="coverage-row-amount">
                          −{formatAmount(it.cents, account.currency)}
                        </span>
                        {account.accountId != null && (
                          <span className="coverage-row-balance">
                            → {formatAmount(it.balanceAfterCents, account.currency)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}
