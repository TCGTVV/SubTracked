import { describe, expect, it } from "vitest";
import type { Subscription } from "../types";
import {
  applyFilterAndSort,
  DEFAULT_SUB_LIST_OPTIONS,
  hasUnassignedSubs,
  uniqueCurrencies,
} from "./subscription-list";

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  name: "Test",
  amountCents: 1000,
  currency: "EUR",
  accountId: 1,
  interval: "monthly",
  anchorDate: "2026-01-15",
  leadDays: 3,
  active: true,
  notify: true,
  ...overrides,
});

const NOW = new Date(2026, 0, 1);

describe("applyFilterAndSort", () => {
  describe("Filter", () => {
    it("ohne Filter liefert alle Subs in name-asc-Sortierung", () => {
      const subs = [
        sub({ id: 1, name: "Spotify" }),
        sub({ id: 2, name: "Netflix" }),
        sub({ id: 3, name: "Apple" }),
      ];
      const result = applyFilterAndSort(subs, DEFAULT_SUB_LIST_OPTIONS, NOW);
      expect(result.map((s) => s.name)).toEqual(["Apple", "Netflix", "Spotify"]);
    });

    it("filtert nach Konto-ID", () => {
      const subs = [
        sub({ id: 1, name: "A", accountId: 1 }),
        sub({ id: 2, name: "B", accountId: 2 }),
        sub({ id: 3, name: "C", accountId: 1 }),
      ];
      const result = applyFilterAndSort(subs, { ...DEFAULT_SUB_LIST_OPTIONS, account: 1 }, NOW);
      expect(result.map((s) => s.name)).toEqual(["A", "C"]);
    });

    it("filtert auf 'kein Konto' via account = 'none'", () => {
      const subs = [
        sub({ id: 1, name: "A", accountId: 1 }),
        sub({ id: 2, name: "B", accountId: null }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, account: "none" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["B"]);
    });

    it("filtert nach Währung", () => {
      const subs = [
        sub({ id: 1, name: "A", currency: "EUR" }),
        sub({ id: 2, name: "B", currency: "USD" }),
        sub({ id: 3, name: "C", currency: "EUR" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, currency: "EUR" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["A", "C"]);
    });

    it("filter notify='on' liefert nur Subs mit Erinnerung", () => {
      const subs = [
        sub({ id: 1, name: "A", notify: true }),
        sub({ id: 2, name: "B", notify: false }),
      ];
      const result = applyFilterAndSort(subs, { ...DEFAULT_SUB_LIST_OPTIONS, notify: "on" }, NOW);
      expect(result.map((s) => s.name)).toEqual(["A"]);
    });

    it("filter notify='off' liefert nur stumme Subs", () => {
      const subs = [
        sub({ id: 1, name: "A", notify: true }),
        sub({ id: 2, name: "B", notify: false }),
      ];
      const result = applyFilterAndSort(subs, { ...DEFAULT_SUB_LIST_OPTIONS, notify: "off" }, NOW);
      expect(result.map((s) => s.name)).toEqual(["B"]);
    });

    it("kombiniert Filter (UND-Verknüpfung)", () => {
      const subs = [
        sub({ id: 1, name: "A", accountId: 1, currency: "EUR" }),
        sub({ id: 2, name: "B", accountId: 1, currency: "USD" }),
        sub({ id: 3, name: "C", accountId: 2, currency: "EUR" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, account: 1, currency: "EUR" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["A"]);
    });
  });

  describe("Sortierung", () => {
    it("name-desc kehrt die Reihenfolge um", () => {
      const subs = [sub({ id: 1, name: "Apple" }), sub({ id: 2, name: "Netflix" })];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "name-desc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Netflix", "Apple"]);
    });

    it("due-asc sortiert nach nächster Fälligkeit aufsteigend", () => {
      const subs = [
        sub({ id: 1, name: "Spät", anchorDate: "2026-01-25" }),
        sub({ id: 2, name: "Früh", anchorDate: "2026-01-05" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "due-asc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Früh", "Spät"]);
    });

    it("due-desc sortiert nach nächster Fälligkeit absteigend", () => {
      const subs = [
        sub({ id: 1, name: "Spät", anchorDate: "2026-01-25" }),
        sub({ id: 2, name: "Früh", anchorDate: "2026-01-05" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "due-desc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Spät", "Früh"]);
    });

    it("due-asc legt ungueltige Legacy-Datumswerte ans Ende", () => {
      const subs = [
        sub({ id: 1, name: "Invalid", anchorDate: "2026-1-5" }),
        sub({ id: 2, name: "Valid", anchorDate: "2026-01-05" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "due-asc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Valid", "Invalid"]);
    });

    it("due-desc legt ungueltige Legacy-Datumswerte ans Ende", () => {
      const subs = [
        sub({ id: 1, name: "Invalid", anchorDate: "2026-1-5" }),
        sub({ id: 2, name: "Valid", anchorDate: "2026-01-05" }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "due-desc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Valid", "Invalid"]);
    });

    it("amount-asc sortiert nach Betrag aufsteigend", () => {
      const subs = [
        sub({ id: 1, name: "Teuer", amountCents: 5000 }),
        sub({ id: 2, name: "Billig", amountCents: 100 }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "amount-asc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Billig", "Teuer"]);
    });

    it("amount-desc sortiert nach Betrag absteigend", () => {
      const subs = [
        sub({ id: 1, name: "Teuer", amountCents: 5000 }),
        sub({ id: 2, name: "Billig", amountCents: 100 }),
      ];
      const result = applyFilterAndSort(
        subs,
        { ...DEFAULT_SUB_LIST_OPTIONS, sort: "amount-desc" },
        NOW,
      );
      expect(result.map((s) => s.name)).toEqual(["Teuer", "Billig"]);
    });
  });
});

describe("uniqueCurrencies", () => {
  it("liefert alphabetisch sortierte einzigartige Währungen", () => {
    const subs = [
      sub({ id: 1, currency: "USD" }),
      sub({ id: 2, currency: "EUR" }),
      sub({ id: 3, currency: "EUR" }),
      sub({ id: 4, currency: "KRW" }),
    ];
    expect(uniqueCurrencies(subs)).toEqual(["EUR", "KRW", "USD"]);
  });

  it("liefert leeres Array bei leerer Liste", () => {
    expect(uniqueCurrencies([])).toEqual([]);
  });
});

describe("hasUnassignedSubs", () => {
  it("true wenn mindestens ein Sub ohne Konto", () => {
    const subs = [sub({ accountId: 1 }), sub({ accountId: null })];
    expect(hasUnassignedSubs(subs)).toBe(true);
  });

  it("false wenn alle Subs ein Konto haben", () => {
    expect(hasUnassignedSubs([sub({ accountId: 1 })])).toBe(false);
  });

  it("false bei leerer Liste", () => {
    expect(hasUnassignedSubs([])).toBe(false);
  });
});
