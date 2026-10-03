import { describe, expect, it } from "vitest";
import {
  resolveProbeTarget,
  runShouldFail,
  verdictForUnprobed,
} from "../../scripts/verify-source-feeds.js";
import { SOURCE_REGISTRY } from "../sources/catalog.js";

function row(id: string) {
  const found = SOURCE_REGISTRY.find((source) => source.id === id);
  if (!found) throw new Error(`missing registry row ${id}`);
  return found;
}

describe("verify-source-feeds URL resolution", () => {
  it("reads the config key the adapter is configured with", () => {
    // rssAdapter reads config.feed. xaiAdapter hardcodes
    // SITEMAP_URL = "https://x.ai/sitemap.xml" and ignores
    // config (fetchItems(_config, ...)). The catalog stores that
    // same URL at config.sitemap, which is the string this probe
    // fetches.
    expect(resolveProbeTarget(row("openai"))).toEqual({
      action: "probe",
      key: "feed",
      url: "https://openai.com/news/rss.xml",
    });
    expect(resolveProbeTarget(row("xai"))).toEqual({
      action: "probe",
      key: "sitemap",
      url: "https://x.ai/sitemap.xml",
    });
  });

  it("skips adapters with no single public URL", () => {
    for (const id of [
      "hn",
      "anthropic",
      "huggingnews",
      "marketbrief",
      "lobsters",
    ]) {
      const target = resolveProbeTarget(row(id));
      expect(target.action).toBe("skip");
      if (target.action === "probe") continue;
      expect(runShouldFail([verdictForUnprobed(target)])).toBe(false);
    }
  });

  it("fails a typo'd source type, and that verdict fails the run", () => {
    const target = resolveProbeTarget({
      type: "rsss",
      config: { feed: "https://example.com/rss.xml" },
    });
    expect(target).toEqual({
      action: "fail",
      error: 'unknown source type "rsss"',
    });
    if (target.action === "probe") throw new Error("typo was probed");
    expect(runShouldFail([verdictForUnprobed(target)])).toBe(true);
  });

  it("still fails an rss row that has no feed URL", () => {
    expect(
      resolveProbeTarget({
        type: "rss",
        config: { homepage: "https://example.com" },
      })
    ).toEqual({ action: "fail", error: "no feed URL in registry config" });
  });
});
