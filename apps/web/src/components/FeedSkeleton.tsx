function SkeletonRow({ i }: { i: number }) {
  const widths = [
    "w-3/4",
    "w-2/3",
    "w-3/4",
    "w-1/2",
    "w-2/3",
    "w-3/4",
    "w-1/2",
    "w-2/3",
  ];
  return (
    <div className="flex items-baseline gap-3 border-b border-border py-2">
      <span className="h-4 w-5 shrink-0 rounded bg-muted" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span
          className={`block h-4 ${widths[i % widths.length]} rounded bg-muted`}
        />
        <span className="block h-3 w-1/4 rounded bg-muted" />
      </span>
      <span className="hidden h-4 w-14 shrink-0 rounded bg-muted sm:block" />
      <span className="h-4 w-10 shrink-0 rounded bg-muted" />
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Category nav */}
      <div className="flex items-center gap-1.5 border-b border-border py-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-7 w-16 shrink-0 rounded-full bg-muted" />
        ))}
      </div>

      {/* Trending chips */}
      <div className="flex items-center gap-2 py-3">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-7 w-20 shrink-0 rounded-full bg-muted" />
        ))}
      </div>

      {/* TL;DR */}
      <div className="space-y-2 border-y-2 border-border py-4">
        <div className="mb-2.5 h-5 w-24 rounded bg-muted" />
        <div className="grid gap-x-10 md:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex min-h-[2lh] items-stretch gap-2">
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3.5 w-full rounded bg-muted" />
                    <span className="block h-3.5 w-4/5 rounded bg-muted" />
                  </span>
                  <span className="size-[2lh] shrink-0 rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Day section */}
      <div className="pt-6">
        <div className="flex items-baseline gap-x-4 border-b-2 border-border pb-2">
          <span className="h-6 w-40 rounded bg-muted" />
          <span className="h-3.5 w-16 rounded bg-muted" />
        </div>
        <div>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} i={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
