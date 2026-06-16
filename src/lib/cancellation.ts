import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isBefore,
  startOfDay,
} from "date-fns";
import type { CancelUnit, Subscription } from "../types";
import { parseStrictISODate, toISODateLocal } from "./format";
import { nextDueDate } from "./recurrence";

/** Schwelle (Tage), ab der ein anstehendes „kündigen bis"-Datum hervorgehoben wird. */
const CANCEL_SOON_DAYS = 30;

/** Zieht eine Kündigungsfrist von einem Datum ab — Monate date-additiv (kein 90≈3-Monate-Drift). */
function subtractPeriod(date: Date, value: number, unit: CancelUnit): Date {
  if (unit === "days") return addDays(date, -value);
  if (unit === "weeks") return addDays(date, -value * 7);
  return addMonths(date, -value);
}

/**
 * Nächstes relevantes „kündigen bis"-Datum eines Abos als ISO-String, oder null wenn
 * keine Kündigung getrackt ist.
 *
 * - cancelMode "date": das feste Stichdatum (unverändert, auch wenn es in der Vergangenheit liegt).
 * - cancelMode "period": nächste Fälligkeit minus Frist. Ist diese Frist-Deadline für den
 *   aktuellen Zyklus bereits verstrichen, wird zur nächsten Fälligkeit weitergerückt, sodass
 *   immer die nächste noch handlungsfähige Frist zurückkommt (auto-verlängernde Verträge).
 */
export function cancelDeadline(sub: Subscription, from: Date = new Date()): string | null {
  if (sub.cancelMode === "date") return sub.cancelDate;
  if (
    sub.cancelMode === "period" &&
    sub.cancelPeriodValue !== null &&
    sub.cancelPeriodUnit !== null
  ) {
    const anchor = parseStrictISODate(sub.anchorDate);
    if (!anchor) return null;
    const value = sub.cancelPeriodValue;
    const unit = sub.cancelPeriodUnit;
    const today = startOfDay(from);
    let renewal = nextDueDate(anchor, sub.interval, today);
    let deadline = subtractPeriod(renewal, value, unit);
    while (isBefore(deadline, today)) {
      renewal = nextDueDate(anchor, sub.interval, addDays(renewal, 1));
      deadline = subtractPeriod(renewal, value, unit);
    }
    return toISODateLocal(deadline);
  }
  return null;
}

export interface CancelDeadlineDisplay {
  /** ISO "YYYY-MM-DD". */
  iso: string;
  /** Deutsch formatiert, "dd.MM.yyyy". */
  formatted: string;
  /** Kalendertage bis zur Frist; negativ wenn verstrichen (nur bei festem Datum möglich). */
  daysUntil: number;
  status: "overdue" | "soon" | "ok";
}

/**
 * Aufbereitete „kündigen bis"-Info für die Anzeige, oder null wenn keine Kündigung
 * getrackt ist. `status` steuert die Hervorhebung: overdue (verstrichen), soon
 * (innerhalb CANCEL_SOON_DAYS) oder ok.
 */
export function cancelDeadlineDisplay(
  sub: Subscription,
  from: Date = new Date(),
): CancelDeadlineDisplay | null {
  const iso = cancelDeadline(sub, from);
  if (!iso) return null;
  const date = parseStrictISODate(iso);
  if (!date) return null;
  const daysUntil = differenceInCalendarDays(date, startOfDay(from));
  const status = daysUntil < 0 ? "overdue" : daysUntil <= CANCEL_SOON_DAYS ? "soon" : "ok";
  return { iso, formatted: format(date, "dd.MM.yyyy"), daysUntil, status };
}
