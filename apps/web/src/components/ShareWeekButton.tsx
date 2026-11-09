import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { withUtm } from "../../worker/utm.js";
import { track } from "../lib/analytics/track";
import { absoluteSiteUrl } from "../lib/locale-url";
import type { Lang } from "../lib/types";
import { formatWeekRange, weekPath } from "../lib/week";

type WeekLike = {
  week: string;
  start_date: string;
  end_date: string;
  issue: number;
};

const COPY = {
  en: { share: "Share", shared: "Shared", copied: "Copied" },
  vi: { share: "Chia sẻ", shared: "Đã chia sẻ", copied: "Đã chép" },
} as const;

/** Share one weekly issue: the native share sheet where offered (phones,
 * some desktops), otherwise the "text + link" post text on the clipboard.
 * Styled after the story page's action pill so the two pages read as one. */
export function ShareWeekButton({
  week,
  lang,
  className = "",
}: {
  week: WeekLike;
  lang: Lang;
  className?: string;
}) {
  const copy = COPY[lang];
  const [state, setState] = useState<"idle" | "shared" | "copied">("idle");

  const label =
    state === "idle"
      ? copy.share
      : state === "shared"
        ? copy.shared
        : copy.copied;
  const Icon = state === "idle" ? Share2 : Check;

  const onShare = async () => {
    const range = formatWeekRange(week.start_date, week.end_date, lang);
    const title =
      lang === "vi"
        ? `AI;DR Tuần Này số ${week.issue} · ${range}`
        : `AI;DR Weekly No. ${week.issue} · ${range}`;
    const url = withUtm(absoluteSiteUrl(weekPath(week.week), lang), {
      source: "share",
      medium: "social",
      campaign: `weekly-${week.week}`,
      content: "share",
    });
    const text = `${title}\n\n${url}`;
    track("source_click", { item_id: week.week, placement: "row" });
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text, url });
        setState("shared");
        return;
      }
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // User dismissed the share sheet or clipboard was refused: nothing
      // to undo, and no toast to clear.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[calc(12px*var(--reader-font-size,1))] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </button>
  );
}
