import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { type AidrLayout, DEFAULT_AIDR_LAYOUT } from "../lib/aidr-layout";
import { track } from "../lib/analytics/track";
import { dayOgDateParts } from "../lib/day-og";
import { timeAgo } from "../lib/lang";
import { type TldrCount, usePrefs } from "../lib/prefs";
import { tldrCountOptions, tldrShownCount } from "../lib/tldr-links";
import type { Lang, TldrBullet } from "../lib/types";
import { DayCardView, DayCardViewSwitch } from "./DayCardPreview";
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
  dateHref,
  singleColumn = false,
  showFreshness = true,
}: {
  bullets: TldrBullet[];
  defaultCount: TldrCount;
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
  /** Links the snapshot date (e.g. to its day archive page). */
  dateHref?: string;
  /** One bullet column, for narrow slots such as the day page sidebar. */
  singleColumn?: boolean;
  /** The live "Updated …" footer; off for archived days. */
  showFreshness?: boolean;
}): ReactElement | null {
  const { setPrefs } = usePrefs();
  const [preview, setPreview] = useState(false);
  const [cardWarm, setCardWarm] = useState(false);

  if (bullets.length === 0) return null;

  // The 8 | 12 | 16 arithmetic lives in `lib/tldr-links` so the homepage
  // JSON-LD ItemList (#224) resolves the same "how many bullets are painted"
  // answer this component does, instead of a second copy drifting from it.
  const options = tldrCountOptions(bullets.length);
  const selectedOption =
    options.find((o) => o.nominal === defaultCount) ??
    options[options.length - 1];

  const shown = bullets.slice(0, tldrShownCount(bullets.length, defaultCount));
  const mid = singleColumn ? shown.length : Math.ceil(shown.length / 2);

  const selectedIndex = selectedOption ? options.indexOf(selectedOption) : -1;
  const nextOption =
    selectedIndex >= 0 ? options[selectedIndex + 1] : undefined;
  const canCollapse = selectedIndex > 0;
  const numbered = layout === "a";
  const dateParts = snapshotDate ? dayOgDateParts(snapshotDate, lang) : null;

  return (
    <section
      className="my-3 overflow-hidden rounded-lg border border-border bg-card"
      data-aidr-layout={layout}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          {dateParts ? (
            <>
              <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                {dateParts.day}
              </span>
              <span className="flex min-w-0 flex-col font-mono text-[11px] uppercase leading-[1.45] tracking-[0.1em]">
                <span className="inline-flex items-center gap-1.5 font-medium text-accent">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-signal"
                  />
                  AI;DR
                </span>
                {dateHref ? (
                  <a
                    href={dateHref}
                    className="truncate rounded-[6px] text-muted-foreground hover:text-foreground"
                  >
                    {dateParts.weekday} · {dateParts.monthYear}
                  </a>
                ) : (
                  <span className="truncate text-muted-foreground">
                    {dateParts.weekday} · {dateParts.monthYear}
                  </span>
                )}
              </span>
            </>
          ) : (
            <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-signal"
              />
              AI;DR{" "}
              <span className="font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-muted-foreground">
                {lang === "vi" ? "24 giờ qua" : "past 24 hours"}
              </span>
            </h2>
          )}
          {layoutLabeled && (
            <span className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Layout {layout.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {snapshotDate && dateHref ? (
            <DayCardViewSwitch
              lang={lang}
              showImage={preview}
              onChange={(showImage) => {
                track("tldr_toggle", { view: showImage ? "image" : "text" });
                setPreview(showImage);
              }}
              onIntent={() => setCardWarm(true)}
            />
          ) : null}
          {options.length > 0 && (
            <div className="flex gap-0.5 rounded-full border border-input p-0.5 text-[13px]">
              {options.map((o) => (
                <button
                  key={o.nominal}
                  type="button"
                  onClick={() => {
                    track("prefs_change", {
                      pref: "tldrCount",
                      pref_value: `${o.nominal}`,
                    });
                    setPrefs({ tldrCount: o.nominal });
                  }}
                  aria-pressed={selectedOption === o}
                  className={`inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 tabular-nums transition-[background-color,color] duration-150 ${
                    selectedOption === o
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {o.effective}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-1 pb-3 sm:px-[18px]">
        {snapshotDate && dateHref ? (
          <DayCardView
            date={snapshotDate}
            lang={lang}
            open={preview}
            warm={cardWarm}
          />
        ) : null}
        <div hidden={preview}>
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
                track("prefs_change", {
                  pref: "tldrCount",
                  pref_value: `${nextOption.nominal}`,
                });
                setPrefs({ tldrCount: nextOption.nominal });
              }}
              className="mt-1 inline-flex h-8 items-center rounded-[6px] text-[13px] font-medium text-accent hover:underline"
            >
              {lang === "vi" ? "Xem thêm ↓" : "Show more ↓"}
            </button>
          ) : (
            canCollapse && (
              <button
                type="button"
                onClick={() => {
                  track("prefs_change", {
                    pref: "tldrCount",
                    pref_value: `${options[0].nominal}`,
                  });
                  setPrefs({ tldrCount: options[0].nominal });
                }}
                className="mt-1 inline-flex h-8 items-center rounded-[6px] text-[13px] font-medium text-accent hover:underline"
              >
                {lang === "vi" ? "Thu gọn" : "Show less ↑"}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground tabular-nums sm:px-[18px]">
        <span>
          {totalStories} {lang === "vi" ? "tin" : "stories"}
        </span>
        {!showFreshness ? null : lastFetchedAt ? (
          <Link
            to="/data"
            suppressHydrationWarning
            className="inline-flex items-center gap-1.5 rounded-[6px] hover:text-foreground"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-signal"
            />
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
