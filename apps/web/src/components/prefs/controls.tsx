import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import type { ReactNode } from "react";

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  // Draws the option as a round swatch; the label is then read, not shown.
  color?: string;
}

export const EYEBROW =
  "text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground";
const ROW_LABEL = "text-[12.5px] text-muted-foreground";
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

export function Choice({
  label,
  description,
  value,
  options,
  onPick,
  inline = false,
  disabled = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  value: string | null;
  options: readonly ChoiceOption[];
  onPick: (value: string) => void;
  inline?: boolean;
  disabled?: boolean;
}) {
  const swatches = options.some((o) => o.color);
  return (
    <Field
      className={
        inline
          ? "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
          : "flex flex-col gap-2"
      }
    >
      <FieldLabel className={inline ? ROW_LABEL : EYEBROW}>{label}</FieldLabel>
      {description && (
        <FieldDescription className={ROW_LABEL}>{description}</FieldDescription>
      )}
      <SegmentedControl
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) onPick(next);
        }}
        className={
          swatches
            ? "flex gap-2.5"
            : `flex rounded-full bg-muted p-0.5 data-[disabled]:opacity-50 ${inline ? "" : "w-full"}`
        }
      >
        {options.map((o) =>
          o.color ? (
            <SegmentedControlItem
              key={o.value}
              value={o.value}
              style={{ backgroundColor: o.color }}
              className={`size-[34px] rounded-full border border-input outline-offset-2 data-[checked]:outline-2 data-[checked]:outline-solid data-[checked]:outline-ring ${FOCUS}`}
            >
              <span className="sr-only">{o.label}</span>
            </SegmentedControlItem>
          ) : (
            <SegmentedControlItem
              key={o.value}
              value={o.value}
              className={`min-w-9 rounded-full px-3 py-1.5 text-center text-[12.5px] font-medium leading-tight text-muted-foreground transition-colors hover:text-foreground data-[checked]:bg-foreground data-[checked]:text-background ${inline ? "" : "flex-1"} ${FOCUS}`}
            >
              {o.label}
            </SegmentedControlItem>
          )
        )}
      </SegmentedControl>
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field className="flex items-center justify-between gap-3">
      <FieldLabel className={ROW_LABEL}>{label}</FieldLabel>
      <Switch
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-muted-foreground p-0.5 transition-colors data-[checked]:bg-foreground ${FOCUS}`}
      >
        <SwitchThumb className="size-4 rounded-full bg-background transition-transform data-[checked]:translate-x-4" />
      </Switch>
    </Field>
  );
}
