import { Skeleton } from "@aidr/ui";
import type { ReactNode } from "react";
import type { SystemDataState } from "../../lib/use-system-stats";

export function DataSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

/** Local loading placeholder sized like the card body it replaces, so
 *  content popping in never shifts layout. */
export function CardSkeleton({ tall }: { tall?: boolean }) {
  return <Skeleton className={`w-full ${tall ? "h-52" : "h-44"}`} />;
}

/** Per-card data state: the card's own skeleton while its endpoint is in
 * flight, a quiet inline note on failure — one slow query never blanks
 * the whole page anymore. */
export function CardData<T>({
  state,
  skeleton,
  children,
}: {
  state: SystemDataState<T>;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) {
    return <p className="text-sm text-muted-foreground">Couldn't load.</p>;
  }
  return <>{skeleton}</>;
}
