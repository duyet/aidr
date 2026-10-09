import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { NotFoundPage } from "../components/NotFoundPage";
import { ReleaseArticle } from "../components/ReleaseArticle";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { releaseDocumentTitle, t } from "../lib/releases/format";
import { findRelease, RELEASES, releasePath } from "../lib/releases/index";
import type { Release } from "../lib/releases/types";
import { localizedPageHead, notFoundHead } from "../lib/seo";
import { SITE_URL } from "../lib/site";
import type { Lang } from "../lib/types";

type LoaderResult =
  | { kind: "release"; release: Release }
  | { kind: "missing"; lang: Lang };

/** Older and newer neighbours in `RELEASES` (newest first). */
export function releaseNeighbours(release: Release): {
  prev?: Release;
  next?: Release;
} {
  const i = RELEASES.findIndex((r) => r.version === release.version);
  return { prev: RELEASES[i + 1], next: RELEASES[i - 1] };
}

export const Route = createFileRoute("/release/$version")({
  loader: ({ params, context }): LoaderResult => {
    const release = findRelease(params.version);
    if (!release) return { kind: "missing", lang: context.lang };
    return { kind: "release", release };
  },
  headers: ({ loaderData, match }): Record<string, string> => {
    if (!loaderData || loaderData.kind === "missing") {
      return {
        [NOT_FOUND_HEADER]: "1",
        "Cache-Control": "private, no-store",
        "Content-Language": match.context.lang,
        Vary: "Cookie, Accept-Language",
      };
    }
    return {
      "Content-Language": match.context.lang,
      Vary: "Cookie, Accept-Language",
    };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData || loaderData.kind === "missing") {
      const lang = loaderData?.kind === "missing" ? loaderData.lang : "vi";
      return notFoundHead(notFoundCopy(lang).documentTitle);
    }
    const lang = match.context.lang;
    const { release } = loaderData;
    return localizedPageHead({
      path: releasePath(release),
      title: releaseDocumentTitle(release, lang),
      description: t(release.intro, lang),
      imageUrl: release.cover ? `${SITE_URL}${release.cover.src}` : undefined,
      lang,
      route: headRouteInput(match),
    });
  },
  component: ReleasePage,
});

function ReleasePage(): ReactElement {
  const lang = useLang();
  const data = Route.useLoaderData();
  if (data.kind === "missing") return <NotFoundPage />;
  const { prev, next } = releaseNeighbours(data.release);
  return (
    <ReleaseArticle
      release={data.release}
      prev={prev}
      next={next}
      lang={lang}
    />
  );
}
