import type { Account as GeneratedAccount } from "./generated/Account";
import type { Income as GeneratedIncome } from "./generated/Income";
import type { PriceHistoryEntry as GeneratedPriceHistoryEntry } from "./generated/PriceHistoryEntry";
import type { Subscription as GeneratedSubscription } from "./generated/Subscription";

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

export type Income = Omit<GeneratedIncome, "interval"> & {
  interval: Interval;
};

export type Subscription = Omit<
  GeneratedSubscription,
  "interval" | "cancelMode" | "cancelPeriodUnit"
> & {
  interval: Interval;
  /** Kündigungsmodus; null = keine Kündigung getrackt. */
  cancelMode: CancelMode | null;
  /** Einheit bei cancelMode === "period", sonst null. */
  cancelPeriodUnit: CancelUnit | null;
};

export type PriceHistoryEntry = GeneratedPriceHistoryEntry;
