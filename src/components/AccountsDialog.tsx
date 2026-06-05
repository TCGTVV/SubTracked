import { type FormEvent, type Ref, useId, useState } from "react";
import { addAccount, countSubsForAccount, deleteAccount } from "../lib/db";
import type { Account } from "../types";

interface Props {
  ref: Ref<HTMLDialogElement>;
  accounts: Account[];
  onChanged: () => void;
}

export function AccountsDialog({ ref, accounts, onChanged }: Props) {
  const nameId = useId();
  const noteId = useId();

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setNote("");
    setSubmitting(false);
    setError(null);
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSubmitting(true);
    setError(null);
    try {
      await addAccount(trimmedName, note.trim() || undefined);
      setName("");
      setNote("");
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
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
                  {a.note && <span className="account-note">{a.note}</span>}
                </div>
                <button
                  type="button"
                  className="sub-delete"
                  onClick={() => void handleDelete(a)}
                  aria-label={`Konto ${a.name} löschen`}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="account-add" noValidate>
          <h3>Neues Konto</h3>

          <div className="field">
            <label htmlFor={nameId}>Name</label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={noteId}>Notiz (optional)</label>
            <input
              id={noteId}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            <button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Speichere …" : "Hinzufügen"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
