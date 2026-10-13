import {
  CalendarDays,
  Check,
  LayoutGrid,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { ReactElement } from "react";
import { track } from "../../lib/analytics/track";
import { type TldrCount, usePrefs } from "../../lib/prefs";
import { PREFS_LABEL, Segmented } from "./Segmented";

const TLDR_COUNTS: TldrCount[] = [8, 12, 16];

export function SettingsTab({ t }: { t: (en: string, vi: string) => string }) {
  const { prefs, setPrefs } = usePrefs();

  const sectionTiles: {
    key: keyof typeof prefs.sections;
    label: string;
    icon: ReactElement;
  }[] = [
    {
      key: "categories",
      label: t("Category nav", "Danh mục"),
      icon: <LayoutGrid className="size-3.5 shrink-0" aria-hidden />,
    },
    {
      key: "trending",
      label: t("Trending", "Xu hướng"),
      icon: <TrendingUp className="size-3.5 shrink-0" aria-hidden />,
    },
    {
      key: "tldr",
      label: "AI;DR",
      icon: <Sparkles className="size-3.5 shrink-0" aria-hidden />,
    },
    {
      key: "days",
      label: t("Daily feed", "Bảng tin theo ngày"),
      icon: <CalendarDays className="size-3.5 shrink-0" aria-hidden />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className={`block ${PREFS_LABEL}`}>
          {t("AI;DR items", "Số mục AI;DR")}
        </span>
        <Segmented
          label={t("AI;DR items", "Số mục AI;DR")}
          value={prefs.tldrCount}
          onChange={(n: TldrCount) => {
            track("prefs_change", { pref: "tldrCount", pref_value: `${n}` });
            setPrefs({ tldrCount: n });
          }}
          options={TLDR_COUNTS.map((n) => ({ value: n, label: n }))}
        />
      </div>

      <div className="space-y-1.5">
        <span className={`block ${PREFS_LABEL}`}>
          {t("Sections", "Mục hiển thị")}
        </span>
        <div className="grid grid-cols-2 gap-1">
          {sectionTiles.map(({ key, label, icon }) => {
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
                  setPrefs({
                    sections: { ...prefs.sections, [key]: !on },
                  });
                }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  on
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <Check
                  className={`size-3.5 shrink-0 ${on ? "" : "invisible"}`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
