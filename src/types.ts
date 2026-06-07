export type Interval = "monthly" | "quarterly" | "yearly";

export interface Account {
  id: number;
  name: string;
  note: string | null;
  currency: string;
  balanceCents: number;
  minBufferCents: number;
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
