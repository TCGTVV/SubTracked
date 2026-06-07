import { type FormEvent, type Ref, useId, useRef, useState } from "react";
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

interface FieldErrors {
  name?: string;
  amount?: string;
  leadDays?: string;
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
  const nameErrorId = useId();
  const amountErrorId = useId();
  const leadErrorId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const leadRef = useRef<HTMLInputElement>(null);

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
  const [errors, setErrors] = useState<FieldErrors>({});

  function clearFieldError(field: keyof FieldErrors) {
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): { errors: FieldErrors; amountNumber: number | null } {
    const next: FieldErrors = {};
    if (name.trim() === "") next.name = "Bitte Namen eingeben.";

    let amountNumber: number | null = null;
    if (amount.trim() === "") {
      next.amount = "Bitte Betrag eingeben.";
    } else {
      amountNumber = parseAmountInput(amount);
      if (amountNumber === null) {
        next.amount = "Betrag ungültig — bitte Zahl eingeben (z.B. 17,99).";
      } else if (amountNumber <= 0) {
        next.amount = "Betrag muss größer als 0 sein.";
      }
    }

    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) {
      next.leadDays = "Vorlauf muss zwischen 0 und 365 Tagen liegen.";
    }

    return { errors: next, amountNumber };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { errors: validation, amountNumber } = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      // Fokus auf erstes fehlerhaftes Feld in DOM-Reihenfolge.
      if (validation.name) nameRef.current?.focus();
      else if (validation.amount) amountRef.current?.focus();
      else if (validation.leadDays) leadRef.current?.focus();
      return;
    }

    setErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        // amountNumber kann hier nicht null sein — validate() hätte sonst einen Fehler gemeldet.
        amountCents: Math.round((amountNumber as number) * getCurrencySubdivisor(currency)),
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
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError("name");
            }}
            required
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
          />
          {errors.name && (
            <span id={nameErrorId} className="field-error" role="alert">
              {errors.name}
            </span>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={amountId}>Betrag</label>
            <input
              id={amountId}
              ref={amountRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                clearFieldError("amount");
              }}
              required
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? amountErrorId : undefined}
            />
            {errors.amount && (
              <span id={amountErrorId} className="field-error" role="alert">
                {errors.amount}
              </span>
            )}
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
              ref={leadRef}
              type="number"
              min={0}
              max={365}
              step={1}
              value={leadDays}
              onChange={(e) => {
                setLeadDays(Number(e.target.value));
                clearFieldError("leadDays");
              }}
              required
              aria-invalid={errors.leadDays ? true : undefined}
              aria-describedby={errors.leadDays ? leadErrorId : undefined}
            />
            {errors.leadDays && (
              <span id={leadErrorId} className="field-error" role="alert">
                {errors.leadDays}
              </span>
            )}
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
