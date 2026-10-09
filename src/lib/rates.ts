import type { ExchangeRate } from "../types";
import { getCurrencySubdivisor } from "./format";

// Manuelle Wechselkurse. Kurse werden NIE als Float gespeichert, sondern als ganzzahlige
// Mikro-Einheiten (`rateMicros` = Kurs × 1.000.000), konsistent zur Regel „Geld in kleinster
// Einheit". Umgerechnet wird ausschließlich auf ausdrücklich hinterlegte Kurse hin und das
// Ergebnis ist in der UI immer als umgerechnet („≈") gekennzeichnet — nie still.

const RATE_SCALE = 1_000_000;

/** Nur die für die Umrechnung nötigen Felder (Tests brauchen kein `updatedAt`). */
export type RateLike = Pick<ExchangeRate, "fromCurrency" | "toCurrency" | "rateMicros">;

export interface RateLookup {
  /** Faktor von der Quell- zur Zielwährung (Hauptwährungseinheit → Hauptwährungseinheit). */
  factor: number;
  /** true, wenn nur der Kehrwert-Kurs (Ziel → Quelle) hinterlegt war. */
  inverted: boolean;
}

/**
 * Sucht einen Kurs `from → to`. Direkt hinterlegt hat Vorrang; fehlt er, wird der Kehrwert
 * eines hinterlegten Gegenkurses (`to → from`) verwendet. Gleiche Währung braucht keinen Kurs.
 */
export function findRate(rates: readonly RateLike[], from: string, to: string): RateLookup | null {
  if (from === to) return { factor: 1, inverted: false };
  const direct = rates.find((r) => r.fromCurrency === from && r.toCurrency === to);
  if (direct) return { factor: direct.rateMicros / RATE_SCALE, inverted: false };
  const reverse = rates.find((r) => r.fromCurrency === to && r.toCurrency === from);
  if (reverse && reverse.rateMicros > 0) {
    return { factor: RATE_SCALE / reverse.rateMicros, inverted: true };
  }
  return null;
}

/**
 * Rechnet einen Betrag in kleinster Einheit (`cents` der Währung `from`) in die kleinste
 * Einheit von `to` um. Berücksichtigt unterschiedliche Subdivisionen (EUR = 100, JPY/KRW = 1).
 */
export function convertCents(cents: number, from: string, to: string, lookup: RateLookup): number {
  const major = cents / getCurrencySubdivisor(from);
  return Math.round(major * lookup.factor * getCurrencySubdivisor(to));
}

/**
 * Parst eine Kurs-Eingabe ("1,0850", "1.0850", "0,92") zu Mikro-Einheiten. Bis zu 6
 * Nachkommastellen; Kurse ≤ 0, nicht-numerische Eingaben und zu feine Kurse → `null`.
 * Bewusst strenger als Betragseingaben: ein Punkt oder Komma ist immer der Dezimaltrenner
 * (Kurse haben keine Tausendertrenner).
 */
export function parseRateInput(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const micros = Math.round(Number(trimmed) * RATE_SCALE);
  return Number.isSafeInteger(micros) && micros > 0 ? micros : null;
}

/** Anzeige eines Kurses: "1,0850" (mindestens 2, höchstens 6 Nachkommastellen, ohne Rauschen). */
export function formatRate(rateMicros: number): string {
  const value = rateMicros / RATE_SCALE;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
