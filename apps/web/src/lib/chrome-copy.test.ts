import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHROME_WEB_STORE_URL,
  EXTENSION_PATH,
  GITHUB_ALGORITHM_PATH,
  GITHUB_ALGORITHM_URL,
  GITHUB_URL,
  SITE_SLOGAN,
} from "./site";

const here = dirname(fileURLToPath(import.meta.url));

describe("site chrome copy", () => {
  it("uses the ranked-and-summary slogan, not translated hourly", () => {
    expect(SITE_SLOGAN).toBe("AI news ranked and summary");
    const footer = readFileSync(join(here, "../routes/__root.tsx"), "utf8");
    expect(footer).toContain("SITE_SLOGAN");
    expect(footer).not.toContain("translated hourly");
    expect(footer).not.toContain("Blog");
    expect(footer).toContain("duyet.net");
    expect(footer).toContain("EXTENSION_PATH");
    expect(footer).toContain("/data");
    expect(footer).toContain("Data / Pipeline");
    expect(footer).not.toContain('label: "Brand"');
    expect(footer).not.toContain('to: "/brand"');
    expect(footer).not.toContain("CHROME_WEB_STORE_URL");
  });

  it("points the header Chrome control at /subscribe, not the Web Store URL", () => {
    expect(EXTENSION_PATH).toBe("/subscribe");
    const header = readFileSync(
      join(here, "../components/HeaderBar.tsx"),
      "utf8"
    );
    expect(header).toContain("EXTENSION_PATH");
    expect(header).toContain("RiChromeLine");
    expect(header).not.toContain("CHROME_WEB_STORE_URL");
    expect(header).not.toContain(CHROME_WEB_STORE_URL);
    expect(header).not.toContain('label: "Blog"');
    expect(header).not.toContain('label: "Subscribe"');
    expect(header).toContain('href: "/brand"');
    expect(header).toContain('label: "Brand"');
    expect(header).toContain('label: "Get AI;DR"');
  });

  it("points GitHub and ALGORITHM at duyet/aidr apps/web, not the old monorepo news app", () => {
    expect(GITHUB_URL).toBe("https://github.com/duyet/aidr");
    expect(GITHUB_ALGORITHM_PATH).toBe("apps/web/ALGORITHM.md");
    expect(GITHUB_ALGORITHM_URL).toBe(
      "https://github.com/duyet/aidr/blob/master/apps/web/ALGORITHM.md"
    );
    const files = [
      join(here, "../routes/about.tsx"),
      join(here, "../routes/mcp.tsx"),
      join(here, "../components/system/RankingExplainer.tsx"),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toContain("github.com/duyet/monorepo");
      expect(src).not.toContain("apps/news");
    }
    const explainer = readFileSync(
      join(here, "../components/system/RankingExplainer.tsx"),
      "utf8"
    );
    expect(explainer).toContain("GITHUB_ALGORITHM_URL");
    expect(explainer).toContain("min(sourceCount, 8)");
  });
});
