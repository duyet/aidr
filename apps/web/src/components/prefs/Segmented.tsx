import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card";

export function PrefsRow({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span id={id} className="shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({
  labelledBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-labelledby={labelledBy}
      className="inline-flex shrink-0 gap-0.5 rounded-md border border-border p-0.5"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex h-6 min-w-7 items-center justify-center gap-1 rounded-[5px] px-2 text-xs transition-colors ${FOCUS} ${
              on
                ? "bg-foreground font-medium text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function PrefsSelect<T extends string>({
  labelledBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-labelledby={labelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`h-7 min-w-[7.5rem] cursor-pointer appearance-none rounded-md border border-border bg-card py-0 pr-7 pl-2.5 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted ${FOCUS}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}
