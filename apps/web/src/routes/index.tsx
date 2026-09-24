import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CategoryNav } from "../components/CategoryNav";
import { FeedDays } from "../components/FeedDays";
import { FeedSkeleton } from "../components/FeedSkeleton";
import { TldrSection } from "../components/TldrSection";
import { TrendingChips } from "../components/TrendingChips";
import { parseAidrLayout } from "../lib/aidr-layout";
import { showFeedBrowseChrome } from "../lib/empty-feed";
import { setCachedFeed } from "../lib/feed-cache";
import { fetchFeed } from "../lib/feed-fn";
import { timeAgo } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import { usePrefs } from "../lib/prefs";
import { homepageHead } from "../lib/seo";
import { storyPath } from "../lib/slug";
import { displayTldrBullets } from "../lib/tldr-fallback";
import type { FeedResponse } from "../lib/types";

export interface IndexSearch {
  q?: string;
  tag?: string;
  category?: string;
  /** QA-only AI;DR layout: a (default) | b | c. */
  aidr?: "a" | "b" | "c";
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const out: IndexSearch = {};
    if (typeof search.q === "string" && search.q) out.q = search.q;
    if (typeof search.tag === "string" && search.tag) out.tag = search.tag;
    if (typeof search.category === "string" && search.category) {
      out.category = search.category;
    }
    if (search.aidr === "a" || search.aidr === "b" || search.aidr === "c") {
      out.aidr = search.aidr;
    }
    return out;
  },
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) =>
    fetchFeed({
      data: deps.q ? { q: deps.q } : { days: 3 },
    }),
  head: () => homepageHead(),
  component: IndexPage,
});

function IndexPage() {
  const { q, tag, category, aidr } = Route.useSearch();
  const lang = useLang();
  const { prefs } = usePrefs();
  const loaderFeed = Route.useLoaderData();
  const [feed, setFeed] = useState<FeedResponse | null>(
    () => loaderFeed ?? null
  );
  const [error, setError] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(tag ?? null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(category ? [category] : [])
  );

  // Picking a "filter" suggestion from the header SearchBox navigates here
  // with ?tag=/?category= — sync it in even if this component was already
  // mounted (SPA nav doesn't remount).
  useEffect(() => {
    if (tag) setSelectedTag(tag);
  }, [tag]);
  useEffect(() => {
    if (category) setSelectedCategories(new Set([category]));
  }, [category]);

  useEffect(() => {
    if (loaderFeed) {
      setFeed(loaderFeed);
      setError(false);
      if (!q) setCachedFeed(loaderFeed);
    }
  }, [loaderFeed, q]);

  // Client refresh (and first paint when the loader had no D1, e.g. prerender).
  useEffect(() => {
    let cancelled = false;
    if (!loaderFeed) {
      setFeed(null);
      setError(false);
      const params = q ? `?q=${encodeURIComponent(q)}` : "?days=3";
      fetch(`/api/feed${params}`)
        .then((res) => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
        .then((res) => {
          if (cancelled) return;
          if (res) {
            setFeed(res);
            if (!q) setCachedFeed(res);
          } else {
            setError(true);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }
    const refresh = window.setInterval(() => {
      if (q) return;
      fetch("/api/feed?days=3")
        .then((res) => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
        .then((res) => {
          if (!cancelled && res) {
            setFeed((prev) => {
              if (!prev) return res;
              const older = prev.days.filter(
                (d) => !res.days.some((n) => n.date === d.date)
              );
              return {
                ...res,
                days: [...res.days, ...older],
                hasMore: prev.hasMore || res.hasMore,
              };
            });
            setCachedFeed(res);
          }
        })
        .catch(() => {
          // keep the last good feed
        });
    }, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [q, loaderFeed]);

  if (error) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {lang === "vi"
          ? "Không tải được bảng tin. Thử tải lại trang."
          : "Couldn't load the feed. Try reloading the page."}
      </p>
    );
  }

  if (!feed) return <FeedSkeleton />;

  const bullets = displayTldrBullets(feed.tldr, lang);

  const topicByItemId = new Map<string, string>();
  const categoryByItemId = new Map<string, string>();
  const pathByItemId = new Map<string, string>();
  const tagsByItemId = new Map<string, string[]>();
  const imageByItemId = new Map<string, string>();
  for (const day of feed.days) {
    for (const item of day.items) {
      const topic = item.tags[0] ?? item.category;
      if (topic) topicByItemId.set(item.id, topic);
      if (item.category) categoryByItemId.set(item.id, item.category);
      pathByItemId.set(item.id, storyPath(item));
      if (item.tags.length > 0) tagsByItemId.set(item.id, item.tags);
      if (item.image_url) imageByItemId.set(item.id, item.image_url);
    }
  }

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const days =
    selectedCategories.size === 0
      ? feed.days
      : feed.days
          .map((day) => {
            const items = day.items.filter(
              (item) => item.category && selectedCategories.has(item.category)
            );
            const categoryCounts: Record<string, number> = {};
            for (const item of items) {
              if (item.category) {
                categoryCounts[item.category] =
                  (categoryCounts[item.category] ?? 0) + 1;
              }
            }
            return { ...day, items, categoryCounts };
          })
          .filter((day) => day.items.length > 0);

  const browseChrome = showFeedBrowseChrome(q);

  function mergeOlderDays(older: FeedResponse) {
    setFeed((prev) => {
      if (!prev) return older;
      const seen = new Set(prev.days.map((d) => d.date));
      const merged = [
        ...prev.days,
        ...older.days.filter((d) => !seen.has(d.date)),
      ];
      return {
        ...prev,
        days: merged,
        hasMore: older.hasMore,
        totalStories: prev.totalStories + older.totalStories,
      };
    });
  }

  const brief = !q && prefs.sections.tldr && !prefs.sections.days;

  return (
    <div className={brief ? "flex flex-1 flex-col" : undefined}>
      {q ? (
        <p className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm text-muted-foreground">
          <span>
            {lang === "vi" ? "Kết quả cho" : "Results for"}{" "}
            <span className="font-semibold text-foreground">“{q}”</span> —{" "}
            {feed.totalStories}
          </span>
          {feed.lastFetchedAt && (
            <span className="text-xs">
              {lang === "vi" ? "Cập nhật" : "Updated"}{" "}
              {timeAgo(feed.lastFetchedAt, feed.updatedAt, lang)}
            </span>
          )}
        </p>
      ) : null}
      {prefs.sectionOrder.map((section) => {
        const visible = prefs.sections[section];
        if (!visible) return null;
        if (q && section !== "days") return null;
        switch (section) {
          case "categories":
            if (!browseChrome) return null;
            return (
              <div key={section}>
                <CategoryNav
                  categories={feed.categories}
                  selected={selectedCategories}
                  onToggle={toggleCategory}
                  lang={lang}
                />
              </div>
            );
          case "trending":
            if (!browseChrome) return null;
            return (
              <div key={section}>
                <TrendingChips
                  trending={feed.trending}
                  label={lang === "vi" ? "Xu hướng" : "Trending"}
                  selectedTag={selectedTag}
                  onSelectTag={setSelectedTag}
                />
              </div>
            );
          case "tldr":
            if (q) return null;
            return (
              <div
                key={section}
                className={
                  brief
                    ? "flex flex-1 flex-col justify-center py-6 sm:py-10"
                    : undefined
                }
              >
                <TldrSection
                  bullets={bullets ?? []}
                  defaultCount={prefs.tldrCount}
                  lang={lang}
                  totalStories={feed.totalStories}
                  updatedAt={feed.updatedAt}
                  lastFetchedAt={feed.lastFetchedAt}
                  topicByItemId={topicByItemId}
                  categoryByItemId={categoryByItemId}
                  pathByItemId={pathByItemId}
                  tagsByItemId={tagsByItemId}
                  imageByItemId={imageByItemId}
                  snapshotDate={feed.tldr?.date}
                  layout={parseAidrLayout(aidr)}
                  layoutLabeled={Boolean(aidr)}
                />
              </div>
            );
          case "days":
            return (
              <div key={section}>
                <FeedDays
                  feed={feed}
                  days={days}
                  lang={lang}
                  selectedTag={selectedTag}
                  q={q}
                  selectedCategoryCount={selectedCategories.size}
                  onMergeOlder={mergeOlderDays}
                />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
