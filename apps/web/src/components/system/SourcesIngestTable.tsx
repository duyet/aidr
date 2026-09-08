import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aidr/ui";
import type { IngestSourceRow } from "../../lib/system-queries";

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
}: {
  sources: IngestSourceRow[];
  lastRunBySource?: Record<string, number>;
}) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ingest sources configured.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8">Source</TableHead>
          <TableHead className="h-8">Adapter</TableHead>
          <TableHead className="h-8">Status</TableHead>
          <TableHead className="h-8 text-right">Items</TableHead>
          <TableHead className="h-8 text-right">Last run</TableHead>
          <TableHead className="h-8">Fetch config</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.id}>
            <TableCell className="py-2">
              <div className="font-medium">{source.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {source.id}
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
            <TableCell className="py-2 text-right font-mono tabular-nums">
              {lastRunBySource?.[source.id] ??
                lastRunBySource?.[source.type] ??
                "—"}
            </TableCell>
            <TableCell className="max-w-[16rem] truncate py-2 text-xs text-muted-foreground">
              {configHint(source.config)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
