import { createFileRoute, redirect } from "@tanstack/react-router";

/** /changelog moved to /release. The Worker answers crawlers with a 301
 *  (`LEGACY_PAGE_REDIRECTS` in `src/server.ts`); this is the in-app twin for
 *  client-side navigations, same as /extension → /subscribe. */
export const Route = createFileRoute("/changelog")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/release",
      search,
      replace: true,
    });
  },
});
