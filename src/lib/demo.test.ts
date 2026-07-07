import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAccount,
  addIncome,
  addSubscription,
  deleteAccount,
  deleteIncome,
  deleteSubscription,
} from "./db";
import { hasDemoData, loadDemoData, removeDemoData } from "./demo";

vi.mock("./db", () => ({
  addAccount: vi.fn(),
  addIncome: vi.fn(),
  addSubscription: vi.fn(),
  deleteAccount: vi.fn(),
  deleteIncome: vi.fn(),
  deleteSubscription: vi.fn(),
}));

const mockAddAccount = vi.mocked(addAccount);
const mockAddIncome = vi.mocked(addIncome);
const mockAddSubscription = vi.mocked(addSubscription);
const mockDeleteAccount = vi.mocked(deleteAccount);
const mockDeleteIncome = vi.mocked(deleteIncome);
const mockDeleteSubscription = vi.mocked(deleteSubscription);

const TODAY = new Date("2026-07-07T12:00:00Z");

describe("demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAddAccount.mockResolvedValue(1);
    mockAddIncome.mockResolvedValue(50);
    let nextSubId = 100;
    mockAddSubscription.mockImplementation(async () => nextSubId++);
  });

  it("hasDemoData ist ohne gespeicherte IDs false", () => {
    expect(hasDemoData()).toBe(false);
  });

  it("legt Konto, Gehalt und Demo-Abos an und merkt sich die IDs", async () => {
    await loadDemoData(TODAY);

    expect(mockAddAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Girokonto (Demo)", currency: "EUR" }),
    );
    // Einnahme und alle Abos hängen am Demo-Konto.
    expect(mockAddIncome).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Gehalt (Demo)", accountId: 1, interval: "monthly" }),
    );
    for (const call of mockAddSubscription.mock.calls) {
      expect(call[0].accountId).toBe(1);
      expect(call[0].name).toMatch(/\(Demo\)$/);
      // Kein Erinnerungs-Spam durch Demo-Daten.
      expect(call[0].notify).toBe(false);
    }
    expect(hasDemoData()).toBe(true);
  });

  it("enthält Probeabo, Jahresbeitrag und Einmalausgabe (alle Sections gefüllt)", async () => {
    await loadDemoData(TODAY);
    const subs = mockAddSubscription.mock.calls.map((c) => c[0]);

    const trial = subs.find((s) => s.amountCents === 0);
    expect(trial).toMatchObject({ pendingAmountCents: 299, pendingFrom: "2026-07-21" });

    expect(subs.some((s) => s.interval === "yearly")).toBe(true);
    expect(subs.some((s) => s.oneTime)).toBe(true);
    // Anker auf festem Monatstag liegen im Vormonat (sicher in der Vergangenheit).
    expect(subs.find((s) => s.name === "Miete (Demo)")?.anchorDate).toBe("2026-06-01");
  });

  it("entfernt erst Abos und Einnahmen, dann das Konto, und vergisst die IDs", async () => {
    await loadDemoData(TODAY);
    const subCount = mockAddSubscription.mock.calls.length;

    await removeDemoData();

    expect(mockDeleteSubscription).toHaveBeenCalledTimes(subCount);
    expect(mockDeleteIncome).toHaveBeenCalledWith(50);
    expect(mockDeleteAccount).toHaveBeenCalledWith(1);
    // FK-Bindung: Konto-Löschung kommt nach der letzten Abo-Löschung.
    const lastSubOrder = Math.max(...mockDeleteSubscription.mock.invocationCallOrder);
    expect(mockDeleteAccount.mock.invocationCallOrder[0]).toBeGreaterThan(lastSubOrder);
    expect(hasDemoData()).toBe(false);
  });

  it("removeDemoData ohne gespeicherte IDs löscht nichts", async () => {
    await removeDemoData();
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("ignoriert einen kaputten localStorage-Eintrag", async () => {
    localStorage.setItem("subtracked.demo-ids", "kein json {");
    await removeDemoData();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(hasDemoData()).toBe(false);
  });
});
