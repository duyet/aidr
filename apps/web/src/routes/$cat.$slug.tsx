import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { notFoundCopy } from "../lib/not-found";
import { loadNotFoundLang } from "../lib/not-found-fn";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { notFoundHead } from "../lib/seo";
import { legacyStoryRedirectPath } from "../lib/slug";
import type { Lang } from "../lib/types";

/** Old /:cat/:slug permalinks permanently redirect to /:slug. */
export const Route = createFileRoute("/$cat/$slug")({
  beforeLoad: ({ params }) => {
    const to = legacyStoryRedirectPath(`/${params.cat}/${params.slug}`);
    if (to) throw redirect({ href: to });
  },
  loader: async (): Promise<{ lang: Lang }> => ({
    lang: await loadNotFoundLang(),
  }),
  headers: (): Record<string, string> => ({
    [NOT_FOUND_HEADER]: "1",
    "Cache-Control": "private, no-store",
  }),
  head: ({ loaderData }) =>
    notFoundHead(
      notFoundCopy((loaderData?.lang ?? "vi") as Lang).documentTitle
    ),
  component: NotFoundPage,
});
