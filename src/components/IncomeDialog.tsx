import { Pencil, Save, Wallet, X } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { addIncome, updateIncome } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import {
  CURRENCY_OPTIONS,
  getCurrencySubdivisor,
  isCurrencyOption,
  isStrictISODate,
  parseAmountInput,
  todayISO,
} from "../lib/format";
import { INTERVAL_OPTIONS } from "../lib/recurrence";
import type { Account, Income, Interval } from "../types";
import { DateField } from "./DateField";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  open: boolean;
  income: Income | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  amount?: string;
  currency?: string;
  anchorDate?: string;
}

/** Sentinel für „kein Konto" — Radix-Select erlaubt keinen leeren Item-Wert. */
const NO_ACCOUNT = "none";

function centsToInput(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  if (divisor === 1) return cents.toString();
  return (cents / divisor).toFixed(2).replace(".", ",");
}

export function IncomeDialog({ open, income, accounts, onClose, onSaved }: Props) {
  const isEdit = income !== null;

  const anchorId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState(
    income ? centsToInput(income.amountCents, income.currency) : "",
  );
  const [currency, setCurrency] = useState<string>(income?.currency ?? "EUR");
  const [accountId, setAccountId] = useState<number | null>(income?.accountId ?? null);
  const [oneTime, setOneTime] = useState(income?.oneTime ?? false);
  const [interval, setInterval] = useState<Interval>(
    income?.oneTime ? "monthly" : (income?.interval ?? "monthly"),
  );
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
      setError(toUserMessage(e, "Einnahme speichern"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fluid-lg">
              {isEdit ? (
                <Pencil className="size-5 text-primary" />
              ) : (
                <Wallet className="size-5 text-primary" />
              )}
              {isEdit ? "Einnahme bearbeiten" : "Neue Einnahme"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${anchorId}-name`}>Name</Label>
              <Input
                id={`${anchorId}-name`}
                ref={nameRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError("name");
                }}
                aria-invalid={!!errors.name}
                required
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${anchorId}-amount`}>Betrag</Label>
              <Input
                id={`${anchorId}-amount`}
                ref={amountRef}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clearFieldError("amount");
                }}
                inputMode="decimal"
                aria-invalid={!!errors.amount}
              />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${anchorId}-currency`}>Währung</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => {
                    setCurrency(v);
                    clearFieldError("currency");
                  }}
                >
                  <SelectTrigger
                    id={`${anchorId}-currency`}
                    ref={currencyRef}
                    aria-invalid={!!errors.currency}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.currency && <p className="text-sm text-destructive">{errors.currency}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${anchorId}-account`}>Konto</Label>
                <Select
                  value={accountId === null ? NO_ACCOUNT : String(accountId)}
                  onValueChange={(v) => setAccountId(v === NO_ACCOUNT ? null : Number(v))}
                >
                  <SelectTrigger id={`${anchorId}-account`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>(kein Konto)</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id={`${anchorId}-onetime`}
                checked={oneTime}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setOneTime(on);
                  if (on) setInterval("monthly");
                }}
              />
              <Label htmlFor={`${anchorId}-onetime`} className="font-medium">
                Einmalige Einnahme
              </Label>
            </div>

            {!oneTime && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${anchorId}-interval`}>Intervall</Label>
                <Select value={interval} onValueChange={(v) => setInterval(v as Interval)}>
                  <SelectTrigger id={`${anchorId}-interval`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={anchorId}>{oneTime ? "Datum" : "Erste / nächste Fälligkeit"}</Label>
              <DateField
                id={anchorId}
                buttonRef={anchorRef}
                value={anchorDate}
                onChange={(v) => {
                  setAnchorDate(v);
                  clearFieldError("anchorDate");
                }}
                ariaInvalid={!!errors.anchorDate}
                ariaDescribedBy={errors.anchorDate ? `${anchorId}-error` : undefined}
              />
              {errors.anchorDate && (
                <p id={`${anchorId}-error`} className="text-sm text-destructive">
                  {errors.anchorDate}
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              <X />
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              <Save />
              {submitting ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
