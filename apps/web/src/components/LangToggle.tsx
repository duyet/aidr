import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import type { Lang } from "../lib/types";

const MODES: { value: Lang; label: string }[] = [
  { value: "vi", label: "VI" },
  { value: "en", label: "EN" },
];

const ITEM_CLASS =
  "inline-flex h-7 min-w-9 flex-1 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm data-disabled:cursor-not-allowed motion-reduce:transition-none";

/** VI | EN. Bilingual mode is a Customize setting, not part of this switch. */
export function LangToggle({
  lang,
  onChange,
  disabled,
  className = "",
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  disabled?: boolean;
  className?: string;
}) {
  const choose = (next: Lang | null) => {
    if (next === null || next === lang) return;
    onChange(next);
  };

  return (
    <SegmentedControl
      aria-label={lang === "vi" ? "Ngôn ngữ" : "Language"}
      value={lang}
      onValueChange={choose}
      disabled={disabled}
      title={
        disabled
          ? lang === "vi"
            ? "Trang này chỉ có tiếng Anh"
            : "English only"
          : undefined
      }
      className={`inline-flex items-center rounded-full bg-muted p-0.5 data-disabled:opacity-50 ${className}`}
    >
      {MODES.map((mode) => (
        <SegmentedControlItem
          key={mode.value}
          value={mode.value}
          className={ITEM_CLASS}
        >
          {mode.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
