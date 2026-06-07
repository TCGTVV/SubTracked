import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { computeUpcoming } from "../lib/coverage";
import { formatAmount } from "../lib/format";
import type { Account, Subscription } from "../types";

interface Props {
  subscriptions: Subscription[];
  accounts: Account[];
  days?: number;
}

export function UpcomingSection({ subscriptions, accounts, days = 30 }: Props) {
  const items = computeUpcoming(subscriptions, accounts, days);

  return (
    <section className="upcoming">
      <h2>Demnächst ({days} Tage)</h2>
      {items.length === 0 ? (
        <p className="empty">Keine Fälligkeiten in den nächsten {days} Tagen.</p>
      ) : (
        <ul className="upcoming-list">
          {items.map((it) => (
            <li key={`${it.subscriptionId}-${it.date}`} className="upcoming-row">
              <span className="upcoming-date">
                {format(parseISO(it.date), "dd.MM.", { locale: de })}
              </span>
              <span className="upcoming-name">
                {it.subscription}
                {!it.notify && (
                  <span className="upcoming-muted" title="Erinnerungen für dieses Abo aus">
                    {" "}
                    · stumm
                  </span>
                )}
              </span>
              <span className="upcoming-account">{it.accountName ?? "(kein Konto)"}</span>
              <span className="upcoming-amount">{formatAmount(it.cents, it.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
