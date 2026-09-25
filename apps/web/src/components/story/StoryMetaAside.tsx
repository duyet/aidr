import { ChevronDown, ChevronUp, Clock, Cpu, Link2 } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { useId, useRef, useState } from "react";
import { storyPath } from "../../lib/slug";
import { topicColor } from "../../lib/topic-color";
import type { FeedItem, Lang } from "../../lib/types";
import { CategoryLabel } from "../CategoryLabel";
import { fmtTime } from "./lib";
import { MediaGallery } from "./MediaGallery";
import {
  formatStoryScore,
  formatStoryTimestamp,
  formatStoryTokens,
  nextDisclosureId,
  storyTokenAriaLabel,
  storyTokenCount,
} from "./story-meta";

const STORY_DETAILS_COPY = {
  en: {
    story: "Story details",
    published: "Published",
    source: "Source",
    score: "Score",
    total: "Token total",
    context:
      "This is a story-level total; see Pipeline runs for model, workflow, and timing details.",
    runs: "Open run history",
  },
  vi: {
    story: "Chi tiết bài viết",
    published: "Xuất bản",
    source: "Nguồn",
    score: "Điểm",
    total: "Tổng token",
    context:
      "Đây là tổng ở cấp bài viết; xem lịch sử chạy để biết mô hình, quy trình và thời gian.",
    runs: "Mở lịch sử chạy",
  },
} as const;

function StoryTokenTrigger({
  item,
  lang,
  expanded,
  panelId,
  buttonRef,
  onToggle,
}: {
  item: FeedItem;
  lang: Lang;
  expanded: boolean;
  panelId: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const count = storyTokenCount(item.llm_tokens);
  if (count == null || count <= 0) return null;
  const unit = lang === "vi" ? "token" : "tokens";
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={storyTokenAriaLabel(lang, expanded, count)}
      title={`${formatStoryTokens(count)} ${unit}`}
      className="inline-flex min-h-8 touch-manipulation items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
          buttonRef.current?.focus();
        }
      }}
    >
      <Cpu className="inline h-3 w-3 align-[-1px]" aria-hidden />
      {formatStoryTokens(count)} {unit}
      {expanded ? (
        <ChevronUp className="inline h-3 w-3" aria-hidden />
      ) : (
        <ChevronDown className="inline h-3 w-3" aria-hidden />
      )}
    </button>
  );
}

function StoryTokenPanel({
  item,
  lang,
  panelId,
  buttonRef,
  onClose,
}: {
  item: FeedItem;
  lang: Lang;
  panelId: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const count = storyTokenCount(item.llm_tokens);
  if (count == null || count <= 0) return null;
  const copy = STORY_DETAILS_COPY[lang];
  return (
    <fieldset
      id={panelId}
      tabIndex={-1}
      aria-label={copy.story}
      className="mt-2 min-w-0 border-0 border-l border-border p-0 pl-2 text-[11px] leading-relaxed"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          buttonRef.current?.focus();
        }
      }}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {copy.story}
      </p>
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{copy.published}</dt>
          <dd
            className="font-mono tabular-nums text-foreground"
            suppressHydrationWarning
          >
            {formatStoryTimestamp(item.published_at, lang)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{copy.source}</dt>
          <dd className="break-words text-foreground">
            {item.source_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{copy.score}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatStoryScore(item.rank_score)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{copy.total}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatStoryTokens(count)}
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 text-muted-foreground">
        {copy.context}{" "}
        <a
          href="/data?tab=runs"
          className="font-medium underline underline-offset-2 hover:text-accent"
        >
          {copy.runs}
        </a>
      </p>
    </fieldset>
  );
}

/** Right-hand meta column: thumbnail, topics, and the details line. */
export function StoryMetaAside({
  item,
  lang,
  imageUrl,
}: {
  item: FeedItem;
  lang: Lang;
  imageUrl: string | null;
}) {
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const detailsId = "story-tokens";
  const detailsOpen = openDetails === detailsId;
  const panelId = `story-token-details-${useId().replace(/:/g, "")}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tokenCount = storyTokenCount(item.llm_tokens);
  const showTokenDetails = tokenCount !== null && tokenCount > 0;

  return (
    <aside className="not-typeset min-w-0 space-y-5 md:border-l md:border-border md:pl-6">
      {/* The bounded media manifest (#160) is the source of truth for ordered
          image/video assets; `imageUrl` stays the single legacy thumbnail used
          when the manifest has nothing renderable. */}
      <MediaGallery
        manifest={item.media_manifest}
        fallbackImageUrl={imageUrl}
        articleUrl={item.url}
        lang={lang}
        itemId={item.id}
      />

      {(item.tags.length > 0 || item.category) && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {lang === "vi" ? "Chủ đề" : "Topics"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.category && (
              <span className="rounded-full border border-border bg-background px-2 py-0 text-xs">
                <CategoryLabel name={item.category} lang={lang} />
              </span>
            )}
            {item.tags.map((tag) => {
              const color = topicColor(tag);
              return (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-background px-2 py-0 text-xs"
                >
                  <span
                    className="topic-colored"
                    style={
                      {
                        "--tc-light": color.light,
                        "--tc-dark": color.dark,
                      } as CSSProperties
                    }
                  >
                    {tag}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-xs leading-relaxed text-muted-foreground">
        <div>
          <Clock className="inline h-3 w-3 align-[-1px]" aria-hidden />{" "}
          {fmtTime(item.published_at, lang)} · {item.source_id} · score{" "}
          {formatStoryScore(item.rank_score)}
          {showTokenDetails ? (
            <>
              {" · "}
              <StoryTokenTrigger
                item={item}
                lang={lang}
                expanded={detailsOpen}
                panelId={panelId}
                buttonRef={buttonRef}
                onToggle={() =>
                  setOpenDetails((current) =>
                    nextDisclosureId(current, detailsId)
                  )
                }
              />
            </>
          ) : null}
          {" · "}
          <a
            href={storyPath(item, lang)}
            className="underline underline-offset-2 hover:text-accent"
          >
            <Link2 className="inline h-3 w-3 align-[-1px]" aria-hidden />{" "}
            {lang === "vi" ? "Trang tin" : "Permalink"}
          </a>
        </div>
        {showTokenDetails && detailsOpen ? (
          <StoryTokenPanel
            item={item}
            lang={lang}
            panelId={panelId}
            buttonRef={buttonRef}
            onClose={() => setOpenDetails(null)}
          />
        ) : null}
      </div>
    </aside>
  );
}
