import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { dayArchivePath } from "../lib/day-archive";
import { categoryLabel } from "../lib/lang";
import { withLang } from "../lib/locale-url";
import { EYEBROW, PAGE_TITLE } from "../lib/page-style";
import { stripTitleMarker } from "../lib/plain-text";
import { publisherHost } from "../lib/publisher-host";
import { storyPath } from "../lib/slug";
import { resizeCdnImageUrl } from "../lib/tldr-images";
import type { Lang } from "../lib/types";
import {
  formatWeekRange,
  WEEKS_INDEX_PATH,
  weekDates,
  weekMarkdownPath,
  weekPath,
} from "../lib/week";
import {
  type WeekEdition,
  type WeekStory,
  weekIntro,
  weekStoriesFor,
  weekStoryText,
} from "../lib/week-model";
import { WeeklySubscribeCta } from "./WeeklySubscribeCta";

export function weeklyTitle(lang: Lang): string {
  return lang === "vi" ? "AI;DR Tuần Này" : "AI;DR Weekly";
}

/** Headline in `lang` only: the title in that language, else the edition's
 * own line (which is in that language) stands as the headline. Never the
 * other language's title. */
export function weekStoryHeadline(
  story: WeekStory,
  lang: Lang
): { headline: string; deck: string | null } {
  const text = weekStoryText(story, lang) ?? "";
  const raw = lang === "vi" ? story.item.title_vi : story.item.title;
  const title = raw ? stripTitleMarker(raw).trim() : "";
  return title
    ? { headline: title, deck: text || null }
    : { headline: text, deck: null };
}

function Kicker({ story, lang }: { story: WeekStory; lang: Lang }) {
  const host = publisherHost(story.item.url);
  const parts = [
    story.item.category ? categoryLabel(story.item.category, lang) : null,
    host,
  ].filter(Boolean);
  return (
    <p className={`${EYEBROW} [overflow-wrap:anywhere]`}>
      <span className="font-medium tabular-nums text-accent">
        {String(story.rank).padStart(2, "0")}
      </span>
      {parts.length > 0 ? ` · ${parts.join(" · ")}` : null}
    </p>
  );
}

function LeadStory({ story, lang }: { story: WeekStory; lang: Lang }) {
  const { headline, deck } = weekStoryHeadline(story, lang);
  // Publisher image only: a generated OG card is never a lead photo.
  const image = resizeCdnImageUrl(story.item.image_url, "full");
  const href = storyPath(story.item, lang);
  return (
    <article className="grid gap-4 border-b border-border pb-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8">
      {image ? (
        <a
          href={href}
          className="block overflow-hidden rounded-[10px] bg-muted"
        >
          <img
            src={image}
            alt=""
            fetchPriority="high"
            referrerPolicy="no-referrer"
            className="aspect-[16/10] h-auto w-full object-cover"
          />
        </a>
      ) : null}
      <div className={image ? "min-w-0" : "min-w-0 md:col-span-2"}>
        <Kicker story={story} lang={lang} />
        <h2 className="mt-2 text-balance text-[calc(22px*var(--reader-font-size,1))] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] sm:text-[calc(26px*var(--reader-font-size,1))]">
          <a href={href} className="hover:text-accent">
            {headline}
          </a>
        </h2>
        {deck ? (
          <p className="mt-2.5 text-[calc(16px*var(--reader-font-size,1))] leading-(--reader-leading,1.6) text-body">
            {deck}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ColumnStory({ story, lang }: { story: WeekStory; lang: Lang }) {
  const { headline, deck } = weekStoryHeadline(story, lang);
  const image = resizeCdnImageUrl(story.item.image_url, "card");
  const href = storyPath(story.item, lang);
  return (
    <article className="mb-5 min-w-0 break-inside-avoid border-b border-border pb-5">
      {image && story.rank <= 4 ? (
        <a
          href={href}
          className="mb-3 block overflow-hidden rounded-[10px] bg-muted"
        >
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="aspect-[16/9] h-auto w-full object-cover"
          />
        </a>
      ) : null}
      <Kicker story={story} lang={lang} />
      <h3 className="mt-1.5 text-[calc(16px*var(--reader-font-size,1))] font-semibold leading-[1.4] tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
        <a href={href} className="hover:text-accent">
          {headline}
        </a>
      </h3>
      {deck ? (
        <p className="mt-1.5 text-[calc(14px*var(--reader-font-size,1))] leading-(--reader-leading,1.55) text-body">
          {deck}
        </p>
      ) : null}
    </article>
  );
}

const pill =
  "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[calc(13px*var(--reader-font-size,1))] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:h-11";

const dayChip =
  "inline-flex h-8 items-center rounded-full border border-input px-3 text-[calc(13px*var(--reader-font-size,1))] tabular-nums text-foreground transition-colors hover:bg-muted max-sm:h-11";

export function WeeklyPaper({
  edition,
  lang,
}: {
  edition: WeekEdition;
  lang: Lang;
}) {
  const vi = lang === "vi";
  // Numbered within this language: a story with no line here is left out,
  // so the paper never skips from 01 to 03.
  const stories = weekStoriesFor(edition, lang).map((story, index) => ({
    ...story,
    rank: index + 1,
  }));
  const [lead, ...rest] = stories;
  const intro = weekIntro(edition, lang);
  const range = formatWeekRange(edition.start_date, edition.end_date, lang);
  const weekNo = edition.week.slice(-2);
  const days = weekDates(edition.week) ?? [];

  return (
    <div className="mx-auto max-w-[1080px] pt-3 pb-10">
      <nav
        aria-label={vi ? "Chuyển tuần" : "Week navigation"}
        className="-mx-2.5 flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1">
          {edition.prevWeek ? (
            <a href={weekPath(edition.prevWeek, lang)} className={pill}>
              <ChevronLeft className="size-4" aria-hidden />
              {vi ? "Số trước" : "Previous issue"}
            </a>
          ) : null}
          {edition.nextWeek ? (
            <a href={weekPath(edition.nextWeek, lang)} className={pill}>
              {vi ? "Số sau" : "Next issue"}
              <ChevronRight className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
        <a href={withLang(WEEKS_INDEX_PATH, lang)} className={pill}>
          <ArrowLeft className="size-4" aria-hidden />
          {vi ? "Quay lại tất cả các tuần" : "Back to all weeks"}
        </a>
      </nav>

      <header className="mt-3 border-b border-border pb-5">
        <p className={`${EYEBROW} flex flex-wrap gap-x-3 gap-y-1 tabular-nums`}>
          <span className="text-accent">
            {vi ? `Số ${edition.issue}` : `Issue No. ${edition.issue}`}
          </span>
          <span>{range}</span>
          <span>{vi ? `Tuần ${weekNo}` : `Week ${weekNo}`}</span>
        </p>
        <h1 className={`mt-2 ${PAGE_TITLE}`}>{weeklyTitle(lang)}</h1>
        <p className="mt-1.5 text-[calc(15px*var(--reader-font-size,1))] text-muted-foreground">
          {vi
            ? `${stories.length} tin AI đáng đọc nhất trong tuần`
            : `The ${stories.length} AI stories that mattered this week`}
        </p>
      </header>

      {intro ? (
        <section
          aria-label={vi ? "Lời mở đầu" : "From the editor"}
          className="border-b border-border py-5"
        >
          <p className="max-w-[64ch] text-[calc(17px*var(--reader-font-size,1))] leading-(--reader-leading,1.6) text-foreground">
            {intro}
          </p>
        </section>
      ) : null}

      <div className="pt-6">
        {lead ? <LeadStory story={lead} lang={lang} /> : null}
        {rest.length > 0 ? (
          <div className="mt-6 gap-8 sm:columns-2 lg:columns-3">
            {rest.map((story) => (
              <ColumnStory key={story.item.id} story={story} lang={lang} />
            ))}
          </div>
        ) : null}
      </div>

      <WeeklySubscribeCta lang={lang} />

      <nav
        aria-label={vi ? "Số trước và số sau" : "Previous and next issue"}
        className="grid grid-cols-2 gap-3"
      >
        {edition.prevWeek ? (
          <a
            href={weekPath(edition.prevWeek, lang)}
            rel="prev"
            className="group flex min-w-0 flex-col rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/60"
          >
            <span className={`${EYEBROW} inline-flex items-center gap-1`}>
              <ChevronLeft className="size-3.5" aria-hidden />
              {vi ? "Số trước" : "Previous issue"}
            </span>
            <span className="mt-1 text-[calc(15px*var(--reader-font-size,1))] font-medium tabular-nums text-foreground group-hover:text-accent">
              {edition.prevWeek}
            </span>
          </a>
        ) : (
          <span />
        )}
        {edition.nextWeek ? (
          <a
            href={weekPath(edition.nextWeek, lang)}
            rel="next"
            className="group flex min-w-0 flex-col items-end rounded-lg border border-border px-4 py-3 text-right transition-colors hover:bg-muted/60"
          >
            <span className={`${EYEBROW} inline-flex items-center gap-1`}>
              {vi ? "Số sau" : "Next issue"}
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
            <span className="mt-1 text-[calc(15px*var(--reader-font-size,1))] font-medium tabular-nums text-foreground group-hover:text-accent">
              {edition.nextWeek}
            </span>
          </a>
        ) : (
          <span />
        )}
      </nav>

      <footer className="mt-6 border-t border-border pt-4">
        <p className={EYEBROW}>{vi ? "Bản tin từng ngày" : "Daily editions"}</p>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {days.map((date) => (
            <li key={date}>
              <a href={dayArchivePath(date, lang)} className={dayChip}>
                {date}
              </a>
            </li>
          ))}
          <li>
            <a
              href={weekMarkdownPath(edition.week, lang)}
              className={`${dayChip} text-muted-foreground`}
            >
              Markdown
            </a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
