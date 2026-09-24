import { track } from "@aidr/ui/track";
import { Columns2, ExternalLink, X } from "lucide-react";
import type { FeedItem, Lang } from "../../lib/types";

/** The dialog's header row: the story title (external link), the
 * EN|VI side-by-side toggle when a translation exists, and the close button. */
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
  return (
    <div className="flex items-start justify-between gap-3">
      {item ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          lang={fallbackFromEnglish ? "en" : undefined}
          onClick={() => track("story_open", { item_id: item.id })}
          className="min-w-0 flex-1 font-semibold leading-snug hover:text-accent"
        >
          {title}
          {fallbackFromEnglish && (
            <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              EN
            </span>
          )}{" "}
          <ExternalLink className="inline h-3.5 w-3.5 align-baseline" />
        </a>
      ) : (
        <span className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-1">
        {hasVi && (
          <button
            type="button"
            aria-pressed={bilingual}
            onClick={() => {
              track("prefs_change", { pref: "bilingualDialog" });
              onToggleBilingual();
            }}
            title={
              lang === "vi"
                ? "Xem song song Anh/Việt"
                : "View English/Vietnamese side by side"
            }
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
              bilingual
                ? "border-accent text-accent"
                : "border-border text-muted-foreground hover:border-accent/60"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" aria-hidden />
            Dual language
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === "vi" ? "Đóng" : "Close"}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
