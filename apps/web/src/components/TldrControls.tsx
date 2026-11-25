import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { ImageIcon, Rows2, Rows3 } from "lucide-react";
import type { TldrCount, TldrView } from "../lib/prefs";
import type { Lang } from "../lib/types";

const GROUP_CLASS = "flex gap-0.5 rounded-full bg-muted p-0.5 text-[13px]";
const ITEM_CLASS =
  "inline-flex items-center justify-center rounded-full text-muted-foreground transition-[background-color,color] duration-150 data-checked:bg-primary data-checked:text-primary-foreground data-unchecked:hover:bg-muted data-unchecked:hover:text-foreground";

export function TldrViewSwitch({
  lang,
  view,
  onChange,
  onIntent,
}: {
  lang: Lang;
  view: TldrView;
  onChange: (view: TldrView) => void;
  onIntent?: () => void;
}) {
  const views: { value: TldrView; Icon: typeof ImageIcon; label: string }[] = [
    {
      value: "image",
      Icon: ImageIcon,
      label: lang === "vi" ? "Xem ảnh tóm tắt" : "Show day card",
    },
    {
      value: "rows2",
      Icon: Rows2,
      label: lang === "vi" ? "Chữ, 2 dòng mỗi tin" : "2 rows",
    },
    {
      value: "rows3",
      Icon: Rows3,
      label: lang === "vi" ? "Chữ, 3 dòng mỗi tin" : "3 rows",
    },
  ];
  return (
    <SegmentedControl
      aria-label={lang === "vi" ? "Kiểu hiển thị" : "View"}
      value={view}
      onValueChange={(next) => {
        const picked = views.find((v) => v.value === next);
        if (picked) onChange(picked.value);
      }}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className={GROUP_CLASS}
    >
      {views.map(({ value, Icon, label }) => (
        <SegmentedControlItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className={`${ITEM_CLASS} h-11 w-11 sm:h-8 sm:w-9`}
        >
          <Icon className="size-3.5" aria-hidden />
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

export function TldrCountSwitch({
  lang,
  options,
  selected,
  onChange,
}: {
  lang: Lang;
  options: { effective: number; nominal: TldrCount }[];
  selected: TldrCount;
  onChange: (nominal: TldrCount) => void;
}) {
  return (
    <SegmentedControl
      aria-label={lang === "vi" ? "Số tin hiển thị" : "Stories shown"}
      value={String(selected)}
      onValueChange={(next) => {
        const option = options.find((o) => String(o.nominal) === next);
        if (option) onChange(option.nominal);
      }}
      className={GROUP_CLASS}
    >
      {options.map((o) => (
        <SegmentedControlItem
          key={o.nominal}
          value={String(o.nominal)}
          className={`${ITEM_CLASS} h-11 min-w-11 px-2.5 tabular-nums sm:h-8 sm:min-w-9`}
        >
          {o.effective}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
