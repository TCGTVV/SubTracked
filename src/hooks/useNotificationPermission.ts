import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { useEffect, useState } from "react";
import type { NotificationStatus } from "../components/NotificationPermissionBanner";

export interface UseNotificationPermissionResult {
  status: NotificationStatus;
  activate: () => Promise<void>;
}

export function useNotificationPermission(): UseNotificationPermissionResult {
  const [status, setStatus] = useState<NotificationStatus>("loading");

  useEffect(() => {
    void (async () => {
      try {
        const granted = await isPermissionGranted();
        setStatus(granted ? "granted" : "default");
      } catch (e) {
        console.error("isPermissionGranted fehlgeschlagen:", e);
        setStatus("default");
      }
    })();
  }, []);

  async function activate() {
    try {
      const result = await requestPermission();
      setStatus(result === "granted" ? "granted" : result === "denied" ? "denied" : "default");
    } catch (e) {
      console.error("requestPermission fehlgeschlagen:", e);
    }
  }

  return { status, activate };
}
