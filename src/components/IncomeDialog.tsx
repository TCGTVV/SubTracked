import { type FormEvent, type Ref, useId, useRef, useState } from "react";
import { addIncome, updateIncome } from "../lib/db";
import { closeDialogOnBackdropClick } from "../lib/dialog";
import {
  CURRENCY_OPTIONS,
  getCurrencySubdivisor,
  isCurrencyOption,
  isStrictISODate,
  parseAmountInput,
  todayISO,
} from "../lib/format";
import type { Account, Income, Interval } from "../types";
import { DateField } from "./DateField";

const INTERVAL_OPTIONS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "monthly", label: "Monatlich" },
  { value: "biweekly", label: "Zweiwöchentlich" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "yearly", label: "Jährlich" },
];

interface Props {
  ref: Ref<HTMLDialogElement>;
  income: Income | null;
  accounts: Account[];
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  amount?: string;
  currency?: string;
  anchorDate?: string;
}

function centsToInput(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  if (divisor === 1) return cents.toString();
  return (cents / divisor).toFixed(2).replace(".", ",");
}

export function IncomeDialog({ ref, income, accounts, onSaved }: Props) {
  const isEdit = income !== null;

  const nameId = useId();
  const amountId = useId();
  const currencyId = useId();
  const accountIdId = useId();
  const oneTimeId = useId();
  const intervalId = useId();
  const anchorId = useId();
  const nameErrorId = useId();
  const amountErrorId = useId();
  const currencyErrorId = useId();
  const anchorErrorId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLSelectElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState(
    income ? centsToInput(income.amountCents, income.currency) : "",
  );
  const [currency, setCurrency] = useState<string>(income?.currency ?? "EUR");
  const [accountId, setAccountId] = useState<number | null>(income?.accountId ?? null);
  const [oneTime, setOneTime] = useState(income?.oneTime ?? false);
  const [interval, setInterval] = useState<Interval>(income?.interval ?? "monthly");
  const [anchorDate, setAnchorDate] = useState(income?.anchorDate ?? todayISO());
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

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Name darf nicht leer sein.";
    const parsed = parseAmountInput(amount);
    if (parsed === null || parsed <= 0) next.amount = "Bitte einen gültigen Betrag eingeben.";
    if (!isCurrencyOption(currency)) next.currency = "Unbekannte Währung.";
    if (!isStrictISODate(anchorDate)) next.anchorDate = "Datum im Format TT.MM.JJJJ eingeben.";
    setErrors(next);
    if (next.name) nameRef.current?.focus();
    else if (next.amount) amountRef.current?.focus();
    else if (next.currency) currencyRef.current?.focus();
    else if (next.anchorDate) anchorRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const divisor = getCurrencySubdivisor(currency);
      const amountCents = Math.round((parseAmountInput(amount) ?? 0) * divisor);
      if (isEdit) {
        await updateIncome({
          ...income,
          name: name.trim(),
          amountCents,
          currency,
          accountId,
          oneTime,
          interval,
          anchorDate,
        });
      } else {
        await addIncome({
          name: name.trim(),
          amountCents,
          currency,
          accountId,
          oneTime,
          interval,
          anchorDate,
          active: true,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: nativer <dialog> schliesst per Escape; onClick ergaenzt nur den Backdrop-Klick
    <dialog ref={ref} className="dialog" onClick={closeDialogOnBackdropClick}>
      <form onSubmit={(e) => void handleSubmit(e)} className="form" noValidate>
        <h2>{isEdit ? "Einnahme bearbeiten" : "Neue Einnahme"}</h2>

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
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? nameErrorId : undefined}
            required
          />
          {errors.name && (
            <span id={nameErrorId} className="field-error" role="alert">
              {errors.name}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={amountId}>Betrag</label>
          <input
            id={amountId}
            ref={amountRef}
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              clearFieldError("amount");
            }}
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? amountErrorId : undefined}
          />
          {errors.amount && (
            <span id={amountErrorId} className="field-error" role="alert">
              {errors.amount}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={currencyId}>Währung</label>
          <select
            id={currencyId}
            ref={currencyRef}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              clearFieldError("currency");
            }}
            aria-invalid={!!errors.currency}
            aria-describedby={errors.currency ? currencyErrorId : undefined}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errors.currency && (
            <span id={currencyErrorId} className="field-error" role="alert">
              {errors.currency}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={accountIdId}>Konto</label>
          <select
            id={accountIdId}
            value={accountId ?? ""}
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
          <label className="setting-label" htmlFor={oneTimeId}>
            <input
              id={oneTimeId}
              type="checkbox"
              checked={oneTime}
              onChange={(e) => setOneTime(e.target.checked)}
            />
            <span>Einmalige Einnahme</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor={intervalId}>Intervall</label>
          <select
            id={intervalId}
            value={interval}
            onChange={(e) => setInterval(e.target.value as Interval)}
            disabled={oneTime}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={anchorId}>{oneTime ? "Datum" : "Erste / nächste Fälligkeit"}</label>
          <DateField
            id={anchorId}
            buttonRef={anchorRef}
            value={anchorDate}
            onChange={(v) => {
              setAnchorDate(v);
              clearFieldError("anchorDate");
            }}
            ariaInvalid={!!errors.anchorDate}
            ariaDescribedBy={errors.anchorDate ? anchorErrorId : undefined}
          />
          {errors.anchorDate && (
            <span id={anchorErrorId} className="field-error" role="alert">
              {errors.anchorDate}
            </span>
          )}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
            Abbrechen
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Speichern …" : "Speichern"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
