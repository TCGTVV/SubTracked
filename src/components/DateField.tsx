import { format, isValid, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { type Ref, useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

interface Props {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export function DateField({ ariaDescribedBy, ariaInvalid, buttonRef, id, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const label = selected
    ? format(selected, "dd.MM.yyyy", { locale: de })
    : value || "Datum wählen …";

  return (
    <div className="date-field" ref={containerRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className="date-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
      >
        {label}
      </button>
      {open && (
        <div className="date-popover" role="dialog" aria-label="Kalender">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
            locale={de}
            weekStartsOn={1}
            showOutsideDays
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
