import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aidr/ui";
import { sourceIconUrl } from "../../lib/source-icon";
import type {
  IngestSourceRow,
  NamedCount,
  SourceHealthView,
} from "../../lib/system-queries";

function configHint(config: Record<string, unknown>): string {
  const query = config.query;
  if (typeof query === "string" && query.trim()) return query.trim();
  const tags = config.tags;
  if (Array.isArray(tags) && tags.length) {
    return tags.filter((t) => typeof t === "string").join(", ");
  }
  const keys = Object.keys(config);
  if (keys.length === 0) return "—";
  return keys
    .slice(0, 4)
    .map((k) => `${k}=${String(config[k])}`)
    .join(" · ");
}

/** Reason text is duplicated from `worker/source-health.ts`'s
 *  `describeSkipReason` rather than imported: this is a client component and
 *  the worker module is server-only. Keeping the wording identical matters
 *  more than sharing the function. */
const SKIP_REASON_TEXT: Record<string, string> = {
  fetch_failed: "fetch failed",
  parse_failed: "feed unparseable",
  empty: "no items in window",
  all_rejected_below_relevance: "all rejected below relevance",
  disabled: "disabled",
};

const ZERO: SourceHealthView = {
  observed: false,
  fetched: 0,
  scored: 0,
  accepted: 0,
  rejected: 0,
  merged: 0,
  skipReason: "",
  emptyRuns: 0,
};

function agoLabel(epochSec: number | null): string {
  if (!epochSec) return "never";
  const hours = Math.round((Date.now() / 1000 - epochSec) / 3600);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function HealthCell({ health }: { health: SourceHealthView | undefined }) {
  const h = health ?? ZERO;
  if (h.skipReason === "disabled") {
    return <span className="text-xs text-muted-foreground">off</span>;
  }
  if (!h.observed) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="No per-source stats on the last run"
      >
        —
      </span>
    );
  }
  if (h.stale) {
    return (
      <Badge variant="destructive" className="font-normal">
        stale · {h.emptyRuns}/{h.staleAfterRuns} runs
      </Badge>
    );
  }
  if (h.skipReason) {
    return (
      <Badge variant="outline" className="font-normal">
        {SKIP_REASON_TEXT[h.skipReason] ?? h.skipReason}
        {h.emptyRuns > 0 ? ` · ${h.emptyRuns}` : ""}
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">ok</span>;
}

export function SourcesIngestTable({
  sources,
  lastRunBySource,
  volume,
  health,
}: {
  sources: IngestSourceRow[];
  lastRunBySource?: Record<string, number>;
  /** Stored items by source_id (top 10) — the old Volume card, folded in. */
  volume?: NamedCount[];
  /** Per-source outcome from the last run (`/api/system/sources`). */
  health?: Record<string, SourceHealthView>;
}) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ingest sources configured.
      </p>
    );
  }

  const volumeById = new Map((volume ?? []).map((v) => [v.name, v.count]));
  const volumeMax = Math.max(1, ...volumeById.values());
  const itemsMax = Math.max(1, ...sources.map((s) => s.itemCount));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8">Source</TableHead>
          <TableHead className="h-8">Adapter</TableHead>
          <TableHead className="h-8">Status</TableHead>
          <TableHead className="h-8">Items</TableHead>
          <TableHead className="h-8">Volume</TableHead>
          <TableHead className="h-8 text-right">Fetched</TableHead>
          <TableHead className="h-8 text-right">New</TableHead>
          <TableHead className="h-8 text-right">Accepted</TableHead>
          <TableHead className="h-8 text-right">Rejected</TableHead>
          <TableHead className="h-8 text-right">Last item</TableHead>
          <TableHead className="h-8">Health</TableHead>
          <TableHead className="h-8">Fetch config</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((source) => {
          const icon = sourceIconUrl(source);
          const stored = volumeById.get(source.id) ?? source.itemCount;
          const share = Math.max(
            (stored / volumeMax) * 100,
            stored > 0 ? 4 : 0
          );
          const row = health?.[source.id];
          return (
            <TableRow key={source.id}>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      width={16}
                      height={16}
                      className="size-4 shrink-0 rounded-sm"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div>
                    <div className="font-medium">{source.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {source.id}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-2 font-mono text-xs">
                {source.type}
              </TableCell>
              <TableCell className="py-2">
                <Badge
                  variant={source.enabled ? "secondary" : "outline"}
                  className="font-normal"
                >
                  {source.enabled ? "on" : "off"}
                </Badge>
              </TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max((source.itemCount / itemsMax) * 100, source.itemCount > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums">
                    {source.itemCount}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {stored}
                  </span>
                </div>
              </TableCell>
              {/* Fetched / New / Accepted / Rejected are the last run's
                  per-source numbers, not lifetime totals: the question they
                  answer is "what did this source do to the pipeline just now".
                  `accepted` is items written as published, so a source that
                  fetches plenty and publishes nothing is obvious here even
                  though it looks busy in the Items/Volume columns. */}
              <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                {row?.observed
                  ? row.fetched
                  : (lastRunBySource?.[source.id] ?? "—")}
              </TableCell>
              <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                {row?.observed ? row.scored : "—"}
              </TableCell>
              <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                {row?.observed ? row.accepted : "—"}
              </TableCell>
              <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {row?.observed ? row.rejected : "—"}
              </TableCell>
              <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {agoLabel(source.lastItemAt)}
              </TableCell>
              <TableCell className="py-2">
                <HealthCell health={health?.[source.id]} />
              </TableCell>
              <TableCell className="max-w-[16rem] truncate py-2 text-xs text-muted-foreground">
                {configHint(source.config)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
