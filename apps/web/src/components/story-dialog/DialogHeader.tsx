import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  X,
} from "lucide-react";
import { useState } from "react";
import { recordRead } from "../../lib/analytics/reads";
import { track } from "../../lib/analytics/track";
import { categoryLabel, timeAgo } from "../../lib/lang";
import { usePrefs } from "../../lib/prefs";
import { publisherHost } from "../../lib/publisher-host";
import { SITE_URL } from "../../lib/site";
import { storyPath } from "../../lib/slug";
import { topicStyle } from "../../lib/topic";
import type { FeedItem, Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { titleParts } from "../story/story-text";
import { STORY_DIALOG_CLOSE_BUTTON_CLASS } from "./layout";

function permalink(item: Pick<FeedItem, "id">, lang: Lang): string {
  return new URL(storyPath(item, lang), SITE_URL).toString();
}

const ICON_BUTTON = `${STORY_DIALOG_CLOSE_BUTTON_CLASS} text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent`;

export function DialogHeader({
  item,
  title,
  fallbackFromEnglish,
  hasVi,
  bilingual,
  lang,
  onToggleBilingual,
  onClose,
  onStep,
}: {
  item: FeedItem | undefined;
  title: string | undefined;
  fallbackFromEnglish: boolean;
  hasVi: boolean;
  /** The side-by-side EN | VI view. */
  bilingual: boolean;
  lang: Lang;
  onToggleBilingual: () => void;
  onClose: () => void;
  /** J and K as buttons: the next (1) or previous (-1) story. */
  onStep?: (direction: 1 | -1) => void;
}) {
  const { prefs } = usePrefs();
  const [copied, setCopied] = useState(false);
  const pageUrl = item ? permalink(item, lang) : "";
  const vi = lang === "vi";

  async function copyPermalink() {
    if (!pageUrl) return;
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const headline =
    item && (prefs.bilingual || bilingual)
      ? titleParts(item, lang, {
          bilingual: true,
          first: bilingual ? lang : prefs.bilingualFirst,
        })
      : [
          {
            lang: fallbackFromEnglish ? "en" : lang,
            text: title ?? "",
            second: false,
          },
        ];
  const host = item ? publisherHost(item.url) : null;

  return (
    <div className="grid gap-2.5">
      <div className="-mx-2 flex items-center gap-1">
        {onStep && (
          <>
            <Button
              type="button"
              onClick={() => onStep(-1)}
              aria-label={vi ? "Tin trước" : "Previous story"}
              className={ICON_BUTTON}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              onClick={() => onStep(1)}
              aria-label={vi ? "Tin kế" : "Next story"}
              className={ICON_BUTTON}
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
            <span
              aria-hidden
              className="flex gap-1 text-[11px] text-muted-foreground [@media(hover:none)]:hidden"
            >
              <kbd className="rounded bg-muted px-1.5 font-mono">J</kbd>
              <kbd className="rounded bg-muted px-1.5 font-mono">K</kbd>
            </span>
          </>
        )}
        <span className="ml-auto flex items-center">
          {hasVi && (
            <Toggle
              pressed={bilingual}
              onPressedChange={() => {
                track("prefs_change", {
                  pref: "bilingualDialog",
                  pref_value: bilingual ? "off" : "on",
                });
                onToggleBilingual();
              }}
              title={
                vi
                  ? "Xem song song Anh/Việt"
                  : "View English/Vietnamese side by side"
              }
              className="inline-flex size-11 shrink-0 items-center justify-center gap-1 rounded-full text-xs font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-pressed:bg-muted data-pressed:text-foreground motion-reduce:transition-none sm:mx-1 sm:h-8 sm:w-auto sm:px-3"
            >
              <Columns2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {vi ? "Song ngữ" : "Dual language"}
              </span>
            </Toggle>
          )}
          {item && (
            <Button
              type="button"
              onClick={() => void copyPermalink()}
              aria-label={
                copied
                  ? vi
                    ? "Đã chép liên kết"
                    : "Link copied"
                  : vi
                    ? "Chép liên kết trang"
                    : "Copy permalink"
              }
              title={pageUrl}
              className={ICON_BUTTON}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </Button>
          )}
          <Button
            type="button"
            onClick={onClose}
            aria-label={vi ? "Đóng" : "Close"}
            className={ICON_BUTTON}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </span>
      </div>
      {item ? (
        <div className="min-w-0 text-pretty" style={topicStyle(item.category)}>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.07em] text-muted-foreground uppercase">
            {item.category && (
              <>
                <span
                  aria-hidden
                  className="topic-dot inline-block size-2 rounded-full"
                />
                {categoryLabel(item.category, lang)}
                <span aria-hidden>·</span>
              </>
            )}
            <span suppressHydrationWarning>
              {timeAgo(item.published_at, Date.now(), lang)}
            </span>
          </p>
          <a
            href={pageUrl}
            className="mt-1.5 block font-heading text-[20.5px] leading-[1.2] font-semibold text-foreground hover:text-accent"
          >
            {headline.map((part) => (
              <span
                key={part.lang}
                lang={part.lang}
                className={
                  part.second
                    ? "bi-second mt-1 block text-[0.7em]! font-medium"
                    : "block"
                }
              >
                {part.text}
                {part.lang === "en" && fallbackFromEnglish && !part.second && (
                  <span className="ml-1 align-middle text-[10px] font-semibold tracking-wide uppercase">
                    EN
                  </span>
                )}
              </span>
            ))}
          </a>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={pageUrl} className="btn-primary">
              <Bi vi="Mở trang tin" en="Open page" inline />
              <ArrowUpRight aria-hidden />
            </a>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={item.url}
                onClick={() => {
                  track("source_click", {
                    item_id: item.id,
                    placement: "dialog",
                  });
                  recordRead(item.id, "outbound");
                }}
                className="btn-link"
              >
                <Bi vi="Đọc nguồn" en="Source" inline />
                {host && <span className="text-muted-foreground">{host}</span>}
                <ArrowUpRight aria-hidden />
              </a>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
