const TITLE_WIDTHS = ["w-3/4", "w-2/3", "w-5/6", "w-1/2", "w-2/3", "w-3/4"];

function SkeletonRow({ i }: { i: number }) {
  return (
    <div className="flex items-center gap-3.5 py-(--home-row-pad)">
      <span className="h-3.5 w-7 shrink-0 rounded bg-muted max-[699px]:hidden" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span
          className={`block h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]} rounded bg-muted`}
        />
        <span className="block h-3 w-1/3 rounded bg-muted" />
      </span>
      <span className="size-(--home-thumb-size) shrink-0 rounded-md bg-muted" />
    </div>
  );
}

/** The home page before its feed arrives, in the shape of the loaded page:
 * day heading, topic chips, the AI;DR card, then the lead and the rail. */
export function FeedSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-(--home-section-gap) pt-5 motion-reduce:animate-none">
      <div className="space-y-4">
        <div className="h-7 w-56 rounded bg-muted" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="h-[30px] w-20 shrink-0 rounded-full bg-muted"
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg bg-muted/60 p-5">
        <div className="mb-2 h-5 w-24 rounded bg-muted" />
        <div className="tldr-grid gap-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-stretch gap-2">
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-3.5 w-full rounded bg-muted" />
                <span className="block h-3.5 w-4/5 rounded bg-muted" />
              </span>
              <span className="size-12 shrink-0 rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-(--home-col-gap) min-[900px]:grid-cols-[minmax(0,1fr)_var(--rail-width)]">
        <div className="flex flex-col gap-(--home-section-gap)">
          <div className="grid gap-5 min-[700px]:grid-cols-[minmax(0,1fr)_190px]">
            <div className="space-y-3">
              <div className="h-3 w-32 rounded bg-muted" />
              <div className="h-6 w-full rounded bg-muted" />
              <div className="h-6 w-2/3 rounded bg-muted" />
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-8 w-28 rounded-full bg-muted" />
            </div>
            <div className="h-28 rounded-[10px] bg-muted" />
          </div>
          <div>
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonRow key={i} i={i} />
            ))}
          </div>
        </div>
        <div className="space-y-(--home-rail-gap) max-[899px]:hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-3.5 w-24 rounded bg-muted" />
              <div className="h-24 rounded-lg bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
