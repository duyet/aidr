import { cn } from "@aidr/libs/utils";
import { Card, CardContent, Skeleton } from "@aidr/ui";
import type { LucideIcon } from "lucide-react";

/** Shared tile height so the loading placeholder and the loaded tile never
 *  shift the metric row when one endpoint resolves before the other. */
export const STAT_TILE_MIN_HEIGHT = "min-h-[5.25rem]";

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
        "h-full border-border/70 bg-card shadow-none",
        STAT_TILE_MIN_HEIGHT
      )}
    >
      <CardContent className="flex h-full flex-col p-3.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {Icon ? (
            <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          ) : null}
          <span className="truncate">{label}</span>
        </p>
        {value === null ? (
          <Skeleton className="mt-2 h-6 w-14" />
        ) : (
          <p
            className={cn(
              "mt-1.5 font-semibold leading-none tracking-tight text-foreground",
              numeric ? "font-mono text-2xl tabular-nums" : "font-sans text-lg"
            )}
          >
            {value}
          </p>
        )}
        {sublabel ? (
          <p className="mt-1.5 min-w-0 text-[11px] leading-tight text-muted-foreground">
            {sublabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Same box as StatTile with no copy, for a section that is still in flight. */
export function StatTileSkeleton() {
  return <Skeleton className={cn("rounded-2xl", STAT_TILE_MIN_HEIGHT)} />;
}
