import { type FormEvent, type Ref, useId, useState } from "react";
import { addAccount, countSubsForAccount, deleteAccount, updateAccount } from "../lib/db";
import {
  CURRENCY_OPTIONS,
  formatAmount,
  getCurrencySubdivisor,
  parseAmountInput,
} from "../lib/format";
import type { Account } from "../types";

interface Props {
  ref: Ref<HTMLDialogElement>;
  accounts: Account[];
  onChanged: () => void;
}

interface FormState {
  name: string;
  note: string;
  currency: string;
  balance: string;
  buffer: string;
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

export function AccountsDialog({ ref, accounts, onChanged }: Props) {
  const nameId = useId();
  const noteId = useId();
  const currencyId = useId();
  const balanceId = useId();
  const bufferId = useId();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSubmitting(false);
    setError(null);
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
  }

  function parseToCents(input: string, currency: string): number | null {
    const trimmed = input.trim();
    if (trimmed === "") return 0;
    const num = parseAmountInput(trimmed);
    if (num === null) return null;
    return Math.round(num * getCurrencySubdivisor(currency));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) return;

    const balanceCents = parseToCents(form.balance, form.currency);
    if (balanceCents === null) {
      setError("Saldo ungültig — bitte Zahl eingeben (z.B. 500 oder 500,00).");
      return;
    }
    const minBufferCents = parseToCents(form.buffer, form.currency);
    if (minBufferCents === null) {
      setError("Mindestpuffer ungültig — bitte Zahl eingeben.");
      return;
    }
    if (minBufferCents < 0) {
      setError("Mindestpuffer darf nicht negativ sein.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const note = form.note.trim() || null;
      if (editingId != null) {
        await updateAccount({
          id: editingId,
          name: trimmedName,
          note,
          currency: form.currency,
          balanceCents,
          minBufferCents,
        });
      } else {
        await addAccount({
          name: trimmedName,
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
    <dialog ref={ref} className="dialog" onClose={resetForm}>
      <div className="accounts-dialog">
        <h2>Konten</h2>

        {accounts.length === 0 ? (
          <p className="empty">Noch keine Konten angelegt.</p>
        ) : (
          <ul className="account-list">
            {accounts.map((a) => (
              <li key={a.id} className="account-item">
                <div className="account-info">
                  <span className="account-name">{a.name}</span>
                  <span className="account-balance">
                    Saldo: {formatAmount(a.balanceCents, a.currency)}
                    {a.minBufferCents > 0 && (
                      <> · Puffer: {formatAmount(a.minBufferCents, a.currency)}</>
                    )}
                  </span>
                  {a.note && <span className="account-note">{a.note}</span>}
                </div>
                <div className="account-actions">
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    aria-label={`Konto ${a.name} bearbeiten`}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="sub-delete"
                    onClick={() => void handleDelete(a)}
                    aria-label={`Konto ${a.name} löschen`}
                  >
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="account-add" noValidate>
          <h3>{isEditing ? "Konto bearbeiten" : "Neues Konto"}</h3>

          <div className="field">
            <label htmlFor={nameId}>Name</label>
            <input
              id={nameId}
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={currencyId}>Währung</label>
            <select
              id={currencyId}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={balanceId}>Aktueller Saldo</label>
            <input
              id={balanceId}
              type="text"
              inputMode="decimal"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
              placeholder="z.B. 500 oder 500,00"
            />
          </div>

          <div className="field">
            <label htmlFor={bufferId}>Mindestpuffer (optional)</label>
            <input
              id={bufferId}
              type="text"
              inputMode="decimal"
              value={form.buffer}
              onChange={(e) => setForm({ ...form, buffer: e.target.value })}
              placeholder="z.B. 100"
            />
            <small className="field-hint">
              Wird in der Übersicht gewarnt, wenn der Saldo darunter fallen würde.
            </small>
          </div>

          <div className="field">
            <label htmlFor={noteId}>Notiz (optional)</label>
            <input
              id={noteId}
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="z.B. IBAN-Endung oder Karte"
            />
          </div>

          {error && (
            <p className="error" role="alert">
              Fehler: {error}
            </p>
          )}

          <div className="form-actions">
            <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
              Schließen
            </button>
            {isEditing && (
              <button type="button" onClick={resetForm}>
                Abbrechen
              </button>
            )}
            <button type="submit" disabled={submitting || !form.name.trim()}>
              {submitting ? "Speichere …" : isEditing ? "Speichern" : "Hinzufügen"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
