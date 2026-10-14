import { describe, expect, it } from "vitest";
import {
  ASSET_RETENTION_MS,
  assetRefs,
  deployCheckPages,
  parseAssetHistory,
  planAssetCarry,
} from "./deploy-assets";

const HOUR = 60 * 60 * 1000;

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
    expect(assetRefs(html)).toEqual([
      "/assets/index-DoMdo6yM.css",
      "/assets/index-uAJIDAo6.js",
      "/assets/routes-C9lUwA6g.js",
    ]);
  });
});
