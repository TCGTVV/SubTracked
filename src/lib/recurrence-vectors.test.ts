import { describe, expect, it } from "vitest";
import vectorsJson from "../../tests/fixtures/recurrence-vectors.json";
import type { CancelMode, CancelUnit, Subscription } from "../types";
import { cancelDeadline } from "./cancellation";
import { type Interval, nextDueDate } from "./recurrence";

// Geteilte Testvektoren mit `src-tauri/src/recurrence.rs`. Drift zwischen den
// beiden Implementierungen faellt damit auf, sobald eine Seite sich anders
// entscheidet. Vektoren leben unter `tests/fixtures/recurrence-vectors.json`
// im Repo-Root und sind die einzige Source of Truth fuer beide Seiten.

// Roh aus JSON: interval ist nur string. Die Whitelist unten narrowt auf
// Interval, damit ein Tippfehler in der Fixture (z.B. "Monthly") schon hier
// als klarer Fehler auffaellt — und nicht erst Rust-seitig als
// "Unbekanntes Intervall".
interface NextDueVectorRaw {
  name: string;
  anchor: string;
  interval: string;
  from: string;
  expected: string;
}

const ALLOWED_INTERVALS = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const satisfies readonly Interval[];

function assertInterval(value: string, vectorName: string): Interval {
  if ((ALLOWED_INTERVALS as readonly string[]).includes(value)) {
    return value as Interval;
  }
  throw new Error(
    `Vektor "${vectorName}": ungueltiges interval ${JSON.stringify(value)} ` +
      `(erlaubt: ${ALLOWED_INTERVALS.join(", ")}).`,
  );
}

interface CancelVectorRaw {
  name: string;
  mode: CancelMode | null;
  period_value: number | null;
  period_unit: CancelUnit | null;
  cancel_date: string | null;
  anchor: string;
  interval: string;
  from: string;
  expected: string | null;
}

const vectors = vectorsJson as {
  next_due_date: NextDueVectorRaw[];
  cancel_deadline: CancelVectorRaw[];
};

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
      const interval = assertInterval(v.interval, v.name);
      const got = nextDueDate(parseDate(v.anchor), interval, parseDate(v.from));
      expect(got).toEqual(parseDate(v.expected));
    });
  }
});

describe("shared cancel-deadline vectors (TS-Seite)", () => {
  it("fixtures-Datei enthaelt mindestens einen Cancel-Vektor", () => {
    expect(vectors.cancel_deadline.length).toBeGreaterThan(0);
  });

  for (const v of vectors.cancel_deadline) {
    it(v.name, () => {
      const sub: Subscription = {
        id: 1,
        name: v.name,
        amountCents: 0,
        currency: "EUR",
        accountId: null,
        interval: assertInterval(v.interval, v.name),
        anchorDate: v.anchor,
        leadDays: 0,
        active: true,
        notify: true,
        cancelMode: v.mode,
        cancelPeriodValue: v.period_value,
        cancelPeriodUnit: v.period_unit,
        cancelDate: v.cancel_date,
        category: null,
      };
      expect(cancelDeadline(sub, parseDate(v.from))).toBe(v.expected);
    });
  }
});

describe("assertInterval narrowing", () => {
  it("akzeptiert alle erlaubten Intervalle", () => {
    for (const interval of ALLOWED_INTERVALS) {
      expect(assertInterval(interval, "test")).toBe(interval);
    }
  });

  it("wirft bei Capitalization-Tippfehler", () => {
    expect(() => assertInterval("Monthly", "broken_vector")).toThrow(/broken_vector/);
    expect(() => assertInterval("Monthly", "broken_vector")).toThrow(/Monthly/);
  });

  it("wirft bei voellig unbekanntem Intervall", () => {
    expect(() => assertInterval("fortnightly", "v1")).toThrow(/fortnightly/);
  });
});
