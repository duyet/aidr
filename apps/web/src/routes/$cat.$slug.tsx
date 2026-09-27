import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { withLang } from "../lib/locale-url";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { notFoundHead } from "../lib/seo";
import { legacyStoryRedirectPath } from "../lib/slug";
import type { Lang } from "../lib/types";

/** Old /:cat/:slug permalinks use a permanent locale-safe redirect.
 *
 * `src/server.ts` normally answers this permutation before the router runs;
 * this `beforeLoad` is the in-app equivalent, so it uses the same permanence
 * (`PERMANENT_LOCALE_REDIRECT_STATUS` in `lib/locale-response.ts`) — a
 * client-side navigation must not see a weaker redirect than a crawler does. */
export const Route = createFileRoute("/$cat/$slug")({
  beforeLoad: ({ params, context, location }) => {
    const to = legacyStoryRedirectPath(`/${params.cat}/${params.slug}`);
    if (to) {
      throw redirect({
        href: withLang(
          `${to}${location.searchStr}${location.hash}`,
          context.lang
        ),
        statusCode: 308,
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
