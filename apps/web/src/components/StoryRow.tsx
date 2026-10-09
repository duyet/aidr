import { track } from "@aidr/ui/track";
import { ExternalLink, TrendingUp } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ARTICLE_TITLE_TAG,
  FEED_TITLE_TAG,
  type StoryTitleTag,
} from "../lib/article-headings";
import { localizedTitle } from "../lib/display-title";
import { timeAgo } from "../lib/lang";
import { publisherHost } from "../lib/publisher-host";
import { storyPath } from "../lib/slug";
import { type TopicColor, topicColor } from "../lib/topic-color";
import type { FeedItem, Lang } from "../lib/types";
import { CategoryLabel } from "./CategoryLabel";
import { HighlightedText } from "./HighlightedText";
import { StoryDetail } from "./StoryDetail";
import { StoryVotes } from "./story/StoryVotes";

/** One title line tall (title is `leading-snug`), content centered in it. */
const FIRST_LINE = "flex h-[1.375em] shrink-0 items-center";

function StoryRowHeader({
  hasDetails,
  expanded,
  matchColor,
  onToggle,
  children,
}: {
  hasDetails: boolean;
  expanded: boolean;
  matchColor: TopicColor | null;
  onToggle: () => void;
  children: ReactNode;
}) {
  const className = `flex items-start gap-3 ${
    hasDetails ? "cursor-pointer" : ""
  } ${expanded ? "bg-muted/60" : matchColor ? "topic-hl-row" : ""}`;
  const style = {
    paddingTop: "var(--reader-pad, 0.5rem)",
    paddingBottom: "var(--reader-pad, 0.5rem)",
    ...(matchColor && {
      "--tc-light": matchColor.light,
      "--tc-dark": matchColor.dark,
    }),
  } as CSSProperties;

  if (hasDetails) {
    return (
      // Native <button> cannot wrap the title/source links inside the row.
      // biome-ignore lint/a11y/useSemanticElements: nested links; div+role=button
      <div
        className={className}
        style={style}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export function StoryRow({
  item,
  index,
  lang,
  hot,
  defaultExpanded,
  selectedTag,
  titleAs = FEED_TITLE_TAG,
}: {
  item: FeedItem;
  index: number;
  lang: Lang;
  hot?: boolean;
  defaultExpanded?: boolean;
  selectedTag?: string | null;
  /** Article route only — homepage feed keeps a non-heading title. */
  titleAs?: StoryTitleTag;
}) {
  const TitleTag = titleAs;
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  // First expand loads /api/story when the row is a lean SSR item
  // (`lazyDetail`) or the feed omitted `content_log`. A permalink item
  // already came from getStory and keeps the log it arrived with.
  const [detail, setDetail] = useState<FeedItem | null>(null);
  const detailRequested = useRef(false);
  // A response can land after the reader has switched language.
  const langRef = useRef(lang);
  langRef.current = lang;
  // Drop the previous language's story during render so the effect
  // below sees an open lazy row with no detail. An effect-only reset
  // would still close over the old detail and skip the refetch.
  const [seenLang, setSeenLang] = useState(lang);
  if (seenLang !== lang) {
    setSeenLang(lang);
    setDetail(null);
    detailRequested.current = false;
  }

  const loadDetail = (requestedLang: Lang) => {
    let stale = false;
    detailRequested.current = true;
    fetch(`/api/story${storyPath(item, requestedLang)}`)
      .then((res) => (res.ok ? (res.json() as Promise<FeedItem>) : null))
      .then((full) => {
        if (stale || langRef.current !== requestedLang) return;
        // Fall back to the lean row so the loading line clears even
        // when the story lookup misses.
        setDetail(full ?? item);
      })
      .catch(() => {
        if (stale || langRef.current !== requestedLang) return;
        // Show the lean row (meta/topics) and allow a retry on the
        // next expand.
        detailRequested.current = false;
        setDetail(item);
      });
    return () => {
      stale = true;
    };
  };

  useEffect(() => {
    // expanded && lazyDetail && !detail: the open row is on Loading.
    if (!(expanded && item.lazyDetail && !detail)) return;
    return loadDetail(lang);
  }, [lang]);
  const { text: title, fallbackFromEnglish } = localizedTitle(item, lang);
  const summary =
    lang === "vi" && item.summary_vi ? item.summary_vi : item.summary;
  const hasDetails =
    Boolean(item.lazyDetail) ||
    Boolean(summary) ||
    item.tags.length > 0 ||
    item.sources.length > 0;
  const isMatch = Boolean(
    selectedTag &&
      (item.tags.some(
        (tag) => tag.toLowerCase() === selectedTag.toLowerCase()
      ) ||
        item.title.toLowerCase().includes(selectedTag.toLowerCase()) ||
        (item.title_vi?.toLowerCase().includes(selectedTag.toLowerCase()) ??
          false))
  );
  // Selected-topic rows tint with THAT topic's own deterministic color
  // (same palette as the in-title keyword highlights) instead of a
  // generic accent, so the highlight visually matches the clicked chip.
  const matchColor = isMatch && selectedTag ? topicColor(selectedTag) : null;

  const toggleExpanded = () => {
    if (!hasDetails) return;
    if (
      !expanded &&
      !detailRequested.current &&
      (item.lazyDetail || item.content_log == null)
    ) {
      loadDetail(lang);
    }
    setExpanded((v) => {
      const next = !v;
      track(next ? "story_expand" : "story_collapse", { item_id: item.id });
      return next;
    });
  };

  return (
    <div id={`item-${item.id}`}>
      <StoryRowHeader
        hasDetails={hasDetails}
        expanded={expanded}
        matchColor={matchColor}
        onToggle={toggleExpanded}
      >
        <span
          className={`${FIRST_LINE} w-5 justify-end text-sm tabular-nums text-muted-foreground`}
        >
          {index}
        </span>
        <span
          className={`min-w-0 flex-1 leading-snug ${
            matchColor ? "topic-colored font-medium" : "font-medium"
          }`}
        >
          {hot && (
            <TrendingUp
              className="mr-1 inline h-4 w-4 align-[-2px] text-muted-foreground"
              role="img"
              aria-label={
                lang === "vi" ? "Tin hàng đầu hôm nay" : "Top story today"
              }
            >
              <title>
                {lang === "vi" ? "Tin hàng đầu hôm nay" : "Top story today"}
              </title>
            </TrendingUp>
          )}
          <TitleTag
            className={titleAs === ARTICLE_TITLE_TAG ? "inline" : undefined}
          >
            <a
              href={storyPath(item, lang)}
              lang={fallbackFromEnglish ? "en" : undefined}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline hover:underline-offset-2"
            >
              <HighlightedText text={title} tags={item.tags} />
            </a>
          </TitleTag>
          {fallbackFromEnglish && (
            <span
              className="ml-1 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              title={
                lang === "vi"
                  ? "Tiêu đề gốc tiếng Anh — chưa có bản dịch"
                  : "Original English title — no Vietnamese translation yet"
              }
            >
              EN
            </span>
          )}{" "}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                track("story_open", { item_id: item.id });
              }}
              className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Open story link"
            >
              <ExternalLink className="inline h-3.5 w-3.5 align-baseline" />
              {publisherHost(item.url) && (
                <span className="ml-1 hidden sm:inline">
                  {publisherHost(item.url)}
                </span>
              )}
            </a>
          )}
        </span>
        {/* Votes, category and time sit on the title's first line in fixed
            columns, so every row lines up however the title wraps. */}
        <span className={`${FIRST_LINE} gap-3 text-sm text-muted-foreground`}>
          <StoryVotes
            itemId={item.id}
            voteNet={item.vote_net ?? 0}
            lang={lang}
            compact
          />
          <span className="hidden w-24 truncate text-right sm:block">
            {item.category ? (
              <CategoryLabel name={item.category} lang={lang} />
            ) : null}
          </span>
          <span
            className="hidden w-[6.5rem] whitespace-nowrap text-right md:block"
            suppressHydrationWarning
          >
            {Number.isFinite(item.published_at)
              ? timeAgo(item.published_at, Date.now(), lang)
              : ""}
          </span>
        </span>
      </StoryRowHeader>

      {expanded && hasDetails && (
        <div className="overflow-hidden rounded-b-2xl border border-border/70 bg-card px-5 py-5 md:px-6 md:py-6">
          <StoryDetail item={detail ?? item} lang={lang} />
          {item.lazyDetail && !detail && (
            <p className="mt-3 text-xs text-muted-foreground">
              {lang === "vi" ? "Đang tải…" : "Loading…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
