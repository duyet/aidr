/**
 * The homepage holds its first paint until the whole AI;DR section is
 * parsed (src/lib/aidr-paint-gate.ts). Without that, a paint that lands
 * while the streamed HTML is part way through the section centres a short,
 * half-built card and then moves it up as the rest arrives: a 0.08-0.2
 * layout shift, measured on the live page in most throttled loads.
 *
 * The gate only works if both halves reach the HTML: the `rel=expect` link
 * in <head>, and the marker right after the section. If the marker is
 * missing, the link holds paint until the whole document is parsed, so the
 * head must only add the link when the page will render the marker.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AIDR_END_ID, AIDR_PAINT_GATE_LINK } from "../lib/aidr-paint-gate";
import { LangContext } from "../lib/lang-context";
import type { FeedResponse } from "../lib/types";
import { Route } from "./index";

const ITEM_ID = "071a284c0011223344556677";
// Enough real Vietnamese bullets that displayTldrBullets shows the section.
const bulletsVi = Array.from({ length: 8 }, (_, i) => ({
  text: `Tin thứ ${i + 1}: mô hình mới được công bố hôm nay`,
  item_ids: [ITEM_ID],
  image_url: null,
}));

const feed: FeedResponse = {
  tldr: {
    date: "2026-09-30",
    bullets_en: [{ text: "Story", item_ids: [ITEM_ID], image_url: null }],
    bullets_vi: bulletsVi,
  },
  days: [],
  categories: [],
  trending: [],
  totalStories: 1,
  updatedAt: 1_780_000_000,
  lastFetchedAt: null,
  hasMore: false,
};

type HeadFn = (ctx: unknown) => { links?: Array<Record<string, string>> };

function head(search: { q?: string }, loaderData: FeedResponse | undefined) {
  const fn = Route.options.head as unknown as HeadFn;
  return fn({
    match: {
      context: { lang: "vi" },
      search,
      pathname: "/",
      status: "success",
    },
    loaderData,
  });
}

function renderHome(): string {
  vi.spyOn(Route, "useSearch").mockReturnValue({} as never);
  vi.spyOn(Route, "useLoaderData").mockReturnValue(feed as never);
  const Page = Route.options.component as () => React.ReactElement;
  return renderToStaticMarkup(
    <LangContext.Provider value="vi">
      <Page />
    </LangContext.Provider>
  );
}

describe("homepage first-paint gate", () => {
  it("points the expect link at the marker id", () => {
    expect(AIDR_PAINT_GATE_LINK).toEqual({
      rel: "expect",
      href: `#${AIDR_END_ID}`,
      blocking: "render",
    });
  });

  it("adds the render-blocking link when the page has the AI;DR section", () => {
    expect(head({}, feed).links).toContainEqual(AIDR_PAINT_GATE_LINK);
  });

  it("leaves it out on a search page, which has no AI;DR section", () => {
    expect(head({ q: "openai" }, feed).links).not.toContainEqual(
      AIDR_PAINT_GATE_LINK
    );
  });

  it("leaves it out when there is no loader data and the page SSRs a skeleton", () => {
    expect(head({}, undefined).links).not.toContainEqual(AIDR_PAINT_GATE_LINK);
  });

  it("renders the marker right after the AI;DR section closes", () => {
    const html = renderHome();
    const section = html.indexOf("data-aidr-layout");
    const marker = html.indexOf(`<span id="${AIDR_END_ID}" hidden="">`);
    expect(section).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(section);
    // Nothing but the section's closing tags between the two, so the gate
    // releases paint the moment the full card is parsed.
    expect(html.slice(section, marker)).toMatch(/<\/section>(<\/div>)*$/);
  });
});
