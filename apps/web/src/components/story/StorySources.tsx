import { track } from "@aidr/ui/track";
import { ExternalLink } from "lucide-react";
import { useId } from "react";
import { publisherHost } from "../../lib/publisher-host";
import type { FeedItem, ItemSource, Lang } from "../../lib/types";
import { fmtTime } from "./lib";

function safeSourceUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function sourceLabel(kind: string, lang: Lang) {
  if (kind === "discussion") {
    return lang === "vi" ? "THẢO LUẬN" : "DISCUSSION";
  }
  return kind.toUpperCase();
}

function sourceLinkLabel(kind: string, lang: Lang) {
  if (kind === "support") {
    return lang === "vi" ? "Mở nguồn hỗ trợ" : "Open supporting source";
  }
  if (kind === "discussion") {
    return lang === "vi" ? "Mở thảo luận" : "Open discussion";
  }
  return lang === "vi" ? "Mở nguồn" : "Open source";
}

function InlineDivider() {
  return (
    <span aria-hidden="true" className="text-border">
      {" · "}
    </span>
  );
}

/** Whether a row carries a renderable timestamp. The renderer skips falsy
 * `posted_at` values, so the filter has to agree: `0` is not a date we can
 * format, and admitting it would render a lone role label with no content.
 * Declared as a type guard so callers also get the non-null narrowing. */
function hasTimestamp(
  source: ItemSource
): source is ItemSource & { posted_at: number } {
  return Boolean(source.posted_at);
}

/** A source row is only worth rendering when it carries at least one piece of
 * metadata. The API contract allows metadata-empty rows (e.g. `{ kind:
 * "source" }`); rendering those would leave a lone, meaningless `SOURCE`
 * label with no content beside it. */
function hasRowContent(source: ItemSource): boolean {
  if (source.author) return true;
  if (hasTimestamp(source)) return true;
  if (source.quote) return true;
  return safeSourceUrl(source.url) != null;
}

function SourceRow({
  source,
  lang,
  itemId,
}: {
  source: FeedItem["sources"][number];
  lang: Lang;
  itemId: string;
}) {
  const kind = source.kind || "source";
  const href = safeSourceUrl(source.url);
  const host = publisherHost(href);
  const linkLabel = sourceLinkLabel(kind, lang);
  const roleTone =
    kind === "source"
      ? "text-accent"
      : kind === "support"
        ? "text-foreground/80"
        : "text-muted-foreground";

  return (
    <li className="flex items-baseline gap-x-1.5 text-sm leading-relaxed">
      <span
        className={`shrink-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] ${roleTone}`}
      >
        {sourceLabel(kind, lang)}
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {source.author && (
          <span className="font-semibold">{source.author}</span>
        )}
        {hasTimestamp(source) && (
          <>
            {source.author && <InlineDivider />}
            <time
              dateTime={new Date(source.posted_at * 1000).toISOString()}
              className="text-xs text-muted-foreground"
            >
              {fmtTime(source.posted_at, lang)}
            </time>
          </>
        )}
        {source.quote && (
          <>
            {(source.author || hasTimestamp(source)) && <InlineDivider />}
            <span className="text-muted-foreground">“{source.quote}”</span>
          </>
        )}
        {href && (
          /* The divider and the external-link icon stay glued to the atomic
           * link unit, so neither can be stranded alone at a line end. The unit
           * is an `inline-block` capped at the row width, so a pathologically
           * long host may still wrap *within* the unit — it degrades to a
           * multi-line unit rather than orphaning a piece or overflowing. */
          <span
            data-source-meta-unit
            className="inline-block max-w-full whitespace-nowrap align-baseline"
          >
            {(source.author || source.posted_at || source.quote) && (
              <InlineDivider />
            )}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("story_open", { item_id: itemId })}
              className="whitespace-normal [overflow-wrap:anywhere] font-medium text-accent underline decoration-border underline-offset-2 hover:decoration-accent focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`${linkLabel}: ${host ?? href}`}
            >
              <ExternalLink
                aria-hidden="true"
                className="mr-0.5 inline h-3 w-3 align-[-0.12em]"
              />
              {host ?? linkLabel}
            </a>
          </span>
        )}
      </span>
    </li>
  );
}

export function StorySources({
  sources,
  lang,
  itemId,
}: {
  sources: FeedItem["sources"];
  lang: Lang;
  itemId: string;
}) {
  const headingId = useId();
  if (sources.length === 0) return null;

  // Contract-valid rows may arrive with no metadata at all. Skipping them keeps
  // every rendered <li> meaningful; when nothing renderable is left we show an
  // intentional, localized empty state instead of an empty list.
  const renderable = sources.filter(hasRowContent);

  return (
    <section
      aria-labelledby={headingId}
      className="not-typeset border-t border-border pt-4"
    >
      <h2
        id={headingId}
        className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {lang === "vi" ? "Nguồn chính" : "Key sources"}
      </h2>
      {renderable.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "vi"
            ? "Chưa có thông tin chi tiết về nguồn."
            : "No source details are available yet."}
        </p>
      ) : (
        <ol className="mt-2 list-none space-y-1">
          {renderable.map((source, index) => (
            <SourceRow
              key={`${source.kind}-${source.url ?? source.author ?? "source"}-${index}`}
              source={source}
              lang={lang}
              itemId={itemId}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
