import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Figure, PlayGlyph, VersionBadge } from "../components/ReleaseArticle";
import { ALGORITHM_ENTRIES } from "../content/releases/algorithm";
import {
  EARLIER_ENTRIES,
  type EarlierEntry,
  EXTENSION_ENTRIES,
} from "../content/releases/earlier";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { PAGE_TITLE, SECTION_TITLE } from "../lib/page-style";
import { formatReleaseRange, releaseFilmId, t } from "../lib/releases/format";
import { RELEASES } from "../lib/releases/index";
import type { Release } from "../lib/releases/types";
import { localizedPageHead } from "../lib/seo";
import type { Lang } from "../lib/types";

const DESCRIPTION = {
  en: "Every AI;DR release, newest first. Each version has what shipped, screenshots, the film and the full changelog.",
  vi: "Mọi bản phát hành của AI;DR, mới nhất lên đầu. Mỗi phiên bản gồm những gì mới, ảnh chụp màn hình, video và toàn bộ nhật ký thay đổi.",
};

export const Route = createFileRoute("/release/")({
  head: ({ match }) => {
    const lang = match.context.lang;
    return localizedPageHead({
      path: "/release",
      title:
        lang === "vi" ? "Ghi chú phát hành | AI;DR" : "Release notes | AI;DR",
      description: DESCRIPTION[lang],
      lang,
      route: headRouteInput(match),
    });
  },
  component: ReleaseIndexPage,
});

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
        className="group grid gap-4 py-6 sm:grid-cols-[1fr_12rem]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums text-muted-foreground">
            <VersionBadge version={release.version} />
            <time dateTime={release.date}>
              {formatReleaseRange(release, lang)}
            </time>
            {hasFilm ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <PlayGlyph className="h-4 w-5 rounded bg-foreground text-background" />
                {lang === "vi" ? "Phim" : "Film"}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-[20px] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground group-hover:text-accent">
            {t(release.title, lang)}
          </h2>
          <p className="mt-1.5 line-clamp-3 text-[15px] leading-[1.6] text-body">
            {t(release.intro, lang)}
          </p>
          {labels.length > 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {labels.join(" · ")}
              {more > 0 ? (
                <span className="text-muted-foreground"> · +{more}</span>
              ) : null}
            </p>
          ) : null}
          <span className="mt-2.5 inline-block text-[13px] font-medium text-accent">
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
              className="aspect-[16/10] w-full rounded-[10px] border border-border object-cover object-top"
            />
            {hasFilm ? (
              <PlayGlyph className="absolute inset-0 m-auto size-11 rounded-full bg-white/95 text-black shadow" />
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
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] tabular-nums text-muted-foreground">
            {entry.date}
          </div>
          <p className="mt-1 text-[15px] leading-[1.6] text-body">
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
  const sectionHeading = SECTION_TITLE;
  return (
    <div className="mx-auto max-w-[44rem] pt-5 pb-10">
      <h1 className={PAGE_TITLE}>
        {vi ? "Ghi chú phát hành" : "Release notes"}
      </h1>
      <p className="mt-2 text-[16px] leading-[1.6] text-muted-foreground">
        {DESCRIPTION[lang]}
      </p>

      <ol className="mt-6 divide-y divide-border">
        {RELEASES.map((release) => (
          <ReleaseRow key={release.version} release={release} lang={lang} />
        ))}
      </ol>

      <section
        id="algorithm"
        className="mt-10 border-t border-border pt-6 scroll-mt-20"
      >
        <h2 className={sectionHeading}>
          {vi ? "Cách chọn và viết tin" : "How stories are picked"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {vi
            ? "Thay đổi về xếp hạng, gom tin, prompt và các model AI;DR dùng."
            : "Changes to ranking, clustering, prompts and the models AI;DR uses."}
        </p>
        <EarlierList entries={ALGORITHM_ENTRIES} lang={lang} />
      </section>

      <section
        id="chrome-extension"
        className="mt-10 border-t border-border pt-6 scroll-mt-20"
      >
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

      <section
        id="earlier"
        className="mt-10 border-t border-border pt-6 scroll-mt-20"
      >
        <h2 className={sectionHeading}>
          {vi ? "Trước v0.1.0" : "Before v0.1.0"}
        </h2>
        <EarlierList entries={EARLIER_ENTRIES} lang={lang} />
      </section>
    </div>
  );
}
