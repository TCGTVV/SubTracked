import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  CancelMode,
  CancelUnit,
  Income,
  Interval,
  PriceHistoryEntry,
  Subscription,
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
  s: Omit<Subscription, "id" | "active" | "notify"> & {
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

export interface LastSentReminder {
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

// --- Backup / Restore ------------------------------------------------------

/** Schreibt ein vollständiges JSON-Backup an den (vom Datei-Dialog gewählten) Pfad. */
export async function exportBackup(path: string): Promise<void> {
  await invoke("export_backup", { path });
}

/** Stellt den Datenbestand aus der Backup-Datei wieder her (ersetzt alles). */
export async function importBackup(path: string): Promise<void> {
  await invoke("import_backup", { path });
}
