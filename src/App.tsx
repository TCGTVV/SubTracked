import { useEffect, useState } from "react";
import type { Subscription } from "./types";
import { listSubscriptions } from "./lib/db";
import "./App.css";

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function App() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSubscriptions()
      .then(setSubs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <h1>SubTracked</h1>

      {loading && <p>Lade …</p>}
      {error && <p className="error">Fehler: {error}</p>}
      {!loading && !error && subs.length === 0 && (
        <p className="empty">Noch keine Abos angelegt.</p>
      )}
      {subs.length > 0 && (
        <ul className="sub-list">
          {subs.map((sub) => (
            <li key={sub.id} className="sub-item">
              <span className="sub-name">{sub.name}</span>
              <span className="sub-amount">
                {formatAmount(sub.amountCents, sub.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;
