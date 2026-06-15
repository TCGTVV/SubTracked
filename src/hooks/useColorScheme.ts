import { useCallback, useEffect, useState } from "react";

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "subtracked.color-scheme";

function readStored(): ColorScheme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

function applyScheme(scheme: ColorScheme) {
  const dark = scheme === "dark" || (scheme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Hell/Dunkel/System-Steuerung. Persistiert die Wahl, setzt `.dark` auf
 * <html> (shadcn-Konvention) und folgt im System-Modus live dem OS.
 */
export function useColorScheme() {
  const [scheme, setSchemeState] = useState<ColorScheme>(readStored);

  useEffect(() => {
    applyScheme(scheme);
  }, [scheme]);

  useEffect(() => {
    if (scheme !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyScheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [scheme]);

  const setScheme = useCallback((next: ColorScheme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setSchemeState(next);
  }, []);

  return { scheme, setScheme };
}
