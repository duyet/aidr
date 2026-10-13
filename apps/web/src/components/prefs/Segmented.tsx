import type { ReactNode } from "react";

/** Shared look for the prefs panel: one radius, one selected state. */
export const PREFS_LABEL = "text-xs text-muted-foreground";

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex w-full gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              on
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}
