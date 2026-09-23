import { track } from "@aidr/ui/track";
import { ExternalLink } from "lucide-react";
import { publisherHost } from "../../lib/publisher-host";
import type { FeedItem, Lang } from "../../lib/types";
import { fmtTime } from "./lib";

function SourceRow({
  source,
  lang,
  itemId,
}: {
  source: FeedItem["sources"][number];
  lang: Lang;
  itemId: string;
}) {
  const label =
    source.kind === "discussion"
      ? lang === "vi"
        ? "THẢO LUẬN"
        : "DISCUSSION"
      : source.kind.toUpperCase();
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wide text-accent">
        {label}
      </span>
      {source.author && <span className="font-semibold">{source.author}</span>}
      {source.posted_at && (
        <span className="text-xs text-muted-foreground">
          {fmtTime(source.posted_at, lang)}
        </span>
      )}
      {source.quote && (
        <span className="text-muted-foreground">— {source.quote}</span>
      )}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("story_open", { item_id: itemId })}
          className="text-accent hover:underline"
          aria-label="Open source"
        >
          <ExternalLink className="inline h-3.5 w-3.5" />
          {publisherHost(source.url) && (
            <span className="ml-1">{publisherHost(source.url)}</span>
          )}
        </a>
      )}
    </div>
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
  if (sources.length === 0) return null;
  return (
    <div className="not-typeset space-y-2 border-t border-border pt-4">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {lang === "vi" ? "Nguồn chính" : "Key sources"}
      </div>
      {sources.map((source) => (
        <SourceRow
          key={`${source.kind}-${source.url ?? source.author}`}
          source={source}
          lang={lang}
          itemId={itemId}
        />
      ))}
    </div>
  );
}
