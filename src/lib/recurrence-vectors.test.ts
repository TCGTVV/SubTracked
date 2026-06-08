import { describe, expect, it } from "vitest";
import vectorsJson from "../../tests/fixtures/recurrence-vectors.json";
import { type Interval, nextDueDate } from "./recurrence";

// Geteilte Testvektoren mit `src-tauri/src/recurrence.rs`. Drift zwischen den
// beiden Implementierungen faellt damit auf, sobald eine Seite sich anders
// entscheidet. Vektoren leben unter `tests/fixtures/recurrence-vectors.json`
// im Repo-Root und sind die einzige Source of Truth fuer beide Seiten.

interface NextDueVector {
  name: string;
  anchor: string;
  interval: Interval;
  from: string;
  expected: string;
}

const vectors = vectorsJson as { next_due_date: NextDueVector[] };

// Lokale Mitternacht — Vitest setzt TZ=UTC, damit dieselben numerischen
// Mitternacht-Werte rauskommen wie Rusts NaiveDate.
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

describe("shared recurrence vectors (TS-Seite)", () => {
  it("fixtures-Datei enthaelt mindestens einen Vektor", () => {
    expect(vectors.next_due_date.length).toBeGreaterThan(0);
  });

  for (const v of vectors.next_due_date) {
    it(v.name, () => {
      const got = nextDueDate(parseDate(v.anchor), v.interval, parseDate(v.from));
      expect(got).toEqual(parseDate(v.expected));
    });
  }
});
