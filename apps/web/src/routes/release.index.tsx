import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Figure, PlayGlyph, VersionBadge } from "../components/ReleaseArticle";
import {
  EARLIER_ENTRIES,
  type EarlierEntry,
  EXTENSION_ENTRIES,
} from "../content/releases/earlier";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { formatReleaseRange, releaseFilmId, t } from "../lib/releases/format";
import { RELEASES } from "../lib/releases/index";
import type { Release } from "../lib/releases/types";
import { localizedPageHead } from "../lib/seo";
import type { Lang } from "../lib/types";

const DESCRIPTION = {
  en: "Every AI;DR release, newest first: what shipped, screenshots, the film, and the full changelog for each version.",
  vi: "Mọi bản phát hành của AI;DR, mới nhất trước: có gì mới, ảnh chụp màn hình, phim và nhật ký thay đổi đầy đủ của từng phiên bản.",
};

export const Route = createFileRoute("/release/")({
  head: ({ match }) => {
    const lang = match.context.lang;
    return localizedPageHead({
      path: "/release",
      title:
        lang === "vi"
          ? "Ghi chú phát hành | AI News"
          : "Release notes | AI News",
      description: DESCRIPTION[lang],
      lang,
      route: headRouteInput(match),
    });
  },
  component: ReleaseIndexPage,
});

/** How many highlight labels fit on the compact line under the intro. */
const HIGHLIGHT_PREVIEW = 4;

function ReleaseRow({
  release,
  lang,
}: {
  release: Release;
  lang: Lang;
}): ReactElement {
  const hasFilm = Boolean(releaseFilmId(release, lang));
  const labels = release.highlights
    .slice(0, HIGHLIGHT_PREVIEW)
    .map((h) => t(h.label, lang));
  const more = release.highlights.length - labels.length;
  return (
    <li>
      <Link
        to="/release/$version"
        params={{ version: `v${release.version}` }}
        search={{ lang }}
        className="group grid gap-5 py-8 sm:grid-cols-[1fr_12rem]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <VersionBadge version={release.version} />
            <time dateTime={release.date}>
              {formatReleaseRange(release, lang)}
            </time>
            {hasFilm ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <PlayGlyph className="h-4 w-5 rounded bg-red-600 text-white" />
                {lang === "vi" ? "Phim" : "Film"}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 font-serif text-2xl font-medium leading-snug tracking-tight group-hover:underline">
            {t(release.title, lang)}
          </h2>
          <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
            {t(release.intro, lang)}
          </p>
          {labels.length > 0 ? (
            <p className="mt-3 text-sm text-foreground/80">
              {labels.join(" · ")}
              {more > 0 ? (
                <span className="text-muted-foreground"> · +{more}</span>
              ) : null}
            </p>
          ) : null}
          <span className="mt-3 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-[3px] group-hover:decoration-accent">
            {lang === "vi" ? "Đọc ghi chú" : "Read the notes"} →
          </span>
        </div>
        {release.cover ? (
          <div className="relative sm:order-none order-first">
            <img
              src={release.cover.src}
              width={release.cover.width}
              height={release.cover.height}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[16/10] w-full rounded-lg border border-border object-cover object-top"
            />
            {hasFilm ? (
              <PlayGlyph className="absolute inset-0 m-auto h-9 w-12 rounded-xl bg-red-600 text-white shadow" />
            ) : null}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

function EarlierList({
  entries,
  lang,
}: {
  entries: EarlierEntry[];
  lang: Lang;
}): ReactElement {
  return (
    <ol className="mt-4 space-y-5 border-l border-border pl-5">
      {entries.map((entry) => (
        <li key={entry.text.en} className="relative">
          <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-accent" />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.date}
          </div>
          <p className="mt-1 text-[15px] leading-relaxed">
            {t(entry.text, lang)}
          </p>
          {entry.image ? <Figure image={entry.image} lang={lang} /> : null}
        </li>
      ))}
    </ol>
  );
}

function ReleaseIndexPage(): ReactElement {
  const lang = useLang();
  const vi = lang === "vi";
  const sectionHeading =
    "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  return (
    <div className="mx-auto max-w-[44rem] py-10 sm:py-14">
      <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
        {vi ? "Ghi chú phát hành" : "Release notes"}
      </h1>
      <p className="mt-3 text-muted-foreground">{DESCRIPTION[lang]}</p>

      <ol className="mt-6 divide-y divide-border">
        {RELEASES.map((release) => (
          <ReleaseRow key={release.version} release={release} lang={lang} />
        ))}
      </ol>

      <section id="chrome-extension" className="mt-12 scroll-mt-20">
        <h2 className={sectionHeading}>
          {vi ? "Tiện ích Chrome" : "Chrome extension"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {vi ? "Hướng dẫn cài đặt tại " : "Install guide at "}
          <Link
            to="/subscribe"
            search={{ lang }}
            className="underline underline-offset-2 hover:text-foreground"
          >
            /subscribe
          </Link>
          .
        </p>
        <EarlierList entries={EXTENSION_ENTRIES} lang={lang} />
      </section>

      <section id="earlier" className="mt-12 scroll-mt-20">
        <h2 className={sectionHeading}>
          {vi ? "Trước v0.1.0" : "Before v0.1.0"}
        </h2>
        <EarlierList entries={EARLIER_ENTRIES} lang={lang} />
      </section>
    </div>
  );
}
