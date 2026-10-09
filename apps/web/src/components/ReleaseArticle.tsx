import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactElement, useState } from "react";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "../lib/day-video";
import {
  CHANGE_KIND_LABEL,
  commitUrl,
  compareUrl,
  formatReleaseDate,
  formatReleaseRange,
  groupChanges,
  prUrl,
  releaseFilmId,
  t,
} from "../lib/releases/format";
import type {
  Release,
  ReleaseChange,
  ReleaseHighlight,
  ReleaseImage,
} from "../lib/releases/types";
import type { Lang } from "../lib/types";

const EXTERNAL =
  "text-accent underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent";

export function VersionBadge({ version }: { version: string }): ReactElement {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-xs font-semibold tracking-tight text-accent">
      v{version}
    </span>
  );
}

export function Figure({
  image,
  lang,
}: {
  image: ReleaseImage;
  lang: Lang;
}): ReactElement {
  const caption = image.caption ? t(image.caption, lang) : null;
  return (
    <figure className="my-6">
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={t(image.alt, lang)}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl border border-border bg-card"
      />
      {caption ? (
        <figcaption className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Page hero: the release film as a click-to-play youtube-nocookie facade
 * (poster = cover, else the YouTube thumbnail); nothing from YouTube loads
 * before the click. Without a film, the cover itself is the hero.
 */
export function ReleaseHero({
  release,
  lang,
}: {
  release: Release;
  lang: Lang;
}): ReactElement | null {
  const [playing, setPlaying] = useState(false);
  const filmId = releaseFilmId(release, lang);
  const title = t(release.title, lang);
  if (!filmId) {
    if (!release.cover) return null;
    return (
      <img
        src={release.cover.src}
        width={release.cover.width}
        height={release.cover.height}
        alt={t(release.cover.alt, lang)}
        decoding="async"
        fetchPriority="high"
        className="h-auto w-full rounded-xl border border-border bg-card"
      />
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(filmId)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${lang === "vi" ? "Phát video" : "Play film"}: ${title}`}
          className="group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={release.cover?.src ?? youtubeThumbnailUrl(filmId, "maxres")}
            width={release.cover?.width}
            height={release.cover?.height}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-5 pb-4 pt-16 text-left">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {lang === "vi" ? "Phim phát hành" : "Release film"}
            </span>
            <span className="mt-0.5 block font-mono text-sm text-white">
              v{release.version}
            </span>
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <PlayGlyph className="h-14 w-20 rounded-2xl bg-red-600 text-white shadow-lg transition-transform group-hover:scale-110" />
          </span>
        </button>
      )}
    </div>
  );
}

export function PlayGlyph({ className }: { className: string }): ReactElement {
  return (
    <span className={`flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-[45%] w-[45%]"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function Highlight({
  item,
  lang,
}: {
  item: ReleaseHighlight;
  lang: Lang;
}): ReactElement {
  const label = t(item.label, lang);
  const text = t(item.text, lang);
  return (
    <li className="pt-6 first:pt-0">
      <p className="text-base leading-relaxed sm:text-[17px]">
        <strong className="font-semibold text-foreground">{label}.</strong>{" "}
        <span className="text-foreground/85">{text}</span>
        {item.href ? (
          <>
            {" "}
            <a
              href={item.href}
              className={`${EXTERNAL} inline-flex items-center gap-0.5 whitespace-nowrap text-sm`}
            >
              {lang === "vi" ? "Thử ngay" : "Try it"}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </>
        ) : null}
      </p>
      {item.image ? <Figure image={item.image} lang={lang} /> : null}
    </li>
  );
}

function Change({
  change,
  lang,
}: {
  change: ReleaseChange;
  lang: Lang;
}): ReactElement {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-[15px] leading-relaxed">
      {change.scope ? (
        <span className="rounded border border-border bg-card px-1.5 py-px font-mono text-[11px] text-muted-foreground">
          {change.scope}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 basis-60">{t(change.text, lang)}</span>
      {change.commit || change.pr ? (
        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs text-muted-foreground">
          {change.commit ? (
            <a
              href={commitUrl(change.commit)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {change.commit}
            </a>
          ) : null}
          {change.pr ? (
            <a
              href={prUrl(change.pr)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              #{change.pr}
            </a>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function OtherReleases({
  prev,
  next,
  lang,
}: {
  prev?: Release;
  next?: Release;
  lang: Lang;
}): ReactElement {
  const card =
    "group flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-foreground/30";
  return (
    <nav
      aria-label={lang === "vi" ? "Các bản phát hành khác" : "Other releases"}
      className="mt-12 border-t border-border pt-8"
    >
      <h2 className="font-serif text-xl font-medium tracking-tight">
        {lang === "vi" ? "Các bản phát hành khác" : "Other releases"}
      </h2>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {prev ? (
          <Link
            to="/release/$version"
            params={{ version: `v${prev.version}` }}
            search={{ lang }}
            className={card}
          >
            <ChevronLeft
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-mono text-xs text-muted-foreground">
                v{prev.version}
              </span>
              <span className="block truncate group-hover:underline">
                {t(prev.title, lang)}
              </span>
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link
            to="/release/$version"
            params={{ version: `v${next.version}` }}
            search={{ lang }}
            className={`${card} sm:text-right`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-xs text-muted-foreground">
                v{next.version}
              </span>
              <span className="block truncate group-hover:underline">
                {t(next.title, lang)}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        <Link
          to="/release"
          search={{ lang }}
          className="underline underline-offset-4 decoration-border hover:decoration-foreground"
        >
          {lang === "vi" ? "Tất cả bản phát hành" : "All releases"}
        </Link>
      </p>
    </nav>
  );
}

export function ReleaseArticle({
  release,
  prev,
  next,
  lang,
}: {
  release: Release;
  /** Older release. */
  prev?: Release;
  /** Newer release. */
  next?: Release;
  lang: Lang;
}): ReactElement {
  const vi = lang === "vi";
  const title = t(release.title, lang);
  const groups = groupChanges(release.changes);

  return (
    <article className="mx-auto max-w-[44rem] py-8 sm:py-12">
      <ReleaseHero release={release} lang={lang} />
      <p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Link to="/release" search={{ lang }} className="hover:text-foreground">
          {vi ? "Ghi chú phát hành" : "Release notes"}
        </Link>
      </p>

      <header className="mt-3">
        <h1 className="font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-[2.6rem]">
          {title}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {t(release.intro, lang)}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <VersionBadge version={release.version} />
          <time dateTime={release.date} className="text-foreground">
            {formatReleaseDate(release.date, lang)}
          </time>
          <span aria-hidden>·</span>
          <span>{formatReleaseRange(release, lang)}</span>
        </div>
      </header>

      {release.stats.length > 0 ? (
        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-y border-border py-5">
          {release.stats.map((stat) => (
            <div key={t(stat.label, "en")} className="min-w-[5rem]">
              <dd className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
                {stat.value}
              </dd>
              <dt className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                {t(stat.label, lang)}
              </dt>
            </div>
          ))}
        </dl>
      ) : null}

      {release.highlights.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            {vi ? "Điểm nổi bật" : "Highlights"}
          </h2>
          <ol className="mt-4 divide-y divide-border/70">
            {release.highlights.map((item) => (
              <Highlight key={item.label.en} item={item} lang={lang} />
            ))}
          </ol>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            {vi ? "Nhật ký thay đổi" : "Changelog"}
          </h2>
          {groups.map((group) => (
            <div key={group.kind} className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(CHANGE_KIND_LABEL[group.kind], lang)}
                <span className="ml-1.5 font-mono font-normal normal-case tracking-normal">
                  {group.items.length}
                </span>
              </h3>
              <ul className="mt-1 divide-y divide-border/60">
                {group.items.map((change) => (
                  <Change
                    key={`${change.commit ?? ""}:${change.text.en}`}
                    change={change}
                    lang={lang}
                  />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-6 text-sm">
            <a
              href={compareUrl(release)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${EXTERNAL} inline-flex items-center gap-1`}
            >
              {vi ? "So sánh trên GitHub" : "Compare on GitHub"}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {release.compare.base}...{release.compare.head}
            </span>
          </p>
        </section>
      ) : null}

      <OtherReleases prev={prev} next={next} lang={lang} />
    </article>
  );
}
