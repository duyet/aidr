/**
 * `/date/YYYY-MM-DD.md`: the agent-readable twin of a day page. It must say
 * the same thing as the HTML page in the requested language, link every story
 * to its explicit-locale permalink, and follow the page's cache rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DayArchive } from "./feed-queries";
import type { FeedItem } from "./types";

const getDayArchive =
  vi.fn<(db: unknown, date: string) => Promise<DayArchive>>();
vi.mock("./feed-queries", () => ({
  getDayArchive: (db: unknown, date: string) => getDayArchive(db, date),
}));

const {
  DAY_MARKDOWN_MAX_STORIES,
  handleDayMarkdownRequest,
  isDayMarkdownPath,
  renderDayMarkdown,
} = await import("./day-markdown");

// 2026-10-03 10:00 in Asia/Ho_Chi_Minh.
const NOW = Date.parse("2026-10-03T03:00:00Z");
const DB = {} as D1Database;

function item(id: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Story ${id}`,
    title_vi: `Tin ${id}`,
    summary: null,
    summary_vi: null,
    category: "Models",
    published_at: 1_790_000_000,
    points: 0,
    comments: 0,
    rank_score: 1,
    source_id: "hn",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

function archive(overrides: Partial<DayArchive> = {}): DayArchive {
  return {
    date: "2026-08-01",
    day: {
      date: "2026-08-01",
      items: [item("aaaaaaaa11"), item("bbbbbbbb22")],
      categoryCounts: {},
    },
    tldr: {
      date: "2026-08-01",
      bullets_en: [
        { text: "First EN bullet", item_ids: ["aaaaaaaa11"] },
        { text: "Second EN bullet" },
      ],
      bullets_vi: [
        { text: "Ý thứ nhất", item_ids: ["bbbbbbbb22"] },
        { text: "Ý thứ hai" },
      ],
    },
    video: { youtube_id: "dQw4w9WgXcQ", short_id: "abcdefghijk", title: null },
    prevDate: "2026-07-31",
    nextDate: null,
    ...overrides,
  };
}

const request = (path: string, init?: RequestInit) =>
  new Request(`https://aidr.today${path}`, init);

describe("isDayMarkdownPath", () => {
  it("matches only the day Markdown twin", () => {
    expect(isDayMarkdownPath("/date/2026-08-01.md")).toBe(true);
    expect(isDayMarkdownPath("/date/2026-08-01")).toBe(false);
    expect(isDayMarkdownPath("/date/2026-08-01.md/x")).toBe(false);
    expect(isDayMarkdownPath("/about.md")).toBe(false);
  });
});

describe("renderDayMarkdown", () => {
  it("renders the English page: video links, digest, ranked story links", () => {
    const md = renderDayMarkdown(archive(), "en");
    expect(md).toMatch(/^# AI news for /);
    expect(md).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(md).toContain("https://www.youtube.com/shorts/abcdefghijk");
    expect(md).toContain(
      "- First EN bullet ([story](https://aidr.today/aaaaaaaa?lang=en))"
    );
    expect(md).toContain(
      "1. [Story aaaaaaaa11](https://aidr.today/aaaaaaaa?lang=en)"
    );
    expect(md).toContain("https://aidr.today/date/2026-08-01?lang=en");
    expect(md).toContain("https://aidr.today/date/2026-07-31.md?lang=en");
    expect(md).not.toContain("Ý thứ nhất");
  });

  it("renders Vietnamese from the vi columns with lang=vi links", () => {
    const md = renderDayMarkdown(archive(), "vi");
    expect(md).toMatch(/^# Tin AI ngày /);
    expect(md).toContain("Ý thứ nhất");
    expect(md).not.toContain("First EN bullet");
    expect(md).toContain(
      "[Tin aaaaaaaa11](https://aidr.today/aaaaaaaa?lang=vi)"
    );
  });

  it("flattens and escapes publisher text so it cannot inject Markdown", () => {
    const md = renderDayMarkdown(
      archive({
        day: {
          date: "2026-08-01",
          items: [
            item("cccccccc33", { title: "Evil](https://x.y)\n# Heading" }),
          ],
          categoryCounts: {},
        },
        tldr: null,
        video: null,
      }),
      "en"
    );
    expect(md).toContain(
      "[Evil\\](https://x.y) \\# Heading](https://aidr.today/cccccccc?lang=en)"
    );
    expect(md).not.toContain("\n# Heading");
  });

  it("bounds the story list", () => {
    const items = Array.from({ length: DAY_MARKDOWN_MAX_STORIES + 5 }, (_, i) =>
      item(`${String(i).padStart(8, "0")}ff`)
    );
    const md = renderDayMarkdown(
      archive({ day: { date: "2026-08-01", items, categoryCounts: {} } }),
      "en"
    );
    expect(md).toContain(`${DAY_MARKDOWN_MAX_STORIES}. [`);
    expect(md).not.toContain(`${DAY_MARKDOWN_MAX_STORIES + 1}. [`);
    expect(md).toContain("5 more stories on the HTML page.");
  });
});

describe("handleDayMarkdownRequest", () => {
  beforeEach(() => {
    getDayArchive.mockReset();
    getDayArchive.mockResolvedValue(archive());
  });

  it("serves explicit-locale Markdown with the page's public cache rule", async () => {
    const res = await handleDayMarkdownRequest(
      request("/date/2026-08-01.md?lang=en"),
      DB,
      NOW
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(res.headers.get("content-language")).toBe("en");
    // Settled day: same Cache-Control as the HTML page.
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(res.headers.get("vary")).toBeNull();
    expect(getDayArchive).toHaveBeenCalledWith(DB, "2026-08-01");
    expect(await res.text()).toContain("# AI news for");
  });

  it("keeps a header-selected language private", async () => {
    const res = await handleDayMarkdownRequest(
      request("/date/2026-08-01.md", {
        headers: { "accept-language": "en-US" },
      }),
      DB,
      NOW
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Cookie, Accept-Language");
  });

  it("404s invalid, future, and empty days without leaking a cacheable response", async () => {
    for (const path of ["/date/2026-02-30.md", "/date/2026-10-04.md"]) {
      const res = await handleDayMarkdownRequest(request(path), DB, NOW);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    getDayArchive.mockResolvedValue(archive({ day: null, tldr: null }));
    const empty = await handleDayMarkdownRequest(
      request("/date/2026-08-01.md?lang=en"),
      DB,
      NOW
    );
    expect(empty.status).toBe(404);
  });

  it("rejects bad locales and non-GET methods, and 503s without D1", async () => {
    expect(
      (
        await handleDayMarkdownRequest(
          request("/date/2026-08-01.md?lang=fr"),
          DB,
          NOW
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleDayMarkdownRequest(
          request("/date/2026-08-01.md", { method: "POST" }),
          DB,
          NOW
        )
      ).status
    ).toBe(405);
    expect(
      (
        await handleDayMarkdownRequest(
          request("/date/2026-08-01.md?lang=en"),
          undefined,
          NOW
        )
      ).status
    ).toBe(503);
  });

  it("redirects one legacy locale to lang", async () => {
    const res = await handleDayMarkdownRequest(
      request("/date/2026-08-01.md?locale=en"),
      DB,
      NOW
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://aidr.today/date/2026-08-01.md?lang=en"
    );
  });
});
