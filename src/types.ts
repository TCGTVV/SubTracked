export type Interval =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "yearly";

/** Kündigungsmodus eines Abos: Frist (relativ zur Fälligkeit) oder festes Stichdatum. */
export type CancelMode = "period" | "date";
/** Einheit der Kündigungsfrist (cancelMode === "period"). */
export type CancelUnit = "days" | "weeks" | "months";

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
  oneTime: boolean;
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
  /** Kündigungsmodus; null = keine Kündigung getrackt. */
  cancelMode: CancelMode | null;
  /** Anzahl bei cancelMode === "period", sonst null. */
  cancelPeriodValue: number | null;
  /** Einheit bei cancelMode === "period", sonst null. */
  cancelPeriodUnit: CancelUnit | null;
  /** Festes Stichdatum (ISO "YYYY-MM-DD") bei cancelMode === "date", sonst null. */
  cancelDate: string | null;
  /** Optionale Kategorie (Freitext, Presets im Dialog); null = keine. */
  category: string | null;
  /** Einmalige Ausgabe: true = einzelne Buchung am anchorDate (Intervall/Kündigung
   * ignoriert), false = wiederkehrend. Analog zu Income.oneTime. */
  oneTime: boolean;
  /** SQLite datetime (UTC, "YYYY-MM-DD HH:MM:SS"), gesetzt beim Archivieren.
   * null = aktiv oder vor Migration 0013 archiviert (Zeitpunkt unbekannt). */
  archivedAt: string | null;
  /** Geplante Preisänderung: neuer Betrag (kleinste Währungseinheit), wirksam ab
   * pendingFrom. Beide Felder immer gemeinsam gesetzt oder gemeinsam null.
   * Trial-/Probeabo = amountCents 0 + gesetzte Änderung. */
  pendingAmountCents: number | null;
  /** Wirksamkeitsdatum (ISO "YYYY-MM-DD") der geplanten Preisänderung. */
  pendingFrom: string | null;
}

export interface PriceHistoryEntry {
  id: number;
  subscriptionId: number;
  amountCents: number;
  currency: string;
  /** SQLite datetime string (UTC), e.g. "2026-06-10 14:23:00". */
  changedAt: string;
}
