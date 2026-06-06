import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { Account, Interval, Subscription } from "../types";

let _db: Database | null = null;

/** Lazy-Singleton. Die Migration (0001_init.sql) wird vom Rust-Plugin angewandt. */
export async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:subtracker.db");
  return _db;
}

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
  const db = await getDb();
  const res = await db.execute("INSERT INTO accounts (name, note) VALUES ($1, $2)", [
    name,
    note ?? null,
  ]);
  return res.lastInsertId ?? 0;
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

export async function countSubsForAccount(accountId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM subscriptions WHERE account_id = $1",
    [accountId],
  );
  return rows[0]?.n ?? 0;
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
  const db = await getDb();
  await db.execute(
    `UPDATE subscriptions
       SET name = $1, amount_cents = $2, currency = $3, account_id = $4,
           interval = $5, anchor_date = $6, lead_days = $7, active = $8, notify = $9
     WHERE id = $10`,
    [
      s.name,
      s.amountCents,
      s.currency,
      s.accountId,
      s.interval,
      s.anchorDate,
      s.leadDays,
      s.active ? 1 : 0,
      s.notify ? 1 : 0,
      s.id,
    ],
  );
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
  const db = await getDb();
  const res = await db.execute(
    "INSERT OR IGNORE INTO reminders (subscription_id, due_date) VALUES ($1, $2)",
    [subscriptionId, dueDate],
  );
  return res.rowsAffected > 0;
}
