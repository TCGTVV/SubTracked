import { useCallback, useEffect, useRef, useState } from "react";
import type { Subscription } from "./types";
import { deleteSubscription, listSubscriptions } from "./lib/db";
import { formatAmount, formatNextDue } from "./lib/format";
import { NewSubscriptionDialog } from "./components/NewSubscriptionDialog";
import "./App.css";

function App() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await listSubscriptions();
      setSubs(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function handleAdded() {
    dialogRef.current?.close();
    void reload();
  }

  async function handleDelete(sub: Subscription) {
    if (!window.confirm(`„${sub.name}“ wirklich löschen?`)) return;
    try {
      await deleteSubscription(sub.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="container">
      <header className="header">
        <h1>SubTracked</h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
        >
          Neues Abo
        </button>
      </header>

      {loading && <p>Lade …</p>}
      {error && <p className="error" role="alert">Fehler: {error}</p>}
      {!loading && !error && subs.length === 0 && (
        <p className="empty">Noch keine Abos angelegt.</p>
      )}
      {subs.length > 0 && (
        <ul className="sub-list">
          {subs.map((sub) => (
            <li key={sub.id} className="sub-item">
              <div className="sub-info">
                <span className="sub-name">{sub.name}</span>
                <span className="sub-next">
                  nächste Fälligkeit: {formatNextDue(sub)}
                </span>
              </div>
              <div className="sub-meta">
                <span className="sub-amount">
                  {formatAmount(sub.amountCents, sub.currency)}
                </span>
                <button
                  type="button"
                  className="sub-delete"
                  onClick={() => void handleDelete(sub)}
                  aria-label={`${sub.name} löschen`}
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewSubscriptionDialog ref={dialogRef} onAdded={handleAdded} />
    </main>
  );
}

export default App;
