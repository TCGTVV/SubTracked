import { useEffect } from "react";
import { runReminderCheck } from "../lib/reminders";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Tickt `runReminderCheck` einmal beim Mount und danach im Intervall.
 *
 * Hinweis: Da das Intervall im Webview läuft, pausiert es bei minimiertem
 * Fenster / System-Suspend. Das ist ein bekanntes Limit; geplant ist die
 * Verlagerung in den Rust-Hauptprozess (Backlog 🏛️ Architektur ➋).
 */
export function useReminderLoop(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  useEffect(() => {
    const tick = () => {
      void runReminderCheck().catch((e) => {
        console.error("runReminderCheck fehlgeschlagen:", e);
      });
    };
    tick();
    const handle = setInterval(tick, intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);
}
