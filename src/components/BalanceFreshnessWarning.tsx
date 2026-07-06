import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { confirmAccountBalance } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { daysSince } from "../lib/format";
import type { Account } from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

/** Ab so vielen Tagen ohne Saldo-Update gilt der Forecast als unsicher. */
export const STALE_BALANCE_DAYS = 14;

interface Props {
  accounts: Account[];
  /** Öffnet den Konten-Dialog zum Ändern des Saldos. */
  onOpenAccounts: () => void;
  /** Wird nach erfolgreichem Bestätigen aufgerufen, damit App die Konten neu lädt. */
  onChanged: () => void | Promise<void>;
}

/**
 * Prominente Warnung, wenn Konto-Salden länger nicht gepflegt wurden — der Forecast
 * rechnet dann mit Scheinsicherheit. „Stimmt noch" bestätigt den Saldo ohne Änderung
 * (setzt nur den Zeitstempel), „Saldo aktualisieren" öffnet den Konten-Dialog.
 */
export function BalanceFreshnessWarning({ accounts, onOpenAccounts, onChanged }: Props) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stale = accounts
    .map((account) => ({ account, days: daysSince(account.balanceUpdatedAt) }))
    .filter((e): e is { account: Account; days: number } => (e.days ?? 0) >= STALE_BALANCE_DAYS)
    .sort((a, b) => b.days - a.days);

  if (stale.length === 0) return null;

  async function handleConfirm(id: number) {
    setPendingId(id);
    setError(null);
    try {
      await confirmAccountBalance(id);
      await onChanged();
    } catch (e) {
      setError(toUserMessage(e, "Saldo bestätigen"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 shrink-0 text-warning" />
        <p className="text-sm font-medium">
          Forecast unsicher:{" "}
          {stale.length === 1
            ? "ein Kontostand ist nicht mehr aktuell."
            : `${stale.length} Kontostände sind nicht mehr aktuell.`}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {stale.map(({ account, days }) => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              <strong>{account.name}</strong>
              <span className="text-muted-foreground">
                {" — "}Saldo seit {days === 1 ? "1 Tag" : `${days} Tagen`} nicht aktualisiert
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendingId !== null}
              onClick={() => void handleConfirm(account.id)}
              aria-label={`Saldo von ${account.name} bestätigen`}
            >
              {pendingId === account.id ? "Bestätige …" : "Stimmt noch"}
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Fehler: {error}</AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={onOpenAccounts}>
          Saldo aktualisieren
        </Button>
      </div>
    </div>
  );
}
