import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASSET_HISTORY_PATH,
  ASSET_RETENTION_MS,
  assetBodyProblem,
  assetRefs,
  type CarryOptions,
  carryLiveAssets,
  deployCheckPages,
  MAX_ASSET_BYTES,
  parseAssetHistory,
  planAssetCarry,
  readBuildAssets,
  timedFetch,
  writeCarriedAsset,
} from "./deploy-assets";

const HOUR = 60 * 60 * 1000;
const ORIGIN = "https://aidr.today";

/** `"hang"` accepts the request and never answers. */
type Reply =
  | {
      status: number;
      type?: string;
      body?: string | Uint8Array;
      /** Send without a content-length header. */
      chunked?: boolean;
    }
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
    if (reply.chunked) res.write(reply.body ?? "");
    res.end(reply.chunked ? undefined : (reply.body ?? ""));
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
    const live = {
      built: ["assets/index-old.js", "assets/shared-a.js"],
      retired: {},
    };
    const plan = planAssetCarry(
      ["assets/index-new.js", "assets/shared-a.js"],
      live,
      t0
    );
    expect(plan.carry).toEqual(["assets/index-old.js"]);
    expect(plan.history).toEqual({
      built: ["assets/index-new.js", "assets/shared-a.js"],
      retired: { "assets/index-old.js": t0 },
    });
  });

  // A build stays live, and keeps rendering HTML that names its chunks, until
  // the deploy that replaces it, however long after its own deploy that is.
  it("keeps a chunk for the retention after the deploy that replaced its build", () => {
    const t0 = 1_000 * HOUR;
    const first = planAssetCarry(
      ["assets/index-a.js"],
      { built: [], retired: {} },
      t0
    );
    const replaced = t0 + 47 * HOUR;
    let history = planAssetCarry(
      ["assets/index-b.js"],
      first.history,
      replaced
    ).history;
    for (let hours = 6; hours < 48; hours += 6) {
      const plan = planAssetCarry(
        [`assets/index-${hours}.js`],
        history,
        replaced + hours * HOUR
      );
      expect(plan.carry).toContain("assets/index-a.js");
      history = plan.history;
    }
    expect(history.retired["assets/index-a.js"]).toBe(replaced);

    const expired = planAssetCarry(
      ["assets/index-48.js"],
      history,
      replaced + ASSET_RETENTION_MS
    );
    expect(expired.carry).not.toContain("assets/index-a.js");
    expect(expired.history.retired).not.toHaveProperty("assets/index-a.js");
  });

  it("lists a retired file the new build emits again as built", () => {
    const plan = planAssetCarry(
      ["assets/index-a.js"],
      { built: [], retired: { "assets/index-a.js": 5 } },
      10
    );
    expect(plan).toEqual({
      history: { built: ["assets/index-a.js"], retired: {} },
      carry: [],
    });
  });

  it("rejects a build file it could not publish safely", () => {
    expect(() =>
      planAssetCarry(["assets/sub/x.js"], { built: [], retired: {} }, 0)
    ).toThrow(/unsupported asset path/);
  });
});

describe("parseAssetHistory", () => {
  const now = 1_000 * HOUR;

  it("accepts the published shape", () => {
    const raw = {
      built: ["assets/index-abc.js"],
      retired: { "assets/index-old.js": now - HOUR },
    };
    expect(parseAssetHistory(raw, now)).toEqual(raw);
  });

  // A history written by a machine whose clock ran ahead would otherwise keep
  // its files until that clock's time plus retention.
  it("reads a time after now as now", () => {
    const parsed = parseAssetHistory(
      { built: [], retired: { "assets/a.js": now + 1_000 * HOUR } },
      now
    );
    expect(parsed.retired["assets/a.js"]).toBe(now);
    const plan = planAssetCarry([], parsed, now + ASSET_RETENTION_MS);
    expect(plan.carry).toEqual([]);
  });

  it.each([
    [{ built: ["assets/../server/index.js"], retired: {} }],
    [{ built: [], retired: { "../wrangler.json": 1 } }],
    [{ built: ["assets/.."], retired: {} }],
    [{ built: [], retired: { "fonts/a.woff2": 1 } }],
    [{ built: [5], retired: {} }],
    [{ built: [], retired: { "assets/a.js": "1" } }],
    [{ "assets/a.js": 1 }],
    [["assets/a.js"]],
    [null],
  ])("rejects %j, whose paths become write paths", (raw) => {
    expect(() => parseAssetHistory(raw, now)).toThrow();
  });
});

describe("readBuildAssets", () => {
  function clientRoot(files: string[]): string {
    const root = mkdtempSync(join(tmpdir(), "deploy-assets-"));
    mkdirSync(join(root, "assets"));
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "x");
    }
    return root;
  }

  it("lists the build's flat asset files", () => {
    expect(
      readBuildAssets(clientRoot(["assets/index-b.js", "assets/a-1.css"]))
    ).toEqual(["assets/a-1.css", "assets/index-b.js"]);
  });

  // The PR gate reads the build through this, so a name the deploy's carry
  // would refuse fails the pull request instead of the master deploy.
  it.each(["assets/sub/x.js", "assets/a~b.js", "assets/.hidden.js"])(
    "rejects %s",
    (file) => {
      expect(() =>
        readBuildAssets(clientRoot(["assets/index-a.js", file]))
      ).toThrow(/unsupported asset path/);
    }
  );

  // `vite build` empties dist/client. A history file there means this output
  // was carried into already, and its carried files would read as built.
  it("refuses an output dir an earlier carry wrote into", () => {
    const root = clientRoot(["assets/index-a.js", "assets/index-old.js"]);
    writeFileSync(join(root, ASSET_HISTORY_PATH), "{}");
    expect(() => readBuildAssets(root)).toThrow(/rebuild first/);
  });
});

describe("writeCarriedAsset", () => {
  it("writes the file under its name", () => {
    const root = mkdtempSync(join(tmpdir(), "deploy-assets-"));
    mkdirSync(join(root, "assets"));
    writeCarriedAsset(root, "assets/a.js", new TextEncoder().encode("a()"));
    expect(readFileSync(join(root, "assets/a.js"), "utf8")).toBe("a()");
    expect(readdirSync(join(root, "assets"))).toEqual(["a.js"]);
  });

  // Anything under the hashed name is published as that chunk.
  it("leaves nothing behind when the write fails partway", () => {
    const root = mkdtempSync(join(tmpdir(), "deploy-assets-"));
    mkdirSync(join(root, "assets"));
    const bytes = new TextEncoder().encode("whole()");
    expect(() =>
      writeCarriedAsset(root, "assets/a.js", bytes, (file, data) => {
        writeFileSync(file, data.subarray(0, 3));
        throw new Error("ENOSPC");
      })
    ).toThrow(/ENOSPC/);
    expect(readdirSync(join(root, "assets"))).toEqual([]);
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
  const js = (body: string): Exclude<Reply, "hang"> => ({
    status: 200,
    type: "text/javascript",
    body,
  });
  const page = (body: string): Reply => ({
    status: 200,
    type: "text/html",
    body,
  });
  /** A live history whose files retired an hour ago. */
  const history = (...paths: string[]): Reply => ({
    status: 200,
    type: "application/json",
    body: JSON.stringify({
      built: [],
      retired: Object.fromEntries(paths.map((path) => [path, now - HOUR])),
    }),
  });
  const recordSleeps = (sleeps: number[]) => async (ms: number) => {
    sleeps.push(ms);
  };

  it("re-ships the live build's files and earlier ones the new build lacks", async () => {
    const base = await liveSite({
      "/asset-history.json": {
        status: 200,
        type: "application/json",
        body: JSON.stringify({
          built: ["assets/index-live.js"],
          retired: { "assets/index-old.js": now - HOUR },
        }),
      },
      "/assets/index-live.js": js("live()"),
      "/assets/index-old.js": js("old()"),
    });
    const result = await carry(base);
    expect(result.history).toEqual({
      built: ["assets/index-new.js"],
      retired: {
        "assets/index-live.js": now,
        "assets/index-old.js": now - HOUR,
      },
    });
    expect(
      new TextDecoder().decode(result.saved.get("assets/index-old.js"))
    ).toBe("old()");
    expect(result.saved.size).toBe(2);
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
      built: ["assets/index-new.js"],
      retired: {
        "assets/index-old.js": now,
        "assets/day-old.js": now,
        "assets/story-old.js": now,
      },
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
      "history in the old flat shape",
      () =>
        liveSite({
          "/asset-history.json": {
            status: 200,
            type: "application/json",
            body: JSON.stringify({ "assets/index-old.js": now }),
          },
        }),
    ],
    [
      "history with a path outside assets/",
      () =>
        liveSite({
          "/asset-history.json": {
            status: 200,
            type: "application/json",
            body: JSON.stringify({
              built: ["assets/../server/index.js"],
              retired: {},
            }),
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
    expect(result.history).toEqual({
      built: ["assets/index-new.js"],
      retired: {},
    });
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
    expect(result.history.retired).toEqual({});
    expect(result.warnings).toEqual([
      expect.stringMatching(/timeout.*deploying without carrying/),
    ]);
  });

  it("keeps a download that never answers in the history and carries the rest", async () => {
    const base = await liveSite({
      "/asset-history.json": history(
        "assets/hung-old.js",
        "assets/index-old.js"
      ),
      "/assets/hung-old.js": "hang",
      "/assets/index-old.js": js("old()"),
    });
    const result = await carry(base, {
      timeoutMs: 100,
      sleep: async () => {},
    });
    expect([...result.saved.keys()]).toEqual(["assets/index-old.js"]);
    expect(result.history.retired).toHaveProperty("assets/hung-old.js");
    expect(result.warnings).toEqual([
      expect.stringMatching(
        /kept in the history: \/assets\/hung-old\.js.*timeout/
      ),
    ]);
  });

  // The deploy waits on this step; past its deadline the deploy goes on with
  // what was carried, and the rest stays listed for the next deploy to try.
  it("stops at the step deadline and keeps what it has not carried", {
    timeout: 5_000,
  }, async () => {
    const base = await liveSite({
      "/asset-history.json": history(
        ...Array.from({ length: 9 }, (_, i) => `assets/hung-${i}.js`),
        "assets/a-old.js"
      ),
      "/assets/a-old.js": js("old()"),
      ...Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`/assets/hung-${i}.js`, "hang"])
      ),
    });
    const started = Date.now();
    const result = await carry(base, {
      timeoutMs: 60_000,
      deadlineMs: 300,
      sleep: async () => {},
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect([...result.saved.keys()]).toEqual(["assets/a-old.js"]);
    expect(Object.keys(result.history.retired)).toHaveLength(10);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/stopped carrying at the 0.3s deadline; 1 file/)
    );
  });

  it("keeps a file that failed transiently, after waiting between attempts", {
    timeout: 10_000,
  }, async () => {
    const base = await liveSite({
      "/asset-history.json": history("assets/flaky-old.js"),
      "/assets/flaky-old.js": { status: 503 },
    });
    const sleeps: number[] = [];
    const result = await carry(base, { sleep: recordSleeps(sleeps) });
    expect(sleeps).toEqual([1000, 2000]);
    expect(result.history.retired).toHaveProperty("assets/flaky-old.js");
    expect(result.warnings).toEqual([
      expect.stringMatching(
        /kept in the history: \/assets\/flaky-old\.js: HTTP 503/
      ),
    ]);
  });

  it("drops a file the live site no longer has, without retrying", async () => {
    const base = await liveSite({
      "/asset-history.json": history("assets/gone-old.js"),
    });
    const sleeps: number[] = [];
    const result = await carry(base, { sleep: recordSleeps(sleeps) });
    expect(sleeps).toEqual([]);
    expect(result.history.retired).toEqual({});
    expect(result.warnings).toEqual([
      expect.stringMatching(/not carried: \/assets\/gone-old\.js: HTTP 404/),
    ]);
  });

  it("drops a file it could not write", async () => {
    const base = await liveSite({
      "/asset-history.json": history("assets/index-old.js"),
      "/assets/index-old.js": js("old()"),
    });
    const result = await carry(base, {
      save: () => {
        throw new Error("EACCES");
      },
    });
    expect(result.carried).toBe(0);
    expect(result.history.retired).toEqual({});
    expect(result.warnings).toEqual([
      expect.stringMatching(/index-old\.js: could not write it: EACCES/),
    ]);
  });

  // A carried file is published as-is under its hashed name, so a body that
  // isn't what the name says would be served to every cached page asking.
  it("refuses a body of the wrong kind or size, without retrying", async () => {
    const base = await liveSite({
      "/asset-history.json": history(
        "assets/plain-old.js",
        "assets/font-old.woff2",
        "assets/huge-old.js",
        "assets/streamed-old.js",
        "assets/index-old.js"
      ),
      "/assets/streamed-old.js": {
        ...js("x".repeat(MAX_ASSET_BYTES + 1)),
        chunked: true,
      },
      "/assets/plain-old.js": { status: 200, type: "text/plain", body: "x" },
      "/assets/font-old.woff2": {
        status: 200,
        type: "text/html; charset=utf-8",
        body: "<h1>",
      },
      "/assets/huge-old.js": js("x".repeat(MAX_ASSET_BYTES + 1)),
      "/assets/index-old.js": js("old()"),
    });
    const sleeps: number[] = [];
    const result = await carry(base, { sleep: recordSleeps(sleeps) });
    expect([...result.saved.keys()]).toEqual(["assets/index-old.js"]);
    expect(Object.keys(result.history.retired)).toEqual([
      "assets/index-old.js",
    ]);
    expect(result.warnings.sort()).toEqual([
      expect.stringMatching(/font-old\.woff2: content-type text\/html/),
      expect.stringMatching(/huge-old\.js: \d+ bytes is over/),
      expect.stringMatching(/plain-old\.js: content-type text\/plain/),
      expect.stringMatching(/streamed-old\.js: \d+ bytes is over/),
    ]);
    expect(sleeps).toEqual([]);
  });
});

describe("assetBodyProblem", () => {
  it.each([
    ["assets/index-a.js", "text/javascript; charset=utf-8"],
    ["assets/index-a.js", "application/javascript"],
    ["assets/index-a.css", "text/css"],
    ["assets/serif-a.woff2", "font/woff2"],
    ["assets/logo-a.png", "image/png"],
    ["assets/logo-a.svg", "image/svg+xml"],
  ])("accepts %s served as %s", (path, type) => {
    expect(assetBodyProblem(path, type, 1_000)).toBeNull();
  });

  it.each([
    ["assets/index-a.js", "text/html", 1_000],
    ["assets/index-a.js", "", 1_000],
    ["assets/index-a.css", "text/javascript", 1_000],
    ["assets/serif-a.woff2", "application/octet-stream", 1_000],
    ["assets/logo-a.svg", "text/xml", 1_000],
    ["assets/data-a.wasm", "application/wasm", 1_000],
    ["assets/constructor", "text/javascript", 1_000],
    ["assets/index-a.js", "text/javascript", MAX_ASSET_BYTES + 1],
  ])("refuses %s served as %j, %i bytes", (path, type, bytes) => {
    expect(assetBodyProblem(path, type, bytes)).toEqual(expect.any(String));
  });
});

describe("deploy-web.yml", () => {
  const workflow = readFileSync(
    fileURLToPath(
      new URL("../../../../.github/workflows/deploy-web.yml", import.meta.url)
    ),
    "utf-8"
  );
  const steps = new Map(
    workflow
      .split(/\n {6}- name: /)
      .slice(1)
      .map((block) => [block.slice(0, block.indexOf("\n")), block])
  );
  const condition = (name: string) =>
    /\n {8}if: (.+)/.exec(steps.get(name) ?? "")?.[1];

  // The Clerk checks sit after the asset smoke step. A broken chunk must not
  // hide whether sign-in and the webhook secret still work, but none of them
  // mean anything when the deploy itself failed.
  it.each([
    "Smoke — /__clerk/v1/environment",
    "Smoke — /api/webhooks/clerk configured",
  ])(
    "runs %s after a failed asset smoke, not after a failed deploy",
    (name) => {
      expect(steps.get("Deploy @aidr/web")).toMatch(/\n {8}id: deploy\n/);
      expect([...steps.keys()].indexOf(name)).toBeGreaterThan(
        [...steps.keys()].indexOf("Smoke — referenced /assets/* load")
      );
      expect(condition(name)).toBe(
        `\${{ !cancelled() && steps.deploy.outcome == 'success' }}`
      );
    }
  );
});

/**
 * Runs a package.json script in `sh` with every command it calls stubbed to
 * log its arguments, and `pnpm run <failing>` exiting 1.
 */
function runScript(
  name: string,
  failing = ""
): { calls: string[]; code: number } {
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      "utf8"
    )
  ).scripts;
  const log = join(mkdtempSync(join(tmpdir(), "deploy-script-")), "calls");
  writeFileSync(log, "");
  const stubs = `
pnpm() { echo "pnpm $*" >> "$LOG"; [ "$2" != "$FAILING" ]; }
tsx() { echo "tsx $*" >> "$LOG"; }
dotenvx() { while [ "$1" != "--" ]; do shift; done; shift; "$@"; }
`;
  let code = 0;
  try {
    execFileSync("sh", ["-c", `${stubs}\n${scripts[name]}`], {
      env: { ...process.env, LOG: log, FAILING: failing },
    });
  } catch (e) {
    code = (e as { status: number }).status;
  }
  return { calls: readFileSync(log, "utf8").trim().split("\n"), code };
}

describe("package.json deploy scripts", () => {
  // Carried chunks hold the live site's `pk_live_` key, so a check that runs
  // after the carry passes a keyless build, and a carried `pk_test_` chunk
  // would fail a good one. The key check must see only this build's files.
  it("checks the new build's Clerk key before carrying earlier builds' files", () => {
    const { calls } = runScript("deploy");
    expect(calls).toEqual([
      "pnpm run check:migrations",
      "pnpm run verify:translation-schema",
      "pnpm run build",
      "tsx scripts/assert-clerk-proxy-config.ts --require-live-key",
      "tsx scripts/carry-live-assets.ts",
      "pnpm exec wrangler deploy --config dist/server/wrangler.json",
    ]);
  });

  it("deploys through the same script locally", () => {
    expect(runScript("cf:deploy:prod").calls[0]).toBe("pnpm run deploy");
  });

  // Same as deploy-web.yml: the asset check first, and a failed asset check
  // doesn't hide the Clerk and API checks.
  it.each(["smoke:assets", "smoke"])(
    "runs both post-deploy smoke checks and fails when %s fails",
    (failing) => {
      const { calls, code } = runScript("cf:deploy:prod", failing);
      expect(calls.slice(1)).toEqual([
        "pnpm run smoke:assets",
        "pnpm run smoke",
      ]);
      expect(code).not.toBe(0);
    }
  );

  it("passes when the deploy and both smoke checks pass", () => {
    expect(runScript("cf:deploy:prod").code).toBe(0);
  });
});

describe("timedFetch", () => {
  it("rejects once the server has not answered within the limit", async () => {
    const base = await liveSite({ "/": "hang" });
    await expect(timedFetch(`${base}/`, {}, 100)).rejects.toThrow(/timeout/);
  });
});
