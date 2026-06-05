import Database from "@tauri-apps/plugin-sql";
import type { Account, Interval, Subscription } from "../types";

let _db: Database | null = null;

/** Lazy-Singleton. Die Migration (0001_init.sql) wird vom Rust-Plugin angewandt. */
export async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:subtracker.db");
  return _db;
}

// --- Mapping DB-Zeile (snake_case, 0/1) <-> TS-Objekt ----------------------

interface SubRow {
  id: number;
  name: string;
  amount_cents: number;
  currency: string;
  account_id: number | null;
  interval: Interval;
  anchor_date: string;
  lead_days: number;
  active: number;
  notify: number;
}

function mapSub(r: SubRow): Subscription {
  return {
    id: r.id,
    name: r.name,
    amountCents: r.amount_cents,
    currency: r.currency,
    accountId: r.account_id,
    interval: r.interval,
    anchorDate: r.anchor_date,
    leadDays: r.lead_days,
    active: r.active === 1,
    notify: r.notify === 1,
  };
}

// --- Accounts --------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.select<Account[]>("SELECT id, name, note FROM accounts ORDER BY name");
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
  const db = await getDb();
  const sql = onlyActive
    ? "SELECT * FROM subscriptions WHERE active = 1 ORDER BY name"
    : "SELECT * FROM subscriptions ORDER BY name";
  const rows = await db.select<SubRow[]>(sql);
  return rows.map(mapSub);
}

export async function addSubscription(
  s: Omit<Subscription, "id" | "active" | "notify"> & {
    active?: boolean;
    notify?: boolean;
  },
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO subscriptions
       (name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, notify)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      s.name,
      s.amountCents,
      s.currency,
      s.accountId,
      s.interval,
      s.anchorDate,
      s.leadDays,
      s.active === false ? 0 : 1,
      s.notify === false ? 0 : 1,
    ],
  );
  return res.lastInsertId ?? 0;
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
  const db = await getDb();
  await db.execute("DELETE FROM subscriptions WHERE id = $1", [id]);
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
