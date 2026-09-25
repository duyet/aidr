import { Input } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchFeedOnce, getCachedFeed } from "../lib/feed-cache";
import {
  type FilterSuggestion,
  matchFilterTarget,
  matchStories,
  type StorySuggestion,
} from "../lib/search-match";
import type { FeedResponse, Lang } from "../lib/types";
import { StoryDialog } from "./StoryDialog";
import { SearchResults } from "./search/SearchResults";
import { useSearchKeyNav } from "./search/use-search-keynav";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

export function SearchBox({
  placeholder,
  lang,
  compact,
}: {
  placeholder: string;
  lang: Lang;
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [feed, setFeed] = useState<FeedResponse | null>(() =>
    getCachedFeed(lang)
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dialogIdPrefix, setDialogIdPrefix] = useState<string | null>(null);
  const containerRef = useRef<HTMLFormElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedFeed(lang);
    setFeed(cached);
    if (!cached && q.trim().length >= MIN_QUERY_LEN) {
      void fetchFeedOnce(lang).then((res) => {
        if (!cancelled && res) setFeed(res);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [lang, q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleChange = (value: string) => {
    setQ(value);
    setOpen(value.trim().length >= MIN_QUERY_LEN);
    setActiveIndex(-1);
  };

  const allItems = feed?.days.flatMap((d) => d.items) ?? [];
  const storyMatches: StorySuggestion[] =
    debouncedQ.trim().length >= MIN_QUERY_LEN
      ? matchStories(allItems, debouncedQ, lang, 7)
      : [];
  const filterMatch: FilterSuggestion | null = feed
    ? matchFilterTarget(debouncedQ, feed.categories, feed.trending)
    : null;

  const rowCount = (filterMatch ? 1 : 0) + storyMatches.length;
  const showDropdown =
    open && debouncedQ === q && q.trim().length >= MIN_QUERY_LEN;

  const selectFilter = () => {
    if (!filterMatch) return;
    track("topic_filter", { tag: filterMatch.value });
    setOpen(false);
    setQ("");
    navigate({
      to: "/",
      search:
        filterMatch.kind === "topic"
          ? { tag: filterMatch.value }
          : { category: filterMatch.value },
    });
  };

  const selectStory = (item: StorySuggestion["item"]) => {
    setOpen(false);
    setDialogIdPrefix(item.id);
  };

  const submitFullSearch = () => {
    if (q.trim()) {
      track("search", { query_len: q.trim().length });
      setOpen(false);
      navigate({ to: "/", search: { q: q.trim() } });
    }
  };

  const onKeyDown = useSearchKeyNav({
    showDropdown,
    rowCount,
    setOpen,
    setActiveIndex,
  });

  return (
    <>
      <form
        ref={containerRef}
        className={compact ? "relative w-full" : "relative w-full max-w-xl"}
        onSubmit={(e) => {
          e.preventDefault();
          if (activeIndex === -1 || !showDropdown) {
            submitFullSearch();
            return;
          }
          if (filterMatch && activeIndex === 0) {
            selectFilter();
          } else {
            const idx = filterMatch ? activeIndex - 1 : activeIndex;
            const match = storyMatches[idx];
            if (match) selectStory(match.item);
          }
        }}
      >
        <Search
          className={
            compact
              ? "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              : "pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          }
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (q.trim().length >= MIN_QUERY_LEN) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={
            compact ? "h-11 min-h-[44px] rounded-xl pl-10" : "h-9 pl-8"
          }
          role="combobox"
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          autoComplete="off"
        />

        {showDropdown && rowCount > 0 && (
          <SearchResults
            filterMatch={filterMatch}
            storyMatches={storyMatches}
            activeIndex={activeIndex}
            lang={lang}
            onSelectFilter={selectFilter}
            onSelectStory={selectStory}
          />
        )}
      </form>

      {dialogIdPrefix && (
        <StoryDialog
          idPrefix={dialogIdPrefix}
          lang={lang}
          onClose={() => setDialogIdPrefix(null)}
        />
      )}
    </>
  );
}
