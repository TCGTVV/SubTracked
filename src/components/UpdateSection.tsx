import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { checkForUpdate, installUpdate, type UpdateInfo } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo }
  | { kind: "error"; message: string };

/**
 * Manuelle Update-Prüfung. Es wird nichts im Hintergrund geprüft oder geladen: erst „Nach Updates
 * suchen", dann (nur bei Fund) bewusst „Installieren". Nach erfolgreicher Installation startet
 * die App neu — dieser Promise kehrt dann nicht mehr zurück.
 */
export function UpdateSection() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleCheck() {
    setState({ kind: "checking" });
    try {
      const info = await checkForUpdate();
      setState(info ? { kind: "available", info } : { kind: "upToDate" });
    } catch (e) {
      setState({ kind: "error", message: toUserMessage(e, "Nach Updates suchen") });
    }
  }

  async function handleInstall(info: UpdateInfo) {
    setState({ kind: "installing", info });
    try {
      await installUpdate();
    } catch (e) {
      setState({ kind: "error", message: toUserMessage(e, "Update installieren") });
    }
  }

  const busy = state.kind === "checking" || state.kind === "installing";

  return (
    <section className="flex flex-col gap-2" aria-labelledby="update-heading">
      <h3 id="update-heading" className="font-semibold">
        Updates
      </h3>
      <p className="text-sm text-muted-foreground">
        Prüft bei GitHub auf eine neuere, signierte Version. Es wird nur auf Klick gesucht und
        installiert. Unter Linux funktioniert die Installation nur mit der AppImage-Version.
      </p>

      {state.kind === "available" || state.kind === "installing" ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm">
            <strong>Version {state.info.version}</strong> ist verfügbar (installiert:{" "}
            {state.info.currentVersion}).
          </p>
          {state.info.notes && (
            <p className="max-h-32 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
              {state.info.notes}
            </p>
          )}
          <div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handleInstall(state.info)}
              className="gap-1.5"
            >
              <Download className="size-4" aria-hidden="true" />
              {state.kind === "installing"
                ? "Wird heruntergeladen und installiert …"
                : "Installieren und neu starten"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleCheck()}
            className="gap-1.5"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {state.kind === "checking" ? "Suche …" : "Nach Updates suchen"}
          </Button>
        </div>
      )}

      {state.kind === "upToDate" && (
        <p role="status" className="text-sm text-success">
          ✓ SubTracked ist auf dem neuesten Stand.
        </p>
      )}
      {state.kind === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
