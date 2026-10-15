/**
 * The vi and en documents of one page are separate URLs in the hreflang pair.
 * /subscribe?lang=vi and /contribute?lang=vi used to ship the English title
 * and description, so both URLs carried one duplicate English snippet.
 */
import { describe, expect, it } from "vitest";
import type { HeadMeta } from "../lib/seo";
import type { Lang } from "../lib/types";
import { Route as ContributeRoute } from "./contribute.index";
import { Route as SubscribeRoute } from "./subscribe";

type HeadFn = (ctx: {
  match: {
    context: { lang: Lang };
    search: Record<string, string>;
    pathname: string;
    status: string;
  };
}) => { meta: HeadMeta[] };

function snippet(
  route: { options: { head?: unknown } },
  pathname: string,
  lang: Lang
): { title?: string; description?: string } {
  const head = route.options.head as HeadFn;
  const meta = head({
    match: { context: { lang }, search: { lang }, pathname, status: "success" },
  }).meta;
  const title = meta.find((tag) => "title" in tag) as
    | { title: string }
    | undefined;
  const description = meta.find(
    (tag) => "name" in tag && tag.name === "description"
  ) as { content: string } | undefined;
  return { title: title?.title, description: description?.content };
}

describe("localized page titles", () => {
  for (const [route, pathname] of [
    [SubscribeRoute, "/subscribe"],
    [ContributeRoute, "/contribute"],
  ] as const) {
    it(`gives ${pathname} its own Vietnamese title and description`, () => {
      const vi = snippet(route, pathname, "vi");
      const en = snippet(route, pathname, "en");
      expect(vi.title).toBeTruthy();
      expect(vi.description).toBeTruthy();
      expect(vi.title).not.toBe(en.title);
      expect(vi.description).not.toBe(en.description);
    });
  }
});
