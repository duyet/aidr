import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { type AidrLayout, DEFAULT_AIDR_LAYOUT } from "../lib/aidr-layout";
import { track } from "../lib/analytics/track";
import { dayOgDateParts } from "../lib/day-og";
import { timeAgo } from "../lib/lang";
import { type TldrCount, usePrefs } from "../lib/prefs";
import { tldrCountOptions, tldrShownCount } from "../lib/tldr-links";
import type { Lang, TldrBullet } from "../lib/types";
import { Bi } from "./Bi";
import { DayCardView } from "./DayCardPreview";
import { TldrBulletList } from "./TldrBulletList";
import { TldrCountSwitch, TldrViewSwitch } from "./TldrControls";

export function TldrSection({
  bullets,
  secondBullets = [],
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
  footerHint,
}: {
  bullets: TldrBullet[];
  /** The other language's bullets, shown under each title in bilingual
   * mode. Matched by the first story id; a bullet with no match shows no
   * second line, never the leading language's text. */
  secondBullets?: TldrBullet[];
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
  /** A small footer extra, such as the home feed's "? Shortcuts" hint. */
  footerHint?: ReactNode;
}): ReactElement | null {
  const { prefs, setPrefs } = usePrefs();
  const [cardWarm, setCardWarm] = useState(false);

  if (bullets.length === 0) return null;

  // The day card needs a snapshot date and its archive link; without them
  // the text list is the only view, whatever the pref says.
  const hasCard = Boolean(snapshotDate && dateHref);
  const showImage = hasCard && prefs.tldrView === "image";

  // The 8 | 12 | 16 arithmetic lives in `lib/tldr-links` so the homepage
  // JSON-LD ItemList (#224) resolves the same "how many bullets are painted"
  // answer this component does, instead of a second copy drifting from it.
  const options = tldrCountOptions(bullets.length);
  const selectedOption =
    options.find((o) => o.nominal === defaultCount) ??
    options[options.length - 1];

  const shown = bullets.slice(0, tldrShownCount(bullets.length, defaultCount));

  const selectedIndex = selectedOption ? options.indexOf(selectedOption) : -1;
  const nextOption =
    selectedIndex >= 0 ? options[selectedIndex + 1] : undefined;
  const canCollapse = selectedIndex > 0;
  const numbered = layout === "a";
  const dates = snapshotDate
    ? {
        vi: dayOgDateParts(snapshotDate, "vi"),
        en: dayOgDateParts(snapshotDate, "en"),
      }
    : null;
  const dateLine = (l: Lang) =>
    dates ? `${dates[l].weekday} · ${dates[l].monthYear}` : "";

  const secondTextByItemId = prefs.bilingual
    ? new Map(
        secondBullets.flatMap((b) =>
          b.item_ids?.[0] ? [[b.item_ids[0], b.text] as const] : []
        )
      )
    : undefined;

  const setCount = (nominal: TldrCount) => {
    track("prefs_change", { pref: "tldrCount", pref_value: `${nominal}` });
    setPrefs({ tldrCount: nominal });
  };

  return (
    <section
      className="my-3 overflow-hidden rounded-lg"
      data-aidr-layout={layout}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          {dates ? (
            <>
              <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                {dates[lang].day}
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
                    <Bi vi={dateLine("vi")} en={dateLine("en")} />
                  </a>
                ) : (
                  <Bi
                    className="truncate text-muted-foreground"
                    vi={dateLine("vi")}
                    en={dateLine("en")}
                  />
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
              <Bi
                className="font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-muted-foreground"
                vi="24 giờ qua"
                en="past 24 hours"
              />
            </h2>
          )}
          {layoutLabeled && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Layout {layout.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasCard ? (
            <TldrViewSwitch
              lang={lang}
              showImage={showImage}
              onChange={(image) => {
                const view = image ? "image" : "text";
                track("tldr_toggle", { view });
                setPrefs({ tldrView: view });
              }}
              onIntent={() => setCardWarm(true)}
            />
          ) : null}
          {selectedOption && (
            <TldrCountSwitch
              lang={lang}
              options={options}
              selected={selectedOption.nominal}
              onChange={setCount}
            />
          )}
        </div>
      </div>

      <div className="px-4 pt-1 pb-3 sm:px-[18px]">
        {snapshotDate && dateHref ? (
          <DayCardView
            date={snapshotDate}
            lang={lang}
            open={showImage}
            warm={cardWarm}
          />
        ) : null}
        <div hidden={showImage}>
          <TldrBulletList
            shown={shown}
            layout={layout}
            numbered={numbered}
            lang={lang}
            singleColumn={singleColumn}
            topicByItemId={topicByItemId}
            categoryByItemId={categoryByItemId}
            pathByItemId={pathByItemId}
            tagsByItemId={tagsByItemId}
            imageByItemId={imageByItemId}
            secondTextByItemId={secondTextByItemId}
          />

          {nextOption ? (
            <button
              type="button"
              onClick={() => setCount(nextOption.nominal)}
              className="btn-link mt-1"
            >
              <Bi inline vi="Xem thêm" en="Show more" />
              <ChevronDown aria-hidden />
            </button>
          ) : (
            canCollapse && (
              <button
                type="button"
                onClick={() => setCount(options[0].nominal)}
                className="btn-link mt-1"
              >
                <Bi inline vi="Thu gọn" en="Show less" />
                <ChevronUp aria-hidden />
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] text-muted-foreground tabular-nums sm:px-[18px]">
        <span className="flex items-center gap-4">
          <Bi
            inline
            vi={`${totalStories} tin`}
            en={`${totalStories} stories`}
          />
          {footerHint}
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
            <Bi
              inline
              vi={`Cập nhật ${timeAgo(lastFetchedAt, updatedAt, "vi")}`}
              en={`Updated ${timeAgo(lastFetchedAt, updatedAt, "en")}`}
            />
          </Link>
        ) : (
          <Bi inline vi="Cập nhật lúc" en="News as of" />
        )}
      </div>
    </section>
  );
}
