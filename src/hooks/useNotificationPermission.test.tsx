import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationPermission } from "./useNotificationPermission";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
}));

const mockIsPermissionGranted = vi.mocked(isPermissionGranted);
const mockRequestPermission = vi.mocked(requestPermission);

describe("useNotificationPermission", () => {
  beforeEach(() => {
    mockIsPermissionGranted.mockReset();
    mockRequestPermission.mockReset();
  });

  it("startet im loading-State und wechselt auf granted, wenn die Permission schon da ist", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);
    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.status).toBe("granted");
    });
  });

  it("wechselt auf default, wenn die Permission noch nicht erteilt ist", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => {
      expect(result.current.status).toBe("default");
    });
  });

  it("fängt einen Fehler aus isPermissionGranted ab und fällt auf default", async () => {
    mockIsPermissionGranted.mockRejectedValue(new Error("boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => {
      expect(result.current.status).toBe("default");
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("setzt status auf granted, wenn activate() vom System genehmigt wird", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    mockRequestPermission.mockResolvedValue("granted");
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => {
      expect(result.current.status).toBe("default");
    });
    await act(async () => {
      await result.current.activate();
    });
    expect(result.current.status).toBe("granted");
  });

  it("setzt status auf denied, wenn activate() vom System abgelehnt wird", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    mockRequestPermission.mockResolvedValue("denied");
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => {
      expect(result.current.status).toBe("default");
    });
    await act(async () => {
      await result.current.activate();
    });
    expect(result.current.status).toBe("denied");
  });
});
