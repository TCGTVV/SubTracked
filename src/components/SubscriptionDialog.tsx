import { type FormEvent, type Ref, useId, useState } from "react";
import { addSubscription, updateSubscription } from "../lib/db";
import { CURRENCY_OPTIONS, getCurrencySubdivisor, parseAmountInput, todayISO } from "../lib/format";
import type { Account, Interval, Subscription } from "../types";
import { DateField } from "./DateField";

const INTERVAL_OPTIONS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "yearly", label: "Jährlich" },
];

interface Props {
  ref: Ref<HTMLDialogElement>;
  subscription: Subscription | null;
  accounts: Account[];
  onSaved: () => void;
}

function centsToInput(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  if (divisor === 1) return cents.toString();
  return (cents / divisor).toFixed(2).replace(".", ",");
}

export function SubscriptionDialog({ ref, subscription, accounts, onSaved }: Props) {
  const isEdit = subscription !== null;

  const nameId = useId();
  const amountId = useId();
  const currencyId = useId();
  const accountIdId = useId();
  const intervalId = useId();
  const anchorId = useId();
  const leadId = useId();

  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(
    subscription ? centsToInput(subscription.amountCents, subscription.currency) : "",
  );
  const [currency, setCurrency] = useState<string>(subscription?.currency ?? "EUR");
  const [accountId, setAccountId] = useState<number | null>(subscription?.accountId ?? null);
  const [interval, setInterval] = useState<Interval>(subscription?.interval ?? "monthly");
  const [anchorDate, setAnchorDate] = useState(subscription?.anchorDate ?? todayISO());
  const [leadDays, setLeadDays] = useState(subscription?.leadDays ?? 60);
  const [notify, setNotify] = useState(subscription?.notify ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    const amountNumber = parseAmountInput(amount);
    if (!trimmedName || amountNumber === null || amountNumber <= 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: trimmedName,
        amountCents: Math.round(amountNumber * getCurrencySubdivisor(currency)),
        currency,
        accountId,
        interval,
        anchorDate,
        leadDays,
        notify,
      };
      if (isEdit && subscription) {
        await updateSubscription({
          ...payload,
          id: subscription.id,
          active: subscription.active,
        });
      } else {
        await addSubscription(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog">
      <form onSubmit={handleSubmit} className="form" noValidate>
        <h2>{isEdit ? "Abo bearbeiten" : "Neues Abo"}</h2>

        <div className="field">
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={amountId}>Betrag</label>
            <input
              id={amountId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="field field-narrow">
            <label htmlFor={currencyId}>Währung</label>
            <select id={currencyId} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor={accountIdId}>Konto</label>
          <select
            id={accountIdId}
            value={accountId === null ? "" : String(accountId)}
            onChange={(e) => setAccountId(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">(kein Konto)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={intervalId}>Intervall</label>
          <select
            id={intervalId}
            value={interval}
            onChange={(e) => setInterval(e.target.value as Interval)}
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={anchorId}>Erste Fälligkeit</label>
            <DateField id={anchorId} value={anchorDate} onChange={setAnchorDate} />
          </div>
          <div className="field field-narrow">
            <label htmlFor={leadId}>Vorlauf (Tage)</label>
            <input
              id={leadId}
              type="number"
              min={0}
              max={365}
              step={1}
              value={leadDays}
              onChange={(e) => setLeadDays(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="field">
          <label className="setting-label">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>Erinnerungen für dieses Abo</span>
          </label>
        </div>

        {error && (
          <p className="error" role="alert">
            Fehler beim Speichern: {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
            Abbrechen
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Speichere …" : isEdit ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
