import { track } from "@aidr/ui/track";
import { ExternalLink } from "lucide-react";
import { useId } from "react";
import { publisherHost } from "../../lib/publisher-host";
import type { FeedItem, Lang } from "../../lib/types";
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
        {source.posted_at && (
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
            {(source.author || source.posted_at) && <InlineDivider />}
            <span className="text-muted-foreground">“{source.quote}”</span>
          </>
        )}
        {href && (
          <>
            {(source.author || source.posted_at || source.quote) && (
              <InlineDivider />
            )}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("story_open", { item_id: itemId })}
              className="font-medium text-accent underline decoration-border underline-offset-2 hover:decoration-accent focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`${linkLabel}: ${host ?? href}`}
            >
              <ExternalLink
                aria-hidden="true"
                className="mr-0.5 inline h-3 w-3 align-[-0.12em]"
              />
              {host ?? linkLabel}
            </a>
          </>
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
      <ol className="mt-2 list-none space-y-1">
        {sources.map((source, index) => (
          <SourceRow
            key={`${source.kind}-${source.url ?? source.author ?? "source"}-${index}`}
            source={source}
            lang={lang}
            itemId={itemId}
          />
        ))}
      </ol>
    </section>
  );
}
