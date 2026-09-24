import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = readFileSync(join(here, "../routes/__root.tsx"), "utf8");
const subscribe = readFileSync(join(here, "../routes/subscribe.tsx"), "utf8");
const footer = readFileSync(join(here, "NewsFooter.tsx"), "utf8");

describe("subscribe footer freshness path", () => {
  it("does not use the full feed request for the global freshness label", () => {
    expect(root).toContain("<NewsFooter />");
    expect(subscribe).toContain("DeliverPage");
    expect(footer).toContain("fetchFeedFreshnessOnce");
    expect(footer).toContain("getCachedFeedFreshness");
    expect(footer).not.toContain("fetchFeedOnce");
  });
});
