import {
  LayoutDashboard,
  type LucideIcon,
  Monitor,
  Moon,
  Plus,
  Repeat,
  Settings,
  Sun,
  Wallet,
} from "lucide-react";
import type { ColorScheme } from "../hooks/useColorScheme";
import { formatAmount } from "../lib/format";
import { cn } from "../lib/utils";
import type { Account } from "../types";

export type DashboardView = "overview" | "subs" | "incomes";

const NAV: { id: DashboardView; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "subs", label: "Abos", icon: Repeat },
  { id: "incomes", label: "Einnahmen", icon: Wallet },
];

interface Props {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
  accounts: Account[];
  onOpenAccounts: () => void;
  onOpenSettings: () => void;
  scheme: ColorScheme;
  onSchemeChange: (s: ColorScheme) => void;
}

export function AppSidebar({
  view,
  onViewChange,
  accounts,
  onOpenAccounts,
  onOpenSettings,
  scheme,
  onSchemeChange,
}: Props) {
  return (
    <aside className="flex h-full flex-col gap-4 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-2 pt-1">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm">
          <Wallet className="size-4.5" />
        </span>
        <span className="text-fluid-lg font-bold tracking-tight">SubTracked</span>
      </div>

      {/* Views */}
      <nav className="flex flex-col gap-1">
        {NAV.map(({ id, label, icon: IconCmp }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
              )}
            >
              <IconCmp className="size-4.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Konten */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
            Konten
          </span>
          <button
            type="button"
            onClick={onOpenAccounts}
            aria-label="Konten verwalten"
            className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {accounts.length === 0 ? (
            <button
              type="button"
              onClick={onOpenAccounts}
              className="rounded-lg px-3 py-2 text-left text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50"
            >
              Konto anlegen …
            </button>
          ) : (
            accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={onOpenAccounts}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-sidebar-accent/50"
              >
                <span className="truncate text-sm font-medium">{a.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-sidebar-foreground/70">
                  {formatAmount(a.balanceCents, a.currency)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Footer: Theme-Toggle + Einstellungen */}
      <div className="flex flex-col gap-2 border-t border-sidebar-border pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar-accent/40 p-1">
          {(
            [
              { id: "light", label: "Hell", icon: Sun },
              { id: "system", label: "System", icon: Monitor },
              { id: "dark", label: "Dunkel", icon: Moon },
            ] as const
          ).map(({ id, label, icon: IconCmp }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSchemeChange(id)}
              aria-label={label}
              aria-pressed={scheme === id}
              title={label}
              className={cn(
                "grid place-items-center rounded-md py-1.5 transition-colors",
                scheme === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
              )}
            >
              <IconCmp className="size-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
        >
          <Settings className="size-4.5 shrink-0" />
          Einstellungen
        </button>
      </div>
    </aside>
  );
}
