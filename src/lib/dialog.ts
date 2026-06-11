import type { MouseEvent } from "react";

/**
 * Klick-Handler für native `<dialog>`-Elemente: schließt den Dialog, wenn auf
 * den Backdrop geklickt wird. Native Dialoge schließen bei Backdrop-Klick nicht
 * von selbst — der Klick trifft das `<dialog>`-Element direkt (der Inhalt ist
 * ein Kind-Element), daher die `target === currentTarget`-Prüfung.
 */
export function closeDialogOnBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
  if (event.target === event.currentTarget) {
    event.currentTarget.close();
  }
}
