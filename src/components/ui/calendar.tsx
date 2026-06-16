import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * shadcn-Style-Calendar als Wrapper um react-day-picker v10. Token-basiert
 * (kein react-day-picker/style.css mehr), damit Light/Dark über die App-Tokens
 * laufen.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      classNames={{
        root: cn(defaults.root, "w-fit"),
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-3",
        month_caption: "flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "opacity-70"),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "opacity-70"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 flex-1 text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: cn(
          "relative size-9 flex-1 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-9 font-normal aria-selected:opacity-100",
        ),
        today: "rounded-md bg-accent/40 text-accent-foreground",
        selected:
          "rounded-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground/40 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
