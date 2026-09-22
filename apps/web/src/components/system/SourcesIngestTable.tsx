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
import type { IngestSourceRow, NamedCount } from "../../lib/system-queries";

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

export function SourcesIngestTable({
  sources,
  lastRunBySource,
  volume,
}: {
  sources: IngestSourceRow[];
  lastRunBySource?: Record<string, number>;
  /** Stored items by source_id (top 10) — the old Volume card, folded in. */
  volume?: NamedCount[];
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8">Source</TableHead>
          <TableHead className="h-8">Adapter</TableHead>
          <TableHead className="h-8">Status</TableHead>
          <TableHead className="h-8 text-right">Items</TableHead>
          <TableHead className="h-8">Volume</TableHead>
          <TableHead className="h-8 text-right">Last run</TableHead>
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
              <TableCell className="py-2 text-right font-mono tabular-nums">
                {source.itemCount}
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
              <TableCell className="py-2 text-right font-mono tabular-nums">
                {lastRunBySource?.[source.id] ??
                  lastRunBySource?.[source.type] ??
                  "—"}
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
