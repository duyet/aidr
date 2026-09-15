import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { StoryRow } from "../components/StoryRow";
import { ARTICLE_DATE_TAG, ARTICLE_TITLE_TAG } from "../lib/article-headings";
import { formatDayHeading } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";
import { loadNotFoundLang } from "../lib/not-found-fn";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { articleHead, notFoundHead } from "../lib/seo";
import { idPrefixFromSlug, storyCanonicalRedirect } from "../lib/slug";
import { fetchStory } from "../lib/story-fn";
import type { FeedItem, Lang } from "../lib/types";

type LoaderResult =
  | { kind: "story"; item: FeedItem }
  | { kind: "missing"; lang: Lang };

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<LoaderResult> => {
    const idPrefix = idPrefixFromSlug(params.slug);
    if (!idPrefix) {
      return { kind: "missing", lang: await loadNotFoundLang() };
    }
    const item = await fetchStory({ data: { idPrefix } });
    if (!item) {
      return { kind: "missing", lang: await loadNotFoundLang() };
    }
    const to = storyCanonicalRedirect(params.slug, item);
    if (to) throw redirect({ href: to });
    return { kind: "story", item };
  },
  headers: ({ loaderData }): Record<string, string> =>
    loaderData?.kind === "missing"
      ? {
          [NOT_FOUND_HEADER]: "1",
          "Cache-Control": "private, no-store",
        }
      : {},
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.kind === "missing") {
      const lang = loaderData?.kind === "missing" ? loaderData.lang : "vi";
      return notFoundHead(notFoundCopy(lang).documentTitle);
    }
    return articleHead(loaderData.item);
  },
  component: StoryPage,
});

function NotFoundStory({ lang }: { lang: Lang }) {
  return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">
        {lang === "vi" ? "Không tìm thấy tin." : "Story not found."}
      </p>
      <Link
        to="/"
        className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
      >
        {lang === "vi" ? "Về trang chính" : "Back to live feed"}
      </Link>
    </div>
  );
}

function StoryContent({ item, lang }: { item: FeedItem; lang: Lang }) {
  const date = new Date(item.published_at * 1000).toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between py-4 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-accent">
          ← {lang === "vi" ? "Về trang chính" : "Back to live feed"}
        </Link>
        <span className="text-muted-foreground">
          1 {lang === "vi" ? "tin" : "story"}
        </span>
      </div>
      <div className="border-b-2 border-foreground/80 pb-2">
        <ARTICLE_DATE_TAG className="text-xl font-bold">
          {formatDayHeading(date, lang)}
        </ARTICLE_DATE_TAG>
      </div>
      <StoryRow
        item={item}
        index={1}
        lang={lang}
        defaultExpanded
        titleAs={ARTICLE_TITLE_TAG}
      />
    </div>
  );
}

function StoryPage() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  const lang = useLang();

  if (data.kind === "missing") {
    return idPrefixFromSlug(slug) ? (
      <NotFoundStory lang={data.lang} />
    ) : (
      <NotFoundPage />
    );
  }
  return <StoryContent item={data.item} lang={lang} />;
}
