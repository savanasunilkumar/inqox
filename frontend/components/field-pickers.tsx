"use client";

import { useState } from "react";
import { format, isValid, parse, parseISO } from "date-fns";
import { CalendarIcon, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TriggerProps = {
  id: string;
  invalid?: boolean;
  describedBy?: string;
  labelledBy?: string;
};

const triggerClass = "h-8 w-full justify-between px-2.5 font-normal aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

const MONTH_FORMATS = ["MMM yyyy", "MMMM yyyy", "MM/yyyy", "M/yyyy", "yyyy-MM", "yyyy"];

function parseValue(value: string, granularity: "day" | "month"): Date | undefined {
  if (!value) return undefined;
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  if (granularity === "month") {
    for (const pattern of MONTH_FORMATS) {
      const parsed = parse(value.trim(), pattern, new Date());
      if (isValid(parsed)) return parsed;
    }
  }
  return undefined;
}

export function DatePicker({ id, value, onChange, granularity = "day", invalid, describedBy, labelledBy }: TriggerProps & {
  value: string;
  onChange: (value: string) => void;
  granularity?: "day" | "month";
}) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(value, granularity);
  const display = selected ? format(selected, granularity === "day" ? "MMM d, yyyy" : "MMM yyyy") : value;
  const thisYear = new Date().getFullYear();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined} className={triggerClass}>
          <span className={display ? "" : "text-muted-foreground"}>{display || (granularity === "day" ? "Pick a date" : "Pick a month")}</span>
          <CalendarIcon className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(thisYear - 60, 0)}
          endMonth={new Date(thisYear + 10, 11)}
          onSelect={date => {
            if (!date) return;
            onChange(format(date, granularity === "day" ? "yyyy-MM-dd" : "MMM yyyy"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function Combobox({ id, value, onChange, options, placeholder, allowCustom, invalid, describedBy, labelledBy }: TriggerProps & {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const custom = allowCustom && trimmed && !options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const choose = (next: string) => { onChange(next); setOpen(false); setQuery(""); };
  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined} className={triggerClass}>
          <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{value || placeholder || "Select…"}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{allowCustom ? "Type to add your own." : "No matches."}</CommandEmpty>
            {custom && (
              <CommandGroup>
                <CommandItem value={`custom:${trimmed}`} onSelect={() => choose(trimmed)}>Use “{trimmed}”</CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map(option => (
                <CommandItem key={option} value={option} data-checked={option === value} onSelect={() => choose(option)}>
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
