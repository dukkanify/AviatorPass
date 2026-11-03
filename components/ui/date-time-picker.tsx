"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateTimePickerProps {
  /** `datetime-local` wall value: `YYYY-MM-DDTHH:mm` */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

function parseDateTimeLocal(value: string | undefined): { date?: Date; time: string } {
  if (!value?.trim()) return { time: "09:00" };
  const [datePart, timePart = "09:00"] = value.split("T");
  if (!datePart) return { time: timePart.slice(0, 5) || "09:00" };
  const date = parse(datePart, "yyyy-MM-dd", new Date());
  if (Number.isNaN(date.getTime())) return { time: timePart.slice(0, 5) || "09:00" };
  return { date, time: timePart.slice(0, 5) || "09:00" };
}

function toDateTimeLocal(date: Date, time: string): string {
  return `${format(date, "yyyy-MM-dd")}T${time || "09:00"}`;
}

function DateTimePicker({
  value = "",
  onChange,
  placeholder = "Pick date & time",
  className,
  disabled,
  id,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const { date, time } = parseDateTimeLocal(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            "h-10 w-full min-w-0 justify-start px-3 text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
          {date ? (
            <span className="truncate">
              {format(date, "dd/MM/yyyy")} · {time}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(next) => {
            if (!next) {
              onChange?.("");
              return;
            }
            onChange?.(toDateTimeLocal(next, time));
          }}
          initialFocus
        />
        <div className="space-y-2 border-t border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={id ? `${id}-time` : undefined} className="text-xs">
              Time
            </Label>
            <Input
              id={id ? `${id}-time` : undefined}
              type="time"
              value={time}
              onChange={(e) => {
                const nextTime = e.target.value || "09:00";
                onChange?.(toDateTimeLocal(date ?? new Date(), nextTime));
              }}
              onClick={(e) => {
                const el = e.currentTarget;
                try {
                  el.showPicker?.();
                } catch {
                  /* ignore unsupported / already-open */
                }
              }}
            />
          </div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DateTimePicker };
