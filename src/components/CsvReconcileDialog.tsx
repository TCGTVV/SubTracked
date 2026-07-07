import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FileSearch } from "lucide-react";
import { useState } from "react";
import {
  type ReconcileFinding,
  reconcileCsv,
  setSubscriptionActive,
  updateSubscription,
} from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { formatAmount } from "../lib/format";
import type { Subscription } from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface Props {
  open: boolean;
  /** Alle Abos (für Currency-Anzeige und Preis-Übernahme per updateSubscription). */
  subs: Subscription[];
  onClose: () => void;
  /** Wird nach jeder übernommenen Aktion aufgerufen, damit App neu lädt. */
  onChanged: () => void;
}

export function CsvReconcileDialog({ open, subs, onClose, onChanged }: Props) {
  const [findings, setFindings] = useState<ReconcileFinding[] | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  async function handlePickFile() {
    setLoadError(null);
    setActionError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (typeof selected !== "string") return; // Dialog abgebrochen
      setFilePath(selected);
      setFindings(null);
      setDone({});
      setLoading(true);
      setFindings(await reconcileCsv(selected));
    } catch (e) {
      setLoadError(toUserMessage(e, "CSV-Datei abgleichen"));
      setFindings(null);
    } finally {
      setLoading(false);
    }
  }

  async function applyFinding(f: ReconcileFinding) {
    setActionError(null);
    setActionPending(f.subscriptionId);
    try {
      if (f.kind === "price_changed") {
        const sub = subs.find((s) => s.id === f.subscriptionId);
        if (!sub || f.actualAmountCents === null) {
          throw new Error("Abo nicht gefunden — bitte Daten neu laden.");
        }
        // updateSubscription schreibt bei Betragsänderung automatisch die Preis-Historie.
        await updateSubscription({ ...sub, amountCents: f.actualAmountCents });
        setDone((prev) => ({ ...prev, [f.subscriptionId]: "Preis übernommen" }));
      } else {
        await setSubscriptionActive(f.subscriptionId, false);
        setDone((prev) => ({ ...prev, [f.subscriptionId]: "Archiviert" }));
      }
      onChanged();
    } catch (e) {
      setActionError(
        toUserMessage(e, f.kind === "price_changed" ? "Preis übernehmen" : "Abo archivieren"),
      );
    } finally {
      setActionPending(null);
    }
  }

  function handleClose() {
    setFindings(null);
    setFilePath(null);
    setLoadError(null);
    setActionError(null);
    setDone({});
    onClose();
  }

  function currencyFor(f: ReconcileFinding): string {
    return subs.find((s) => s.id === f.subscriptionId)?.currency ?? "EUR";
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fluid-lg">
            <FileSearch className="size-5 text-primary" />
            Bankauszug abgleichen
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-xs text-muted-foreground">
            Vergleicht die Abbuchungen eines CSV-Kontoauszugs mit deinen bestehenden Abos und meldet
            Abweichungen: geänderte Beträge kannst du direkt als neuen Preis übernehmen (inkl.
            Preis-Historie), seit mindestens zwei Zyklen ausbleibende Abbuchungen als vermutlich
            gekündigt archivieren. Abos ohne passende Buchung im Auszug werden nicht bewertet.
          </p>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePickFile()}
              disabled={loading}
            >
              {loading ? "Gleiche ab …" : filePath ? "Andere Datei wählen" : "CSV-Datei wählen"}
            </Button>
          </div>

          {loadError && (
            <Alert variant="destructive">
              <AlertDescription>Fehler: {loadError}</AlertDescription>
            </Alert>
          )}

          {findings && findings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Abweichungen gefunden — Soll und Ist stimmen überein.
            </p>
          )}

          {findings && findings.length > 0 && (
            <div className="flex flex-col gap-3">
              {findings.map((f) => (
                <div
                  key={`${f.subscriptionId}-${f.kind}`}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium">{f.subscriptionName}</p>
                      {f.kind === "price_changed" && f.actualAmountCents !== null ? (
                        <p className="text-xs text-warning">
                          Zuletzt {formatAmount(f.actualAmountCents, currencyFor(f))} statt{" "}
                          {formatAmount(f.expectedAmountCents, currencyFor(f))} abgebucht (am{" "}
                          {f.lastChargeDate}).
                        </p>
                      ) : (
                        <p className="text-xs text-warning">
                          Seit mindestens 2 Zyklen nicht mehr abgebucht (zuletzt {f.lastChargeDate})
                          — gekündigt?
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {f.matchedCount} passende Buchung{f.matchedCount === 1 ? "" : "en"} im
                        Auszug
                      </p>
                    </div>
                    {done[f.subscriptionId] ? (
                      <span className="text-sm text-success" role="status">
                        ✓ {done[f.subscriptionId]}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void applyFinding(f)}
                        disabled={actionPending !== null}
                      >
                        {actionPending === f.subscriptionId
                          ? "Arbeite …"
                          : f.kind === "price_changed"
                            ? "Preis übernehmen"
                            : "Archivieren"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>Fehler: {actionError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
