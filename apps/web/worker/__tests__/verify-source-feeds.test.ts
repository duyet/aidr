import { describe, expect, it } from "vitest";
import {
  resolveProbeTarget,
  runShouldFail,
} from "../../scripts/verify-source-feeds.js";
import { SOURCE_REGISTRY } from "../sources/catalog.js";

function row(id: string) {
  const found = SOURCE_REGISTRY.find((source) => source.id === id);
  if (!found) throw new Error(`missing registry row ${id}`);
  return found;
}

describe("verify-source-feeds URL resolution", () => {
  it("reads the config key the adapter is configured with", () => {
    // rssAdapter reads config.feed. The xAI row is config.sitemap; the
    // adapter fetches that same sitemap (it does not read config.feed).
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

  it("skips adapters with no single public URL, and a skip does not fail the run", () => {
    for (const id of [
      "hn",
      "anthropic",
      "huggingnews",
      "marketbrief",
      "lobsters",
    ]) {
      expect(resolveProbeTarget(row(id)).action).toBe("skip");
    }
    expect(runShouldFail(["SKIP", "PASS"])).toBe(false);
    expect(runShouldFail(["SKIP"])).toBe(false);
    expect(runShouldFail(["FAIL", "SKIP"])).toBe(true);
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
