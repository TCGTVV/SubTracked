import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, Subscription } from "./types";
import {
  deleteSubscription,
  listAccounts,
  listSubscriptions,
} from "./lib/db";
import { formatAmount, formatNextDue } from "./lib/format";
import { SubscriptionDialog } from "./components/SubscriptionDialog";
import { AccountsDialog } from "./components/AccountsDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { OverviewSection } from "./components/OverviewSection";
import { runReminderCheck } from "./lib/reminders";
import {
  NotificationPermissionBanner,
  type NotificationStatus,
} from "./components/NotificationPermissionBanner";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import "./App.css";

function App() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subOpenSeq, setSubOpenSeq] = useState(0);
  const [notifStatus, setNotifStatus] = useState<NotificationStatus>("loading");
  const subDialogRef = useRef<HTMLDialogElement>(null);
  const accountsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);

  const reloadAll = useCallback(async () => {
    try {
      const [subRows, accountRows] = await Promise.all([
        listSubscriptions(),
        listAccounts(),
      ]);
      setSubs(subRows);
      setAccounts(accountRows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const tick = () => {
      void runReminderCheck().catch((e) => {
        console.error("runReminderCheck fehlgeschlagen:", e);
      });
    };
    tick();
    const handle = setInterval(tick, 60 * 60 * 1000);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const granted = await isPermissionGranted();
        setNotifStatus(granted ? "granted" : "default");
      } catch (e) {
        console.error("isPermissionGranted fehlgeschlagen:", e);
        setNotifStatus("default");
      }
    })();
  }, []);

  async function activateNotifications() {
    try {
      const result = await requestPermission();
      setNotifStatus(
        result === "granted" ? "granted" : result === "denied" ? "denied" : "default",
      );
    } catch (e) {
      console.error("requestPermission fehlgeschlagen:", e);
    }
  }

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
    id === null ? null : accounts.find((a) => a.id === id)?.name ?? "(unbekanntes Konto)";

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
      {error && <p className="error" role="alert">Fehler: {error}</p>}
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
                  <span className="sub-amount">
                    {formatAmount(sub.amountCents, sub.currency)}
                  </span>
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
      <AccountsDialog
        ref={accountsDialogRef}
        accounts={accounts}
        onChanged={reloadAccounts}
      />
      <SettingsDialog ref={settingsDialogRef} />
    </main>
  );
}

export default App;
