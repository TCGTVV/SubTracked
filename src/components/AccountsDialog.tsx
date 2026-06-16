import { Pencil, Trash2, Wallet } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { addAccount, countSubsForAccount, deleteAccount, updateAccount } from "../lib/db";
import {
  CURRENCY_OPTIONS,
  daysSince,
  formatAmount,
  getCurrencySubdivisor,
  isCurrencyOption,
  parseSignedAmountInput,
} from "../lib/format";
import type { Account } from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  open: boolean;
  accounts: Account[];
  onChanged: () => void;
  onClose: () => void;
}

interface FormState {
  name: string;
  note: string;
  currency: string;
  balance: string;
  buffer: string;
}

interface FieldErrors {
  name?: string;
  currency?: string;
  balance?: string;
  buffer?: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  note: "",
  currency: "EUR",
  balance: "",
  buffer: "",
};

function centsToInput(cents: number, currency: string): string {
  if (cents === 0) return "";
  const subdivisor = getCurrencySubdivisor(currency);
  if (subdivisor === 1) return String(cents);
  return (cents / subdivisor).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function parseToCents(input: string, currency: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const num = parseSignedAmountInput(trimmed);
  if (num === null) return null;
  return Math.round(num * getCurrencySubdivisor(currency));
}

export function AccountsDialog({ open, accounts, onChanged, onClose }: Props) {
  const nameId = useId();
  const noteId = useId();
  const currencyId = useId();
  const balanceId = useId();
  const bufferId = useId();
  const nameErrorId = useId();
  const currencyErrorId = useId();
  const balanceErrorId = useId();
  const bufferErrorId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const balanceRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSubmitting(false);
    setError(null);
    setErrors({});
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setForm({
      name: a.name,
      note: a.note ?? "",
      currency: a.currency,
      balance: centsToInput(a.balanceCents, a.currency),
      buffer: centsToInput(a.minBufferCents, a.currency),
    });
    setError(null);
    setErrors({});
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function clearFieldError(field: keyof FieldErrors) {
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): {
    errors: FieldErrors;
    balanceCents: number;
    minBufferCents: number;
  } {
    const next: FieldErrors = {};
    if (form.name.trim() === "") next.name = "Bitte Namen eingeben.";

    if (!isCurrencyOption(form.currency)) {
      next.currency = "Bitte eine erlaubte Währung wählen.";
    }

    const balanceCents = parseToCents(form.balance, form.currency);
    if (balanceCents === null) {
      next.balance = "Saldo ungültig — bitte Zahl eingeben (z.B. 500 oder 500,00).";
    }

    const minBufferCents = parseToCents(form.buffer, form.currency);
    if (minBufferCents === null) {
      next.buffer = "Mindestpuffer ungültig — bitte Zahl eingeben.";
    } else if (minBufferCents < 0) {
      next.buffer = "Mindestpuffer darf nicht negativ sein.";
    }

    return { errors: next, balanceCents: balanceCents ?? 0, minBufferCents: minBufferCents ?? 0 };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { errors: validation, balanceCents, minBufferCents } = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      if (validation.name) nameRef.current?.focus();
      else if (validation.currency) currencyRef.current?.focus();
      else if (validation.balance) balanceRef.current?.focus();
      else if (validation.buffer) bufferRef.current?.focus();
      return;
    }

    setErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const note = form.note.trim() || null;
      if (editingId != null) {
        await updateAccount({
          id: editingId,
          name: form.name.trim(),
          note,
          currency: form.currency,
          balanceCents,
          minBufferCents,
          balanceUpdatedAt: null,
        });
      } else {
        await addAccount({
          name: form.name.trim(),
          note: note ?? undefined,
          currency: form.currency,
          balanceCents,
          minBufferCents,
        });
      }
      resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(account: Account) {
    setError(null);
    try {
      const count = await countSubsForAccount(account.id);
      if (count > 0) {
        const word = count === 1 ? "Abo verweist" : "Abos verweisen";
        window.alert(
          `Konto „${account.name}“ kann nicht gelöscht werden: ${count} ${word} darauf. Dort erst entfernen oder umbuchen.`,
        );
        return;
      }
      if (!window.confirm(`Konto „${account.name}“ wirklich löschen?`)) return;
      await deleteAccount(account.id);
      if (editingId === account.id) resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const isEditing = editingId != null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fluid-lg">
            <Wallet className="size-5 text-primary" />
            Konten
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Konten angelegt.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Saldo: {formatAmount(a.balanceCents, a.currency)}
                      {a.minBufferCents > 0 && (
                        <> · Puffer: {formatAmount(a.minBufferCents, a.currency)}</>
                      )}
                    </p>
                    {(() => {
                      const days = daysSince(a.balanceUpdatedAt);
                      return days !== null && days >= 7 ? (
                        <p className="text-xs text-warning">
                          Saldo vor {days} {days === 1 ? "Tag" : "Tagen"} aktualisiert
                        </p>
                      ) : null;
                    })()}
                    {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(a)}
                      aria-label={`Konto ${a.name} bearbeiten`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleDelete(a)}
                      aria-label={`Konto ${a.name} löschen`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t pt-4" noValidate>
            <h3 className="font-semibold">{isEditing ? "Konto bearbeiten" : "Neues Konto"}</h3>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                ref={nameRef}
                value={form.name}
                onChange={(e) => {
                  updateField("name", e.target.value);
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={currencyId}>Währung</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => {
                  updateField("currency", v);
                  clearFieldError("currency");
                }}
              >
                <SelectTrigger
                  id={currencyId}
                  ref={currencyRef}
                  className="w-full"
                  aria-invalid={!!errors.currency}
                  aria-describedby={errors.currency ? currencyErrorId : undefined}
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={balanceId}>Aktueller Saldo</Label>
              <Input
                id={balanceId}
                ref={balanceRef}
                inputMode="decimal"
                value={form.balance}
                onChange={(e) => {
                  updateField("balance", e.target.value);
                  clearFieldError("balance");
                }}
                placeholder="z.B. 500 oder 500,00"
                aria-invalid={!!errors.balance}
                aria-describedby={errors.balance ? balanceErrorId : undefined}
              />
              {errors.balance && (
                <p id={balanceErrorId} className="text-sm text-destructive" role="alert">
                  {errors.balance}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={bufferId}>Mindestpuffer (optional)</Label>
              <Input
                id={bufferId}
                ref={bufferRef}
                inputMode="decimal"
                value={form.buffer}
                onChange={(e) => {
                  updateField("buffer", e.target.value);
                  clearFieldError("buffer");
                }}
                placeholder="z.B. 100"
                aria-invalid={!!errors.buffer}
                aria-describedby={errors.buffer ? bufferErrorId : undefined}
              />
              {errors.buffer ? (
                <p id={bufferErrorId} className="text-sm text-destructive" role="alert">
                  {errors.buffer}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Wird in der Übersicht gewarnt, wenn der Saldo darunter fallen würde.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>Notiz (optional)</Label>
              <Input
                id={noteId}
                value={form.note}
                onChange={(e) => updateField("note", e.target.value)}
                placeholder="z.B. IBAN-Endung oder Karte"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>Fehler: {error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              {isEditing && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Abbrechen
                </Button>
              )}
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting ? "Speichere …" : isEditing ? "Speichern" : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
