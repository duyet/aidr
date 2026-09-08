import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { llmsTxt, llmsTxtResponse } from "./llms-txt";
import { buildSitemapXml, staticSitemapUrls } from "./sitemap";
import { SITE_URL } from "./site";

const here = dirname(fileURLToPath(import.meta.url));

describe("Worker discovery entry", () => {
  it("serves /llms.txt from the same fetch path as robots/sitemap", () => {
    const src = readFileSync(join(here, "../server.ts"), "utf8");
    expect(src).toContain('path === "/llms.txt"');
    expect(src).toContain("llmsTxtResponse");
    expect(src).toContain('path === "/sitemap.xml"');
    expect(src).toContain('path === "/robots.txt"');
  });

  it("llms.txt response is non-empty aidr guidance", async () => {
    const res = llmsTxtResponse();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(llmsTxt());
    expect(body).toContain("aidr.today");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("sitemap builder still emits urlset including /extension and /submit", () => {
    const xml = buildSitemapXml(staticSitemapUrls());
    expect(xml).toContain("<urlset");
    expect(xml).toContain(`${SITE_URL}/extension`);
    expect(xml).toContain(`${SITE_URL}/submit`);
  });
});
