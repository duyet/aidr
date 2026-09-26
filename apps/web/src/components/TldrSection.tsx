import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { type AidrLayout, DEFAULT_AIDR_LAYOUT } from "../lib/aidr-layout";
import { timeAgo } from "../lib/lang";
import { type TldrCount, usePrefs } from "../lib/prefs";
import type { Lang, TldrBullet } from "../lib/types";
import { TldrBulletList } from "./TldrBulletList";

export function TldrSection({
  bullets,
  defaultCount,
  lang,
  totalStories,
  updatedAt,
  lastFetchedAt,
  topicByItemId,
  categoryByItemId,
  pathByItemId,
  tagsByItemId,
  imageByItemId,
  snapshotDate,
  layout = DEFAULT_AIDR_LAYOUT,
  layoutLabeled = false,
}: {
  bullets: TldrBullet[];
  defaultCount: number;
  lang: Lang;
  totalStories: number;
  updatedAt: number;
  lastFetchedAt: number | null;
  topicByItemId?: Map<string, string>;
  /** Raw category per story, used when a bullet has no topic tag. */
  categoryByItemId?: Map<string, string>;
  /** Canonical /{8-char} hrefs so Google does not crawl /{full-id}. */
  pathByItemId?: Map<string, string>;
  /** Item tags for in-bullet entity highlight (plus TITLE_KEYWORDS). */
  tagsByItemId?: Map<string, string[]>;
  /** Fallback when a bullet has no read-time `image_url` (cached feeds). */
  imageByItemId?: Map<string, string>;
  snapshotDate?: string;
  layout?: AidrLayout;
  /** Show a tiny "Layout A/B/C" chip when `?aidr=` is set for QA. */
  layoutLabeled?: boolean;
}): ReactElement | null {
  const { setPrefs } = usePrefs();

  if (bullets.length === 0) return null;

  // Only offer count options meaningful for how many bullets exist. With
  // x = bullets.length: x <= 8 hides the selector (show all, no picker).
  // x > 8 shows 8 | min(x, 12), and if x > 12 also | min(x, 16) — each
  // higher (nominal) option's effective/displayed value capped at x, with
  // the persisted pref staying one of the nominal 8/12/16 values.
  const options: { effective: number; nominal: TldrCount }[] = [];
  if (bullets.length > 8) {
    options.push({ effective: 8, nominal: 8 });
    const cap12 = Math.min(bullets.length, 12);
    options.push({ effective: cap12, nominal: 12 });
    if (bullets.length > 12) {
      const cap16 = Math.min(bullets.length, 16);
      if (cap16 !== cap12) options.push({ effective: cap16, nominal: 16 });
    }
  }

  const selectedOption =
    options.find((o) => o.nominal === defaultCount) ??
    options[options.length - 1];
  const effectiveDefault = selectedOption
    ? selectedOption.effective
    : bullets.length;

  const shown = bullets.slice(0, effectiveDefault);
  const mid = Math.ceil(shown.length / 2);

  const selectedIndex = selectedOption ? options.indexOf(selectedOption) : -1;
  const nextOption =
    selectedIndex >= 0 ? options[selectedIndex + 1] : undefined;
  const canCollapse = selectedIndex > 0;
  const numbered = layout === "a";

  return (
    <section
      className="my-2 rounded-2xl border border-border/80 bg-card px-4 py-5 sm:px-5"
      data-aidr-layout={layout}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            AI;DR
          </h2>
          <span className="text-xs text-muted-foreground">
            {snapshotDate
              ? snapshotDate
              : lang === "vi"
                ? "24 giờ qua"
                : "past 24 hours"}
          </span>
          {layoutLabeled && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Layout {layout.toUpperCase()}
            </span>
          )}
        </div>
        {options.length > 0 && (
          <div className="flex gap-1 rounded-full bg-muted/80 p-0.5 text-xs">
            {options.map((o) => (
              <button
                key={o.nominal}
                type="button"
                onClick={() => {
                  track("prefs_change", { pref: "tldrCount" });
                  setPrefs({ tldrCount: o.nominal });
                }}
                aria-pressed={selectedOption === o}
                className={`rounded-full px-2.5 py-1 transition-[background-color,color] duration-150 ${
                  selectedOption === o
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.effective}
              </button>
            ))}
          </div>
        )}
      </div>

      <TldrBulletList
        shown={shown}
        mid={mid}
        layout={layout}
        numbered={numbered}
        lang={lang}
        topicByItemId={topicByItemId}
        categoryByItemId={categoryByItemId}
        pathByItemId={pathByItemId}
        tagsByItemId={tagsByItemId}
        imageByItemId={imageByItemId}
      />

      {nextOption ? (
        <button
          type="button"
          onClick={() => {
            track("prefs_change", { pref: "tldrCount" });
            setPrefs({ tldrCount: nextOption.nominal });
          }}
          className="mt-3 text-xs font-semibold text-accent hover:underline"
        >
          {lang === "vi" ? "Xem thêm ↓" : "Show more ↓"}
        </button>
      ) : (
        canCollapse && (
          <button
            type="button"
            onClick={() => {
              track("prefs_change", { pref: "tldrCount" });
              setPrefs({ tldrCount: options[0].nominal });
            }}
            className="mt-3 text-xs font-semibold text-accent hover:underline"
          >
            {lang === "vi" ? "Thu gọn" : "Show less ↑"}
          </button>
        )
      )}

      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>
          {totalStories} {lang === "vi" ? "tin" : "stories"}
        </span>
        {lastFetchedAt ? (
          <Link
            to="/data"
            suppressHydrationWarning
            className="rounded-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {lang === "vi" ? "Cập nhật" : "Updated"}{" "}
            {timeAgo(lastFetchedAt, updatedAt, lang)}
          </Link>
        ) : (
          <span>{lang === "vi" ? "Cập nhật lúc" : "News as of"}</span>
        )}
      </div>
    </section>
  );
}
