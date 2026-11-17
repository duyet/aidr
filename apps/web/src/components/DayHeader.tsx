import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { dayArchivePath } from "../lib/day-archive";
import { formatDayHeading, timeAgo } from "../lib/lang";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";

const ARROW =
  "inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground hover:bg-border disabled:pointer-events-none disabled:opacity-50";

function DayArrow({
  href,
  label,
  children,
}: {
  /** Null renders a disabled button. */
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  return href ? (
    <a href={href} aria-label={label} className={ARROW}>
      {children}
    </a>
  ) : (
    <button type="button" disabled aria-label={label} className={ARROW}>
      {children}
    </button>
  );
}

/** The calendar day before `date` (both `YYYY-MM-DD`). */
export function dayBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The home page's day heading with previous and next day. The feed opens on
 * the newest day, so "next" has nowhere to go and stays disabled. In the
 * newspaper layout a masthead with a date strip takes its place.
 */
export function DayHeader({
  date,
  prevDate,
  total,
  updatedAt,
  lastFetchedAt,
  lang,
}: {
  date: string;
  /** The older day to link to, or null when there is none. */
  prevDate: string | null;
  total: number;
  updatedAt: number;
  lastFetchedAt: number | null;
  lang: Lang;
}) {
  const summary = (l: Lang) => {
    const count = l === "vi" ? `${total} tin` : `${total} stories`;
    if (!lastFetchedAt) return count;
    const ago = timeAgo(lastFetchedAt, updatedAt, l);
    return l === "vi"
      ? `${count} · cập nhật ${ago}`
      : `${count} · updated ${ago}`;
  };

  return (
    <>
      <div className="np-only np-masthead pt-5">
        <div className="np-masthead-title" aria-hidden="true">
          AI;DR
        </div>
        <div className="np-masthead-date mt-2.5 flex flex-wrap justify-between gap-x-3 gap-y-1">
          <span>{formatDayHeading(date, lang)}</span>
          <span>{summary(lang)}</span>
        </div>
      </div>
      <div className="np-hide flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[22.5px] font-semibold leading-[1.1] tracking-[-0.015em] text-foreground min-[700px]:text-[23.5px] min-[700px]:in-data-[layout=comfortable]:text-[29.5px]">
          <Bi
            vi={formatDayHeading(date, "vi")}
            en={formatDayHeading(date, "en")}
          />
        </h2>
        <span className="text-[12.5px] text-muted-foreground">
          <Bi vi={summary("vi")} en={summary("en")} inline />
        </span>
        <span className="ml-auto flex gap-1.5">
          <DayArrow
            href={prevDate ? dayArchivePath(prevDate, lang) : null}
            label={lang === "vi" ? "Ngày trước" : "Previous day"}
          >
            <ChevronLeft aria-hidden="true" className="size-[15px]" />
          </DayArrow>
          <DayArrow href={null} label={lang === "vi" ? "Ngày sau" : "Next day"}>
            <ChevronRight aria-hidden="true" className="size-[15px]" />
          </DayArrow>
        </span>
      </div>
    </>
  );
}
