import { format } from "date-fns";
import type { Subscription } from "../types";
import { nextDueDate } from "./recurrence";

// Smallest currency unit pro ISO-4217-Code. Bei Waehrungen ohne Subdivision
// (z.B. KRW, JPY) ist der Wert in der DB direkt die ganze Einheit, nicht ein
// Subunit. Default 100 deckt EUR/USD/GBP/CHF und die meisten anderen ab.
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

/**
 * Parst Betrags-Eingaben tolerant: akzeptiert "12,99", "12.99", "1.234,56", "1,234.56".
 * Heuristik fuer Trennzeichen:
 *  - bei beiden vorhanden ist das spaeter stehende der Dezimaltrenner, das andere Tausender;
 *  - bei nur einem mit genau 3 Stellen danach (z.B. "1,234") wird er als Tausender gedeutet;
 *  - sonst ist der einzelne Trenner der Dezimaltrenner.
 * Gibt null zurueck bei leerem oder strukturell ungueltigem Input (inkl. negativ via Praefix).
 */
export function parseAmountInput(input: string): number | null {
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

export function formatAmount(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / divisor);
}

export function formatNextDue(sub: Subscription, now: Date = new Date()): string {
  const due = nextDueDate(new Date(sub.anchorDate), sub.interval, now);
  return format(due, "dd.MM.yyyy");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
