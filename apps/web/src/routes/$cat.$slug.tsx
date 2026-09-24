import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { withLang } from "../lib/locale-url";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { notFoundHead } from "../lib/seo";
import { legacyStoryRedirectPath } from "../lib/slug";
import type { Lang } from "../lib/types";

/** Old /:cat/:slug permalinks use a temporary locale-safe redirect. */
export const Route = createFileRoute("/$cat/$slug")({
  beforeLoad: ({ params, context, location }) => {
    const to = legacyStoryRedirectPath(`/${params.cat}/${params.slug}`);
    if (to) {
      throw redirect({
        href: withLang(
          `${to}${location.searchStr}${location.hash}`,
          context.lang
        ),
        statusCode: 307,
      });
    }
  },
  loader: ({ context }): { lang: Lang } => ({ lang: context.lang }),
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
