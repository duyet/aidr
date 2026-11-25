import { ChevronDown, TrendingUp } from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { pageType } from "../lib/analytics/landing";
import { recordRead } from "../lib/analytics/reads";
import { track } from "../lib/analytics/track";
import {
  ARTICLE_TITLE_TAG,
  FEED_TITLE_TAG,
  type StoryTitleTag,
} from "../lib/article-headings";
import { timeAgo } from "../lib/lang";
import { usePrefs } from "../lib/prefs";
import { publisherHost } from "../lib/publisher-host";
import { storyPath } from "../lib/slug";
import { type TopicColor, topicColor } from "../lib/topic-color";
import type { FeedItem, Lang } from "../lib/types";
import { CategoryLabel } from "./CategoryLabel";
import { KeywordText } from "./KeywordText";
import { storySummaries, storyTitles } from "./row-text";
import { StoryDetail } from "./StoryDetail";
import { StoryDialog } from "./StoryDialog";
import { StoryThumb } from "./StoryThumb";
import { StoryVotes } from "./story/StoryVotes";

/** Short relative time for the Time column: "7 giờ" / "7h". */
function shortTimeAgo(epochSec: number, lang: Lang): string {
  return timeAgo(epochSec, Date.now(), lang).replace(/ (trước|ago)$/, "");
}

/** True when any story carries a vote. While every count is zero the vote
 * column stays out of the list: a column of "0" says nothing. */
export function anyVotes(
  items: readonly Pick<FeedItem, "vote_net">[]
): boolean {
  return items.some((item) => (item.vote_net ?? 0) > 0);
}

function StoryRowHeader({
  hasDetails,
  expanded,
  closeOnEscape,
  top,
  matchColor,
  onToggle,
  children,
}: {
  hasDetails: boolean;
  expanded: boolean;
  /** Feed rows close on Esc; a row the story page renders open does not. */
  closeOnEscape: boolean;
  /** Top 3 of the day: the rank number takes the accent color. */
  top: boolean;
  matchColor: TopicColor | null;
  onToggle: () => void;
  children: ReactNode;
}) {
  const band = expanded
    ? "bg-muted/60"
    : matchColor
      ? "topic-hl-row"
      : hasDetails
        ? "hover:bg-muted/60"
        : "";
  // The focus ring sits inside the row (negative offset): the day section
  // uses content-visibility, which clips anything painted outside it.
  const className = `story-row group flex items-center gap-x-3.5 py-(--row-pad) scroll-my-16 -mx-3 rounded-lg px-3 focus-visible:-outline-offset-2 ${
    hasDetails ? "cursor-pointer" : ""
  } ${top ? "story-row-top" : ""} ${band}`;
  const style = matchColor
    ? ({
        "--tc-light": matchColor.light,
        "--tc-dark": matchColor.dark,
      } as CSSProperties)
    : undefined;

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
        data-keynav=""
        onClick={onToggle}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" ||
            e.key === " " ||
            (e.key === "Escape" && expanded && closeOnEscape)
          ) {
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
  showVotes = true,
}: {
  item: FeedItem;
  index: number;
  lang: Lang;
  hot?: boolean;
  defaultExpanded?: boolean;
  selectedTag?: string | null;
  /** Article route only — homepage feed keeps a non-heading title. */
  titleAs?: StoryTitleTag;
  /** False while no story on the page has a vote (see `anyVotes`). */
  showVotes?: boolean;
}) {
  const TitleTag = titleAs;
  const { prefs } = usePrefs();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      .then((res) => {
        if (res.ok) return res.json() as Promise<FeedItem>;
        if (res.status === 404) return null;
        throw new Error(`story ${res.status}`);
      })
      .then((full) => {
        if (stale || langRef.current !== requestedLang) return;
        // Fall back to the lean row so the loading line clears even
        // when the story lookup misses.
        setDetail(full ?? item);
      })
      .catch(() => {
        if (stale || langRef.current !== requestedLang) return;
        // A 5xx or offline read: show the lean row (meta/topics) and
        // allow a retry on the next expand.
        detailRequested.current = false;
        setDetail(item);
      });
    return () => {
      stale = true;
    };
  };

  useEffect(() => {
    if (!(expanded && item.lazyDetail && !detail)) return;
    return loadDetail(lang);
  }, [lang]);
  const [title, secondTitle] = storyTitles(item, lang, prefs);
  const newspaper = prefs.layout === "newspaper";
  const summaries =
    prefs.summaries || newspaper ? storySummaries(item, lang, prefs) : [];
  const hasDetails =
    Boolean(item.lazyDetail) ||
    Boolean(item.summary || item.summary_vi) ||
    item.tags.length > 0 ||
    item.sources.length > 0;
  useEffect(() => {
    // A row rendered open (the story page) never toggles, so count it here.
    if (defaultExpanded && hasDetails) recordRead(item.id, "open");
  }, []);
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
    setExpanded(!expanded);
    if (!expanded) {
      track("story_view", {
        item_id: item.id,
        via: "row",
        page_type: pageType(window.location.pathname),
      });
      recordRead(item.id, "open");
    }
  };

  // Plain primary click on a feed title opens the story drawer, the same
  // panel a TL;DR bullet opens; on the story page itself (rendered open) it
  // toggles the row. Modified or non-primary clicks keep the permalink (new
  // tab, etc.). Either way the row's own onClick must not run a second
  // toggle. The chevron and the row still expand in place.
  const onTitleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (
      !hasDetails ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    if (defaultExpanded) {
      toggleExpanded();
      return;
    }
    setDialogOpen(true);
    track("story_view", {
      item_id: item.id,
      via: "row",
      page_type: pageType(window.location.pathname),
    });
    recordRead(item.id, "open");
  };

  const detailsOpen = expanded && hasDetails;
  const host = item.url ? publisherHost(item.url) : null;
  const time = Number.isFinite(item.published_at)
    ? shortTimeAgo(item.published_at, lang)
    : "";

  return (
    <div id={`item-${item.id}`}>
      <StoryRowHeader
        hasDetails={hasDetails}
        expanded={expanded}
        closeOnEscape={!defaultExpanded}
        top={index <= 3}
        matchColor={matchColor}
        onToggle={toggleExpanded}
      >
        <span className="story-rank flex w-7 shrink-0 items-baseline justify-end gap-0.5 self-start pt-[2px] text-right text-[12.5px] tabular-nums text-muted-foreground max-[699px]:hidden in-data-[layout=newspaper]:hidden">
          {hasDetails && (
            <ChevronDown
              data-testid="story-row-chevron"
              data-expanded={expanded ? "true" : "false"}
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 self-center text-quiet-foreground opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none ${
                expanded ? "rotate-180 opacity-100" : ""
              }`}
            />
          )}
          {index}
        </span>
        <span className="story-body min-w-0 flex-1">
          <span
            className={`story-title block min-w-0 text-[15px] leading-[calc(var(--reader-leading,1.55)_-_0.175)] in-data-[layout=newspaper]:font-heading in-data-[layout=newspaper]:leading-[1.25] ${
              matchColor
                ? "topic-colored font-normal"
                : "font-normal text-foreground"
            }`}
          >
            <span className="line-clamp-2">
              {hot && (
                <TrendingUp
                  className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent"
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
                  lang={
                    title.fallbackFromEnglish
                      ? "en"
                      : prefs.bilingual
                        ? title.lang
                        : undefined
                  }
                  onClick={onTitleClick}
                  className="hover:underline hover:underline-offset-2 focus-visible:rounded-[6px]"
                >
                  <KeywordText
                    text={title.text}
                    tags={item.tags}
                    ink
                    category={item.category}
                  />
                </a>
              </TitleTag>
              {title.fallbackFromEnglish && (
                <span
                  className="ml-1.5 align-middle font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                  title={
                    lang === "vi"
                      ? "Tiêu đề gốc tiếng Anh — chưa có bản dịch"
                      : "Original English title — no Vietnamese translation yet"
                  }
                >
                  EN
                </span>
              )}
            </span>
            {secondTitle && (
              <span
                lang={secondTitle.lang}
                className="bi-second line-clamp-1 in-data-[layout=newspaper]:font-sans"
              >
                {secondTitle.text}
              </span>
            )}
          </span>
          {summaries.map((s, i) => (
            <span
              key={s.lang}
              lang={s.lang}
              className={`row-summary mt-1 line-clamp-2 text-[13px] leading-[1.5] np-justify ${
                i === 0 ? "text-muted-foreground" : "bi-second"
              }`}
            >
              {s.text}
            </span>
          ))}
          <span className="story-meta mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {item.category ? (
              <CategoryLabel name={item.category} lang={lang} quiet />
            ) : null}
            {host && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    track("source_click", {
                      item_id: item.id,
                      placement: "row",
                    });
                    recordRead(item.id, "outbound");
                  }}
                  className="hover:text-accent hover:underline"
                >
                  {host}
                </a>
              </>
            )}
            {time && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums" suppressHydrationWarning>
                  {time}
                </span>
              </>
            )}
          </span>
        </span>
        {prefs.thumbs && !newspaper && (
          <span className="row-thumb shrink-0">
            <StoryThumb
              variant="row"
              src={item.image_url}
              itemId={item.id}
              lang={lang}
            />
          </span>
        )}
        {/* An open row moves its votes to the top of the details' media
            column; the empty cell keeps the columns aligned. */}
        {showVotes && prefs.votes && (
          <span className="story-score flex w-11 shrink-0 items-center justify-end">
            {!detailsOpen && (
              <StoryVotes
                itemId={item.id}
                voteNet={item.vote_net ?? 0}
                lang={lang}
              />
            )}
          </span>
        )}
      </StoryRowHeader>

      {detailsOpen && (
        <div className="mb-2 overflow-hidden rounded-lg bg-card px-4 py-4 md:px-5 md:py-5">
          <StoryDetail item={detail ?? item} lang={lang} showVotes />
          {item.lazyDetail && !detail && (
            <p className="mt-3 text-xs text-muted-foreground">
              {lang === "vi" ? "Đang tải…" : "Loading…"}
            </p>
          )}
        </div>
      )}
      {dialogOpen && (
        <StoryDialog
          idPrefix={item.id}
          lang={lang}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
