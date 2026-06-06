import { useEffect, useRef, useState } from "react";
import { AccountsDialog } from "./components/AccountsDialog";
import { NotificationPermissionBanner } from "./components/NotificationPermissionBanner";
import { OverviewSection } from "./components/OverviewSection";
import { SettingsDialog } from "./components/SettingsDialog";
import { SubscriptionDialog } from "./components/SubscriptionDialog";
import { useNotificationPermission } from "./hooks/useNotificationPermission";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { deleteSubscription } from "./lib/db";
import { formatAmount, formatNextDue } from "./lib/format";
import type { Subscription } from "./types";
import "./App.css";

function App() {
  const { subs, accounts, loading, error, setError, reloadAll, reloadAccounts } =
    useSubscriptions();
  const { status: notifStatus, activate: activateNotifications } = useNotificationPermission();

  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subOpenSeq, setSubOpenSeq] = useState(0);
  const subDialogRef = useRef<HTMLDialogElement>(null);
  const accountsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (subOpenSeq > 0) subDialogRef.current?.showModal();
  }, [subOpenSeq]);

  function startNew() {
    setEditingSub(null);
    setSubOpenSeq((s) => s + 1);
  }

  function startEdit(sub: Subscription) {
    setEditingSub(sub);
    setSubOpenSeq((s) => s + 1);
  }

  function openAccounts() {
    accountsDialogRef.current?.showModal();
  }

  function openSettings() {
    settingsDialogRef.current?.showModal();
  }

  function handleSubSaved() {
    subDialogRef.current?.close();
    void reloadAll();
  }

  async function handleDelete(sub: Subscription) {
    if (!window.confirm(`„${sub.name}“ wirklich löschen?`)) return;
    try {
      await deleteSubscription(sub.id);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const accountName = (id: number | null): string | null =>
    id === null ? null : (accounts.find((a) => a.id === id)?.name ?? "(unbekanntes Konto)");

  return (
    <main className="container">
      <header className="header">
        <h1>SubTracked</h1>
        <div className="header-actions">
          <button type="button" onClick={openSettings}>
            Einstellungen
          </button>
          <button type="button" onClick={openAccounts}>
            Konten
          </button>
          <button type="button" onClick={startNew}>
            Neues Abo
          </button>
        </div>
      </header>

      <NotificationPermissionBanner
        status={notifStatus}
        onActivate={() => void activateNotifications()}
      />

      {loading && <p>Lade …</p>}
      {error && (
        <p className="error" role="alert">
          Fehler: {error}
        </p>
      )}
      {!loading && !error && subs.length === 0 && (
        <p className="empty">Noch keine Abos angelegt.</p>
      )}
      {subs.length > 0 && (
        <ul className="sub-list">
          {subs.map((sub) => {
            const account = accountName(sub.accountId);
            return (
              <li key={sub.id} className="sub-item">
                <div className="sub-info">
                  <span className="sub-name">{sub.name}</span>
                  <span className="sub-next">
                    nächste Fälligkeit: {formatNextDue(sub)}
                    {account && <> · {account}</>}
                    {!sub.notify && <> · stumm</>}
                  </span>
                </div>
                <div className="sub-meta">
                  <span className="sub-amount">{formatAmount(sub.amountCents, sub.currency)}</span>
                  <button
                    type="button"
                    className="sub-edit"
                    onClick={() => startEdit(sub)}
                    aria-label={`${sub.name} bearbeiten`}
                  >
                    Bearbeiten
                  </button>
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
            );
          })}
        </ul>
      )}

      <OverviewSection subscriptions={subs} accounts={accounts} />

      <SubscriptionDialog
        key={`${editingSub?.id ?? "new"}-${subOpenSeq}`}
        ref={subDialogRef}
        subscription={editingSub}
        accounts={accounts}
        onSaved={handleSubSaved}
      />
      <AccountsDialog ref={accountsDialogRef} accounts={accounts} onChanged={reloadAccounts} />
      <SettingsDialog ref={settingsDialogRef} />
    </main>
  );
}

export default App;
