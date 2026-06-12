import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useNotificationPermission } from "./hooks/useNotificationPermission";
import { useSubscriptions } from "./hooks/useSubscriptions";
import type { Account } from "./types";

vi.mock("./hooks/useNotificationPermission", () => ({
  useNotificationPermission: vi.fn(),
}));

vi.mock("./hooks/useSubscriptions", () => ({
  useSubscriptions: vi.fn(),
}));

vi.mock("./components/AccountsDialog", () => ({
  AccountsDialog: () => <dialog />,
}));

vi.mock("./components/IncomeDialog", () => ({
  IncomeDialog: () => <dialog />,
}));

vi.mock("./components/NotificationPermissionBanner", () => ({
  NotificationPermissionBanner: () => null,
}));

vi.mock("./components/OverviewSection", () => ({
  OverviewSection: () => <section aria-label="Overview Mock" />,
}));

vi.mock("./components/SettingsDialog", () => ({
  SettingsDialog: () => <dialog />,
}));

vi.mock("./components/StatusCard", () => ({
  StatusCard: () => <section aria-label="Status Mock" />,
}));

vi.mock("./components/SubscriptionDialog", () => ({
  SubscriptionDialog: () => <dialog />,
}));

vi.mock("./components/SubscriptionFilterBar", () => ({
  SubscriptionFilterBar: () => <div />,
}));

vi.mock("./components/UpcomingSection", () => ({
  UpcomingSection: () => <section aria-label="Upcoming Mock" />,
}));

vi.mock("./lib/db", () => ({
  deleteIncome: vi.fn(),
  deleteSubscription: vi.fn(),
  setIncomeActive: vi.fn(),
  setSubscriptionActive: vi.fn(),
}));

const mockUseSubscriptions = vi.mocked(useSubscriptions);
const mockUseNotificationPermission = vi.mocked(useNotificationPermission);

const account: Account = {
  id: 1,
  name: "Hauptkonto",
  note: null,
  currency: "EUR",
  balanceCents: 0,
  minBufferCents: 0,
  balanceUpdatedAt: null,
};

describe("App", () => {
  beforeEach(() => {
    mockUseNotificationPermission.mockReturnValue({
      status: "granted",
      activate: vi.fn(),
    });
    mockUseSubscriptions.mockReturnValue({
      subs: [],
      accounts: [account],
      incomes: [],
      loading: false,
      error: null,
      setError: vi.fn(),
      reloadAll: vi.fn(),
      reloadAccounts: vi.fn(),
    });
  });

  it("zeigt den Empty-State auch, wenn schon ein Konto existiert", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Noch keine Zahlungsdaten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erstes Abo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Einnahme hinzufügen" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Overview Mock")).not.toBeInTheDocument();
  });
});
