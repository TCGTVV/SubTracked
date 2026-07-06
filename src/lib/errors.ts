/**
 * Übersetzt rohe technische Fehler (sqlx/SQLite, Datei-I/O, Tauri-Plugins — englisch)
 * in deutsche, nutzertaugliche Meldungen. Domänen-Fehler aus dem Rust-Backend
 * (validation.rs, csv_import.rs, backup.rs) sind bereits deutsch formuliert und
 * werden unverändert durchgereicht.
 */

/** Extrahiert die rohe Meldung — Tauri-`invoke` rejected mit Strings, nicht mit `Error`. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface TechnicalPattern {
  pattern: RegExp;
  toMessage: (aktion: string) => string;
}

const TECHNICAL_PATTERNS: TechnicalPattern[] = [
  {
    pattern: /UNIQUE constraint failed/i,
    toMessage: (a) => `${a} fehlgeschlagen: Ein gleicher Eintrag existiert bereits.`,
  },
  {
    pattern: /FOREIGN KEY constraint failed/i,
    toMessage: (a) => `${a} fehlgeschlagen: Der Eintrag ist noch mit anderen Daten verknüpft.`,
  },
  {
    pattern:
      /error returned from database|database is locked|SQLITE_|attempt to write a readonly database|pool timed out/i,
    toMessage: (a) =>
      `${a} fehlgeschlagen: Die Datenbank meldet einen Fehler. Bitte erneut versuchen.`,
  },
  {
    pattern: /os error|no such file or directory|permission denied|access is denied/i,
    toMessage: (a) =>
      `${a} fehlgeschlagen: Auf die Datei konnte nicht zugegriffen werden (nicht gefunden oder keine Berechtigung).`,
  },
];

/**
 * Nutzertaugliche Fehlermeldung für die UI. `aktion` beschreibt, was gerade
 * versucht wurde (z.B. "Abo speichern"). Erkannte technische Fehler werden
 * ersetzt (Rohtext geht zur Diagnose auf die Konsole), alles andere — v.a.
 * die bereits deutschen Validierungs-Meldungen — bleibt unverändert.
 */
export function toUserMessage(e: unknown, aktion: string): string {
  const raw = errorMessage(e);
  for (const { pattern, toMessage } of TECHNICAL_PATTERNS) {
    if (pattern.test(raw)) {
      console.error(`${aktion} fehlgeschlagen:`, raw);
      return toMessage(aktion);
    }
  }
  return raw;
}
