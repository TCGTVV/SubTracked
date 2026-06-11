import { useEffect, useMemo, useRef, useState } from "react";
import { AccountsDialog } from "./components/AccountsDialog";
import { IncomeDialog } from "./components/IncomeDialog";
import { NotificationPermissionBanner } from "./components/NotificationPermissionBanner";
import { OverviewSection } from "./components/OverviewSection";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatusCard } from "./components/StatusCard";
import { SubscriptionDialog } from "./components/SubscriptionDialog";
import { SubscriptionFilterBar } from "./components/SubscriptionFilterBar";
import { UpcomingSection } from "./components/UpcomingSection";
import { useNotificationPermission } from "./hooks/useNotificationPermission";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { deleteIncome, deleteSubscription, setIncomeActive, setSubscriptionActive } from "./lib/db";
import { formatAmount, formatNextDue } from "./lib/format";
import {
  applyFilterAndSort,
  DEFAULT_SUB_LIST_OPTIONS,
  type SubListOptions,
} from "./lib/subscription-list";
import type { Income, Subscription } from "./types";
import "./App.css";

function App() {
  const { subs, accounts, incomes, loading, error, setError, reloadAll, reloadAccounts } =
    useSubscriptions();
  const { status: notifStatus, activate: activateNotifications } = useNotificationPermission();

  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subOpenSeq, setSubOpenSeq] = useState(0);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [incomeOpenSeq, setIncomeOpenSeq] = useState(0);
  const [settingsOpenSeq, setSettingsOpenSeq] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [filterOptions, setFilterOptions] = useState<SubListOptions>(DEFAULT_SUB_LIST_OPTIONS);
  const subDialogRef = useRef<HTMLDialogElement>(null);
  const incomeDialogRef = useRef<HTMLDialogElement>(null);
  const accountsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (subOpenSeq > 0) subDialogRef.current?.showModal();
  }, [subOpenSeq]);

  useEffect(() => {
    if (incomeOpenSeq > 0) incomeDialogRef.current?.showModal();
  }, [incomeOpenSeq]);

  const activeSubs = useMemo(() => subs.filter((s) => s.active), [subs]);
  const archivedCount = subs.length - activeSubs.length;
  const preFilteredSubs = showArchived ? subs : activeSubs;
  const visibleSubs = useMemo(
    () => applyFilterAndSort(preFilteredSubs, filterOptions),
    [preFilteredSubs, filterOptions],
  );

  function startNew() {
    setEditingSub(null);
    setSubOpenSeq((s) => s + 1);
  }

  function startEdit(sub: Subscription) {
    setEditingSub(sub);
    setSubOpenSeq((s) => s + 1);
  }

  function startNewIncome() {
    setEditingIncome(null);
    setIncomeOpenSeq((s) => s + 1);
  }

  function startEditIncome(income: Income) {
    setEditingIncome(income);
    setIncomeOpenSeq((s) => s + 1);
  }

  function handleIncomeSaved() {
    incomeDialogRef.current?.close();
    void reloadAll();
  }

  async function handleDeleteIncome(income: Income) {
    if (!window.confirm(`„${income.name}" wirklich löschen?`)) return;
    try {
      await deleteIncome(income.id);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleToggleIncomeActive(income: Income) {
    try {
      await setIncomeActive(income.id, !income.active);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openAccounts() {
    accountsDialogRef.current?.showModal();
  }

  function openSettings() {
    setSettingsOpenSeq((s) => s + 1);
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

  async function handleToggleActive(sub: Subscription) {
    try {
      await setSubscriptionActive(sub.id, !sub.active);
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
          <button type="button" onClick={startNew}>
            Neues Abo
          </button>
          <button type="button" onClick={startNewIncome}>
            Neue Einnahme
          </button>
          <button type="button" onClick={openAccounts}>
            Konten
          </button>
          <button type="button" onClick={openSettings}>
            Einstellungen
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

      {!loading && !error && (activeSubs.length > 0 || incomes.some((i) => i.active)) && (
        <StatusCard
          subscriptions={activeSubs}
          accounts={accounts}
          incomes={incomes.filter((i) => i.active)}
        />
      )}

      {!loading && activeSubs.length > 0 && (
        <UpcomingSection
          subscriptions={activeSubs}
          accounts={accounts}
          incomes={incomes.filter((i) => i.active)}
        />
      )}

      {archivedCount > 0 && (
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>
            Archivierte anzeigen ({archivedCount}
            {archivedCount === 1 ? " Abo" : " Abos"})
          </span>
        </label>
      )}

      {preFilteredSubs.length >= 2 && (
        <SubscriptionFilterBar
          subs={preFilteredSubs}
          accounts={accounts}
          options={filterOptions}
          onChange={setFilterOptions}
        />
      )}

      {preFilteredSubs.length > 0 && visibleSubs.length === 0 && (
        <p className="empty">Kein Abo passt zu den aktuellen Filtern.</p>
      )}

      {visibleSubs.length > 0 && (
        <ul className="sub-list">
          {visibleSubs.map((sub) => {
            const account = accountName(sub.accountId);
            return (
              <li key={sub.id} className={`sub-item${sub.active ? "" : " sub-archived"}`}>
                <div className="sub-info">
                  <span className="sub-name">{sub.name}</span>
                  <span className="sub-next">
                    {sub.active ? <>nächste Fälligkeit: {formatNextDue(sub)}</> : <>archiviert</>}
                    {account && <> · {account}</>}
                    {sub.active && !sub.notify && <> · stumm</>}
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
                    className="sub-archive"
                    onClick={() => void handleToggleActive(sub)}
                    aria-label={`${sub.name} ${sub.active ? "archivieren" : "reaktivieren"}`}
                  >
                    {sub.active ? "Archivieren" : "Reaktivieren"}
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

      <OverviewSection
        subscriptions={activeSubs}
        accounts={accounts}
        incomes={incomes.filter((i) => i.active)}
      />

      {incomes.length > 0 && (
        <section className="income-list-section">
          <h2>Einnahmen</h2>
          <ul className="sub-list">
            {incomes.map((income) => (
              <li key={income.id} className={`sub-item${income.active ? "" : " sub-archived"}`}>
                <div className="sub-info">
                  <span className="sub-name">{income.name}</span>
                  <span className="sub-next">
                    {income.active ? (
                      <>nächste Fälligkeit: {formatNextDue(income)}</>
                    ) : (
                      <>archiviert</>
                    )}
                    {income.accountId !== null &&
                      accounts.find((a) => a.id === income.accountId)?.name && (
                        <> · {accounts.find((a) => a.id === income.accountId)?.name}</>
                      )}
                  </span>
                </div>
                <div className="sub-meta">
                  <span className="sub-amount income-amount">
                    +{formatAmount(income.amountCents, income.currency)}
                  </span>
                  <button
                    type="button"
                    className="sub-edit"
                    onClick={() => startEditIncome(income)}
                    aria-label={`${income.name} bearbeiten`}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="sub-archive"
                    onClick={() => void handleToggleIncomeActive(income)}
                    aria-label={`${income.name} ${income.active ? "archivieren" : "reaktivieren"}`}
                  >
                    {income.active ? "Archivieren" : "Reaktivieren"}
                  </button>
                  <button
                    type="button"
                    className="sub-delete"
                    onClick={() => void handleDeleteIncome(income)}
                    aria-label={`${income.name} löschen`}
                  >
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SubscriptionDialog
        key={`${editingSub?.id ?? "new"}-${subOpenSeq}`}
        ref={subDialogRef}
        subscription={editingSub}
        accounts={accounts}
        onSaved={handleSubSaved}
      />
      <IncomeDialog
        key={`${editingIncome?.id ?? "new-income"}-${incomeOpenSeq}`}
        ref={incomeDialogRef}
        income={editingIncome}
        accounts={accounts}
        onSaved={handleIncomeSaved}
      />
      <AccountsDialog ref={accountsDialogRef} accounts={accounts} onChanged={reloadAccounts} />
      <SettingsDialog
        ref={settingsDialogRef}
        openSeq={settingsOpenSeq}
        onDataReplaced={reloadAll}
      />
    </main>
  );
}

export default App;
