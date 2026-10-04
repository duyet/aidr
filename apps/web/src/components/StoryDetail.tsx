import { useRef } from "react";
import { storyMarkdownUrl } from "../lib/seo";
import { sanitizeImageUrl } from "../lib/tldr-images";
import type { FeedItem, Lang } from "../lib/types";
import { useSuggestSelection } from "../lib/use-suggest-selection";
import { SuggestionBadge, SuggestTranslation } from "./SuggestTranslation";
import { BilingualSummary } from "./story/BilingualSummary";
import { splitParagraphs } from "./story/lib";
import { StoryMetaAside } from "./story/StoryMetaAside";
import { StorySources } from "./story/StorySources";

export { fmtTime } from "./story/lib";

function clipLog(text: string | null): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= 90) return value;
  return `${value.slice(0, 89)}…`;
}

function logReason(reason: string, lang: Lang): string {
  const vi = lang === "vi";
  switch (reason) {
    case "correction":
      return vi ? "Sửa câu chữ" : "Wording fix";
    case "suggestion":
      return vi ? "Góp ý" : "Suggestion";
    case "ingest":
      return vi ? "Viết lại khi thu tin" : "Rewritten on ingest";
    case "backfill":
      return vi ? "Thay nội dung đã lưu" : "Replaced stored text";
    case "admin":
      return vi ? "Biên tập" : "Editor";
    default:
      return reason;
  }
}

function ContentHistory({ item, lang }: { item: FeedItem; lang: Lang }) {
  const rows = item.content_log;
  if (!rows || rows.length === 0) return null;
  return (
    <details className="not-typeset text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        {lang === "vi" ? "Lịch sử nội dung" : "Content history"} ({rows.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {rows.map((entry, index) => (
          <li key={`${entry.created_at}-${entry.lang}-${entry.field}-${index}`}>
            <span className="text-foreground">
              {new Date(entry.created_at * 1000).toISOString().slice(0, 10)}
            </span>
            {" · "}
            {entry.field === "title"
              ? lang === "vi"
                ? "Tiêu đề"
                : "Title"
              : lang === "vi"
                ? "Tóm tắt"
                : "Summary"}
            {" · "}
            <span className="uppercase">{entry.lang}</span>
            {" · "}
            {logReason(entry.reason, lang)}
            <div lang={entry.lang}>
              <span className="line-through">{clipLog(entry.before_text)}</span>
            </div>
            <div lang={entry.lang}>{clipLog(entry.after_text)}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The expanded-story body — topics, meta line, summary paragraphs,
 * thumbnail, translation-suggestion action, and key sources. Shared by
 * StoryRow's inline expansion and StoryDialog's modal so both stay in sync.
 */

/**
 * @param bilingual When true (and the item has a Vietnamese translation),
 * renders title + summary as two side-by-side columns (EN | VI) instead of
 * a single language — used by StoryDialog's "Dual language" toggle.
 */
export function StoryDetail({
  item,
  lang,
  bilingual,
}: {
  item: FeedItem;
  lang: Lang;
  bilingual?: boolean;
}) {
  const hasVi = Boolean(item.title_vi || item.summary_vi);
  const showBilingual = Boolean(bilingual) && hasVi;
  // The suggest-a-correction UI (and its selection listener) targets the
  // Vietnamese text — available whenever VI text is actually on screen,
  // whether that's because lang="vi" or the bilingual view is showing it.
  const vietnameseVisible = lang === "vi" || (showBilingual && hasVi);

  const summary =
    lang === "vi" && item.summary_vi ? item.summary_vi : item.summary;
  const paragraphs = splitParagraphs(summary);
  const imageUrl = sanitizeImageUrl(item.image_url);
  const paragraphsEn = splitParagraphs(item.summary);
  const paragraphsVi = splitParagraphs(item.summary_vi);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectionButton, pendingSuggestion, acceptSelection, clearPending } =
    useSuggestSelection(containerRef, vietnameseVisible);

  return (
    <div ref={containerRef} className="relative space-y-4">
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_240px] md:gap-8">
        <div className="min-w-0 space-y-4">
          {showBilingual ? (
            <BilingualSummary
              item={item}
              lang={lang}
              paragraphsEn={paragraphsEn}
              paragraphsVi={paragraphsVi}
            />
          ) : (
            paragraphs.length > 0 && (
              <div
                data-suggest-field="summary"
                className="typeset typeset-reader max-w-3xl"
              >
                {paragraphs.map((p) => (
                  <p key={p}>{p}</p>
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
              onInitialTextConsumed={clearPending}
            />
            <SuggestionBadge itemId={item.id} expanded lang={lang} />
          </div>

          <StorySources sources={item.sources} lang={lang} itemId={item.id} />
          <a
            href={storyMarkdownUrl(item, lang)}
            className="not-typeset inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-accent"
          >
            {lang === "vi" ? "Bản Markdown" : "Markdown"}
          </a>
        </div>

        <StoryMetaAside item={item} lang={lang} imageUrl={imageUrl} />
      </div>
    </div>
  );
}
