import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAccounts, listSubscriptions } from "../lib/db";
import type { Account, Subscription } from "../types";
import { useSubscriptions } from "./useSubscriptions";

vi.mock("../lib/db", () => ({
  listSubscriptions: vi.fn(),
  listAccounts: vi.fn(),
}));

const mockListSubscriptions = vi.mocked(listSubscriptions);
const mockListAccounts = vi.mocked(listAccounts);

const sampleSubs: Subscription[] = [
  {
    id: 1,
    name: "Netflix",
    amountCents: 1799,
    currency: "EUR",
    accountId: 1,
    interval: "monthly",
    anchorDate: "2026-07-01",
    leadDays: 7,
    active: true,
    notify: true,
  },
];

const sampleAccounts: Account[] = [
  { id: 1, name: "Hauptkonto", note: null, currency: "EUR", balanceCents: 0, minBufferCents: 0 },
];

describe("useSubscriptions", () => {
  beforeEach(() => {
    mockListSubscriptions.mockReset();
    mockListAccounts.mockReset();
  });

  it("startet im loading-State mit leeren Listen", () => {
    // never-resolving Promises, damit der Initial-State sichtbar bleibt
    mockListSubscriptions.mockReturnValue(new Promise(() => {}));
    mockListAccounts.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubscriptions());
    expect(result.current.loading).toBe(true);
    expect(result.current.subs).toEqual([]);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("lädt subs und accounts nach erfolgreichem Mount-Reload", async () => {
    mockListSubscriptions.mockResolvedValue(sampleSubs);
    mockListAccounts.mockResolvedValue(sampleAccounts);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.subs).toEqual(sampleSubs);
    expect(result.current.accounts).toEqual(sampleAccounts);
    expect(result.current.error).toBeNull();
    expect(mockListSubscriptions).toHaveBeenCalledOnce();
    expect(mockListAccounts).toHaveBeenCalledOnce();
  });

  it("setzt error und beendet loading, wenn listSubscriptions wirft", async () => {
    mockListSubscriptions.mockRejectedValue(new Error("DB unavailable"));
    mockListAccounts.mockResolvedValue(sampleAccounts);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe("DB unavailable");
    expect(result.current.subs).toEqual([]);
  });

  it("setzt error und beendet loading, wenn listAccounts wirft", async () => {
    mockListSubscriptions.mockResolvedValue(sampleSubs);
    mockListAccounts.mockRejectedValue(new Error("Accounts kaputt"));
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe("Accounts kaputt");
  });

  it("aktualisiert subs und accounts bei manuellem reloadAll()", async () => {
    mockListSubscriptions.mockResolvedValue([]);
    mockListAccounts.mockResolvedValue([]);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.subs).toEqual([]);

    mockListSubscriptions.mockResolvedValue(sampleSubs);
    mockListAccounts.mockResolvedValue(sampleAccounts);
    await act(async () => {
      await result.current.reloadAll();
    });

    expect(result.current.subs).toEqual(sampleSubs);
    expect(result.current.accounts).toEqual(sampleAccounts);
  });

  it("aktualisiert nur accounts bei reloadAccounts(), subs bleibt unverändert", async () => {
    mockListSubscriptions.mockResolvedValue(sampleSubs);
    mockListAccounts.mockResolvedValue([]);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.subs).toEqual(sampleSubs);
    expect(result.current.accounts).toEqual([]);

    mockListAccounts.mockResolvedValue(sampleAccounts);
    await act(async () => {
      await result.current.reloadAccounts();
    });

    expect(result.current.accounts).toEqual(sampleAccounts);
    expect(result.current.subs).toEqual(sampleSubs); // unverändert
    // listSubscriptions sollte NICHT erneut gerufen werden
    expect(mockListSubscriptions).toHaveBeenCalledOnce();
  });

  it("erlaubt es Aufrufern, error über setError zu setzen", async () => {
    mockListSubscriptions.mockResolvedValue(sampleSubs);
    mockListAccounts.mockResolvedValue(sampleAccounts);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setError("Manueller Fehler");
    });
    expect(result.current.error).toBe("Manueller Fehler");

    act(() => {
      result.current.setError(null);
    });
    expect(result.current.error).toBeNull();
  });

  it("löscht einen vorhandenen Fehler, sobald ein folgender reloadAll erfolgreich ist", async () => {
    mockListSubscriptions.mockRejectedValue(new Error("Erst kaputt"));
    mockListAccounts.mockResolvedValue(sampleAccounts);
    const { result } = renderHook(() => useSubscriptions());

    await waitFor(() => {
      expect(result.current.error).toBe("Erst kaputt");
    });

    mockListSubscriptions.mockResolvedValue(sampleSubs);
    await act(async () => {
      await result.current.reloadAll();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.subs).toEqual(sampleSubs);
  });
});
