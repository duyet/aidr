import { Toggle } from "@ui-sdk/react/toggle";
import { CalendarDays, LayoutGrid, Sparkles, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";
import { track } from "../lib/analytics/track";
import { type Prefs, usePrefs } from "../lib/prefs";
import { Bi } from "./Bi";

type Section = keyof Prefs["sections"];

const SECTION_TILES: {
  key: Section;
  en: string;
  vi: string;
  icon: ReactElement;
}[] = [
  {
    key: "categories",
    en: "Category nav",
    vi: "Danh mục",
    icon: <LayoutGrid aria-hidden />,
  },
  {
    key: "trending",
    en: "Trending",
    vi: "Xu hướng",
    icon: <TrendingUp aria-hidden />,
  },
  { key: "tldr", en: "AI;DR", vi: "AI;DR", icon: <Sparkles aria-hidden /> },
  {
    key: "days",
    en: "Daily feed",
    vi: "Bảng tin theo ngày",
    icon: <CalendarDays aria-hidden />,
  },
];

/** The home page's own section picker, at the foot of the feed it shapes. */
export function HomeSections() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <section aria-labelledby="home-sections" className="pb-2">
      <h2
        id="home-sections"
        className="mb-2.5 text-[12.5px] font-bold uppercase tracking-[0.07em] text-foreground"
      >
        <Bi vi="Hiện trên trang chủ" en="Show on home" inline />
      </h2>
      <div className="flex flex-wrap gap-2">
        {SECTION_TILES.map(({ key, en, vi, icon }) => {
          const on = prefs.sections[key];
          return (
            <Toggle
              key={key}
              pressed={on}
              onPressedChange={() => {
                track("prefs_change", {
                  pref: `sections.${key}`,
                  pref_value: on ? "off" : "on",
                });
                setPrefs({ sections: { ...prefs.sections, [key]: !on } });
              }}
              className="chip"
            >
              {icon}
              <Bi vi={vi} en={en} inline />
            </Toggle>
          );
        })}
      </div>
    </section>
  );
}
