import { invoke } from "@tauri-apps/api/core";
import type { Account, Interval, Subscription } from "../types";

// Rust-Side liefert Subscription via Tauri-Command in camelCase, aber `interval`
// kommt als String und muss zum engen `Interval`-Union narrowed werden.
type SubFromRust = Omit<Subscription, "interval"> & { interval: string };

function parseInterval(s: string): Interval {
  if (s !== "monthly" && s !== "quarterly" && s !== "yearly") {
    throw new Error(`Unbekanntes Intervall aus DB: ${s}`);
  }
  return s;
}

function narrowSub(s: SubFromRust): Subscription {
  return { ...s, interval: parseInterval(s.interval) };
}

// --- Accounts --------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  return invoke<Account[]>("list_accounts");
}

export async function addAccount(name: string, note?: string): Promise<number> {
  return invoke<number>("add_account", { name, note: note ?? null });
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

export async function deleteSubscription(id: number): Promise<void> {
  await invoke("delete_subscription", { id });
}

// --- Reminders -------------------------------------------------------------

/**
 * Idempotenter Insert. Dank UNIQUE(subscription_id, due_date) + INSERT OR IGNORE
 * liefert rowsAffected nur dann 1, wenn die Erinnerung neu ist.
 */
export async function insertReminderIfNew(
  subscriptionId: number,
  dueDate: string,
): Promise<boolean> {
  return invoke<boolean>("insert_reminder_if_new", { subscriptionId, dueDate });
}
