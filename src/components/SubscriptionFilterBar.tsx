import { useId } from "react";
import {
  type AccountFilter,
  hasUnassignedSubs,
  type NotifyFilter,
  type SortKey,
  type SubListOptions,
  uniqueCurrencies,
} from "../lib/subscription-list";
import type { Account, Subscription } from "../types";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  /** Die *vor* Filtern sichtbaren Subs (also nach Archiv-Toggle) — bestimmt die Optionen. */
  subs: Subscription[];
  accounts: Account[];
  options: SubListOptions;
  onChange: (next: SubListOptions) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "due-asc", label: "Fälligkeit (nächste zuerst)" },
  { value: "due-desc", label: "Fälligkeit (späteste zuerst)" },
  { value: "amount-asc", label: "Betrag (aufsteigend)" },
  { value: "amount-desc", label: "Betrag (absteigend)" },
];

/** Sentinel für „Alle" — Radix-Select erlaubt keinen leeren Item-Wert. */
const ALL = "__all__";
const NONE = "__none__";

export function SubscriptionFilterBar({ subs, accounts, options, onChange }: Props) {
  const accountId = useId();
  const currencyId = useId();
  const notifyId = useId();
  const sortId = useId();

  const currencies = uniqueCurrencies(subs);
  const referencedAccountIds = new Set(
    subs.map((s) => s.accountId).filter((id): id is number => id != null),
  );
  const visibleAccounts = accounts.filter((a) => referencedAccountIds.has(a.id));
  const showUnassigned = hasUnassignedSubs(subs);
  const showAccountFilter = visibleAccounts.length + (showUnassigned ? 1 : 0) > 1;
  const showCurrencyFilter = currencies.length > 1;

  function accountValue(): string {
    if (options.account === null) return ALL;
    if (options.account === "none") return NONE;
    return String(options.account);
  }

  function parseAccount(value: string): AccountFilter {
    if (value === ALL) return null;
    if (value === NONE) return "none";
    return Number(value);
  }

  function parseNotify(value: string): NotifyFilter {
    if (value === "on" || value === "off") return value;
    return null;
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {showAccountFilter && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={accountId} className="text-xs text-muted-foreground">
            Konto
          </Label>
          <Select
            value={accountValue()}
            onValueChange={(v) => onChange({ ...options, account: parseAccount(v) })}
          >
            <SelectTrigger id={accountId} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle</SelectItem>
              {visibleAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
              {showUnassigned && <SelectItem value={NONE}>(kein Konto)</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}

      {showCurrencyFilter && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={currencyId} className="text-xs text-muted-foreground">
            Währung
          </Label>
          <Select
            value={options.currency ?? ALL}
            onValueChange={(v) => onChange({ ...options, currency: v === ALL ? null : v })}
          >
            <SelectTrigger id={currencyId} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle</SelectItem>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notifyId} className="text-xs text-muted-foreground">
          Erinnerungen
        </Label>
        <Select
          value={options.notify ?? ALL}
          onValueChange={(v) => onChange({ ...options, notify: parseNotify(v) })}
        >
          <SelectTrigger id={notifyId} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle</SelectItem>
            <SelectItem value="on">Mit Erinnerung</SelectItem>
            <SelectItem value="off">Stumm</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={sortId} className="text-xs text-muted-foreground">
          Sortierung
        </Label>
        <Select
          value={options.sort}
          onValueChange={(v) => onChange({ ...options, sort: v as SortKey })}
        >
          <SelectTrigger id={sortId} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
