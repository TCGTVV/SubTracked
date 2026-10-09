import { SHIFT_RULE_OPTIONS } from "../lib/bankdays";
import type { ShiftRule } from "../types";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  id: string;
  value: ShiftRule;
  onChange: (value: ShiftRule) => void;
  /** Abbuchung (Lastschrift → meist nächster Bankarbeitstag) oder Eingang (Gehalt → meist voriger). */
  kind: "outflow" | "income";
}

/**
 * „Wochenende/Feiertag"-Auswahl: wohin die Bank einen auf Samstag, Sonntag oder einen
 * bundeseinheitlichen Feiertag fallenden Termin bucht. Wirkt nur auf die Prognose und die
 * Erinnerung (Buchungstag), nicht auf den hinterlegten Termin.
 */
export function ShiftRuleField({ id, value, onChange, kind }: Props) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Wochenende / Feiertag</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ShiftRule)}>
        <SelectTrigger id={id} className="w-full" aria-describedby={hintId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SHIFT_RULE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={hintId} className="text-xs text-muted-foreground">
        {kind === "outflow"
          ? "Lastschriften werden meist am nächsten Bankarbeitstag gebucht."
          : "Gehalt kommt oft schon am vorigen Bankarbeitstag an."}{" "}
        Gilt für Samstag, Sonntag und bundesweite Feiertage.
      </p>
    </div>
  );
}
