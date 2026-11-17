/** Small cover chip on the left of each index row: the lead story's
 * publisher photo, or a week-number monogram when it has none. Used on the
 * closed issues and the provisional in-progress row. */
export function WeekThumb({
  week,
}: {
  week: {
    issue: number;
    image_url: string | null;
    week: string;
  };
}) {
  const label = `No. ${week.issue}`;
  if (week.image_url) {
    return (
      <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:h-[84px] sm:w-[84px]">
        <img
          src={week.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-gradient-to-br from-muted to-muted/40 text-accent sm:h-[84px] sm:w-[84px]"
    >
      <span className="font-mono text-[10px] leading-none font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      <span className="mt-1 text-base leading-none font-bold tabular-nums">
        {week.week.slice(-2)}
      </span>
    </span>
  );
}
