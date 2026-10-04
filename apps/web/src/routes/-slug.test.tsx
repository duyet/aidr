/**
 * Two permalink bugs a reader can see.
 *
 * The day heading used the UTC calendar day while the archive link used
 * the Asia/Ho_Chi_Minh day. A story published at 19:00Z is already the
 * next day in Vietnam, so the heading said 3 Oct and opened 4 Oct. The
 * words and the link have to name the same day.
 *
 * A missing slug kept the language from the first loader run. Changing
 * ?lang= updates the request language without fetching the story again,
 * so the not-found line and the document title have to follow that
 * language.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveDateOfSec, dayArchivePath } from "../lib/day-archive";
import { formatDayHeading } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";
import type { FeedItem, Lang } from "../lib/types";
import { Route } from "./$slug";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // The back link needs a router. The day heading is a plain anchor,
    // and the not-found sentence is a paragraph, so this stand-in does
    // not decide either assertion.
    Link: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => createElement("a", { className }, children),
  };
});

// 19:00Z is 02:00 the next morning in Vietnam. 08:00Z is still that UTC day.
const EVENING_UTC = "2026-10-03T19:00:00Z";
const MORNING_UTC = "2026-10-03T08:00:00Z";

function story(publishedAtIso: string): FeedItem {
  return {
    id: "abcdef0123456789abcdef0123456789",
    url: "https://example.com/story",
    title: "An evening publish",
    title_vi: null,
    summary: null,
    summary_vi: null,
    category: null,
    published_at: Math.floor(Date.parse(publishedAtIso) / 1000),
    points: 1,
    comments: 0,
    rank_score: 1,
    source_id: "example",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
  };
}

function renderStory(
  data: { kind: "story"; item: FeedItem } | { kind: "missing"; lang: Lang },
  lang: Lang,
  slug: string
): string {
  vi.spyOn(Route, "useLoaderData").mockReturnValue(data);
  vi.spyOn(Route, "useParams").mockReturnValue({ slug });
  const Page = Route.options.component as () => React.ReactElement;
  return renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <Page />
    </LangContext.Provider>
  );
}

function dayLink(html: string): { href: string; text: string } {
  const match = html.match(/<a\b[^>]*href="(\/date\/[^"]*)"[^>]*>([^<]*)<\/a>/);
  if (!match?.[1] || match[2] === undefined) {
    throw new Error(`no day archive link in ${html}`);
  }
  return { href: match[1], text: match[2] };
}

type HeadMeta = { title?: string; name?: string; content?: string };

function missingTitle(
  loaderData: { kind: "missing"; lang: Lang } | undefined,
  lang: Lang
): string | undefined {
  const head = Route.options.head as unknown as (ctx: {
    loaderData: { kind: "missing"; lang: Lang } | undefined;
    match: { context: { lang: Lang } };
  }) => { meta: HeadMeta[] };
  const title = head({
    loaderData,
    match: { context: { lang } },
  }).meta.find((tag) => typeof tag.title === "string")?.title;
  return title;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("story permalink day heading", () => {
  it("names the Vietnam day that the archive link opens", () => {
    const publishedAt = Math.floor(Date.parse(EVENING_UTC) / 1000);
    // The UTC slice and the audience day disagree for this publish.
    expect(new Date(publishedAt * 1000).toISOString().slice(0, 10)).toBe(
      "2026-10-03"
    );
    expect(archiveDateOfSec(publishedAt)).toBe("2026-10-04");

    const link = dayLink(
      renderStory({ kind: "story", item: story(EVENING_UTC) }, "en", "abcdef01")
    );
    expect(link.href).toBe(dayArchivePath("2026-10-04", "en"));
    expect(link.text).toBe(formatDayHeading("2026-10-04", "en"));
  });

  it("keeps the heading on the UTC day when Vietnam is still that day", () => {
    const publishedAt = Math.floor(Date.parse(MORNING_UTC) / 1000);
    expect(archiveDateOfSec(publishedAt)).toBe("2026-10-03");

    const link = dayLink(
      renderStory({ kind: "story", item: story(MORNING_UTC) }, "en", "abcdef01")
    );
    expect(link.href).toBe(dayArchivePath("2026-10-03", "en"));
    expect(link.text).toBe(formatDayHeading("2026-10-03", "en"));
  });
});

describe("missing permalink language", () => {
  it("renders the not-found copy in the current language", () => {
    // The loader captured English. The reader then asked for Vietnamese
    // without a second fetch, so the loader data is still English.
    const html = renderStory({ kind: "missing", lang: "en" }, "vi", "abcdef01");
    expect(html).toContain("Không tìm thấy tin.");
    expect(html).toContain("Về trang chính");
    expect(html).not.toContain("Story not found.");
    expect(html).not.toContain("Back to live feed");
  });

  it("renders English when the current language is English", () => {
    const html = renderStory({ kind: "missing", lang: "vi" }, "en", "abcdef01");
    expect(html).toContain("Story not found.");
    expect(html).toContain("Back to live feed");
    expect(html).not.toContain("Không tìm thấy tin.");
  });

  it("titles the document in the current language, not the loader language", () => {
    expect(missingTitle({ kind: "missing", lang: "en" }, "vi")).toBe(
      notFoundCopy("vi").documentTitle
    );
    expect(missingTitle({ kind: "missing", lang: "vi" }, "en")).toBe(
      notFoundCopy("en").documentTitle
    );
  });

  it("uses the request language when the loader has not returned", () => {
    expect(missingTitle(undefined, "en")).toBe(
      notFoundCopy("en").documentTitle
    );
  });
});
