import { track } from "@aidr/ui/track";
import { CalendarDays, LayoutGrid, Sparkles, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";
import { type TldrCount, usePrefs } from "../../lib/prefs";

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
      icon: <LayoutGrid className="size-5" aria-hidden />,
    },
    {
      key: "trending",
      label: t("Trending", "Xu hướng"),
      icon: <TrendingUp className="size-5" aria-hidden />,
    },
    {
      key: "tldr",
      label: "AI;DR",
      icon: <Sparkles className="size-5" aria-hidden />,
    },
    {
      key: "days",
      label: t("Daily feed", "Bảng tin theo ngày"),
      icon: <CalendarDays className="size-5" aria-hidden />,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {t("AI;DR items", "Số mục AI;DR")}
        </span>
        <div className="flex gap-1.5">
          {TLDR_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                track("prefs_change", { pref: "tldrCount" });
                setPrefs({ tldrCount: n });
              }}
              aria-pressed={prefs.tldrCount === n}
              className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                prefs.tldrCount === n
                  ? "border-accent bg-muted font-semibold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {t("Sections", "Mục hiển thị")}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {sectionTiles.map(({ key, label, icon }) => {
            const on = prefs.sections[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  track("prefs_change", { pref: `sections.${key}` });
                  setPrefs({
                    sections: { ...prefs.sections, [key]: !on },
                  });
                }}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                  on
                    ? "border-accent bg-muted font-semibold"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {icon}
                <span className="text-xs leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
