import { Button } from "@ui-sdk/react/button";
import { ArrowUpRight, Copy, Keyboard } from "lucide-react";
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
import { categoryLabel, formatDayHeading } from "../../lib/lang";
import { LangContext } from "../../lib/lang-context";
import { usePrefs } from "../../lib/prefs";
import { storyMarkdownUrl } from "../../lib/seo";
import { topicStyle } from "../../lib/topic";
import type { FeedItem, Lang } from "../../lib/types";
import { useSuggestSelection } from "../../lib/use-suggest-selection";
import { Bi } from "../Bi";
import { KeywordText } from "../KeywordText";
import { SuggestionBadge, SuggestTranslation } from "../SuggestTranslation";
import { ContentHistory } from "../story/ContentHistory";
import { splitParagraphs } from "../story/lib";
import { StoryVotes } from "../story/StoryVotes";
import { summaryField, summaryParts, titleParts } from "../story/story-text";
import { CopySheet } from "./CopySheet";
import { shortDayLabel, storyByline, storyClock, storyOutlets } from "./lib";
import { ReadNext } from "./ReadNext";
import { ShareLink } from "./ShareLink";
import { KBD_CLASS, ShortcutSheet } from "./ShortcutSheet";
import { StoryEndCard } from "./StoryEndCard";
import { StoryMedia } from "./StoryMedia";
import { StorySourceLine } from "./StorySourceLine";
import { focusBlock, useStoryKeys } from "./use-story-keys";

const LABEL =
  "text-[12.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground";

const TITLE_FALLBACK = {
  en: "Original English title, no Vietnamese translation yet",
  vi: "Tiêu đề gốc tiếng Anh, chưa có bản dịch",
} as const;

/**
 * The story permalink (`/<id>`): a news page whose main text is the AI;DR.
 * Three rows by two columns from 900px. Row 1 is the topic line, headline
 * and byline; row 2 the AI;DR beside the lead image; row 3 the actions,
 * sources, why it ranks and the end card beside a sticky "Read next".
 * Under 900px it is one column: headline, image, AI;DR, actions, end card,
 * read next. Nothing is pinned over the top block.
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
  const { prefs } = usePrefs();
  const rootRef = useRef<HTMLElement | null>(null);
  const originalRef = useRef<HTMLAnchorElement | null>(null);
  const sourcesRef = useRef<HTMLElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  const view = { bilingual: prefs.bilingual, first: prefs.bilingualFirst };
  const titles = titleParts(item, lang, view);
  const summaries = summaryParts(item, lang, view);
  const fallbackFromEnglish = !prefs.bilingual && titles[0]?.lang !== lang;
  const vietnameseShown =
    lang === "vi" || summaries.some((part) => part.lang === "vi");
  const archiveDate = archiveDateOfSec(item.published_at);
  const clock = storyClock(item.published_at);
  const outlets = storyOutlets(item);

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
  } = useSuggestSelection(
    rootRef as RefObject<HTMLDivElement | null>,
    vietnameseShown
  );

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

  const byline = (l: Lang) => storyByline(item, l);

  return (
    <LangContext.Provider value={lang}>
      <article
        ref={rootRef}
        style={topicStyle(item.category)}
        className="relative mx-auto grid max-w-[1040px] grid-cols-1 gap-x-10 px-1 pt-7 pb-10 min-[900px]:grid-cols-[minmax(0,680px)_300px] min-[900px]:justify-center max-[699px]:pt-4"
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
            ✎ {lang === "vi" ? "Góp ý" : "Suggest"}
          </button>
        )}

        <header className="min-w-0 min-[900px]:col-start-1 min-[900px]:row-start-1">
          <ARTICLE_DATE_TAG
            className={`${LABEL} flex flex-wrap items-center gap-x-2 gap-y-1`}
          >
            {item.category && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="topic-dot inline-block size-2 rounded-full"
                />
                {categoryLabel(item.category, lang)}
              </span>
            )}
            {archiveDate && (
              <>
                <span aria-hidden>·</span>
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
              </>
            )}
            {outlets > 0 && (
              <>
                <span aria-hidden>·</span>
                <Bi
                  vi={`${outlets} nguồn`}
                  en={`${outlets} ${outlets === 1 ? "source" : "sources"}`}
                  inline
                />
              </>
            )}
            {fallbackFromEnglish && (
              <span title={TITLE_FALLBACK[lang]}>EN</span>
            )}
          </ARTICLE_DATE_TAG>

          <ARTICLE_TITLE_TAG
            data-suggest-field="title"
            lang={titles.length === 1 ? titles[0]?.lang : undefined}
            className="mt-2.5 mb-3 max-w-[36ch] font-heading text-[length:var(--headline-size)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-foreground [overflow-wrap:anywhere]"
          >
            {titles.length === 1
              ? titles[0] && (
                  <KeywordText varied text={titles[0].text} tags={item.tags} />
                )
              : titles.map((part) => (
                  <span
                    key={part.lang}
                    lang={part.lang}
                    className={
                      part.second
                        ? "bi-second mt-1.5 block text-[0.58em]! font-medium"
                        : "block"
                    }
                  >
                    <KeywordText varied text={part.text} tags={item.tags} />
                  </span>
                ))}
          </ARTICLE_TITLE_TAG>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[12.5px] text-muted-foreground">
              <Bi inline vi={byline("vi")} en={byline("en")} />
            </p>
            <StoryVotes
              itemId={item.id}
              voteNet={item.vote_net ?? 0}
              lang={lang}
            />
          </div>
        </header>

        <StoryMedia
          item={item}
          lang={lang}
          className="mt-4 min-[900px]:col-start-2 min-[900px]:row-start-2 min-[900px]:mt-0.5 min-[900px]:self-start"
        />

        {summaries.length > 0 && (
          <section
            aria-label="AI;DR"
            tabIndex={-1}
            data-kb=""
            data-testid="story-aidr"
            className="mt-4 grid min-w-0 content-start gap-2 rounded-md min-[900px]:col-start-1 min-[900px]:row-start-2 min-[900px]:mt-0.5"
          >
            <span className={LABEL}>AI;DR</span>
            <div className="np-justify grid gap-4 text-[14.5px] leading-[1.6] text-body min-[700px]:text-[length:var(--summary-size)] min-[700px]:leading-[1.65]">
              {summaries.map((part, i) => (
                <div
                  key={part.lang}
                  data-suggest-field={summaryField(part, prefs.bilingual)}
                  lang={part.lang}
                  className={`grid gap-2.5 [overflow-wrap:anywhere] ${part.second ? "bi-second" : ""}`}
                >
                  {splitParagraphs(part.text).map((p, n) => (
                    <p
                      key={p}
                      className={i === 0 && n === 0 ? "drop-cap" : undefined}
                    >
                      <KeywordText varied text={p} tags={item.tags} />
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-5 grid min-w-0 content-start gap-4 min-[900px]:col-start-1 min-[900px]:row-start-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {item.url && (
              <a
                ref={originalRef}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openOriginal}
                data-kb=""
                className="btn-primary"
              >
                <Bi vi="Đọc bài gốc" en="Read the source" inline />
                <ArrowUpRight aria-hidden />
              </a>
            )}
            <Button
              type="button"
              onClick={() => setSheetOpen(true)}
              data-kb=""
              data-kb-primary=""
              className="btn-link"
            >
              <Copy aria-hidden />
              <Bi vi="Chép bản tóm tắt" en="Copy AI;DR" inline />
            </Button>
            <ShareLink
              item={item}
              lang={lang}
              title={titles[0]?.text ?? item.title}
              onFallback={() => setSheetOpen(true)}
            />
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
          </div>

          <StorySourceLine item={item} lang={lang} sectionRef={sourcesRef} />

          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[12.5px] text-muted-foreground">
            {item.tags.map((tag) => (
              <a
                key={tag}
                href={`/?tag=${encodeURIComponent(tag)}&lang=${lang}`}
                className="hover:text-foreground"
              >
                #{tag}
              </a>
            ))}
            <a
              href={storyMarkdownUrl(item, lang)}
              className="hover:text-foreground"
            >
              <Bi vi="Bản Markdown" en="Markdown" inline />
            </a>
            <ContentHistory
              item={item}
              lang={lang}
              className="[&[open]]:basis-full"
            />
            <Button
              onClick={() => setKeysOpen((v) => !v)}
              aria-expanded={keysOpen}
              className="inline-flex items-center gap-1.5 hover:text-foreground [@media(hover:none)]:hidden"
            >
              <Keyboard className="size-[15px]" aria-hidden />
              <kbd className={KBD_CLASS}>?</kbd>
              <Bi vi="Phím tắt" en="Shortcuts" inline />
            </Button>
          </div>

          <div className="mt-3">
            <StoryEndCard lang={lang} />
          </div>
        </div>

        <ReadNext
          item={item}
          lang={lang}
          className="mt-8 min-w-0 min-[900px]:sticky min-[900px]:top-[72px] min-[900px]:col-start-2 min-[900px]:row-start-3 min-[900px]:mt-5 min-[900px]:self-start"
        />

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
    </LangContext.Provider>
  );
}
