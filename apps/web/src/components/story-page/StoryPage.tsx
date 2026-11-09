import { Button } from "@aidr/ui";
import { ArrowUpRight, Copy } from "lucide-react";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { recordRead } from "../../lib/analytics/reads";
import { track } from "../../lib/analytics/track";
import {
  ARTICLE_DATE_TAG,
  ARTICLE_TITLE_TAG,
} from "../../lib/article-headings";
import { archiveDateOfSec, dayArchivePath } from "../../lib/day-archive";
import { localizedTitle } from "../../lib/display-title";
import { categoryLabel, formatDayHeading } from "../../lib/lang";
import { storyMarkdownUrl } from "../../lib/seo";
import type { FeedItem, Lang } from "../../lib/types";
import { useSuggestSelection } from "../../lib/use-suggest-selection";
import { SuggestionBadge, SuggestTranslation } from "../SuggestTranslation";
import { ContentHistory } from "../story/ContentHistory";
import { splitParagraphs } from "../story/lib";
import { StoryRankingPanel } from "../story/StoryRankingPanel";
import { StoryVotes } from "../story/StoryVotes";
import {
  formatStoryScore,
  formatStoryTokens,
  storyTokenCount,
} from "../story/story-meta";
import { CopySheet } from "./CopySheet";
import { KeywordText } from "./KeywordText";
import { shortDayLabel, storyByline, storyClock } from "./lib";
import { ReadNext } from "./ReadNext";
import { KBD_CLASS, ShortcutSheet } from "./ShortcutSheet";
import { StoryMedia } from "./StoryMedia";
import { PILL, StorySourceLine } from "./StorySourceLine";
import { focusBlock, useStoryKeys } from "./use-story-keys";

const EYEBROW =
  "font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase tracking-[0.1em] text-muted-foreground";

const COPY = {
  en: {
    copyShort: "Copy for social",
    copyLong: "Copy AI;DR for social",
    original: "Read original",
    sources: (n: number) => `${n} ${n === 1 ? "source" : "sources"}`,
    score: "Score",
    tokens: "tokens",
    markdown: "Markdown",
    keys: "Shortcuts",
    titleFallback: "Original English title, no Vietnamese translation yet",
  },
  vi: {
    copyShort: "Chép để đăng",
    copyLong: "Chép AI;DR để đăng",
    original: "Đọc bài gốc",
    sources: (n: number) => `${n} nguồn`,
    score: "Điểm",
    tokens: "token",
    markdown: "Bản Markdown",
    keys: "Phím tắt",
    titleFallback: "Tiêu đề gốc tiếng Anh, chưa có bản dịch",
  },
} as const;

/**
 * The story permalink (`/<id>`): a news page whose main text is the
 * AI;DR. Eyebrow, headline and byline, then the AI;DR beside a sticky
 * media rail; Read Next closes the story proper. Sources, tags and the
 * ranking details sit at the very bottom in one quiet footer cluster,
 * under a hairline rule. One column under 820px with the photo first,
 * and a sticky action bar under 520px.
 *
 * The home feed's inline expansion and StoryDialog keep StoryDetail; this
 * layout is the permalink's own.
 */
export function StoryPage({
  item,
  lang,
}: {
  item: FeedItem;
  lang: Lang;
}): ReactElement {
  const copy = COPY[lang];
  const vi = lang === "vi";
  const rootRef = useRef<HTMLElement | null>(null);
  const originalRef = useRef<HTMLAnchorElement | null>(null);
  const sourcesRef = useRef<HTMLElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  const { text: title, fallbackFromEnglish } = localizedTitle(item, lang);
  // Same rule as StoryDetail: Vietnamese text when there is some, else the
  // English summary, marked as English.
  const summaryIsVi = vi && Boolean(item.summary_vi?.trim());
  const paragraphs = splitParagraphs(
    summaryIsVi ? item.summary_vi : item.summary
  );
  const archiveDate = archiveDateOfSec(item.published_at);
  const clock = storyClock(item.published_at);
  const byline = storyByline(item, lang);
  const tokens = storyTokenCount(item.llm_tokens);

  // The permalink is an open story: count the read once, as the expanded
  // row did before this page had its own layout.
  useEffect(() => {
    recordRead(item.id, "open");
  }, [item.id]);

  const {
    selectionButton,
    pendingSuggestion,
    acceptSelection,
    clearPending,
    suggestionAttempt,
  } = useSuggestSelection(rootRef as RefObject<HTMLDivElement | null>, vi);

  const openOriginal = () => {
    track("source_click", { item_id: item.id, placement: "row" });
    recordRead(item.id, "outbound");
  };

  useStoryKeys(rootRef, {
    copy: () => setSheetOpen(true),
    original: () => originalRef.current?.click(),
    sources: () => focusBlock(sourcesRef.current),
    help: () => setKeysOpen((v) => !v),
    escape: () => setKeysOpen(false),
  });

  const copyButton = (label: string, className: string, primary = false) => (
    <Button
      variant="outline"
      onClick={() => setSheetOpen(true)}
      data-kb=""
      {...(primary ? { "data-kb-primary": "" } : {})}
      className={className}
    >
      <Copy aria-hidden />
      {label}
    </Button>
  );

  return (
    <article
      ref={rootRef}
      className="relative pt-5 pb-8 max-[819px]:pt-4"
      data-testid="story-page"
    >
      {selectionButton && (
        <button
          type="button"
          data-selection-button=""
          style={{
            position: "fixed",
            top: selectionButton.top,
            left: selectionButton.left,
            zIndex: 1100,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={acceptSelection}
          className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow-lg"
        >
          ✎ {vi ? "Góp ý" : "Suggest"}
        </button>
      )}

      <ARTICLE_DATE_TAG
        className={`${EYEBROW} flex flex-wrap gap-x-3.5 gap-y-1`}
      >
        {item.category && (
          <span className="text-accent">
            ● {categoryLabel(item.category, lang)}
          </span>
        )}
        {archiveDate && (
          <span>
            <a
              href={dayArchivePath(archiveDate, lang)}
              title={formatDayHeading(archiveDate, lang)}
              className="hover:text-foreground"
            >
              {shortDayLabel(archiveDate, lang)}
            </a>
            {clock && <span suppressHydrationWarning> · {clock}</span>}
          </span>
        )}
        {item.sources.length > 0 && (
          <span>{copy.sources(item.sources.length)}</span>
        )}
        {fallbackFromEnglish && <span title={copy.titleFallback}>EN</span>}
      </ARTICLE_DATE_TAG>

      <ARTICLE_TITLE_TAG
        data-suggest-field="title"
        lang={fallbackFromEnglish ? "en" : undefined}
        className="mt-2.5 max-w-[36ch] text-balance text-[calc(24px*var(--reader-font-size,1))] leading-[1.18] font-medium tracking-[-0.025em] text-foreground [overflow-wrap:anywhere] min-[820px]:text-[calc(34px*var(--reader-font-size,1))] min-[820px]:leading-[1.12]"
      >
        <KeywordText text={title} tags={item.tags} />
      </ARTICLE_TITLE_TAG>

      {byline && (
        <p className="mt-2 text-[calc(13px*var(--reader-font-size,1))] text-muted-foreground">
          {byline}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 items-start gap-3.5 min-[820px]:mt-4 min-[820px]:grid-cols-[minmax(0,1fr)_360px] min-[820px]:gap-8">
        {/* Left content matches the right rail's thumbnail height
            (360px wide, 16:9), so a screenshot of the content lines up
            with the thumbnail and never catches the suggest/vote row
            or Read Next; both start below the block. */}
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-col gap-4 min-[820px]:min-h-[calc(360px*9/16)]">
            {paragraphs.length > 0 && (
              <section
                aria-label="AI;DR"
                tabIndex={-1}
                data-kb=""
                data-testid="story-aidr"
                className="grid gap-2 rounded-md"
              >
                <span className="font-mono text-[calc(11px*var(--reader-font-size,1))] font-medium uppercase tracking-[0.1em] text-kw-num">
                  AI;DR
                </span>
                <div
                  data-suggest-field="summary"
                  lang={summaryIsVi ? "vi" : "en"}
                  className="grid max-w-[64ch] gap-2.5 text-[calc(17px*var(--reader-font-size,1))] leading-[1.6] text-foreground [overflow-wrap:anywhere]"
                >
                  {paragraphs.map((p) => (
                    <p key={p}>
                      <KeywordText text={p} tags={item.tags} />
                    </p>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2 min-[820px]:mt-auto">
              {item.url && (
                <Button
                  asChild
                  className="text-[calc(13px*var(--reader-font-size,1))] max-[519px]:hidden"
                >
                  <a
                    ref={originalRef}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={openOriginal}
                    data-kb=""
                  >
                    {copy.original}
                    <ArrowUpRight aria-hidden />
                  </a>
                </Button>
              )}
              {copyButton(
                copy.copyLong,
                "text-[calc(13px*var(--reader-font-size,1))] max-[519px]:hidden"
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="story-suggest contents">
              <SuggestTranslation
                itemId={item.id}
                lang={lang}
                initialText={pendingSuggestion?.text}
                suggestionAttempt={suggestionAttempt}
                onInitialTextConsumed={clearPending}
              />
            </span>
            <SuggestionBadge itemId={item.id} expanded lang={lang} />
            <StoryVotes
              itemId={item.id}
              voteNet={item.vote_net ?? 0}
              lang={lang}
            />
          </div>

          <ReadNext item={item} lang={lang} />
        </div>

        <StoryMedia item={item} lang={lang} />
      </div>

      {/* Everything below the fold of the story: sources, tags, the
          ranking details — one quiet cluster, well under the hairline. */}
      <footer className="mt-8 border-t border-border pt-3.5 text-[calc(12px*var(--reader-font-size,1))] text-muted-foreground">
        <StorySourceLine item={item} lang={lang} sectionRef={sourcesRef} />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 gap-y-1.5">
          {item.tags.map((tag) => (
            <a
              key={tag}
              href={`/?tag=${encodeURIComponent(tag)}&lang=${lang}`}
              className={PILL}
            >
              #{tag}
            </a>
          ))}
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <a
            href={storyMarkdownUrl(item, lang)}
            className="hover:text-foreground"
          >
            {copy.markdown}
          </a>
          <ContentHistory
            item={item}
            lang={lang}
            className="[&[open]]:basis-full"
          />
          <span className="tabular-nums">
            {copy.score} {formatStoryScore(item.rank_score)}
          </span>
          {tokens != null && tokens > 0 && (
            <a
              href="/data?tab=runs"
              className="tabular-nums hover:text-foreground"
            >
              {formatStoryTokens(tokens)} {copy.tokens}
            </a>
          )}
          <div className="[&>div]:mt-0">
            <StoryRankingPanel item={item} lang={lang} />
          </div>
          <button
            type="button"
            onClick={() => setKeysOpen((v) => !v)}
            aria-expanded={keysOpen}
            className="inline-flex items-center gap-1.5 hover:text-foreground [@media(hover:none)]:hidden"
          >
            <kbd className={KBD_CLASS}>?</kbd>
            {copy.keys}
          </button>
        </div>
      </footer>

      {/* Phone action bar. Fixed, since the app shell clips overflow and
          would stop a sticky bar; styles.css pads the page bottom by its
          height so it never covers the footer. */}
      <div
        data-story-dock=""
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] min-[520px]:hidden"
      >
        {item.url && (
          <Button asChild className="h-11 flex-1 text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openOriginal}
            >
              {copy.original}
            </a>
          </Button>
        )}
        {copyButton(copy.copyShort, "h-11 flex-1 text-sm")}
      </div>

      {sheetOpen && (
        <CopySheet
          item={item}
          lang={lang}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {keysOpen && (
        <ShortcutSheet lang={lang} onClose={() => setKeysOpen(false)} />
      )}
    </article>
  );
}
