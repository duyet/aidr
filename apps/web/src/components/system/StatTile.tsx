import { cn } from "@aidr/libs/utils";
import { Card, CardContent, Skeleton } from "@aidr/ui";
import type { LucideIcon } from "lucide-react";

/** Shared tile height so the loading placeholder and the loaded tile never
 *  shift the metric row when one endpoint resolves before the other. */
export const STAT_TILE_MIN_HEIGHT = "min-h-[4.75rem]";

interface StatTileProps {
  label: string;
  /** `null` renders the placeholder — no label/value flash while loading. */
  value: string | null;
  sublabel?: string;
  icon?: LucideIcon;
  /** Set false for non-numeric values (`Healthy`, `Unavailable`). */
  numeric?: boolean;
}

export function StatTile({
  label,
  value,
  sublabel,
  icon: Icon,
  numeric = true,
}: StatTileProps) {
  return (
    <Card
      className={cn(
        "h-full rounded-lg border-border bg-card shadow-none",
        STAT_TILE_MIN_HEIGHT
      )}
    >
      <CardContent className="flex h-full flex-col px-3.5 py-3 sm:px-4">
        <p className="flex min-w-0 items-center gap-1.5 font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase tracking-[0.1em] text-muted-foreground">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          <span className="truncate">{label}</span>
        </p>
        {value === null ? (
          <Skeleton className="mt-1.5 h-[22px] w-14" />
        ) : (
          <p
            className={cn(
              "mt-1.5 font-semibold leading-none tracking-[-0.02em] text-foreground",
              numeric ? "text-[calc(22px*var(--reader-font-size,1))] tabular-nums" : "text-base"
            )}
          >
            {value}
          </p>
        )}
        {sublabel ? (
          <p className="mt-1 min-w-0 text-[calc(11px*var(--reader-font-size,1))] leading-tight text-muted-foreground">
            {sublabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Same box as StatTile with no copy, for a section that is still in flight. */
export function StatTileSkeleton() {
  return <Skeleton className={cn("rounded-lg", STAT_TILE_MIN_HEIGHT)} />;
}
