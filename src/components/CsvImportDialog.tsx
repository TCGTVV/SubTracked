import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Upload } from "lucide-react";
import { useState } from "react";
import { addSubscription, previewCsvImport, type RecurringCandidate } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { CURRENCY_OPTIONS, formatAmount } from "../lib/format";
import { INTERVAL_OPTIONS } from "../lib/recurrence";
import type { Account, Interval } from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  /** Wird nach erfolgreichem Anlegen mindestens eines Abos aufgerufen, damit App neu lädt. */
  onImported: () => void;
}

/** Sentinel für „kein Konto" — Radix-Select erlaubt keinen leeren Item-Wert. */
const NO_ACCOUNT = "none";
/** Vorlaufzeit für neu importierte Abos, analog zum Default im SubscriptionDialog. */
const DEFAULT_LEAD_DAYS = 60;

interface EditableCandidate extends RecurringCandidate {
  selected: boolean;
  accountId: number | null;
  currency: string;
}

export function CsvImportDialog({ open, accounts, onClose, onImported }: Props) {
  const [candidates, setCandidates] = useState<EditableCandidate[] | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handlePickFile() {
    setLoadError(null);
    setImportedCount(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (typeof selected !== "string") return; // Dialog abgebrochen
      setFilePath(selected);
      setCandidates(null);
      setLoading(true);
      const rows = await previewCsvImport(selected);
      setCandidates(
        // Vermutliche Duplikate (matchedSubscription gesetzt) starten abgewählt.
        rows.map((r) => ({
          ...r,
          selected: !r.matchedSubscription,
          accountId: null,
          currency: "EUR",
        })),
      );
    } catch (e) {
      setLoadError(toUserMessage(e, "CSV-Datei lesen"));
      setCandidates(null);
    } finally {
      setLoading(false);
    }
  }

  function updateCandidate(index: number, patch: Partial<EditableCandidate>) {
    setCandidates((prev) =>
      prev ? prev.map((c, i) => (i === index ? { ...c, ...patch } : c)) : prev,
    );
  }

  async function handleImport() {
    if (!candidates) return;
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) return;
    setImportPending(true);
    setImportError(null);
    try {
      for (const c of selected) {
        await addSubscription({
          name: c.name,
          amountCents: c.amountCents,
          currency: c.currency,
          accountId: c.accountId,
          interval: c.interval,
          anchorDate: c.anchorDate,
          leadDays: DEFAULT_LEAD_DAYS,
          cancelMode: null,
          cancelPeriodValue: null,
          cancelPeriodUnit: null,
          cancelDate: null,
          category: null,
          oneTime: false,
          pendingAmountCents: null,
          pendingFrom: null,
        });
      }
      setImportedCount(selected.length);
      setCandidates(null);
      setFilePath(null);
      onImported();
    } catch (e) {
      setImportError(toUserMessage(e, "Abos anlegen"));
    } finally {
      setImportPending(false);
    }
  }

  function handleClose() {
    setCandidates(null);
    setFilePath(null);
    setLoadError(null);
    setImportError(null);
    setImportedCount(null);
    onClose();
  }

  const selectedCount = candidates?.filter((c) => c.selected).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fluid-lg">
            <Upload className="size-5 text-primary" />
            Bankauszug importieren
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-xs text-muted-foreground">
            Lädt eine CSV-Datei deines Kontoauszugs und erkennt wiederkehrende Abbuchungen anhand
            von identischem Verwendungszweck, Betrag und regelmäßigem Datumsabstand. Preisänderungen
            werden dabei bewusst nicht zusammengeführt — prüfe Betrag, Intervall und Konto je
            Vorschlag, bevor du importierst.
          </p>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePickFile()}
              disabled={loading}
            >
              {loading ? "Lese …" : filePath ? "Andere Datei wählen" : "CSV-Datei wählen"}
            </Button>
          </div>

          {loadError && (
            <Alert variant="destructive">
              <AlertDescription>Fehler: {loadError}</AlertDescription>
            </Alert>
          )}

          {candidates && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine wiederkehrenden Abbuchungen erkannt.
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="flex flex-col gap-3">
              {candidates.map((c, i) => (
                <div
                  key={`${c.name}-${c.amountCents}-${c.anchorDate}`}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      className="mt-1"
                      checked={c.selected}
                      onCheckedChange={(checked) =>
                        updateCandidate(i, { selected: checked === true })
                      }
                      aria-label={`${c.name} importieren`}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.occurrenceCount}× erkannt · zuletzt {c.anchorDate} · erstmals{" "}
                        {c.firstDate}
                      </p>
                      {c.matchedSubscription && (
                        <p className="text-xs text-warning">
                          Existiert vermutlich schon als „{c.matchedSubscription}" — deshalb
                          abgewählt.
                        </p>
                      )}
                    </div>
                    <span className="font-medium">{formatAmount(c.amountCents, c.currency)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Select
                      value={c.interval}
                      onValueChange={(v) => updateCandidate(i, { interval: v as Interval })}
                    >
                      <SelectTrigger className="w-full" aria-label={`Intervall für ${c.name}`}>
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

                    <Select
                      value={c.currency}
                      onValueChange={(v) => updateCandidate(i, { currency: v })}
                    >
                      <SelectTrigger className="w-full" aria-label={`Währung für ${c.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((cur) => (
                          <SelectItem key={cur} value={cur}>
                            {cur}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={c.accountId === null ? NO_ACCOUNT : String(c.accountId)}
                      onValueChange={(v) =>
                        updateCandidate(i, { accountId: v === NO_ACCOUNT ? null : Number(v) })
                      }
                    >
                      <SelectTrigger className="w-full" aria-label={`Konto für ${c.name}`}>
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
              ))}
            </div>
          )}

          {importError && (
            <Alert variant="destructive">
              <AlertDescription>Fehler: {importError}</AlertDescription>
            </Alert>
          )}
          {importedCount !== null && (
            <span className="text-sm text-success" role="status">
              ✓ {importedCount} Abo{importedCount === 1 ? "" : "s"} angelegt.
            </span>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Schließen
          </Button>
          {candidates && candidates.length > 0 && (
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={importPending || selectedCount === 0}
            >
              {importPending
                ? "Lege an …"
                : `${selectedCount} Abo${selectedCount === 1 ? "" : "s"} anlegen`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
