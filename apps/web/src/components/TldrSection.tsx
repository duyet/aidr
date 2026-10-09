import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { type AidrLayout, DEFAULT_AIDR_LAYOUT } from "../lib/aidr-layout";
import { dayOgDateParts } from "../lib/day-og";
import { timeAgo } from "../lib/lang";
import { type TldrCount, usePrefs } from "../lib/prefs";
import { tldrCountOptions, tldrShownCount } from "../lib/tldr-links";
import type { Lang, TldrBullet } from "../lib/types";
import { DayCardOverlay, DayCardViewSwitch } from "./DayCardPreview";
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
      className="my-2 overflow-hidden rounded-2xl border border-border/80 bg-card"
      data-aidr-layout={layout}
    >
      {/* Yellow masthead: the digest heading reads like the day card itself. */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f5c518] px-4 py-3 text-[#0a0a0a] sm:px-5">
        <div className="flex items-center gap-3">
          {dateParts ? (
            <>
              <span className="text-4xl font-bold leading-none tracking-tighter sm:text-5xl">
                {dateParts.day}
              </span>
              {dateHref ? (
                <a
                  href={dateHref}
                  className="flex flex-col text-[11px] font-bold uppercase leading-snug tracking-[0.2em] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a0a0a]"
                >
                  <span>{dateParts.weekday}</span>
                  <span>{dateParts.monthYear}</span>
                </a>
              ) : (
                <span className="flex flex-col text-[11px] font-bold uppercase leading-snug tracking-[0.2em]">
                  <span>{dateParts.weekday}</span>
                  <span>{dateParts.monthYear}</span>
                </span>
              )}
            </>
          ) : (
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              AI;DR{" "}
              <span className="font-sans text-xs font-normal">
                {lang === "vi" ? "24 giờ qua" : "past 24 hours"}
              </span>
            </h2>
          )}
          {layoutLabeled && (
            <span className="rounded-full border border-[#0a0a0a]/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
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
                track("tldr_view", { view: showImage ? "image" : "text" });
                setPreview(showImage);
              }}
            />
          ) : null}
          {options.length > 0 && (
            <div className="flex gap-1 rounded-full bg-[#0a0a0a]/10 p-0.5 text-xs">
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
                      ? "bg-[#0a0a0a] font-medium text-white"
                      : "text-[#0a0a0a]/70 hover:text-[#0a0a0a]"
                  }`}
                >
                  {o.effective}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative px-4 py-5 sm:px-5">
        {snapshotDate && dateHref ? (
          <DayCardOverlay date={snapshotDate} lang={lang} open={preview} />
        ) : null}
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
          {!showFreshness ? null : lastFetchedAt ? (
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
      </div>
    </section>
  );
}
