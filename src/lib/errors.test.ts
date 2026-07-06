import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessage, toUserMessage } from "./errors";

describe("errorMessage", () => {
  it("nimmt message aus Error-Instanzen", () => {
    expect(errorMessage(new Error("kaputt"))).toBe("kaputt");
  });

  it("stringifiziert Nicht-Errors (invoke rejected mit Strings)", () => {
    expect(errorMessage("roher String")).toBe("roher String");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("toUserMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reicht deutsche Validierungs-Meldungen unverändert durch", () => {
    expect(toUserMessage("Name darf nicht leer sein.", "Abo speichern")).toBe(
      "Name darf nicht leer sein.",
    );
  });

  it("reicht unbekannte Fehler unverändert durch", () => {
    expect(toUserMessage(new Error("irgendwas"), "Abo speichern")).toBe("irgendwas");
  });

  it("übersetzt sqlx-Datenbank-Fehler und loggt den Rohtext", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = "error returned from database: (code: 1) no such table: subscriptions";
    expect(toUserMessage(raw, "Abo speichern")).toBe(
      "Abo speichern fehlgeschlagen: Die Datenbank meldet einen Fehler. Bitte erneut versuchen.",
    );
    expect(spy).toHaveBeenCalledWith("Abo speichern fehlgeschlagen:", raw);
  });

  it("übersetzt UNIQUE-Verletzungen", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      toUserMessage(
        "error returned from database: UNIQUE constraint failed: accounts.name",
        "Konto speichern",
      ),
    ).toBe("Konto speichern fehlgeschlagen: Ein gleicher Eintrag existiert bereits.");
  });

  it("übersetzt FOREIGN-KEY-Verletzungen", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toUserMessage("FOREIGN KEY constraint failed (code: 787)", "Konto löschen")).toBe(
      "Konto löschen fehlgeschlagen: Der Eintrag ist noch mit anderen Daten verknüpft.",
    );
  });

  it("übersetzt Datei-I/O-Fehler", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toUserMessage("No such file or directory (os error 2)", "Backup speichern")).toBe(
      "Backup speichern fehlgeschlagen: Auf die Datei konnte nicht zugegriffen werden (nicht gefunden oder keine Berechtigung).",
    );
  });
});
