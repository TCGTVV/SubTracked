import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { format, isBefore, startOfDay, subDays } from "date-fns";
import { insertReminderIfNew, listSubscriptions } from "./db";
import { nextDueDate } from "./recurrence";

/**
 * Prüft alle aktiven Abos und sendet native Benachrichtigungen für Fälligkeiten,
 * die im Vorlauf-Fenster liegen (heute >= Fälligkeit - leadDays).
 * Pro Fälligkeit nur einmal (Idempotenz über die reminders-Tabelle).
 *
 * Beim App-Start und danach in Intervallen aufrufen (siehe App-Komponente).
 * Permission anfragen ist Sache der UI; ohne Permission entfällt nur das Senden,
 * der DB-Eintrag passiert weiterhin (Idempotenz bleibt erhalten).
 */
export async function runReminderCheck(): Promise<number> {
  const granted = await isPermissionGranted();

  const today = startOfDay(new Date());
  const subs = await listSubscriptions(true);
  let sent = 0;

  for (const sub of subs) {
    if (!sub.notify) continue; // User hat dieses Abo stummgeschaltet — auch keinen DB-Eintrag, damit beim Wieder-Aktivieren in derselben Periode noch eine Notification kommt
    const due = nextDueDate(new Date(sub.anchorDate), sub.interval, today);
    const remindFrom = subDays(due, sub.leadDays);
    if (isBefore(today, remindFrom)) continue; // noch nicht im Fenster

    const dueStr = format(due, "yyyy-MM-dd");
    const isNew = await insertReminderIfNew(sub.id, dueStr);
    if (!isNew) continue; // bereits benachrichtigt

    if (granted) {
      const amount = (sub.amountCents / 100).toFixed(2);
      sendNotification({
        title: `${sub.name} fällig`,
        body: `${format(due, "dd.MM.yyyy")}: ${amount} ${sub.currency}. Konto rechtzeitig decken.`,
      });
    }
    sent += 1;
  }
  return sent;
}
