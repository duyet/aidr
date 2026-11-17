import { ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { emptyFeedCopy } from "../lib/empty-feed";
import {
  DAY_STORY_LIMIT,
  dayFeedParams,
  homepageFeedUrl,
} from "../lib/homepage-feed";
import { usePrefs } from "../lib/prefs";
import type { DayGroup, FeedResponse, Lang } from "../lib/types";
import { Bi } from "./Bi";
import { DaySection } from "./DaySection";
import { LeadStory } from "./LeadStory";
import { anyVotes } from "./StoryRow";

/** Days one "Older days" press, or one scroll to the end of the feed, adds. */
const OLDER_STEP = 5;

/** The days that have a story in one of `selected`. A filtered day counts
 * what it shows, not the day's full total. */
export function filterDays(
  days: DayGroup[],
  selected: ReadonlySet<string>
): DayGroup[] {
  if (selected.size === 0) return days;
  return days
    .map((day) => {
      const items = day.items.filter(
        (item) => item.category && selected.has(item.category)
      );
      const categoryCounts: Record<string, number> = {};
      for (const item of items) {
        if (item.category) {
          categoryCounts[item.category] =
            (categoryCounts[item.category] ?? 0) + 1;
        }
      }
      return { ...day, items, categoryCounts, totalItems: undefined };
    })
    .filter((day) => day.items.length > 0);
}

export function FeedDays({
  feed,
  lang,
  selectedTag,
  q,
  selectedCategories,
  showList = true,
  onMergeOlder,
  onLoadDay,
}: {
  feed: FeedResponse;
  lang: Lang;
  selectedTag: string | null;
  q: string | undefined;
  selectedCategories: ReadonlySet<string>;
  /** False hides the ranked list and the older days (the lead story stays). */
  showList?: boolean;
  onMergeOlder: (older: FeedResponse) => void;
  onLoadDay: (day: DayGroup) => void;
}) {
  const { prefs } = usePrefs();
  // Days pressed or scrolled in beyond the `feedDays` pref.
  const [extra, setExtra] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const filled = useRef(new Set<string>());

  // A search lists every match it has; the feed shows the pref'd days.
  const loaded = feed.days.length;
  const wanted = (q ? loaded : prefs.feedDays) + extra;
  const days = filterDays(feed.days.slice(0, wanted), selectedCategories);
  const needed = wanted - loaded;
  const canShowMore = loaded > wanted || feed.hasMore;
  const autoLoad = showList && !failed && needed > 0 && feed.hasMore;
  const watchEnd = prefs.infiniteDays && showList && !failed && feed.hasMore;
  // The SSR payload drops summaries (`lazyDetail`). A reader who shows them
  // under the titles opted in, so the first day is fetched in full once.
  const top = feed.days[0];
  const needsSummaries =
    !q &&
    showList &&
    (prefs.summaries || prefs.layout === "newspaper") &&
    Boolean(
      top?.items.some((i) => i.lazyDetail && !i.summary && !i.summary_vi)
    );

  async function loadDay(day: DayGroup): Promise<boolean> {
    try {
      const res = await fetch(homepageFeedUrl(dayFeedParams(day.date), lang));
      if (!res.ok) return false;
      const page = (await res.json()) as FeedResponse;
      const full = page.days.find((d) => d.date === day.date);
      if (!full) return false;
      onLoadDay(full);
      return true;
    } catch {
      return false;
    }
  }

  async function loadOlder(count: number) {
    const oldest = feed.days[feed.days.length - 1]?.date;
    if (!oldest || loading.current) return;
    loading.current = true;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        homepageFeedUrl({ days: String(count), before: oldest }, lang)
      );
      if (!res.ok) throw new Error(`feed ${res.status}`);
      onMergeOlder((await res.json()) as FeedResponse);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }

  // The SSR payload carries one day. Fetch the rest of the days the pref asks
  // for once the page is up.
  useEffect(() => {
    if (autoLoad && !loading.current) void loadOlder(needed);
  }, [autoLoad, needed]);

  useEffect(() => {
    if (!needsSummaries || !top || filled.current.has(top.date)) return;
    filled.current.add(top.date);
    void loadDay(top);
  }, [needsSummaries, top?.date]);

  // Scrolling the end of the feed into view asks for more days. The observer
  // is rebuilt after each load, so a feed still short of the viewport keeps
  // loading.
  useEffect(() => {
    const el = sentinel.current;
    if (!watchEnd || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading.current) {
          setExtra((n) => n + OLDER_STEP);
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [watchEnd, loaded]);

  // The lead and its "Ranked today" list belong to the day the header
  // names. A filter that empties that day must not promote an older one.
  const first = days[0];
  const lead =
    q || !first || first.date !== top?.date ? undefined : first.items[0];
  const ranked: DayGroup[] =
    lead && first
      ? [
          {
            ...first,
            items: first.items.slice(1),
            totalItems:
              first.totalItems === undefined ? undefined : first.totalItems - 1,
          },
          ...days.slice(1),
        ]
      : days;
  const showVotes = anyVotes(days.flatMap((day) => day.items));

  return (
    <>
      {lead && <LeadStory item={lead} lang={lang} />}
      {showList &&
        ranked.map((day, i) => {
          const listsFromLead = lead !== undefined && i === 0;
          if (day.items.length === 0 && !day.totalItems) return null;
          return (
            <DaySection
              key={day.date}
              day={day}
              lang={lang}
              selectedTag={selectedTag}
              linkToDay
              limit={DAY_STORY_LIMIT}
              onLoadAll={loadDay}
              firstRank={listsFromLead ? 2 : 1}
              label={
                listsFromLead ? (
                  <Bi vi="Tin xếp hạng hôm nay" en="Ranked today" />
                ) : undefined
              }
              showVotes={showVotes}
            />
          );
        })}
      {showList && canShowMore && (
        <div className="flex flex-col items-center gap-3 text-center">
          {loadingOlder && (
            <p
              role="status"
              className="flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              <Bi vi="Đang tải…" en="Loading…" inline />
            </p>
          )}
          {failed && (
            <p role="alert" className="text-[13px] text-muted-foreground">
              <Bi
                vi="Không tải được các ngày cũ hơn."
                en="Couldn't load older days."
                inline
              />
            </p>
          )}
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => {
              setFailed(false);
              setExtra((n) => n + OLDER_STEP);
            }}
            className="btn-link"
          >
            <ChevronDown aria-hidden="true" />
            <Bi
              vi={failed ? "Thử lại" : "Ngày cũ hơn"}
              en={failed ? "Try again" : "Older days"}
              inline
            />
          </button>
        </div>
      )}
      {watchEnd && <div ref={sentinel} aria-hidden="true" />}
      {days.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          {emptyFeedCopy({
            lang,
            q,
            selectedCategoryCount: selectedCategories.size,
          })}
        </p>
      )}
    </>
  );
}
