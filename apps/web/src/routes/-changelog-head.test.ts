/**
 * /changelog is localized. The document title and share tags must follow
 * the language the page paints, the same way /date/$date switches its title.
 */
import { describe, expect, it } from "vitest";
import type { HeadMeta } from "../lib/seo";
import type { Lang } from "../lib/types";
import { Route } from "./changelog";

const VI_TITLE = "Nhật ký thay đổi | AI News";
const VI_DESCRIPTION =
  "Những thay đổi dành cho người đọc trên AI;DR tại aidr.today.";
const EN_TITLE = "Changelog | AI News";
const EN_DESCRIPTION = "Reader-facing changes to AI;DR on aidr.today.";

type HeadFn = (ctx: {
  match: { context: { lang: Lang }; pathname: string; status: string };
}) => { meta: HeadMeta[] };

function head(lang: Lang): HeadMeta[] {
  const fn = Route.options.head as unknown as HeadFn;
  return fn({
    match: {
      context: { lang },
      pathname: "/changelog",
      status: "success",
    },
  }).meta;
}

function metaContent(tags: HeadMeta[], key: string): string | undefined {
  const hit = tags.find(
    (tag) =>
      ("name" in tag && tag.name === key) ||
      ("property" in tag && tag.property === key) ||
      (key === "title" && "title" in tag)
  );
  if (!hit) return undefined;
  if ("content" in hit) return hit.content;
  if ("title" in hit) return hit.title;
  return undefined;
}

describe("changelog document title", () => {
  it("uses the Vietnamese title and description when the page is vi", () => {
    const tags = head("vi");
    expect(metaContent(tags, "title")).toBe(VI_TITLE);
    expect(metaContent(tags, "og:title")).toBe(VI_TITLE);
    expect(metaContent(tags, "twitter:title")).toBe(VI_TITLE);
    expect(metaContent(tags, "description")).toBe(VI_DESCRIPTION);
    expect(metaContent(tags, "og:description")).toBe(VI_DESCRIPTION);
    expect(metaContent(tags, "twitter:description")).toBe(VI_DESCRIPTION);
    expect(metaContent(tags, "title")).not.toBe(EN_TITLE);
  });

  it("keeps the English title and description", () => {
    const tags = head("en");
    expect(metaContent(tags, "title")).toBe(EN_TITLE);
    expect(metaContent(tags, "og:title")).toBe(EN_TITLE);
    expect(metaContent(tags, "description")).toBe(EN_DESCRIPTION);
  });
});
