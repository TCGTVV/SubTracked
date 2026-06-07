import { useCallback, useEffect, useState } from "react";
import { listAccounts, listSubscriptions } from "../lib/db";
import type { Account, Subscription } from "../types";

export interface UseSubscriptionsResult {
  subs: Subscription[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  reloadAll: () => Promise<void>;
  reloadAccounts: () => Promise<void>;
}

export function useSubscriptions(): UseSubscriptionsResult {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    try {
      // Bewusst alle Subs (inkl. archiviert) — App.tsx filtert per Toggle.
      // OverviewSection bekommt nur die aktiven, damit Coverage keine archivierten
      // Abos in den Forecast einrechnet.
      const [subRows, accountRows] = await Promise.all([listSubscriptions(false), listAccounts()]);
      setSubs(subRows);
      setAccounts(accountRows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  return { subs, accounts, loading, error, setError, reloadAll, reloadAccounts };
}
