import { ArrowRight, BookOpen, Mail, Send } from "lucide-react";
import type { ReactNode } from "react";
import { track } from "../lib/analytics/track";
import { withLang } from "../lib/locale-url";
import {
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../lib/site";
import type { FeedResponse, Lang } from "../lib/types";
import {
  formatWeekRange,
  lastClosedWeek,
  weekBounds,
  weekIssue,
  weekPath,
} from "../lib/week";
import { Bi } from "./Bi";
import { RailSubscribe } from "./RailSubscribe";
import { TrendingChips } from "./TrendingChips";

function RailHeading({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <h3 className="mb-3.5 flex items-center gap-[7px] text-[12.5px] font-bold uppercase tracking-[0.07em] text-foreground">
      {icon}
      {children}
    </h3>
  );
}

function RailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-[9px] text-[12.5px] font-semibold text-foreground hover:bg-muted"
    >
      <span className="min-w-0 truncate">{children}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-[15px] shrink-0 text-muted-foreground"
      />
    </a>
  );
}

/**
 * The home page's right rail: trending tags, the daily email and Telegram,
 * and this week's edition. It sticks below the header from 900px; below that
 * it follows the feed.
 */
export function HomeRail({
  feed,
  lang,
  selectedTag,
  onSelectTag,
  showTrending,
}: {
  feed: FeedResponse;
  lang: Lang;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  showTrending: boolean;
}) {
  const week = lastClosedWeek(Date.now());
  const bounds = weekBounds(week);
  const issue = weekIssue(week);
  const telegram =
    lang === "vi"
      ? { url: TELEGRAM_URL, handle: TELEGRAM_HANDLE }
      : { url: TELEGRAM_EN_URL, handle: TELEGRAM_EN_HANDLE };

  return (
    <aside
      aria-label={lang === "vi" ? "Bên lề" : "Sidebar"}
      className="flex min-w-0 flex-col gap-(--home-rail-gap) min-[900px]:sticky min-[900px]:top-[72px] min-[900px]:self-start"
    >
      {showTrending && (
        <TrendingChips
          trending={feed.trending}
          label="Trending"
          selectedTag={selectedTag}
          onSelectTag={onSelectTag}
        />
      )}
      <section>
        <RailHeading icon={<Mail className="size-[15px]" aria-hidden />}>
          <Bi vi="Bản tin mỗi sáng" en="Every morning" inline />
        </RailHeading>
        <RailSubscribe lang={lang} />
        <a
          href={telegram.url}
          onClick={() =>
            track("channel_click", {
              channel: "telegram",
              placement: "home_rail",
              lang,
            })
          }
          target="_blank"
          rel="noopener noreferrer"
          className="btn-link mt-3.5"
        >
          <Send aria-hidden="true" />
          Telegram {telegram.handle}
        </a>
      </section>
      <section>
        <RailHeading icon={<BookOpen className="size-[15px]" aria-hidden />}>
          <Bi vi="Tuần này" en="This week" inline />
        </RailHeading>
        {bounds && issue !== null && (
          <RailLink href={weekPath(week, lang)}>
            <span suppressHydrationWarning>
              {lang === "vi" ? "Số" : "Issue"} {issue} ·{" "}
              {formatWeekRange(bounds.start, bounds.end, lang)}
            </span>
          </RailLink>
        )}
        <RailLink href={withLang("/calendar", lang)}>
          <Bi vi="Lịch số báo" en="Edition calendar" inline />
        </RailLink>
      </section>
    </aside>
  );
}
