import { Bell, CalendarX, FolderClock, Pencil, Plus, Save, Tag, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { addSubscription, listPriceHistory, updateSubscription } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import {
  CURRENCY_OPTIONS,
  formatAmount,
  getCurrencySubdivisor,
  isCurrencyOption,
  isStrictISODate,
  parseAmountInput,
  todayISO,
} from "../lib/format";
import { INTERVAL_OPTIONS } from "../lib/recurrence";
import type {
  Account,
  CancelMode,
  CancelUnit,
  Interval,
  PriceHistoryEntry,
  Subscription,
} from "../types";
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
  subscription: Subscription | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  amount?: string;
  currency?: string;
  anchorDate?: string;
  leadDays?: string;
  cancelPeriod?: string;
  cancelDate?: string;
  category?: string;
}

/** Sentinel für „keine Kündigung tracken" — Auswahl im Kündigungs-Select. */
const NO_CANCEL = "none";
/** Obergrenze der Kündigungsfrist, parallel zu MAX_CANCEL_PERIOD_VALUE im Rust-Backend. */
const MAX_CANCEL_PERIOD_VALUE = 730;

/** Sentinel für „kein Konto" — Radix-Select erlaubt keinen leeren Item-Wert. */
const NO_ACCOUNT = "none";

/** Sentinel für „keine Kategorie" bzw. „eigene eingeben" im Kategorie-Select. */
const NO_CATEGORY = "none";
const CUSTOM_CATEGORY = "__custom__";
/** Gängige Kategorie-Vorschläge; Freitext via „Eigene…" bleibt möglich. */
const CATEGORY_PRESETS = [
  "Streaming",
  "Versicherung",
  "Hosting/Domains",
  "Mobilfunk/Internet",
] as const;
/** Obergrenze der Kategorie-Länge, parallel zu MAX_CATEGORY_LENGTH im Rust-Backend. */
const MAX_CATEGORY_LENGTH = 60;

function PriceHistoryGraph({ entries }: { entries: PriceHistoryEntry[] }) {
  const chronological = [...entries].reverse();
  const amounts = chronological.map((entry) => entry.amountCents);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const minEntry = chronological.reduce((best, entry) =>
    entry.amountCents < best.amountCents ? entry : best,
  );
  const maxEntry = chronological.reduce((best, entry) =>
    entry.amountCents > best.amountCents ? entry : best,
  );
  const isConstant = min === max;
  const range = max - min;
  const width = 320;
  const height = 120;
  const paddingX = 18;
  const paddingY = 16;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const xStep = chronological.length > 1 ? innerWidth / (chronological.length - 1) : 0;

  const points = chronological.map((entry, index) => {
    const x = paddingX + index * xStep;
    const y = isConstant
      ? paddingY + innerHeight / 2
      : paddingY + innerHeight - ((entry.amountCents - min) / range) * innerHeight;
    return { entry, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mt-2 flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" className="w-full">
        <title>Preisverlauf</title>
        <line
          className="stroke-border"
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
        />
        <polyline className="fill-none stroke-primary stroke-2" points={line} />
        {points.map(({ entry, x, y }) => (
          <circle key={entry.id} className="fill-primary" cx={x} cy={y} r="3.5">
            <title>
              {entry.changedAt.slice(0, 10)}: {formatAmount(entry.amountCents, entry.currency)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        {isConstant ? (
          <span>Konstant: {formatAmount(min, minEntry.currency)}</span>
        ) : (
          <>
            <span>{formatAmount(min, minEntry.currency)}</span>
            <span>{formatAmount(max, maxEntry.currency)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function centsToInput(cents: number, currency: string): string {
  const divisor = getCurrencySubdivisor(currency);
  if (divisor === 1) return cents.toString();
  return (cents / divisor).toFixed(2).replace(".", ",");
}

export function SubscriptionDialog({ open, subscription, accounts, onClose, onSaved }: Props) {
  const isEdit = subscription !== null;

  const anchorId = useId();
  const nameErrorId = useId();
  const amountErrorId = useId();
  const currencyErrorId = useId();
  const anchorErrorId = useId();
  const leadErrorId = useId();
  const cancelPeriodErrorId = useId();
  const cancelDateErrorId = useId();
  const categoryErrorId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const leadRef = useRef<HTMLInputElement>(null);
  const cancelPeriodRef = useRef<HTMLInputElement>(null);
  const cancelDateRef = useRef<HTMLButtonElement>(null);
  const categoryCustomRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(
    subscription ? centsToInput(subscription.amountCents, subscription.currency) : "",
  );
  const [currency, setCurrency] = useState<string>(subscription?.currency ?? "EUR");
  const [accountId, setAccountId] = useState<number | null>(subscription?.accountId ?? null);
  const [interval, setInterval] = useState<Interval>(subscription?.interval ?? "monthly");
  const [oneTime, setOneTime] = useState(subscription?.oneTime ?? false);
  const [anchorDate, setAnchorDate] = useState(subscription?.anchorDate ?? todayISO());
  const [leadDays, setLeadDays] = useState(subscription?.leadDays ?? 60);
  const [notify, setNotify] = useState(subscription?.notify ?? true);
  const [cancelMode, setCancelMode] = useState<typeof NO_CANCEL | CancelMode>(
    subscription?.cancelMode ?? NO_CANCEL,
  );
  const [cancelPeriodValue, setCancelPeriodValue] = useState(subscription?.cancelPeriodValue ?? 3);
  const [cancelPeriodUnit, setCancelPeriodUnit] = useState<CancelUnit>(
    subscription?.cancelPeriodUnit ?? "months",
  );
  const [cancelDate, setCancelDate] = useState(subscription?.cancelDate ?? todayISO());
  const initialCategory = subscription?.category ?? null;
  const initialCategoryIsPreset =
    initialCategory !== null && (CATEGORY_PRESETS as readonly string[]).includes(initialCategory);
  const [categorySelect, setCategorySelect] = useState<string>(
    initialCategory === null
      ? NO_CATEGORY
      : initialCategoryIsPreset
        ? initialCategory
        : CUSTOM_CATEGORY,
  );
  const [categoryCustom, setCategoryCustom] = useState<string>(
    initialCategory !== null && !initialCategoryIsPreset ? initialCategory : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    if (!isEdit || !subscription) {
      setPriceHistory([]);
      return;
    }
    listPriceHistory(subscription.id)
      .then(setPriceHistory)
      .catch(() => {});
  }, [isEdit, subscription]);

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

    if (!isCurrencyOption(currency)) {
      next.currency = "Bitte eine erlaubte Währung wählen.";
    }

    if (!isStrictISODate(anchorDate)) {
      next.anchorDate = "Erste Fälligkeit muss ein gültiges Datum im Format YYYY-MM-DD sein.";
    }

    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) {
      next.leadDays = "Vorlauf muss zwischen 0 und 365 Tagen liegen.";
    }

    if (cancelMode === "period") {
      if (
        !Number.isInteger(cancelPeriodValue) ||
        cancelPeriodValue < 1 ||
        cancelPeriodValue > MAX_CANCEL_PERIOD_VALUE
      ) {
        next.cancelPeriod = `Kündigungsfrist muss zwischen 1 und ${MAX_CANCEL_PERIOD_VALUE} liegen.`;
      }
    } else if (cancelMode === "date" && !isStrictISODate(cancelDate)) {
      next.cancelDate = "Kündigungsdatum muss ein gültiges Datum im Format YYYY-MM-DD sein.";
    }

    if (categorySelect === CUSTOM_CATEGORY && categoryCustom.trim().length > MAX_CATEGORY_LENGTH) {
      next.category = `Kategorie darf höchstens ${MAX_CATEGORY_LENGTH} Zeichen lang sein.`;
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
      else if (validation.currency) currencyRef.current?.focus();
      else if (validation.anchorDate) anchorRef.current?.focus();
      else if (validation.leadDays) leadRef.current?.focus();
      else if (validation.cancelPeriod) cancelPeriodRef.current?.focus();
      else if (validation.cancelDate) cancelDateRef.current?.focus();
      else if (validation.category) categoryCustomRef.current?.focus();
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
        oneTime,
        anchorDate,
        leadDays,
        notify,
        cancelMode: cancelMode === NO_CANCEL ? null : cancelMode,
        cancelPeriodValue: cancelMode === "period" ? cancelPeriodValue : null,
        cancelPeriodUnit: cancelMode === "period" ? cancelPeriodUnit : null,
        cancelDate: cancelMode === "date" ? cancelDate : null,
        category:
          categorySelect === NO_CATEGORY
            ? null
            : categorySelect === CUSTOM_CATEGORY
              ? categoryCustom.trim() || null
              : categorySelect,
      };
      if (isEdit && subscription) {
        await updateSubscription({
          ...payload,
          id: subscription.id,
          active: subscription.active,
          archivedAt: subscription.archivedAt,
        });
      } else {
        await addSubscription(payload);
      }
      onSaved();
    } catch (err) {
      setError(toUserMessage(err, "Abo speichern"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fluid-lg">
              {isEdit ? (
                <Pencil className="size-5 text-primary" />
              ) : (
                <Plus className="size-5 text-primary" />
              )}
              {isEdit ? "Abo bearbeiten" : "Neues Abo"}
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
                required
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? nameErrorId : undefined}
              />
              {errors.name && (
                <p id={nameErrorId} className="text-sm text-destructive" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-4">
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
                  autoComplete="off"
                  required
                  aria-invalid={!!errors.amount}
                  aria-describedby={errors.amount ? amountErrorId : undefined}
                />
                {errors.amount && (
                  <p id={amountErrorId} className="text-sm text-destructive" role="alert">
                    {errors.amount}
                  </p>
                )}
              </div>
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
                {errors.currency && (
                  <p id={currencyErrorId} className="text-sm text-destructive" role="alert">
                    {errors.currency}
                  </p>
                )}
              </div>
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${anchorId}-category`} className="flex items-center gap-1.5">
                <Tag className="size-4 text-muted-foreground" />
                Kategorie
              </Label>
              <Select
                value={categorySelect}
                onValueChange={(v) => {
                  setCategorySelect(v);
                  clearFieldError("category");
                }}
              >
                <SelectTrigger id={`${anchorId}-category`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Keine Kategorie</SelectItem>
                  {CATEGORY_PRESETS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_CATEGORY}>Eigene…</SelectItem>
                </SelectContent>
              </Select>
              {categorySelect === CUSTOM_CATEGORY && (
                <Input
                  ref={categoryCustomRef}
                  value={categoryCustom}
                  onChange={(e) => {
                    setCategoryCustom(e.target.value);
                    clearFieldError("category");
                  }}
                  placeholder="z.B. Fitness"
                  autoComplete="off"
                  aria-invalid={!!errors.category}
                  aria-describedby={errors.category ? categoryErrorId : undefined}
                />
              )}
              {errors.category && (
                <p id={categoryErrorId} className="text-sm text-destructive" role="alert">
                  {errors.category}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id={`${anchorId}-onetime`}
                checked={oneTime}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setOneTime(on);
                  if (on) {
                    setInterval("monthly");
                    setCancelMode(NO_CANCEL);
                    clearFieldError("cancelPeriod");
                    clearFieldError("cancelDate");
                  }
                }}
              />
              <Label htmlFor={`${anchorId}-onetime`} className="font-medium">
                Einmalige Ausgabe
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
                    {INTERVAL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={anchorId}>{oneTime ? "Datum" : "Erste Fälligkeit"}</Label>
                <DateField
                  id={anchorId}
                  buttonRef={anchorRef}
                  value={anchorDate}
                  onChange={(value) => {
                    setAnchorDate(value);
                    clearFieldError("anchorDate");
                  }}
                  ariaInvalid={errors.anchorDate ? true : undefined}
                  ariaDescribedBy={errors.anchorDate ? anchorErrorId : undefined}
                />
                {errors.anchorDate && (
                  <p id={anchorErrorId} className="text-sm text-destructive" role="alert">
                    {errors.anchorDate}
                  </p>
                )}
              </div>
              <div className="flex w-24 flex-col gap-1.5">
                <Label htmlFor={`${anchorId}-lead`}>Vorlauf (Tage)</Label>
                <Input
                  id={`${anchorId}-lead`}
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
                  aria-invalid={!!errors.leadDays}
                  aria-describedby={errors.leadDays ? leadErrorId : undefined}
                />
                {errors.leadDays && (
                  <p id={leadErrorId} className="text-sm text-destructive" role="alert">
                    {errors.leadDays}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id={`${anchorId}-notify`}
                checked={notify}
                onCheckedChange={(checked) => setNotify(checked === true)}
              />
              <Label
                htmlFor={`${anchorId}-notify`}
                className="flex items-center gap-1.5 font-medium"
              >
                <Bell className="size-4 text-muted-foreground" />
                Erinnerungen für dieses Abo
              </Label>
            </div>

            {!oneTime && (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`${anchorId}-cancel-mode`}
                    className="flex items-center gap-1.5 font-medium"
                  >
                    <CalendarX className="size-4 text-muted-foreground" />
                    Kündigung
                  </Label>
                  <Select
                    value={cancelMode}
                    onValueChange={(v) => {
                      setCancelMode(v as typeof NO_CANCEL | CancelMode);
                      clearFieldError("cancelPeriod");
                      clearFieldError("cancelDate");
                    }}
                  >
                    <SelectTrigger id={`${anchorId}-cancel-mode`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CANCEL}>Keine Kündigung tracken</SelectItem>
                      <SelectItem value="period">Kündigungsfrist (vor Fälligkeit)</SelectItem>
                      <SelectItem value="date">Festes Kündigungsdatum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {cancelMode === "period" && (
                  <div className="grid grid-cols-[6rem_1fr] gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${anchorId}-cancel-value`}>Frist</Label>
                      <Input
                        id={`${anchorId}-cancel-value`}
                        ref={cancelPeriodRef}
                        type="number"
                        min={1}
                        max={MAX_CANCEL_PERIOD_VALUE}
                        step={1}
                        value={cancelPeriodValue}
                        onChange={(e) => {
                          setCancelPeriodValue(Number(e.target.value));
                          clearFieldError("cancelPeriod");
                        }}
                        aria-invalid={!!errors.cancelPeriod}
                        aria-describedby={errors.cancelPeriod ? cancelPeriodErrorId : undefined}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${anchorId}-cancel-unit`}>Einheit</Label>
                      <Select
                        value={cancelPeriodUnit}
                        onValueChange={(v) => setCancelPeriodUnit(v as CancelUnit)}
                      >
                        <SelectTrigger id={`${anchorId}-cancel-unit`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">Tage</SelectItem>
                          <SelectItem value="weeks">Wochen</SelectItem>
                          <SelectItem value="months">Monate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {errors.cancelPeriod && (
                      <p
                        id={cancelPeriodErrorId}
                        className="col-span-2 text-sm text-destructive"
                        role="alert"
                      >
                        {errors.cancelPeriod}
                      </p>
                    )}
                  </div>
                )}

                {cancelMode === "date" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${anchorId}-cancel-date`}>Kündigen bis</Label>
                    <DateField
                      id={`${anchorId}-cancel-date`}
                      buttonRef={cancelDateRef}
                      value={cancelDate}
                      onChange={(value) => {
                        setCancelDate(value);
                        clearFieldError("cancelDate");
                      }}
                      ariaInvalid={errors.cancelDate ? true : undefined}
                      ariaDescribedBy={errors.cancelDate ? cancelDateErrorId : undefined}
                    />
                    {errors.cancelDate && (
                      <p id={cancelDateErrorId} className="text-sm text-destructive" role="alert">
                        {errors.cancelDate}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {cancelMode === "period"
                    ? "Die App berechnet das Kündigungsdatum automatisch aus der nächsten Fälligkeit minus Frist."
                    : cancelMode === "date"
                      ? "Fester Stichtag, bis zu dem gekündigt werden muss."
                      : "Optional: Frist oder Stichtag tracken, um eine Kündigung nicht zu verpassen."}
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>Fehler beim Speichern: {error}</AlertDescription>
              </Alert>
            )}

            {isEdit && priceHistory.length > 1 && (
              <details className="rounded-lg border bg-muted/30 p-3 text-sm">
                <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                  <FolderClock className="size-4 text-muted-foreground" />
                  Preis-Historie ({priceHistory.length} Einträge)
                </summary>
                <PriceHistoryGraph entries={priceHistory} />
                <ul className="mt-2 flex flex-col gap-1">
                  {priceHistory.map((entry, i) => (
                    <li key={entry.id} className="flex justify-between gap-2 tabular-nums">
                      <span className="font-medium">
                        {formatAmount(entry.amountCents, entry.currency)}
                      </span>
                      <span className="text-muted-foreground">
                        {entry.changedAt.slice(0, 10)}
                        {i === 0 && <span className="text-success"> (aktuell)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              <X />
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              <Save />
              {submitting ? "Speichere …" : isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
