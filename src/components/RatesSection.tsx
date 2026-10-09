import { Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { deleteRate, listRates, setRate } from "../lib/db";
import { toUserMessage } from "../lib/errors";
import { CURRENCY_OPTIONS } from "../lib/format";
import { formatRate, parseRateInput } from "../lib/rates";
import type { ExchangeRate } from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface Props {
  /** Nach jeder Änderung, damit die Prognose mit den neuen Kursen neu rechnet. */
  onChanged?: () => void | Promise<void>;
}

/**
 * Manuelle Wechselkurse für Abos/Einnahmen in einer anderen Währung als ihr Konto. Ohne Kurs
 * bleiben solche Posten aus der Prognose ausgeschlossen; mit Kurs werden sie umgerechnet und in
 * der Übersicht als „≈" gekennzeichnet. Es gibt bewusst keinen automatischen Kursabruf — die App
 * macht keine Netzwerkzugriffe auf deine Daten.
 */
export function RatesSection({ onChanged }: Props) {
  const formId = useId();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [rateInput, setRateInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRates(await listRates());
    } catch (e) {
      setError(toUserMessage(e, "Wechselkurse laden"));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (from === to) {
      setInputError("Bitte zwei verschiedene Währungen wählen.");
      return;
    }
    const micros = parseRateInput(rateInput);
    if (micros === null) {
      setInputError("Bitte einen Kurs größer als 0 mit höchstens 6 Nachkommastellen eingeben.");
      return;
    }
    setInputError(null);
    setPending(true);
    try {
      await setRate(from, to, micros);
      setRateInput("");
      await reload();
      await onChanged?.();
    } catch (err) {
      setError(toUserMessage(err, "Kurs speichern"));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(rate: ExchangeRate) {
    setError(null);
    try {
      await deleteRate(rate.fromCurrency, rate.toCurrency);
      await reload();
      await onChanged?.();
    } catch (err) {
      setError(toUserMessage(err, "Kurs löschen"));
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${formId}-heading`}>
      <h3 id={`${formId}-heading`} className="font-semibold">
        Wechselkurse
      </h3>
      <p className="text-sm text-muted-foreground">
        Für Abos oder Einnahmen in einer anderen Währung als ihr Konto. Ohne Kurs fehlen sie in der
        Prognose; mit Kurs werden sie umgerechnet und als „≈" gekennzeichnet. Kurse trägst du von
        Hand ein — es wird nichts automatisch abgerufen. Reicht der Gegenkurs, wird sein Kehrwert
        genutzt.
      </p>

      {rates.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rates.map((r) => (
            <li
              key={`${r.fromCurrency}-${r.toCurrency}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="tabular-nums">
                1 {r.fromCurrency} = {formatRate(r.rateMicros)} {r.toCurrency}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleDelete(r)}
                aria-label={`Kurs ${r.fromCurrency} nach ${r.toCurrency} löschen`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-from`}>Von</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id={`${formId}-from`} className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-to`}>Nach</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger id={`${formId}-to`} className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-rate`}>
            Kurs (1 {from} = … {to})
          </Label>
          <Input
            id={`${formId}-rate`}
            inputMode="decimal"
            placeholder="z.B. 0,92"
            value={rateInput}
            onChange={(e) => {
              setRateInput(e.target.value);
              setInputError(null);
            }}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? `${formId}-error` : undefined}
            className="w-32"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern …" : "Kurs speichern"}
        </Button>
      </form>
      {inputError && (
        <p id={`${formId}-error`} role="alert" className="text-sm text-destructive">
          {inputError}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
