import { format } from "date-fns";
import type { Subscription } from "../types";
import { nextDueDate } from "./recurrence";

// Smallest currency unit pro ISO-4217-Code. Bei Waehrungen ohne Subdivision
// (z.B. KRW, JPY) ist der Wert in der DB direkt die ganze Einheit, nicht ein
// Subunit. Default 100 deckt EUR/USD/GBP/CHF und die meisten anderen ab.
export const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF", "KRW"] as const;
export type CurrencyOption = (typeof CURRENCY_OPTIONS)[number];

const CURRENCY_SUBDIVISIONS: Record<string, number> = {
  EUR: 100,
  USD: 100,
  GBP: 100,
  CHF: 100,
  KRW: 1,
};

export function getCurrencySubdivisor(currency: string): number {
  return CURRENCY_SUBDIVISIONS[currency] ?? 100;
}

export function isCurrencyOption(currency: string): currency is CurrencyOption {
  return (CURRENCY_OPTIONS as readonly string[]).includes(currency);
}

export function parseStrictISODate(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function isStrictISODate(input: string): boolean {
  return parseStrictISODate(input) !== null;
}

/**
 * Parst Betrags-Eingaben tolerant: akzeptiert "12,99", "12.99", "1.234,56", "1,234.56".
 * Heuristik fuer Trennzeichen:
 *  - bei beiden vorhanden ist das spaeter stehende der Dezimaltrenner, das andere Tausender;
 *  - bei nur einem mit genau 3 Stellen danach (z.B. "1,234") wird er als Tausender gedeutet;
 *  - sonst ist der einzelne Trenner der Dezimaltrenner.
 * Gibt null zurueck bei leerem oder strukturell ungueltigem Input.
 */
function parseLocalizedAmountInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^[\d.,]+$/.test(trimmed)) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = trimmed.replace(/,/g, "");
    }
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sepIsComma = lastComma >= 0;
    const sepRe = sepIsComma ? /,/g : /\./g;
    const count = (trimmed.match(sepRe) || []).length;
    const lastIdx = sepIsComma ? lastComma : lastDot;
    const tail = trimmed.length - 1 - lastIdx;
    const isThousands = count >= 2 || (count === 1 && tail === 3);
    if (isThousands) {
      normalized = trimmed.replace(sepRe, "");
    } else {
      normalized = sepIsComma ? trimmed.replace(",", ".") : trimmed;
    }
  } else {
    normalized = trimmed;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseAmountInput(input: string): number | null {
  return parseLocalizedAmountInput(input);
}

/** Wie parseAmountInput, aber erlaubt ein fuehrendes Minus fuer Kontosalden. */
export function parseSignedAmountInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("-")) return parseLocalizedAmountInput(trimmed);

  const n = parseLocalizedAmountInput(trimmed.slice(1));
  return n === null ? null : -n;
}

export function formatAmount(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  const value = cents / divisor;
  if (isCurrencyOption(currency)) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
    }).format(value);
  }
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: divisor === 1 ? 0 : 2,
    maximumFractionDigits: divisor === 1 ? 0 : 2,
  }).format(value)} ${currency || "?"}`;
}

export function formatNextDue(sub: Subscription, now: Date = new Date()): string {
  const anchor = parseStrictISODate(sub.anchorDate);
  if (!anchor) return "Ungültiges Datum";
  const due = nextDueDate(anchor, sub.interval, now);
  return format(due, "dd.MM.yyyy");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
