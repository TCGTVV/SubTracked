import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import "react-day-picker/style.css";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function DateField({ id, value, onChange, required }: Props) {
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

  const selected = value ? parseISO(value) : undefined;
  const label = selected ? format(selected, "dd.MM.yyyy", { locale: de }) : "Datum wählen …";

  return (
    <div className="date-field" ref={containerRef}>
      <button
        id={id}
        type="button"
        className="date-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required}
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
