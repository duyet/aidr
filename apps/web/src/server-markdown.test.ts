/**
 * Worker-level Markdown negotiation. An agent that asks for `text/markdown`
 * on a page URL gets that page's Markdown twin; a browser on the same URL
 * still gets HTML; and both carry `Vary: Accept` so Workers Cache, which
 * serves hits before the Worker runs, keeps the two apart.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import handler from "@tanstack/react-start/server-entry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";
import { archiveDateOfSec } from "./lib/day-archive";
import { llmsTxt } from "./lib/llms-txt";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({ NewsIngestWorkflow: class {} }));

const { default: server } = await import("./server");

const PUBLISHED_AT = 1_787_000_000;
const DAY = archiveDateOfSec(PUBLISHED_AT) as string;
const STORY_ID = "a1b2c3d4".padEnd(64, "0");
const BROWSER_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const ROW = {
  id: STORY_ID,
  url: "https://www.example.com/post",
  title: "OpenAI ships a faster reasoning model",
  title_vi: "OpenAI ra mắt mô hình suy luận nhanh hơn",
  summary: "English summary.",
  summary_vi: "Tóm tắt tiếng Việt.",
  category: "Models",
  published_at: PUBLISHED_AT,
  points: 120,
  comments: 30,
  rank_score: 42,
  source_id: "hn",
  tags: '["openai"]',
  image_url: null,
};

function fakeDb(): D1Database {
  const dispatch = (sql: string): unknown[] => {
    if (sql.includes("FROM items i")) return [ROW];
    return [];
  };
  const prepare = (sql: string) => {
    const stmt = {
      bind: () => stmt,
      all: async () => ({ results: dispatch(sql) }),
      first: async () => dispatch(sql)[0] ?? null,
      run: async () => ({ success: true }),
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts: Array<{ all(): Promise<unknown> }>) =>
      Promise.all(stmts.map((stmt) => stmt.all())),
  } as unknown as D1Database;
}

async function fetchPath(path: string, accept: string): Promise<Response> {
  const env = { DB: fakeDb() } as unknown as Env;
  return server.fetch(
    new Request(`https://aidr.today${path}`, { headers: { accept } }),
    env
  );
}

function varyNames(response: Response): string[] {
  return (response.headers.get("vary") ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase());
}

beforeEach(() => {
  vi.mocked(handler.fetch).mockImplementation(
    async () =>
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Accept: text/markdown on page URLs", () => {
  it.each([
    [
      "/?lang=en",
      "https://aidr.today/?lang=en",
      "# AI;DR: today's ranked AI news",
    ],
    [
      `/date/${DAY}?lang=en`,
      `https://aidr.today/date/${DAY}?lang=en`,
      "# AI news for",
    ],
    [
      "/a1b2c3d4?lang=en",
      "https://aidr.today/a1b2c3d4?lang=en",
      "OpenAI ships",
    ],
  ])(
    "%s answers Markdown with its canonical page",
    async (path, canonical, text) => {
      const response = await fetchPath(path, "text/markdown, text/html;q=0.9");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      expect(response.headers.get("link")).toContain(
        `<${canonical}>; rel="canonical"`
      );
      expect(varyNames(response)).toContain("accept");
      expect(await response.text()).toContain(text);
      expect(handler.fetch).not.toHaveBeenCalled();
    }
  );

  it("keeps HTML for a browser and advertises the Markdown twin", async () => {
    const response = await fetchPath("/?lang=en", BROWSER_ACCEPT);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(varyNames(response)).toContain("accept");
    expect(response.headers.get("link")).toContain(
      '<https://aidr.today/index.md?lang=en>; rel="alternate"; type="text/markdown"'
    );
  });

  // The inner Cache API stores HTML without Vary. If Accept were added only
  // while rendering, a hit would leave without it and Workers Cache would
  // serve that HTML to the next agent asking for Markdown.
  it("adds Vary: Accept to an inner edge-cache hit", async () => {
    const cached = new Response("<html>cached</html>", {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    });
    vi.stubGlobal("caches", {
      default: { match: vi.fn(async () => cached), put: vi.fn() },
    });
    const response = await fetchPath("/a1b2c3d4?lang=en", BROWSER_ACCEPT);
    expect(response.headers.get("x-aidr-cache")).toBe("HIT");
    expect(await response.text()).toBe("<html>cached</html>");
    expect(varyNames(response)).toContain("accept");
  });

  it("does not split the cache of a page without a Markdown twin", async () => {
    const response = await fetchPath("/about?lang=en", BROWSER_ACCEPT);
    expect(varyNames(response)).not.toContain("accept");
  });
});

describe("Markdown URL aliases", () => {
  it.each([
    ["/index.md?lang=en", "# AI;DR: today's ranked AI news"],
    ["/index.html.md?lang=en", "# AI;DR: today's ranked AI news"],
    ["/a1b2c3d4.md?lang=en", "OpenAI ships"],
  ])("%s serves Markdown", async (path, text) => {
    const response = await fetchPath(path, "*/*");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toContain(text);
  });

  it("lists the ranked story with category, host and time on the home twin", async () => {
    const response = await fetchPath("/index.md?lang=en", "*/*");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("link")).toBe(
      '<https://aidr.today/?lang=en>; rel="canonical"'
    );
    const body = await response.text();
    expect(body).toContain(
      `1. [OpenAI ships a faster reasoning model](https://aidr.today/a1b2c3d4?lang=en) — Models · example.com · ${new Date(PUBLISHED_AT * 1000).toISOString().replace(".000", "")}`
    );
  });
});

describe("every llms.txt link reaches a real route", () => {
  // A link an agent follows must land on a Worker surface or a declared
  // page route, never on the SPA's not-found catch-all.
  const routeSource = readFileSync(
    fileURLToPath(new URL("./routeTree.gen.ts", import.meta.url)),
    "utf8"
  );
  const block = /interface FileRoutesByFullPath \{([^}]*)\}/.exec(
    routeSource
  )?.[1];
  const declared = [...(block ?? "").matchAll(/'([^']+)':/g)]
    .map((match) => match[1] as string)
    .filter((path) => !["/$", "/$slug", "/$cat/$slug"].includes(path))
    .map(
      (path) =>
        new RegExp(
          `^${path
            .replace(/\/$/, "")
            .replace(/\/\$$/, "(?:/.*)?")
            .replace(/\$[a-z]+/gi, "[^/]+")}/?$`
        )
    );

  it("parses the generated route table", () => {
    expect(declared.length).toBeGreaterThan(20);
  });

  it("serves each aidr link from the Worker or a declared route", async () => {
    const links = [
      ...llmsTxt().matchAll(/\]\((https:\/\/aidr\.today[^)\s]*)\)/g),
    ].map((match) => new URL(match[1] as string));
    expect(links.length).toBeGreaterThan(30);
    for (const url of links) {
      vi.mocked(handler.fetch).mockClear();
      await fetchPath(`${url.pathname}${url.search}`, "*/*");
      if (!vi.mocked(handler.fetch).mock.calls.length) continue;
      const path = url.pathname;
      const isStory = /^\/[0-9a-f]{8}$/.test(path);
      expect(
        isStory || declared.some((route) => route.test(path)),
        `${path} fell through to the SPA catch-all`
      ).toBe(true);
    }
  });
});

describe("/llms-full.txt", () => {
  it("is llms.txt followed by today's edition", async () => {
    const response = await fetchPath("/llms-full.txt", "*/*");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    const body = await response.text();
    expect(body.startsWith(llmsTxt())).toBe(true);
    expect(body).toContain("# AI;DR: today's ranked AI news");
    expect(body).toContain("[OpenAI ships a faster reasoning model]");
  });

  // An agent's context file must not 500 because D1 hiccuped.
  it("serves the map alone when the edition cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;
    const response = await server.fetch(
      new Request("https://aidr.today/llms-full.txt"),
      { DB: broken } as unknown as Env
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(llmsTxt());
  });
});
