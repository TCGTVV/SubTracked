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
    if (options.account === null) return "";
    if (options.account === "none") return "__none__";
    return String(options.account);
  }

  function parseAccount(value: string): AccountFilter {
    if (value === "") return null;
    if (value === "__none__") return "none";
    return Number(value);
  }

  function parseNotify(value: string): NotifyFilter {
    if (value === "on" || value === "off") return value;
    return null;
  }

  return (
    <div className="filter-bar">
      {showAccountFilter && (
        <label className="filter-field">
          <span>Konto</span>
          <select
            id={accountId}
            value={accountValue()}
            onChange={(e) => onChange({ ...options, account: parseAccount(e.target.value) })}
          >
            <option value="">Alle</option>
            {visibleAccounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
            {showUnassigned && <option value="__none__">(kein Konto)</option>}
          </select>
        </label>
      )}

      {showCurrencyFilter && (
        <label className="filter-field">
          <span>Währung</span>
          <select
            id={currencyId}
            value={options.currency ?? ""}
            onChange={(e) =>
              onChange({ ...options, currency: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">Alle</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="filter-field">
        <span>Erinnerungen</span>
        <select
          id={notifyId}
          value={options.notify ?? ""}
          onChange={(e) => onChange({ ...options, notify: parseNotify(e.target.value) })}
        >
          <option value="">Alle</option>
          <option value="on">Mit Erinnerung</option>
          <option value="off">Stumm</option>
        </select>
      </label>

      <label className="filter-field">
        <span>Sortierung</span>
        <select
          id={sortId}
          value={options.sort}
          onChange={(e) => onChange({ ...options, sort: e.target.value as SortKey })}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
