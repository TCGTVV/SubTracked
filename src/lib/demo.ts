import { addDays, format, setDate, subMonths } from "date-fns";
import type { Interval } from "../types";
import {
  addAccount,
  addIncome,
  addSubscription,
  deleteAccount,
  deleteIncome,
  deleteSubscription,
} from "./db";

/**
 * Demo-Datensatz fürs Onboarding: ein realistischer Monat (Konto, Gehalt,
 * Fixkosten, Abos inkl. Probeabo, Jahresversicherung, Einmalausgabe), damit
 * alle Übersichts-Sections sofort etwas zeigen. Die angelegten IDs werden in
 * localStorage gemerkt, damit „Demo-Daten entfernen" alles rückstandsfrei
 * wieder löschen kann. Alle Namen tragen ein „(Demo)"-Suffix, Notifications
 * sind für Demo-Abos deaktiviert (kein Erinnerungs-Spam beim Ausprobieren).
 */

const DEMO_IDS_KEY = "subtracked.demo-ids";

interface DemoIds {
  accountIds: number[];
  subscriptionIds: number[];
  incomeIds: number[];
}

export function hasDemoData(): boolean {
  return localStorage.getItem(DEMO_IDS_KEY) !== null;
}

function readDemoIds(): DemoIds | null {
  const raw = localStorage.getItem(DEMO_IDS_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as DemoIds).accountIds) &&
      Array.isArray((parsed as DemoIds).subscriptionIds) &&
      Array.isArray((parsed as DemoIds).incomeIds)
    ) {
      return parsed as DemoIds;
    }
  } catch {
    // kaputter Eintrag — wie „keine Demo-Daten" behandeln
  }
  return null;
}

interface DemoSub {
  name: string;
  amountCents: number;
  interval: Interval;
  anchorDate: string;
  leadDays: number;
  category: string | null;
  oneTime: boolean;
  pendingAmountCents: number | null;
  pendingFrom: string | null;
}

/** Anker auf einem festen Monatstag, sicher in der Vergangenheit (Vormonat). */
function anchorOnDay(today: Date, day: number): string {
  return format(subMonths(setDate(today, day), 1), "yyyy-MM-dd");
}

function demoSubs(today: Date): DemoSub[] {
  const base = {
    category: null as string | null,
    oneTime: false,
    pendingAmountCents: null as number | null,
    pendingFrom: null as string | null,
    leadDays: 7,
  };
  return [
    {
      ...base,
      name: "Miete (Demo)",
      amountCents: 98000,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 1),
      category: "Wohnen",
    },
    {
      ...base,
      name: "Strom (Demo)",
      amountCents: 8900,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 15),
      category: "Wohnen",
    },
    {
      ...base,
      name: "Internet (Demo)",
      amountCents: 3999,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 8),
      category: "Wohnen",
    },
    {
      ...base,
      name: "Streamgigant (Demo)",
      amountCents: 1799,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 12),
      category: "Streaming",
    },
    {
      ...base,
      name: "Musik-Flat (Demo)",
      amountCents: 1099,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 5),
      category: "Streaming",
    },
    {
      ...base,
      name: "Fitnessstudio (Demo)",
      amountCents: 2990,
      interval: "monthly",
      anchorDate: anchorOnDay(today, 2),
      category: "Gesundheit",
    },
    // Jahresbeitrag in ~6 Wochen: sichtbarer Ausschlag in der Jahres-Belastung
    // und im „Anstehend"-Blick. Anker in der Zukunft ist erlaubt (= erste Buchung).
    {
      ...base,
      name: "Kfz-Versicherung (Demo)",
      amountCents: 48900,
      interval: "yearly",
      anchorDate: format(addDays(today, 45), "yyyy-MM-dd"),
      category: "Mobilität",
      leadDays: 60,
    },
    // Probeabo-Muster: 0 € heute, geplanter Preis ab in 14 Tagen.
    {
      ...base,
      name: "Cloud-Speicher (Demo)",
      amountCents: 0,
      interval: "monthly",
      anchorDate: format(today, "yyyy-MM-dd"),
      pendingAmountCents: 299,
      pendingFrom: format(addDays(today, 14), "yyyy-MM-dd"),
    },
    // Einmalige Ausgabe in 10 Tagen.
    {
      ...base,
      name: "Konzertticket (Demo)",
      amountCents: 8950,
      interval: "monthly",
      anchorDate: format(addDays(today, 10), "yyyy-MM-dd"),
      oneTime: true,
      category: "Freizeit",
    },
  ];
}

/** Legt den Demo-Datensatz an und merkt sich die IDs für die spätere Entfernung. */
export async function loadDemoData(today: Date = new Date()): Promise<void> {
  const accountId = await addAccount({
    name: "Girokonto (Demo)",
    note: 'Demo-Daten — über „Demo-Daten entfernen" jederzeit löschbar.',
    currency: "EUR",
    balanceCents: 64500,
    minBufferCents: 20000,
  });
  const incomeId = await addIncome({
    name: "Gehalt (Demo)",
    amountCents: 245000,
    currency: "EUR",
    accountId,
    interval: "monthly",
    anchorDate: anchorOnDay(today, 28),
    active: true,
    oneTime: false,
  });
  const subscriptionIds: number[] = [];
  for (const s of demoSubs(today)) {
    subscriptionIds.push(
      await addSubscription({
        name: s.name,
        amountCents: s.amountCents,
        currency: "EUR",
        accountId,
        interval: s.interval,
        anchorDate: s.anchorDate,
        leadDays: s.leadDays,
        notify: false,
        cancelMode: null,
        cancelPeriodValue: null,
        cancelPeriodUnit: null,
        cancelDate: null,
        category: s.category,
        oneTime: s.oneTime,
        pendingAmountCents: s.pendingAmountCents,
        pendingFrom: s.pendingFrom,
      }),
    );
  }
  const ids: DemoIds = { accountIds: [accountId], subscriptionIds, incomeIds: [incomeId] };
  localStorage.setItem(DEMO_IDS_KEY, JSON.stringify(ids));
}

/**
 * Entfernt alle gemerkten Demo-Einträge wieder. Reihenfolge: erst Abos und
 * Einnahmen, dann das Konto (FK-Bindung). Bereits manuell gelöschte Einträge
 * stören nicht (DELETE auf unbekannte ID ist ein No-op).
 */
export async function removeDemoData(): Promise<void> {
  const ids = readDemoIds();
  if (ids) {
    for (const id of ids.subscriptionIds) {
      await deleteSubscription(id);
    }
    for (const id of ids.incomeIds) {
      await deleteIncome(id);
    }
    for (const id of ids.accountIds) {
      await deleteAccount(id);
    }
  }
  localStorage.removeItem(DEMO_IDS_KEY);
}
