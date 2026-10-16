import { Check, Columns2, Copy, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { recordRead } from "../../lib/analytics/reads";
import { track } from "../../lib/analytics/track";
import { SITE_URL } from "../../lib/site";
import { storyPath } from "../../lib/slug";
import type { FeedItem, Lang } from "../../lib/types";
import { STORY_DIALOG_CLOSE_BUTTON_CLASS } from "./layout";

function permalink(item: Pick<FeedItem, "id">, lang: Lang): string {
  return new URL(storyPath(item, lang), SITE_URL).toString();
}

/** Dialog header: title links to the aidr.today permalink, the source URL
 * sits under it. Copy / bilingual / close float right so a long title
 * wraps under them instead of squeezing into a narrow column. */
export function DialogHeader({
  item,
  title,
  fallbackFromEnglish,
  hasVi,
  bilingual,
  lang,
  onToggleBilingual,
  onClose,
}: {
  item: FeedItem | null | undefined;
  title: string | undefined;
  fallbackFromEnglish: boolean;
  hasVi: boolean;
  bilingual: boolean;
  lang: Lang;
  onToggleBilingual: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const pageUrl = item ? permalink(item, lang) : "";

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

  return (
    <div className="flow-root">
      <div className="float-right -mt-2 -mr-2 ml-2 flex items-center">
        {item && (
          <button
            type="button"
            onClick={() => void copyPermalink()}
            aria-label={
              copied
                ? lang === "vi"
                  ? "Đã chép liên kết"
                  : "Link copied"
                : lang === "vi"
                  ? "Chép liên kết trang"
                  : "Copy permalink"
            }
            title={pageUrl}
            className={`${STORY_DIALOG_CLOSE_BUTTON_CLASS} text-muted-foreground hover:bg-muted hover:text-foreground`}
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
        {hasVi && (
          <button
            type="button"
            aria-pressed={bilingual}
            onClick={() => {
              track("prefs_change", {
                pref: "bilingualDialog",
                pref_value: bilingual ? "off" : "on",
              });
              onToggleBilingual();
            }}
            title={
              lang === "vi"
                ? "Xem song song Anh/Việt"
                : "View English/Vietnamese side by side"
            }
            className={`inline-flex size-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full text-xs font-semibold transition-colors motion-reduce:transition-none sm:mx-1 sm:h-8 sm:w-auto sm:border sm:px-2.5 ${
              bilingual
                ? "bg-accent/10 text-accent sm:border-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground sm:border-border sm:hover:border-accent/60"
            }`}
          >
            <Columns2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">
              {lang === "vi" ? "Song ngữ" : "Dual language"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === "vi" ? "Đóng" : "Close"}
          className={`${STORY_DIALOG_CLOSE_BUTTON_CLASS} text-muted-foreground hover:bg-muted hover:text-foreground`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {item ? (
        <div className="min-w-0 text-pretty text-[15px] leading-snug sm:text-base">
          <a
            href={pageUrl}
            lang={fallbackFromEnglish ? "en" : undefined}
            className="font-semibold hover:text-accent"
          >
            {title}
            {fallbackFromEnglish && (
              <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                EN
              </span>
            )}
          </a>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track("source_click", {
                  item_id: item.id,
                  placement: "dialog",
                });
                recordRead(item.id, "outbound");
              }}
              className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{item.url}</span>
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}
