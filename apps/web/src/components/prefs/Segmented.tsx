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
export function PrefsSlider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  readout,
  start,
  end,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Trailing readout, e.g. "110%" or "Medium". */
  readout: string;
  /** Optional decorative marks at the slider ends. */
  start?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
          {label}
        </label>
        <output
          htmlFor={id}
          className="text-xs font-medium tabular-nums text-foreground"
        >
          {readout}
        </output>
      </div>
      <div className="flex items-center gap-2">
        {start != null ? (
          <span aria-hidden className="shrink-0 text-muted-foreground">
            {start}
          </span>
        ) : null}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ accentColor: "var(--ring)" }}
          className={`h-6 w-full cursor-pointer rounded-full ${FOCUS}`}
        />
        {end != null ? (
          <span aria-hidden className="shrink-0 text-muted-foreground">
            {end}
          </span>
        ) : null}
      </div>
    </div>
  );
}
