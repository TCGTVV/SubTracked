import { format, isValid, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { type Ref, useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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

  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const label = selected
    ? format(selected, "dd.MM.yyyy", { locale: de })
    : value || "Datum wählen …";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          ref={buttonRef}
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs transition-colors hover:bg-accent/5 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive",
            !selected && "text-muted-foreground",
          )}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
        >
          {label}
          <CalendarIcon className="size-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
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
      </PopoverContent>
    </Popover>
  );
}
