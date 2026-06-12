import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { type FormEvent, useId, useRef, useState } from "react";
import { addIncome, updateIncome } from "../lib/db";
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
  const currencyRef = useRef<HTMLInputElement>(null);
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DialogTitle>{isEdit ? "Einnahme bearbeiten" : "Neue Einnahme"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              inputRef={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError("name");
              }}
              error={!!errors.name}
              helperText={errors.name}
              required
              fullWidth
            />

            <TextField
              label="Betrag"
              inputRef={amountRef}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                clearFieldError("amount");
              }}
              error={!!errors.amount}
              helperText={errors.amount}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              fullWidth
            />

            <FormControl fullWidth error={!!errors.currency}>
              <InputLabel id={`${anchorId}-currency-label`}>Währung</InputLabel>
              <Select
                labelId={`${anchorId}-currency-label`}
                label="Währung"
                inputRef={currencyRef}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  clearFieldError("currency");
                }}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
              {errors.currency && <FormHelperText>{errors.currency}</FormHelperText>}
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id={`${anchorId}-account-label`}>Konto</InputLabel>
              <Select
                labelId={`${anchorId}-account-label`}
                label="Konto"
                value={accountId === null ? "" : String(accountId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccountId(v === "" ? null : Number(v));
                }}
                displayEmpty
              >
                <MenuItem value="">(kein Konto)</MenuItem>
                {accounts.map((a) => (
                  <MenuItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Checkbox
                  checked={oneTime}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOneTime(checked);
                    if (checked) setInterval("monthly");
                  }}
                />
              }
              label="Einmalige Einnahme"
            />

            <FormControl fullWidth disabled={oneTime}>
              <InputLabel id={`${anchorId}-interval-label`}>Intervall</InputLabel>
              <Select
                labelId={`${anchorId}-interval-label`}
                label="Intervall"
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth error={!!errors.anchorDate}>
              <FormLabel htmlFor={anchorId} sx={{ mb: 0.5 }}>
                {oneTime ? "Datum" : "Erste / nächste Fälligkeit"}
              </FormLabel>
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
                <FormHelperText id={`${anchorId}-error`}>{errors.anchorDate}</FormHelperText>
              )}
            </FormControl>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Speichern …" : "Speichern"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
