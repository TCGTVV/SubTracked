import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useNotificationPermission } from "./hooks/useNotificationPermission";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { hasDemoData, loadDemoData, removeDemoData } from "./lib/demo";
import { expectNoAxeViolations } from "./test-utils/axe";
import type { Account, Subscription } from "./types";

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

vi.mock("./lib/demo", () => ({
  hasDemoData: vi.fn(() => false),
  loadDemoData: vi.fn(),
  removeDemoData: vi.fn(),
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
    vi.mocked(hasDemoData).mockReturnValue(false);
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

  it("zeigt den Onboarding-Empty-State auch, wenn schon ein Konto existiert", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Wann wird dein Konto knapp?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erstes Abo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mit Demo-Daten ausprobieren" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Overview Mock")).not.toBeInTheDocument();
  });

  it("lädt Demo-Daten über den Onboarding-Button und lädt danach neu", async () => {
    const reloadAll = vi.fn();
    mockUseSubscriptions.mockReturnValue({
      subs: [],
      accounts: [],
      incomes: [],
      loading: false,
      error: null,
      setError: vi.fn(),
      reloadAll,
      reloadAccounts: vi.fn(),
    });
    vi.mocked(loadDemoData).mockResolvedValue();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Mit Demo-Daten ausprobieren" }));

    await waitFor(() => expect(loadDemoData).toHaveBeenCalled());
    expect(reloadAll).toHaveBeenCalled();
  });

  it("zeigt keinen Empty-State, wenn nur archivierte Abos vorhanden sind", () => {
    const archivedSub: Subscription = {
      id: 10,
      name: "Netflix",
      amountCents: 1799,
      currency: "EUR",
      accountId: account.id,
      interval: "monthly",
      anchorDate: "2026-01-01",
      leadDays: 3,
      active: false,
      notify: true,
      cancelMode: null,
      cancelPeriodValue: null,
      cancelPeriodUnit: null,
      cancelDate: null,
      category: null,
      oneTime: false,
      archivedAt: null,
      pendingAmountCents: null,
      pendingFrom: null,
    };
    mockUseSubscriptions.mockReturnValue({
      subs: [archivedSub],
      accounts: [account],
      incomes: [],
      loading: false,
      error: null,
      setError: vi.fn(),
      reloadAll: vi.fn(),
      reloadAccounts: vi.fn(),
    });

    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "Wann wird dein Konto knapp?" }),
    ).not.toBeInTheDocument();

    // Der Archiv-Toggle lebt in der Abos-Ansicht; dorthin navigieren.
    fireEvent.click(screen.getByRole("button", { name: "Abos" }));
    expect(screen.getByText(/Archivierte anzeigen \(1 Abo\)/)).toBeInTheDocument();
  });

  it("zeigt das Demo-Banner mit Entfernen-Aktion, solange Demo-Daten aktiv sind", async () => {
    vi.mocked(hasDemoData).mockReturnValue(true);
    vi.mocked(removeDemoData).mockResolvedValue();
    const reloadAll = vi.fn();
    const demoSub: Subscription = {
      id: 11,
      name: "Streamgigant (Demo)",
      amountCents: 1799,
      currency: "EUR",
      accountId: account.id,
      interval: "monthly",
      anchorDate: "2026-06-12",
      leadDays: 7,
      active: true,
      notify: false,
      cancelMode: null,
      cancelPeriodValue: null,
      cancelPeriodUnit: null,
      cancelDate: null,
      category: "Streaming",
      oneTime: false,
      archivedAt: null,
      pendingAmountCents: null,
      pendingFrom: null,
    };
    mockUseSubscriptions.mockReturnValue({
      subs: [demoSub],
      accounts: [account],
      incomes: [],
      loading: false,
      error: null,
      setError: vi.fn(),
      reloadAll,
      reloadAccounts: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText(/Du siehst gerade/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Demo-Daten entfernen" }));
    await waitFor(() => expect(removeDemoData).toHaveBeenCalled());
    expect(reloadAll).toHaveBeenCalled();
  });

  it("hat keine axe-Verstöße (App-Shell mit Empty-State)", async () => {
    render(<App />);
    await expectNoAxeViolations();
  });
});
