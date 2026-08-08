"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  /** Virtualisation guard for very long lists (e.g. 1,100+ companies). */
  maxVisible?: number;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  searchPlaceholder = "Search…",
  className,
  disabled,
  maxVisible = 200,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    const source = needle
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) || option.hint?.toLowerCase().includes(needle),
        )
      : options;
    return source.slice(0, maxVisible);
  }, [options, term, maxVisible]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Filter by ${label}`}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition-colors",
              "hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
              selected.length > 0 && "border-primary/40 bg-accent/40",
            )}
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{summary}</span>
            <span className="flex shrink-0 items-center gap-1">
              {selected.length > 1 ? (
                <Badge variant="default" className="px-1.5">
                  {selected.length}
                </Badge>
              ) : null}
              <ChevronsUpDown className="size-3.5 opacity-50" />
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[min(22rem,90vw)] p-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {selected.length > 0 ? (
              <Button variant="ghost" size="xs" onClick={() => onChange([])} className="shrink-0">
                Clear
              </Button>
            ) : null}
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
            ) : (
              filtered.map((option) => {
                const active = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      active && "bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border border-input",
                        active && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {active ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </button>
                );
              })
            )}
            {options.length > filtered.length ? (
              <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">
                Showing {filtered.length} of {options.length} — refine your search
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 3).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/70"
            >
              <span className="max-w-[9rem] truncate">
                {options.find((option) => option.value === value)?.label ?? value}
              </span>
              <X className="size-3" />
            </button>
          ))}
          {selected.length > 3 ? (
            <span className="px-1 text-[11px] text-muted-foreground">+{selected.length - 3} more</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
