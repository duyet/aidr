import { Skeleton } from "@aidr/ui";
import type { ReactNode } from "react";
import type { SystemDataState } from "../../lib/use-system-stats";

/** Local loading placeholder sized like the card body it replaces, so
 *  content popping in never shifts layout. */
export function CardSkeleton({ tall }: { tall?: boolean }) {
  return <Skeleton className={`w-full ${tall ? "h-52" : "h-44"}`} />;
}

/** Per-card data state: the card's own skeleton while its endpoint is in
 *  flight, a quiet inline note on failure — one slow query never blanks
 *  the whole page anymore.
 *
 * `className` wraps the resolved content in an element with that class, which
 * lets a caller inject its own into a parent grid (`contents`) without
 * CardData knowing about the grid. Omit it to stay layout-neutral. */
export function CardData<T>({
  state,
  skeleton,
  className,
  children,
}: {
  state: SystemDataState<T>;
  skeleton: ReactNode;
  className?: string;
  children: (data: T) => ReactNode;
}) {
  const content = state.data ? (
    children(state.data)
  ) : state.error ? (
    <p className="text-sm text-muted-foreground">Couldn't load.</p>
  ) : (
    skeleton
  );
  if (!className) return <>{content}</>;
  return <div className={className}>{content}</div>;
}
