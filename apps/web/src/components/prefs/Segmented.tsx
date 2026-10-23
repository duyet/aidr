import { Minus, Plus } from "lucide-react";
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

export function Stepper({
  labelledBy,
  display,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
}: {
  labelledBy: string;
  display: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const btn = `flex size-6 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 ${FOCUS}`;
  return (
    <fieldset
      aria-labelledby={labelledBy}
      className="inline-flex shrink-0 items-center rounded-md border border-border p-0.5"
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={!canDecrease}
        onClick={onDecrease}
        className={btn}
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <output
        aria-live="polite"
        className="min-w-[5.5rem] text-center text-xs font-medium tabular-nums"
      >
        {display}
      </output>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={!canIncrease}
        onClick={onIncrease}
        className={btn}
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </fieldset>
  );
}
