export type Interval = "monthly" | "quarterly" | "yearly";

export interface Account {
  id: number;
  name: string;
  note: string | null;
  currency: string;
  balanceCents: number;
  minBufferCents: number;
  /** SQLite datetime string (UTC), e.g. "2026-06-10 14:23:00". Null for legacy rows. */
  balanceUpdatedAt: string | null;
}

export interface Income {
  id: number;
  name: string;
  amountCents: number;
  currency: string;
  accountId: number | null;
  interval: Interval;
  anchorDate: string; // ISO "YYYY-MM-DD"
  active: boolean;
}

export interface Subscription {
  id: number;
  name: string;
  amountCents: number;
  currency: string;
  accountId: number | null;
  interval: Interval;
  anchorDate: string; // ISO "YYYY-MM-DD"
  leadDays: number;
  active: boolean;
  notify: boolean;
}

export interface PriceHistoryEntry {
  id: number;
  subscriptionId: number;
  amountCents: number;
  currency: string;
  /** SQLite datetime string (UTC), e.g. "2026-06-10 14:23:00". */
  changedAt: string;
}
