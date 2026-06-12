import type { ComponentPropsWithoutRef, Ref } from "react";
import { closeDialogOnBackdropClick } from "../lib/dialog";

interface DialogProps extends Omit<ComponentPropsWithoutRef<"dialog">, "onClick"> {
  ref: Ref<HTMLDialogElement>;
}

export function Dialog({ ref, className = "dialog", ...props }: DialogProps) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: nativer <dialog> schliesst per Escape; onClick ergaenzt nur den Backdrop-Klick
    <dialog {...props} ref={ref} className={className} onClick={closeDialogOnBackdropClick} />
  );
}
