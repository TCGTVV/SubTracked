import { useId, useState, type FormEvent, type Ref } from "react";
import { addSubscription, updateSubscription } from "../lib/db";
import { todayISO } from "../lib/format";
import type { Interval, Subscription } from "../types";
import { DateField } from "./DateField";

const INTERVAL_OPTIONS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "yearly", label: "Jährlich" },
];

const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF"] as const;

interface Props {
  ref: Ref<HTMLDialogElement>;
  subscription: Subscription | null;
  onSaved: () => void;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function SubscriptionDialog({ ref, subscription, onSaved }: Props) {
  const isEdit = subscription !== null;

  const nameId = useId();
  const amountId = useId();
  const currencyId = useId();
  const intervalId = useId();
  const anchorId = useId();
  const leadId = useId();

  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(
    subscription ? centsToInput(subscription.amountCents) : "",
  );
  const [currency, setCurrency] = useState<string>(subscription?.currency ?? "EUR");
  const [interval, setInterval] = useState<Interval>(subscription?.interval ?? "monthly");
  const [anchorDate, setAnchorDate] = useState(subscription?.anchorDate ?? todayISO());
  const [leadDays, setLeadDays] = useState(subscription?.leadDays ?? 60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    const amountNumber = Number(amount);
    if (!trimmedName || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: trimmedName,
        amountCents: Math.round(amountNumber * 100),
        currency,
        interval,
        anchorDate,
        leadDays,
      };
      if (isEdit && subscription) {
        await updateSubscription({
          ...payload,
          id: subscription.id,
          accountId: subscription.accountId,
          active: subscription.active,
        });
      } else {
        await addSubscription({ ...payload, accountId: null });
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
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="field field-narrow">
            <label htmlFor={currencyId}>Währung</label>
            <select
              id={currencyId}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor={intervalId}>Intervall</label>
          <select
            id={intervalId}
            value={interval}
            onChange={(e) => setInterval(e.target.value as Interval)}
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={anchorId}>Erste Fälligkeit</label>
            <DateField
              id={anchorId}
              value={anchorDate}
              onChange={setAnchorDate}
              required
            />
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

        {error && (
          <p className="error" role="alert">Fehler beim Speichern: {error}</p>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={(e) => e.currentTarget.closest("dialog")?.close()}
          >
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
