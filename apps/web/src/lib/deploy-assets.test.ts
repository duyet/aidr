import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASSET_RETENTION_MS,
  assetRefs,
  type CarryOptions,
  carryLiveAssets,
  deployCheckPages,
  parseAssetHistory,
  planAssetCarry,
  timedFetch,
} from "./deploy-assets";

const HOUR = 60 * 60 * 1000;
const ORIGIN = "https://aidr.today";

/** `"hang"` accepts the request and never answers. */
type Reply =
  | { status: number; type?: string; body?: string | Uint8Array }
  | "hang";

const servers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

/**
 * A stand-in for the live site. Routes match on path plus query, then on path
 * alone; anything else is a 404 HTML page, as the real site answers.
 */
async function liveSite(routes: Record<string, Reply>): Promise<string> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://site");
    const reply = routes[url.pathname + url.search] ??
      routes[url.pathname] ?? { status: 404, type: "text/html", body: "<h1>" };
    if (reply === "hang") return;
    res.writeHead(reply.status, { "content-type": reply.type ?? "" });
    res.end(reply.body ?? "");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(
    () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      })
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A base URL nothing listens on, so every request is refused. */
async function closedPort(): Promise<string> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return `http://127.0.0.1:${port}`;
}

async function carry(base: string, extra: Partial<CarryOptions> = {}) {
  const saved = new Map<string, Uint8Array>();
  const warnings: string[] = [];
  const result = await carryLiveAssets({
    base,
    built: ["assets/index-new.js"],
    now: 1_000 * HOUR,
    save: (path, bytes) => saved.set(path, bytes),
    warn: (message) => warnings.push(message),
    ...extra,
  });
  return { ...result, saved, warnings };
}

const HOME_EN = `<a href="/date/2026-10-14?lang=en"></a><a href="/74c9e10c?lang=en"></a>`;

describe("planAssetCarry", () => {
  it("re-ships a previous build's chunk that the new build dropped", () => {
    const t0 = 1_000 * HOUR;
    const live = { "assets/index-old.js": t0, "assets/shared-a.js": t0 };
    const plan = planAssetCarry(
      ["assets/index-new.js", "assets/shared-a.js"],
      live,
      t0 + HOUR
    );
    expect(plan.carry).toEqual(["assets/index-old.js"]);
    expect(plan.history).toEqual({
      "assets/index-new.js": t0 + HOUR,
      "assets/shared-a.js": t0 + HOUR,
      "assets/index-old.js": t0,
    });
  });

  it("expires a chunk by the last build that emitted it, however often it was carried", () => {
    const t0 = 1_000 * HOUR;
    let history = planAssetCarry(["assets/index-a.js"], {}, t0).history;
    for (let hours = 6; hours < 48; hours += 6) {
      const plan = planAssetCarry(
        [`assets/index-${hours}.js`],
        history,
        t0 + hours * HOUR
      );
      expect(plan.carry).toContain("assets/index-a.js");
      history = plan.history;
    }
    expect(history["assets/index-a.js"]).toBe(t0);

    const expired = planAssetCarry(
      ["assets/index-48.js"],
      history,
      t0 + ASSET_RETENTION_MS
    );
    expect(expired.carry).not.toContain("assets/index-a.js");
    expect(expired.history).not.toHaveProperty("assets/index-a.js");
  });

  it("rejects a build file it could not publish safely", () => {
    expect(() => planAssetCarry(["assets/sub/x.js"], {}, 0)).toThrow(
      /unsupported asset path/
    );
  });
});

describe("parseAssetHistory", () => {
  it("accepts the published shape", () => {
    expect(parseAssetHistory({ "assets/index-abc.js": 5 })).toEqual({
      "assets/index-abc.js": 5,
    });
  });

  it.each([
    [{ "assets/../server/index.js": 1 }],
    [{ "../wrangler.json": 1 }],
    [{ "assets/..": 1 }],
    [{ "fonts/a.woff2": 1 }],
    [{ "assets/a.js": "1" }],
    [["assets/a.js"]],
    [null],
  ])("rejects %j, whose keys become write paths", (raw) => {
    expect(() => parseAssetHistory(raw)).toThrow();
  });
});

describe("deployCheckPages", () => {
  it("checks the English home and the first day and story page it links", () => {
    const home = `<a href="/calendar?lang=en"></a><a href="/date/2026-10-14?lang=en"></a>
<a href="/date/2026-10-13?lang=en"></a><a href="/about"></a>
<a href="/74c9e10c?lang=en"></a><a href="/fd4035d8?lang=en"></a>`;
    expect(deployCheckPages(home)).toEqual([
      "/?lang=en",
      "/date/2026-10-14?lang=en",
      "/74c9e10c?lang=en",
    ]);
  });

  it("fails rather than silently checking fewer pages", () => {
    expect(() => deployCheckPages(`<a href="/74c9e10c?lang=en">`)).toThrow(
      /no day page/
    );
    expect(() =>
      deployCheckPages(`<a href="/date/2026-10-14?lang=en">`)
    ).toThrow(/no story page/);
  });
});

describe("assetRefs", () => {
  it("lists every distinct /assets/* reference in the HTML", () => {
    const html = `<link rel="modulepreload" href="/assets/routes-C9lUwA6g.js">
<link rel="stylesheet" href="/assets/index-DoMdo6yM.css">
<script type="module" src="/assets/index-uAJIDAo6.js"></script>
<script>import("/assets/routes-C9lUwA6g.js")</script>
<link rel="icon" href="/favicon.svg"><img src="/media/x.webp">`;
    expect(assetRefs(html, ORIGIN)).toEqual([
      "/assets/index-DoMdo6yM.css",
      "/assets/index-uAJIDAo6.js",
      "/assets/routes-C9lUwA6g.js",
    ]);
  });

  it("reads absolute same-origin, CSS url() and query-suffixed references", () => {
    const html = `<link href="https://aidr.today/assets/index-abc.js">
<script>import("/assets/index-abc.js")</script>
<style>@font-face{src:url(/assets/serif-x1.woff2)}</style>
<link href=/assets/index-y2.css?v=1>`;
    expect(assetRefs(html, ORIGIN)).toEqual([
      "/assets/index-abc.js",
      "/assets/index-y2.css",
      "/assets/serif-x1.woff2",
    ]);
  });

  // Story content embeds third-party URLs. They 404 on aidr.today and would
  // fail the smoke step, or be carried as bogus history entries.
  it.each([
    [`<img src="https://cdn.example.com/assets/2026/x.jpg">`],
    [`<img src="https://cdn.example.com/assets/x.jpg">`],
    [`<img src="//cdn.example.com/assets/x.jpg">`],
    [`<img src="/assets/2026/x.jpg">`],
    [`<a href="https://aidr.today.evil.example/assets/x.js">`],
    [`<p>the build writes /assets/index.js</p>`],
  ])("ignores %s", (html) => {
    expect(assetRefs(html, ORIGIN)).toEqual([]);
  });
});

describe("carryLiveAssets", () => {
  const now = 1_000 * HOUR;
  const js = (body: string): Reply => ({
    status: 200,
    type: "text/javascript",
    body,
  });
  const page = (body: string): Reply => ({
    status: 200,
    type: "text/html",
    body,
  });

  it("re-ships a live file the new build lacks, keeping its original time", async () => {
    const base = await liveSite({
      "/asset-history.json": {
        status: 200,
        type: "application/json",
        body: JSON.stringify({ "assets/index-old.js": now - HOUR }),
      },
      "/assets/index-old.js": js("old()"),
    });
    const result = await carry(base);
    expect(result.history).toEqual({
      "assets/index-new.js": now,
      "assets/index-old.js": now - HOUR,
    });
    expect(
      new TextDecoder().decode(result.saved.get("assets/index-old.js"))
    ).toBe("old()");
    expect(result.warnings).toEqual([]);
  });

  it("seeds from the pages the smoke step checks when no history is live", async () => {
    const base = await liveSite({
      "/?lang=en": page(`${HOME_EN}<script src="/assets/index-old.js">`),
      "/date/2026-10-14?lang=en": page(`<script src="/assets/day-old.js">`),
      "/74c9e10c?lang=en": page(
        `<script src="/assets/story-old.js"></script>
<img src="https://cdn.example.com/assets/2026/x.jpg"><img src="/assets/2026/y.jpg">`
      ),
      "/?lang=vi": page(`<script src="/assets/index-old.js">`),
      "/assets/index-old.js": js("a"),
      "/assets/day-old.js": js("b"),
      "/assets/story-old.js": js("c"),
    });
    const result = await carry(base);
    expect(result.warnings).toEqual([expect.stringMatching(/seeded from/)]);
    expect([...result.saved.keys()].sort()).toEqual([
      "assets/day-old.js",
      "assets/index-old.js",
      "assets/story-old.js",
    ]);
    expect(result.history).toEqual({
      "assets/index-new.js": now,
      "assets/index-old.js": now,
      "assets/day-old.js": now,
      "assets/story-old.js": now,
    });
  });

  // The deploy this step runs in may be the one meant to fix a broken live
  // site, so failing to read that site must never stop it.
  it.each<[string, () => Promise<string>]>([
    ["history 500", () => liveSite({ "/asset-history.json": { status: 500 } })],
    [
      "history body that is not JSON",
      () => liveSite({ "/asset-history.json": page("<html>") }),
    ],
    [
      "history with a path outside assets/",
      () =>
        liveSite({
          "/asset-history.json": {
            status: 200,
            type: "application/json",
            body: JSON.stringify({ "assets/../server/index.js": now }),
          },
        }),
    ],
    ["connection refused", closedPort],
    [
      "history 404 and home 500",
      () => liveSite({ "/?lang=en": { status: 500 } }),
    ],
    [
      "history 404 and a home linking no day page",
      () => liveSite({ "/?lang=en": page(`<a href="/74c9e10c?lang=en">`) }),
    ],
  ])("deploys without carrying on %s", async (_, site) => {
    const result = await carry(await site());
    expect(result.history).toEqual({ "assets/index-new.js": now });
    expect(result.attempted).toBe(0);
    expect(result.saved.size).toBe(0);
    expect(result.warnings).toEqual([
      expect.stringMatching(/deploying without carrying/),
    ]);
  });

  it("gives up on a live site that never answers", async () => {
    const base = await liveSite({ "/asset-history.json": "hang" });
    const started = Date.now();
    const result = await carry(base, { timeoutMs: 100 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.history).toEqual({ "assets/index-new.js": now });
    expect(result.warnings).toEqual([
      expect.stringMatching(/timeout.*deploying without carrying/),
    ]);
  });

  it("drops a download that never answers and carries the rest", async () => {
    const base = await liveSite({
      "/asset-history.json": {
        status: 200,
        type: "application/json",
        body: JSON.stringify({
          "assets/hung-old.js": now - HOUR,
          "assets/index-old.js": now - HOUR,
        }),
      },
      "/assets/hung-old.js": "hang",
      "/assets/index-old.js": js("old()"),
    });
    const result = await carry(base, {
      timeoutMs: 100,
      sleep: async () => {},
    });
    expect([...result.saved.keys()]).toEqual(["assets/index-old.js"]);
    expect(result.history).not.toHaveProperty("assets/hung-old.js");
    expect(result.warnings).toEqual([
      expect.stringMatching(/not carried: GET \/assets\/hung-old\.js.*timeout/),
    ]);
  });

  it("waits between download attempts but not after the last one", {
    timeout: 10_000,
  }, async () => {
    const base = await liveSite({
      "/asset-history.json": {
        status: 200,
        type: "application/json",
        body: JSON.stringify({ "assets/gone-old.js": now - HOUR }),
      },
    });
    const sleeps: number[] = [];
    const result = await carry(base, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toHaveLength(2);
    expect(result.warnings).toEqual([
      expect.stringMatching(/gone-old\.js failed after 3 attempts: HTTP 404/),
    ]);
  });
});

describe("timedFetch", () => {
  it("rejects once the server has not answered within the limit", async () => {
    const base = await liveSite({ "/": "hang" });
    await expect(timedFetch(`${base}/`, {}, 100)).rejects.toThrow(/timeout/);
  });
});
