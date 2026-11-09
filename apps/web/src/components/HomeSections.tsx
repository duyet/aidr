import {
  CalendarDays,
  Check,
  Home,
  LayoutGrid,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { ReactElement } from "react";
import { track } from "../lib/analytics/track";
import { type Prefs, usePrefs } from "../lib/prefs";
import type { Lang } from "../lib/types";

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
    icon: <LayoutGrid className="size-3.5 shrink-0" aria-hidden />,
  },
  {
    key: "trending",
    en: "Trending",
    vi: "Xu hướng",
    icon: <TrendingUp className="size-3.5 shrink-0" aria-hidden />,
  },
  {
    key: "tldr",
    en: "AI;DR",
    vi: "AI;DR",
    icon: <Sparkles className="size-3.5 shrink-0" aria-hidden />,
  },
  {
    key: "days",
    en: "Daily feed",
    vi: "Bảng tin theo ngày",
    icon: <CalendarDays className="size-3.5 shrink-0" aria-hidden />,
  },
];

/** The home page's own section picker, at the foot of the feed it shapes:
 *  one quiet card whose visible sections are toggle pills. */
export function HomeSections({ lang }: { lang: Lang }) {
  const { prefs, setPrefs } = usePrefs();
  const vi = lang === "vi";
  const onCount = SECTION_TILES.filter((t) => prefs.sections[t.key]).length;
  return (
    <section
      aria-labelledby="home-sections"
      className="mt-10 rounded-2xl border border-border bg-card/60 px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="home-sections"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Home className="size-3.5 shrink-0" aria-hidden />
          {vi ? "Hiện trên trang chủ" : "Show on home"}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {onCount}/{SECTION_TILES.length}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {SECTION_TILES.map(({ key, en, vi: viLabel, icon }) => {
          const on = prefs.sections[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                track("prefs_change", {
                  pref: `sections.${key}`,
                  pref_value: on ? "off" : "on",
                });
                setPrefs({ sections: { ...prefs.sections, [key]: !on } });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on
                  ? "border-accent/40 bg-accent/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {icon}
              <span className="min-w-0 flex-1 truncate">
                {vi ? viLabel : en}
              </span>
              <Check
                className={`size-3.5 shrink-0 ${on ? "text-accent" : "invisible"}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
