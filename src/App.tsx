import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarX,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { AccountsDialog } from "./components/AccountsDialog";
import { AppSidebar, type DashboardView } from "./components/AppSidebar";
import { ArchivedSavingsSection } from "./components/ArchivedSavingsSection";
import { BalanceFreshnessWarning } from "./components/BalanceFreshnessWarning";
import { CostSummarySection } from "./components/CostSummarySection";
import { CsvImportDialog } from "./components/CsvImportDialog";
import { CsvReconcileDialog } from "./components/CsvReconcileDialog";
import { IncomeDialog } from "./components/IncomeDialog";
import { NotificationPermissionBanner } from "./components/NotificationPermissionBanner";
import { OverviewSection } from "./components/OverviewSection";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatusCard } from "./components/StatusCard";
import { SubscriptionDialog } from "./components/SubscriptionDialog";
import { SubscriptionFilterBar } from "./components/SubscriptionFilterBar";
import { UpcomingSection } from "./components/UpcomingSection";
import { Button } from "./components/ui/button";
import { YearlyLoadSection } from "./components/YearlyLoadSection";
import { useColorScheme } from "./hooks/useColorScheme";
import { useNotificationPermission } from "./hooks/useNotificationPermission";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { cancelDeadlineDisplay } from "./lib/cancellation";
import { deleteIncome, deleteSubscription, setIncomeActive, setSubscriptionActive } from "./lib/db";
import { hasDemoData, loadDemoData, removeDemoData } from "./lib/demo";
import { toUserMessage } from "./lib/errors";
import { formatAmount, formatNextDue } from "./lib/format";
import {
  applyFilterAndSort,
  DEFAULT_SUB_LIST_OPTIONS,
  type SubListOptions,
} from "./lib/subscription-list";
import { cn } from "./lib/utils";
import type { Income, Subscription } from "./types";

const ACCENTS = [
  "border-l-chart-1",
  "border-l-chart-2",
  "border-l-chart-3",
  "border-l-chart-4",
  "border-l-chart-5",
] as const;

interface CardActionsProps {
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  active: boolean;
  name: string;
}

function CardActions({ onEdit, onToggle, onDelete, active, name }: CardActionsProps) {
  return (
    <div className="mt-auto flex gap-1 pt-1">
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`${name} bearbeiten`}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${name} ${active ? "archivieren" : "reaktivieren"}`}
      >
        {active ? <Archive /> : <ArchiveRestore />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label={`${name} löschen`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function CancelNotice({ sub }: { sub: Subscription }) {
  if (!sub.active) return null;
  const cd = cancelDeadlineDisplay(sub);
  if (!cd) return null;
  const tone =
    cd.status === "overdue"
      ? "text-destructive"
      : cd.status === "soon"
        ? "text-warning"
        : "text-muted-foreground";
  const suffix =
    cd.status === "overdue"
      ? "Frist verstrichen"
      : cd.daysUntil === 0
        ? "heute"
        : cd.daysUntil === 1
          ? "morgen"
          : `in ${cd.daysUntil} Tagen`;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", tone)}>
      <CalendarX className="size-3.5 shrink-0" />
      Kündigen bis {cd.formatted} · {suffix}
    </p>
  );
}

function PendingPriceNotice({ sub }: { sub: Subscription }) {
  if (!sub.active || sub.pendingAmountCents == null || sub.pendingFrom == null) return null;
  // pendingFrom ist strikt ISO (YYYY-MM-DD) aus der DB — Anzeige als DD.MM.YYYY.
  const formatted = sub.pendingFrom.split("-").reverse().join(".");
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CalendarClock className="size-3.5 shrink-0" />
      Ab {formatted}: {formatAmount(sub.pendingAmountCents, sub.currency)}
    </p>
  );
}

function CashflowCard({
  id,
  active,
  accent,
  title,
  subtitle,
  amount,
  income = false,
  children,
}: {
  id: number;
  active: boolean;
  accent: string;
  title: string;
  subtitle: ReactNode;
  amount: string;
  income?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      key={id}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-l-4 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        accent,
        !active && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
            income ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
          )}
        >
          {income ? "+" : ""}
          {amount}
        </span>
      </div>
      {children}
    </div>
  );
}

function App() {
  const { subs, accounts, incomes, loading, error, setError, reloadAll, reloadAccounts } =
    useSubscriptions();
  const { status: notifStatus, activate: activateNotifications } = useNotificationPermission();
  const { scheme, setScheme } = useColorScheme();

  const [view, setView] = useState<DashboardView>("overview");
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subOpenSeq, setSubOpenSeq] = useState(0);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeOpenSeq, setIncomeOpenSeq] = useState(0);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvReconcileOpen, setCsvReconcileOpen] = useState(false);
  const [demoActive, setDemoActive] = useState(hasDemoData);
  const [demoPending, setDemoPending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filterOptions, setFilterOptions] = useState<SubListOptions>(DEFAULT_SUB_LIST_OPTIONS);

  const activeSubs = useMemo(() => subs.filter((s) => s.active), [subs]);
  const activeIncomes = useMemo(() => incomes.filter((i) => i.active), [incomes]);
  const hasActiveCashflow = activeSubs.length > 0 || activeIncomes.length > 0;
  const archivedCount = subs.length - activeSubs.length;
  const preFilteredSubs = showArchived ? subs : activeSubs;
  const visibleSubs = useMemo(
    () => applyFilterAndSort(preFilteredSubs, filterOptions),
    [preFilteredSubs, filterOptions],
  );

  function startNew() {
    setEditingSub(null);
    setSubOpenSeq((s) => s + 1);
    setSubOpen(true);
  }

  function startEdit(sub: Subscription) {
    setEditingSub(sub);
    setSubOpenSeq((s) => s + 1);
    setSubOpen(true);
  }

  function startNewIncome() {
    setEditingIncome(null);
    setIncomeOpenSeq((s) => s + 1);
    setIncomeOpen(true);
  }

  function startEditIncome(income: Income) {
    setEditingIncome(income);
    setIncomeOpenSeq((s) => s + 1);
    setIncomeOpen(true);
  }

  function handleIncomeSaved() {
    setIncomeOpen(false);
    void reloadAll();
  }

  async function handleDeleteIncome(income: Income) {
    if (!window.confirm(`„${income.name}" wirklich löschen?`)) return;
    try {
      await deleteIncome(income.id);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Einnahme löschen"));
    }
  }

  async function handleToggleIncomeActive(income: Income) {
    try {
      await setIncomeActive(income.id, !income.active);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Status der Einnahme ändern"));
    }
  }

  function openAccounts() {
    setAccountsOpen(true);
  }

  function openSettings() {
    setSettingsOpen(true);
  }

  function handleSubSaved() {
    setSubOpen(false);
    void reloadAll();
  }

  async function handleDelete(sub: Subscription) {
    if (!window.confirm(`„${sub.name}“ wirklich löschen?`)) return;
    try {
      await deleteSubscription(sub.id);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Abo löschen"));
    }
  }

  async function handleToggleActive(sub: Subscription) {
    try {
      await setSubscriptionActive(sub.id, !sub.active);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Status des Abos ändern"));
    }
  }

  const accountName = (id: number | null): string | null =>
    id === null ? null : (accounts.find((a) => a.id === id)?.name ?? "(unbekanntes Konto)");

  async function handleLoadDemo() {
    setDemoPending(true);
    try {
      await loadDemoData();
      setDemoActive(true);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Demo-Daten laden"));
    } finally {
      setDemoPending(false);
    }
  }

  async function handleRemoveDemo() {
    setDemoPending(true);
    try {
      await removeDemoData();
      setDemoActive(false);
      await reloadAll();
    } catch (e) {
      setError(toUserMessage(e, "Demo-Daten entfernen"));
    } finally {
      setDemoPending(false);
    }
  }

  const isEmpty = !loading && !error && subs.length === 0 && incomes.length === 0;
  const viewTitle = view === "overview" ? "Übersicht" : view === "subs" ? "Abos" : "Einnahmen";

  return (
    <div className="grid h-screen grid-cols-[var(--sidebar-w)_1fr] overflow-hidden">
      <AppSidebar
        view={view}
        onViewChange={setView}
        accounts={accounts}
        onOpenAccounts={openAccounts}
        onOpenSettings={openSettings}
        scheme={scheme}
        onSchemeChange={setScheme}
      />

      <main className="flex flex-col overflow-y-auto">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-6 py-4 backdrop-blur">
          <h1 className="text-fluid-xl font-bold tracking-tight">{viewTitle}</h1>
          <div className="flex gap-2">
            <Button onClick={startNew}>
              <Plus />
              Neues Abo
            </Button>
            <Button variant="secondary" onClick={startNewIncome}>
              <Plus />
              Neue Einnahme
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-4 p-6">
          <NotificationPermissionBanner
            status={notifStatus}
            onActivate={() => void activateNotifications()}
          />

          {loading && <p className="text-muted-foreground">Lade …</p>}
          {error && (
            <p
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              Fehler: {error}
            </p>
          )}

          {demoActive && !isEmpty && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
              role="status"
            >
              <span>
                Du siehst gerade <strong>Demo-Daten</strong> zum Ausprobieren — alle Einträge tragen
                „(Demo)".
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRemoveDemo()}
                disabled={demoPending}
              >
                {demoPending ? "Entferne …" : "Demo-Daten entfernen"}
              </Button>
            </div>
          )}

          {isEmpty && (
            <section
              className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center"
              aria-labelledby="empty-title"
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow">
                <Wallet className="size-7" />
              </span>
              <div>
                <h2 id="empty-title" className="text-fluid-lg font-semibold">
                  Wann wird dein Konto knapp?
                </h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  SubTracked verfolgt Abos und Einnahmen lokal auf deinem Rechner und zeigt, wie
                  lange dein Saldo reicht — mit Erinnerung, bevor abgebucht wird.
                </p>
              </div>
              <ol className="grid max-w-2xl gap-3 text-left text-sm sm:grid-cols-3">
                <li className="rounded-lg border border-border bg-card p-3">
                  <span className="font-semibold text-primary">1.</span> Konto mit aktuellem Saldo
                  anlegen
                </li>
                <li className="rounded-lg border border-border bg-card p-3">
                  <span className="font-semibold text-primary">2.</span> Abos und Einnahmen erfassen
                  — oder aus einem Bank-CSV importieren
                </li>
                <li className="rounded-lg border border-border bg-card p-3">
                  <span className="font-semibold text-primary">3.</span> Sehen, wie lange der Saldo
                  reicht, und vor jeder Abbuchung erinnert werden
                </li>
              </ol>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => void handleLoadDemo()} disabled={demoPending}>
                  {demoPending ? "Lade …" : "Mit Demo-Daten ausprobieren"}
                </Button>
                <Button variant="outline" onClick={openAccounts}>
                  Konto anlegen
                </Button>
                <Button variant="secondary" onClick={startNew}>
                  Erstes Abo
                </Button>
              </div>
            </section>
          )}

          {/* ÜBERSICHT */}
          {!isEmpty && view === "overview" && (
            <>
              {hasActiveCashflow && (
                <StatusCard
                  subscriptions={activeSubs}
                  accounts={accounts}
                  incomes={activeIncomes}
                />
              )}
              <BalanceFreshnessWarning
                accounts={accounts}
                onOpenAccounts={() => setAccountsOpen(true)}
                onChanged={reloadAccounts}
              />

              {activeSubs.length > 0 && <CostSummarySection subscriptions={activeSubs} />}
              {activeSubs.length > 0 && <YearlyLoadSection subscriptions={activeSubs} />}
              {hasActiveCashflow && (
                <UpcomingSection
                  subscriptions={activeSubs}
                  accounts={accounts}
                  incomes={activeIncomes}
                />
              )}
              {hasActiveCashflow && (
                <OverviewSection
                  subscriptions={activeSubs}
                  accounts={accounts}
                  incomes={activeIncomes}
                />
              )}
              <ArchivedSavingsSection subscriptions={subs} />
              {!hasActiveCashflow && (
                <p className="text-muted-foreground">
                  Keine aktiven Abos oder Einnahmen. Lege etwas an oder reaktiviere Archiviertes.
                </p>
              )}
            </>
          )}

          {/* ABOS */}
          {!isEmpty && view === "subs" && (
            <>
              {archivedCount > 0 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Archivierte anzeigen ({archivedCount}
                  {archivedCount === 1 ? " Abo" : " Abos"})
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

              {preFilteredSubs.length === 0 ? (
                <p className="text-muted-foreground">Noch keine Abos.</p>
              ) : visibleSubs.length === 0 ? (
                <p className="text-muted-foreground">Kein Abo passt zu den aktuellen Filtern.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min),1fr))] gap-3">
                  {visibleSubs.map((sub) => {
                    const account = accountName(sub.accountId);
                    return (
                      <CashflowCard
                        key={sub.id}
                        id={sub.id}
                        active={sub.active}
                        accent={ACCENTS[sub.id % ACCENTS.length]}
                        title={sub.name}
                        amount={formatAmount(sub.amountCents, sub.currency)}
                        subtitle={
                          <>
                            {sub.active ? (
                              <>
                                {sub.oneTime ? "Datum" : "nächste Fälligkeit"}: {formatNextDue(sub)}
                              </>
                            ) : (
                              <>archiviert</>
                            )}
                            {account && <> · {account}</>}
                            {sub.category && <> · {sub.category}</>}
                            {sub.oneTime && <> · einmalig</>}
                            {sub.active &&
                              sub.amountCents === 0 &&
                              sub.pendingAmountCents != null && <> · Probeabo</>}
                            {sub.active && !sub.notify && <> · stumm</>}
                          </>
                        }
                      >
                        <PendingPriceNotice sub={sub} />
                        <CancelNotice sub={sub} />
                        <CardActions
                          name={sub.name}
                          active={sub.active}
                          onEdit={() => startEdit(sub)}
                          onToggle={() => void handleToggleActive(sub)}
                          onDelete={() => void handleDelete(sub)}
                        />
                      </CashflowCard>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* EINNAHMEN */}
          {!isEmpty &&
            view === "incomes" &&
            (incomes.length === 0 ? (
              <p className="text-muted-foreground">Noch keine Einnahmen.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min),1fr))] gap-3">
                {incomes.map((income) => {
                  const account = accountName(income.accountId);
                  return (
                    <CashflowCard
                      key={income.id}
                      id={income.id}
                      active={income.active}
                      accent={ACCENTS[income.id % ACCENTS.length]}
                      title={income.name}
                      income
                      amount={formatAmount(income.amountCents, income.currency)}
                      subtitle={
                        <>
                          {income.active ? (
                            <>
                              {income.oneTime ? "Datum" : "nächste Fälligkeit"}:{" "}
                              {formatNextDue(income)}
                              {income.oneTime && <> · einmalig</>}
                            </>
                          ) : (
                            <>archiviert</>
                          )}
                          {account && <> · {account}</>}
                        </>
                      }
                    >
                      <CardActions
                        name={income.name}
                        active={income.active}
                        onEdit={() => startEditIncome(income)}
                        onToggle={() => void handleToggleIncomeActive(income)}
                        onDelete={() => void handleDeleteIncome(income)}
                      />
                    </CashflowCard>
                  );
                })}
              </div>
            ))}
        </div>
      </main>

      <SubscriptionDialog
        key={`sub-${editingSub?.id ?? "new"}-${subOpenSeq}`}
        open={subOpen}
        subscription={editingSub}
        accounts={accounts}
        onClose={() => setSubOpen(false)}
        onSaved={handleSubSaved}
      />
      <IncomeDialog
        key={`income-${editingIncome?.id ?? "new"}-${incomeOpenSeq}`}
        open={incomeOpen}
        income={editingIncome}
        accounts={accounts}
        onClose={() => setIncomeOpen(false)}
        onSaved={handleIncomeSaved}
      />
      <AccountsDialog
        open={accountsOpen}
        accounts={accounts}
        onChanged={reloadAccounts}
        onClose={() => setAccountsOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDataReplaced={reloadAll}
        onStartCsvImport={() => {
          setSettingsOpen(false);
          setCsvImportOpen(true);
        }}
        onStartCsvReconcile={() => {
          setSettingsOpen(false);
          setCsvReconcileOpen(true);
        }}
      />
      <CsvImportDialog
        open={csvImportOpen}
        accounts={accounts}
        onClose={() => setCsvImportOpen(false)}
        onImported={reloadAll}
      />
      <CsvReconcileDialog
        open={csvReconcileOpen}
        subs={subs}
        onClose={() => setCsvReconcileOpen(false)}
        onChanged={reloadAll}
      />
    </div>
  );
}

export default App;
