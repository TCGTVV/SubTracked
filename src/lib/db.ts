import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  CancelMode,
  CancelUnit,
  ExchangeRate,
  Income,
  Interval,
  PriceHistoryEntry,
  Subscription,
  SubscriptionSkip,
} from "../types";

export interface AppInfo {
  version: string;
  configDir: string;
  logDir: string;
}

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

// Rust-Side liefert Subscription via Tauri-Command in camelCase, aber `interval`/
// `cancelMode`/`cancelPeriodUnit` kommen als String und müssen zu den engen Unions
// narrowed werden (Defense-in-Depth gegen DB-Manipulation von außen).
type SubFromRust = Omit<Subscription, "interval" | "cancelMode" | "cancelPeriodUnit"> & {
  interval: string;
  cancelMode: string | null;
  cancelPeriodUnit: string | null;
};

function parseInterval(s: string): Interval {
  if (
    s !== "weekly" &&
    s !== "biweekly" &&
    s !== "monthly" &&
    s !== "bimonthly" &&
    s !== "quarterly" &&
    s !== "semiannual" &&
    s !== "yearly"
  ) {
    throw new Error(`Unbekanntes Intervall aus DB: ${s}`);
  }
  return s;
}

function parseCancelMode(s: string | null): CancelMode | null {
  if (s === null) return null;
  if (s !== "period" && s !== "date") {
    throw new Error(`Unbekannter Kündigungsmodus aus DB: ${s}`);
  }
  return s;
}

function parseCancelUnit(s: string | null): CancelUnit | null {
  if (s === null) return null;
  if (s !== "days" && s !== "weeks" && s !== "months") {
    throw new Error(`Unbekannte Kündigungsfrist-Einheit aus DB: ${s}`);
  }
  return s;
}

function narrowSub(s: SubFromRust): Subscription {
  return {
    ...s,
    interval: parseInterval(s.interval),
    cancelMode: parseCancelMode(s.cancelMode),
    cancelPeriodUnit: parseCancelUnit(s.cancelPeriodUnit),
  };
}

// --- Accounts --------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  return invoke<Account[]>("list_accounts");
}

export async function addAccount(input: {
  name: string;
  note?: string;
  currency?: string;
  balanceCents?: number;
  minBufferCents?: number;
}): Promise<number> {
  return invoke<number>("add_account", {
    name: input.name,
    note: input.note ?? null,
    currency: input.currency ?? null,
    balanceCents: input.balanceCents ?? null,
    minBufferCents: input.minBufferCents ?? null,
  });
}

export async function updateAccount(account: Account): Promise<void> {
  await invoke("update_account", { account });
}

/** Bestätigt den aktuellen Saldo ohne Wertänderung — setzt nur `balance_updated_at`. */
export async function confirmAccountBalance(id: number): Promise<void> {
  await invoke("confirm_account_balance", { id });
}

export async function deleteAccount(id: number): Promise<void> {
  await invoke("delete_account", { id });
}

export async function countSubsForAccount(accountId: number): Promise<number> {
  return invoke<number>("count_subs_for_account", { accountId });
}

// --- Subscriptions ---------------------------------------------------------

export async function listSubscriptions(onlyActive = true): Promise<Subscription[]> {
  const rows = await invoke<SubFromRust[]>("list_subscriptions", { onlyActive });
  return rows.map(narrowSub);
}

export async function addSubscription(
  s: Omit<Subscription, "id" | "active" | "notify" | "archivedAt"> & {
    active?: boolean;
    notify?: boolean;
  },
): Promise<number> {
  return invoke<number>("add_subscription", { sub: s });
}

export async function updateSubscription(s: Subscription): Promise<void> {
  await invoke("update_subscription", { sub: s });
}

export async function setSubscriptionActive(id: number, active: boolean): Promise<void> {
  await invoke("set_subscription_active", { id, active });
}

export async function deleteSubscription(id: number): Promise<void> {
  await invoke("delete_subscription", { id });
}

interface LastSentReminder {
  dueDate: string;
  subscriptionName: string;
  sentAt: string;
}

export interface ReminderStatus {
  /** ISO 8601 UTC, null wenn der Loop noch keinen Check abgeschlossen hat. */
  lastCheckAt: string | null;
  intervalSecs: number;
  lastSent: LastSentReminder | null;
}

export async function getReminderStatus(): Promise<ReminderStatus> {
  return invoke<ReminderStatus>("get_reminder_status");
}

export async function sendTestNotification(): Promise<void> {
  await invoke("send_test_notification");
}

type IncomeFromRust = Omit<Income, "interval"> & { interval: string };

function narrowIncome(i: IncomeFromRust): Income {
  return { ...i, interval: parseInterval(i.interval) };
}

export async function listIncomes(onlyActive = false): Promise<Income[]> {
  const rows = await invoke<IncomeFromRust[]>("list_incomes", { onlyActive });
  return rows.map(narrowIncome);
}

export async function addIncome(income: Omit<Income, "id">): Promise<number> {
  return await invoke<number>("add_income", { income });
}

export async function updateIncome(income: Income): Promise<void> {
  await invoke("update_income", { income });
}

export async function deleteIncome(id: number): Promise<void> {
  await invoke("delete_income", { id });
}

export async function setIncomeActive(id: number, active: boolean): Promise<void> {
  await invoke("set_income_active", { id, active });
}

export async function listPriceHistory(subscriptionId: number): Promise<PriceHistoryEntry[]> {
  return invoke<PriceHistoryEntry[]>("list_price_history", { subscriptionId });
}

// --- Wechselkurse -----------------------------------------------------------

export async function listRates(): Promise<ExchangeRate[]> {
  return invoke<ExchangeRate[]>("list_rates");
}

/** Legt einen Kurs an oder überschreibt den für dasselbe Währungspaar. */
export async function setRate(
  fromCurrency: string,
  toCurrency: string,
  rateMicros: number,
): Promise<void> {
  await invoke("set_rate", { fromCurrency, toCurrency, rateMicros });
}

export async function deleteRate(fromCurrency: string, toCurrency: string): Promise<void> {
  await invoke("delete_rate", { fromCurrency, toCurrency });
}

// --- App-Updates -------------------------------------------------------------

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
}

/** Fragt den Update-Server; `null` = die installierte Version ist aktuell. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return await invoke<UpdateInfo | null>("check_for_update");
}

/** Lädt das Update, prüft die Signatur, installiert und startet die App neu. */
export async function installUpdate(): Promise<void> {
  await invoke("install_update");
}

// --- Übersprungene Termine --------------------------------------------------

export async function listSkips(): Promise<SubscriptionSkip[]> {
  return invoke<SubscriptionSkip[]>("list_skips");
}

/** Lässt einen Wiederholungstermin (`YYYY-MM-DD`) des Abos entfallen. */
export async function skipOccurrence(subscriptionId: number, dueDate: string): Promise<void> {
  await invoke("skip_occurrence", { subscriptionId, dueDate });
}

export async function unskipOccurrence(subscriptionId: number, dueDate: string): Promise<void> {
  await invoke("unskip_occurrence", { subscriptionId, dueDate });
}

// --- Datei-Auswahl -----------------------------------------------------------
// Der Renderer übergibt Rust nie einen freien Pfad: Rust öffnet den nativen Dialog selbst
// und liefert ein einmal gültiges Token zurück, das die Datei-Commands einlösen
// (`src-tauri/src/file_grants.rs`). `path` dient nur der Anzeige.

export interface PickedFile {
  token: string;
  path: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Öffnet den „Speichern unter“-Dialog; `null`, wenn der Nutzer abbricht. */
export async function pickSaveFile(
  defaultName: string,
  filter: FileFilter,
): Promise<PickedFile | null> {
  return await invoke<PickedFile | null>("pick_save_file", {
    defaultName,
    filterName: filter.name,
    extensions: filter.extensions,
  });
}

/** Öffnet den „Datei öffnen“-Dialog; `null`, wenn der Nutzer abbricht. */
export async function pickOpenFile(filter: FileFilter): Promise<PickedFile | null> {
  return await invoke<PickedFile | null>("pick_open_file", {
    filterName: filter.name,
    extensions: filter.extensions,
  });
}

/** Schreibt ein vollständiges JSON-Backup in die per `pickSaveFile` gewählte Datei. */
export async function exportBackup(file: PickedFile): Promise<void> {
  await invoke("export_backup", { token: file.token });
}

/** Stellt den Datenbestand aus der per `pickOpenFile` gewählten Backup-Datei wieder her. */
export async function importBackup(file: PickedFile): Promise<void> {
  await invoke("import_backup", { token: file.token });
}

// --- CSV Export / Import ----------------------------------------------------

/** Exportiert alle Abos (inkl. archivierte) als lesbare CSV an den gewählten Pfad. */
export async function exportSubscriptionsCsv(file: PickedFile): Promise<void> {
  await invoke("export_subscriptions_csv", { token: file.token });
}

export interface RecurringCandidate {
  name: string;
  amountCents: number;
  interval: Interval;
  /** Jüngstes erkanntes Vorkommen — als anchorDate direkt für addSubscription nutzbar. */
  anchorDate: string;
  firstDate: string;
  occurrenceCount: number;
  /** Name eines bestehenden Abos, das vermutlich derselbe Posten ist; null = kein Verdacht. */
  matchedSubscription: string | null;
}

type RecurringCandidateFromRust = Omit<RecurringCandidate, "interval"> & { interval: string };

/**
 * Liest eine Bank-Kontoauszug-CSV und schlägt wiederkehrende Abbuchungen als
 * Import-Kandidaten vor (Erkennungs-Heuristik in src-tauri/src/csv_import.rs).
 * Reine Vorschau — legt noch keine Abos an.
 */
export async function previewCsvImport(file: PickedFile): Promise<RecurringCandidate[]> {
  const rows = await invoke<RecurringCandidateFromRust[]>("preview_csv_import", {
    token: file.token,
  });
  return rows.map((r) => ({ ...r, interval: parseInterval(r.interval) }));
}

type ReconcileFindingKind = "price_changed" | "possibly_cancelled";

export interface ReconcileFinding {
  subscriptionId: number;
  subscriptionName: string;
  kind: ReconcileFindingKind;
  expectedAmountCents: number;
  /** Zuletzt abgebuchter Betrag — nur bei "price_changed" gesetzt. */
  actualAmountCents: number | null;
  /** Datum der jüngsten passenden Abbuchung im Auszug (ISO). */
  lastChargeDate: string;
  matchedCount: number;
}

type ReconcileFindingFromRust = Omit<ReconcileFinding, "kind"> & { kind: string };

function parseReconcileKind(s: string): ReconcileFindingKind {
  if (s !== "price_changed" && s !== "possibly_cancelled") {
    throw new Error(`Unbekannte Abgleich-Befundart: ${s}`);
  }
  return s;
}

export async function reconcileCsv(file: PickedFile): Promise<ReconcileFinding[]> {
  const rows = await invoke<ReconcileFindingFromRust[]>("reconcile_csv", { token: file.token });
  return rows.map((r) => ({ ...r, kind: parseReconcileKind(r.kind) }));
}
