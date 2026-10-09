import type { Account as GeneratedAccount } from "./generated/Account";
import type { ExchangeRate as GeneratedExchangeRate } from "./generated/ExchangeRate";
import type { Income as GeneratedIncome } from "./generated/Income";
import type { PriceHistoryEntry as GeneratedPriceHistoryEntry } from "./generated/PriceHistoryEntry";
import type { Subscription as GeneratedSubscription } from "./generated/Subscription";
import type { SubscriptionSkip as GeneratedSubscriptionSkip } from "./generated/SubscriptionSkip";

// Account/Income/Subscription/PriceHistoryEntry sind aus den Rust-Structs in
// `src-tauri/src/db.rs` generiert (ts-rs, `cargo test export` in src-tauri regeneriert
// `src/generated/*.ts` nach Struct-Änderungen — Diff mitcommitten). Damit kann ein
// umbenanntes/entferntes Rust-Feld nicht mehr unbemerkt von der TS-Seite abdriften.
//
// interval/cancelMode/cancelPeriodUnit sind in Rust nur validierte Strings (kein Enum) —
// hier per Omit+Intersection auf die literalen Unions unten verschärft, die auch von
// `recurrence-vectors.test.ts` gegen die Rust-Seite geprüft werden.

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

export type Account = GeneratedAccount;

/**
 * Verschiebung des Buchungstags bei Wochenende/Feiertag: `none` = Termin bleibt,
 * `next` = nächster, `previous` = voriger Bankarbeitstag (siehe `lib/bankdays.ts`).
 */
export type ShiftRule = "none" | "next" | "previous";

// `shiftRule` ist in Rust immer gesetzt, im Frontend aber optional typisiert (fehlt = "none"),
// damit Fixtures/Aufrufer, die die Verschiebung nicht kennen, unverändert bleiben.
export type Income = Omit<GeneratedIncome, "interval" | "shiftRule"> & {
  interval: Interval;
  shiftRule?: ShiftRule;
};

export type Subscription = Omit<
  GeneratedSubscription,
  "interval" | "cancelMode" | "cancelPeriodUnit" | "shiftRule"
> & {
  interval: Interval;
  shiftRule?: ShiftRule;
  /** Kündigungsmodus; null = keine Kündigung getrackt. */
  cancelMode: CancelMode | null;
  /** Einheit bei cancelMode === "period", sonst null. */
  cancelPeriodUnit: CancelUnit | null;
  /**
   * Übersprungene Wiederholungstermine (`YYYY-MM-DD`, nominal). Kein DB-Feld des Abos:
   * `useSubscriptions` setzt es aus der Tabelle `subscription_skips`. Fehlt es, entfällt kein
   * Termin. Alle Prognose-Berechnungen (Coverage, Demnächst, Jahresplan, Simulation)
   * berücksichtigen es über `subscriptionDatesWithin`.
   */
  skippedDates?: readonly string[];
};

export type PriceHistoryEntry = GeneratedPriceHistoryEntry;
export type SubscriptionSkip = GeneratedSubscriptionSkip;
/** Manueller Wechselkurs: 1 `fromCurrency` = `rateMicros / 1.000.000` `toCurrency`. */
export type ExchangeRate = GeneratedExchangeRate;
