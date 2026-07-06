import { useCallback, useEffect, useState } from "react";
import { listAccounts, listIncomes, listSubscriptions } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import type { Account, Income, Subscription } from "../types";

export interface UseSubscriptionsResult {
  subs: Subscription[];
  accounts: Account[];
  incomes: Income[];
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  reloadAll: () => Promise<void>;
  reloadAccounts: () => Promise<void>;
}

export function useSubscriptions(): UseSubscriptionsResult {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    try {
      // Bewusst alle Subs (inkl. archiviert) — App.tsx filtert per Toggle.
      // OverviewSection bekommt nur die aktiven, damit Coverage keine archivierten
      // Abos in den Forecast einrechnet.
      const [subRows, accountRows, incomeRows] = await Promise.all([
        listSubscriptions(false),
        listAccounts(),
        listIncomes(false),
      ]);
      setSubs(subRows);
      setAccounts(accountRows);
      setIncomes(incomeRows);
      setError(null);
    } catch (e) {
      setError(toUserMessage(e, "Daten laden"));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
    } catch (e) {
      setError(toUserMessage(e, "Konten laden"));
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  return { subs, accounts, incomes, loading, error, setError, reloadAll, reloadAccounts };
}
