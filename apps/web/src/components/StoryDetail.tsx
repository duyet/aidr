import { useRef } from "react";
import { usePrefs } from "../lib/prefs";
import { storyMarkdownUrl } from "../lib/seo";
import { storyShareText } from "../lib/share-text";
import { sanitizeImageUrl } from "../lib/tldr-images";
import type { FeedItem, Lang } from "../lib/types";
import { useSuggestSelection } from "../lib/use-suggest-selection";
import { Bi } from "./Bi";
import { CopyTextButton } from "./CopyTextButton";
import { SuggestionBadge, SuggestTranslation } from "./SuggestTranslation";
import { BilingualSummary } from "./story/BilingualSummary";
import { ContentHistory } from "./story/ContentHistory";
import { splitParagraphs } from "./story/lib";
import { StoryMetaAside } from "./story/StoryMetaAside";
import { StorySources } from "./story/StorySources";
import { summaryField, summaryParts } from "./story/story-text";

export { fmtTime } from "./story/lib";

/**
 * The expanded-story body — summary paragraphs, thumbnail, translation
 * suggestion, copy action and key sources. Shared by StoryRow's inline
 * expansion and StoryDialog so both stay in sync.
 */

/**
 * @param bilingual When true (and the item has a Vietnamese translation),
 * renders the summary as two side-by-side columns (EN | VI) instead of
 * a single language — used by StoryDialog's "Dual language" toggle. Wins over
 * the stacked VI+EN mode, which a reader turns on in Customize.
 */
export function StoryDetail({
  item,
  lang,
  bilingual,
  showVotes,
}: {
  item: FeedItem;
  lang: Lang;
  bilingual?: boolean;
  showVotes?: boolean;
}) {
  const { prefs } = usePrefs();
  const hasVi = Boolean(item.title_vi || item.summary_vi);
  const showBilingual = Boolean(bilingual) && hasVi;
  const stacked = prefs.bilingual && !showBilingual;
  const parts = summaryParts(item, lang, {
    bilingual: stacked,
    first: prefs.bilingualFirst,
  });
  // The suggest-a-correction UI (and its selection listener) targets the
  // Vietnamese text — available whenever VI text is actually on screen,
  // whether that's because lang="vi", the side-by-side view or stacked mode.
  const vietnameseVisible =
    lang === "vi" || showBilingual || parts.some((part) => part.lang === "vi");

  const imageUrl = sanitizeImageUrl(item.image_url);
  const paragraphsEn = splitParagraphs(item.summary);
  const paragraphsVi = splitParagraphs(item.summary_vi);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const {
    selectionButton,
    pendingSuggestion,
    acceptSelection,
    clearPending,
    suggestionAttempt,
  } = useSuggestSelection(containerRef, vietnameseVisible);

  return (
    <div ref={containerRef} className="@container relative space-y-4">
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
      {/* Two-section layout: story content on the left, a meta sidebar
          (image, topics, details, sources) on the right. */}
      <div className="grid grid-cols-1 gap-6 @[640px]:grid-cols-[minmax(0,1fr)_240px] @[640px]:gap-8">
        <div className="min-w-0 space-y-4">
          {showBilingual ? (
            <BilingualSummary
              lang={lang}
              paragraphsEn={paragraphsEn}
              paragraphsVi={paragraphsVi}
            />
          ) : (
            parts.length > 0 && (
              <div className="np-justify grid gap-4 text-[14.5px] leading-[1.65] text-body">
                {parts.map((part, i) => (
                  <div
                    key={part.lang}
                    data-suggest-field={summaryField(part, stacked)}
                    lang={part.lang}
                    className={`grid gap-2.5 [overflow-wrap:anywhere] ${part.second ? "bi-second" : ""}`}
                  >
                    {splitParagraphs(part.text).map((p, n) => (
                      <p
                        key={p}
                        className={i === 0 && n === 0 ? "drop-cap" : undefined}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )
          )}

          <ContentHistory item={item} lang={lang} />

          {/* One free-form suggestion; the reviewer decides which fields
              and languages it changes. */}
          <div className="not-typeset flex flex-wrap items-center gap-2">
            <SuggestTranslation
              itemId={item.id}
              lang={lang}
              initialText={pendingSuggestion?.text}
              suggestionAttempt={suggestionAttempt}
              onInitialTextConsumed={clearPending}
            />
            <SuggestionBadge itemId={item.id} expanded lang={lang} />
            <CopyTextButton
              text={storyShareText(item, lang)}
              label={
                lang === "vi" ? "Chép tiêu đề + link" : "Copy title + link"
              }
              lang={lang}
            />
          </div>

          <StorySources sources={item.sources} lang={lang} itemId={item.id} />
          <a
            href={storyMarkdownUrl(item, lang)}
            className="not-typeset inline-block text-xs text-muted-foreground hover:text-accent"
          >
            <Bi vi="Bản Markdown" en="Markdown" inline />
          </a>
        </div>

        <StoryMetaAside
          item={item}
          lang={lang}
          imageUrl={imageUrl}
          showVotes={showVotes}
        />
      </div>
    </div>
  );
}
