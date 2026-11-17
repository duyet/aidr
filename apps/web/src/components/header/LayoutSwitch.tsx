import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { Newspaper, Rows3, Rows4 } from "lucide-react";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import { type Layout, usePrefs } from "../../lib/prefs";

const LAYOUT_ITEMS: {
  value: Layout;
  vi: string;
  en: string;
  icon: typeof Rows4;
}[] = [
  { value: "compact", vi: "Gọn", en: "Compact", icon: Rows4 },
  { value: "comfortable", vi: "Thoáng", en: "Comfortable", icon: Rows3 },
  { value: "newspaper", vi: "Báo in", en: "Newspaper", icon: Newspaper },
];

/** The menu bar's three-icon layout switch. Below 700px the choice lives in
 *  Customize instead. */
export function LayoutSwitch() {
  const lang = useLang();
  const { prefs, setPrefs } = usePrefs();
  return (
    <SegmentedControl
      aria-label={lang === "vi" ? "Bố cục" : "Layout"}
      value={prefs.layout}
      onValueChange={(layout) => {
        if (layout === null) return;
        setPrefs({ layout });
        track("prefs_change", { pref: "layout", pref_value: layout });
      }}
      className="inline-flex items-center rounded-full bg-muted p-0.5"
    >
      {LAYOUT_ITEMS.map((item) => {
        const label = lang === "vi" ? item.vi : item.en;
        return (
          <SegmentedControlItem
            key={item.value}
            value={item.value}
            aria-label={label}
            title={label}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm motion-reduce:transition-none [&_svg]:size-[15px]"
          >
            <item.icon aria-hidden />
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}
