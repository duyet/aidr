import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayArchivePath } from "../lib/day-archive";
import { categoryLabel } from "../lib/lang";
import { withLang } from "../lib/locale-url";
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
  return lang === "vi" ? "AI;DR Tuần" : "AI;DR Weekly";
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
    <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <span className="tabular-nums text-foreground">
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
    <article className="typeset grid gap-5 border-b-2 border-foreground pb-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8">
      {image ? (
        <a href={href} className="block overflow-hidden bg-muted">
          <img
            src={image}
            alt=""
            fetchPriority="high"
            referrerPolicy="no-referrer"
            className="aspect-[16/10] h-auto w-full object-cover grayscale-[15%]"
          />
        </a>
      ) : null}
      <div className={image ? "" : "md:col-span-2"}>
        <Kicker story={story} lang={lang} />
        <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          <a href={href} className="font-semibold no-underline hover:underline">
            {headline}
          </a>
        </h2>
        {deck ? (
          <p className="mt-3 font-serif text-lg leading-relaxed text-foreground/85">
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
    <article className="typeset mb-6 break-inside-avoid border-b border-border pb-5">
      {image && story.rank <= 4 ? (
        <a href={href} className="mb-3 block overflow-hidden bg-muted">
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
      <h3 className="mt-1.5 font-serif text-xl font-semibold leading-snug">
        <a href={href} className="font-semibold no-underline hover:underline">
          {headline}
        </a>
      </h3>
      {deck ? (
        <p className="mt-2 font-serif text-[0.98rem] leading-relaxed text-foreground/80">
          {deck}
        </p>
      ) : null}
    </article>
  );
}

const pill =
  "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";

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
    <div className="mx-auto max-w-6xl py-6">
      <nav
        aria-label={vi ? "Chuyển tuần" : "Week navigation"}
        className="flex flex-wrap items-center justify-between gap-3 pb-4"
      >
        <div className="flex items-center gap-4">
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
          {vi ? "Tất cả các số" : "All issues"}
        </a>
      </nav>

      <header className="border-y-4 border-double border-foreground py-4 text-center">
        <p className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            {vi ? `Số ${edition.issue}` : `Issue No. ${edition.issue}`}
          </span>
          <span>{range}</span>
          <span>{vi ? `Tuần ${weekNo}` : `Week ${weekNo}`}</span>
        </p>
        <h1 className="mt-3 font-serif text-5xl font-bold tracking-tight sm:text-7xl">
          {weeklyTitle(lang)}
        </h1>
        <p className="mt-2 font-serif text-base italic text-muted-foreground">
          {vi
            ? `${stories.length} tin AI đáng đọc nhất trong tuần`
            : `The ${stories.length} AI stories that mattered this week`}
        </p>
      </header>

      {intro ? (
        <section
          aria-label={vi ? "Lời mở đầu" : "From the editor"}
          className="typeset border-b border-border py-6"
        >
          <p className="mx-auto max-w-3xl font-serif text-xl leading-relaxed first-letter:float-left first-letter:mr-2 first-letter:font-bold first-letter:text-6xl first-letter:leading-[0.85]">
            {intro}
          </p>
        </section>
      ) : null}

      <div className="pt-6">
        {lead ? <LeadStory story={lead} lang={lang} /> : null}
        {rest.length > 0 ? (
          <div className="mt-6 gap-8 sm:columns-2 lg:columns-3 [column-rule:1px_solid_var(--color-border)]">
            {rest.map((story) => (
              <ColumnStory key={story.item.id} story={story} lang={lang} />
            ))}
          </div>
        ) : null}
      </div>

      <WeeklySubscribeCta lang={lang} />

      <nav
        aria-label={vi ? "Số trước và số sau" : "Previous and next issue"}
        className="grid grid-cols-2 gap-3 border-t border-border pt-4 font-sans"
      >
        {edition.prevWeek ? (
          <a
            href={weekPath(edition.prevWeek, lang)}
            rel="prev"
            className="group flex flex-col rounded-sm border border-border px-3 py-2 hover:border-foreground focus-visible:outline-2 focus-visible:outline-foreground"
          >
            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <ChevronLeft className="size-3.5" aria-hidden />
              {vi ? "Số trước" : "Previous issue"}
            </span>
            <span className="mt-1 font-serif text-base font-semibold group-hover:underline">
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
            className="group flex flex-col items-end rounded-sm border border-border px-3 py-2 text-right hover:border-foreground focus-visible:outline-2 focus-visible:outline-foreground"
          >
            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {vi ? "Số sau" : "Next issue"}
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
            <span className="mt-1 font-serif text-base font-semibold group-hover:underline">
              {edition.nextWeek}
            </span>
          </a>
        ) : (
          <span />
        )}
      </nav>

      <footer className="mt-6 border-t-2 border-foreground pt-4 font-sans text-sm text-muted-foreground">
        <p className="font-semibold uppercase tracking-[0.14em] text-[0.7rem]">
          {vi ? "Bản tin từng ngày" : "Daily editions"}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {days.map((date) => (
            <li key={date}>
              <a
                href={dayArchivePath(date, lang)}
                className="hover:text-foreground hover:underline"
              >
                {date}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          <a
            href={weekMarkdownPath(edition.week, lang)}
            className="hover:text-foreground hover:underline"
          >
            Markdown
          </a>
        </p>
      </footer>
    </div>
  );
}
