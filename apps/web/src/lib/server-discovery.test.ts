import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { llmsTxt, llmsTxtResponse } from "./llms-txt";
import { SITE_URL } from "./site";
import { buildSitemapXml, staticSitemapUrls } from "./sitemap";
import { isStoryMarkdownPath } from "./story-markdown";

const here = dirname(fileURLToPath(import.meta.url));

describe("Worker discovery entry", () => {
  it("serves /llms.txt from the same fetch path as robots/sitemap", () => {
    const src = readFileSync(join(here, "../server.ts"), "utf8");
    expect(src).not.toContain("aliasRedirect");
    expect(src).toContain("handlePublicAsset");
    expect(src).toContain('path === "/llms.txt"');
    expect(src).toContain("llmsTxtResponse");
    expect(src).toContain('path === "/sitemap.xml"');
    expect(src).toContain('path === "/robots.txt"');
    expect(src).toContain('path === "/extension"');
    expect(src).toContain('dest.pathname = "/subscribe"');
    expect(src).toContain("legacyStoryRedirectPath");
  });

  it("routes the bounded story Markdown surface before the SPA fallback", () => {
    const src = readFileSync(join(here, "../server.ts"), "utf8");
    expect(src).toContain("isStoryMarkdownPath(path)");
    expect(src).toContain("handleStoryMarkdownRequest(request, env?.DB)");
    expect(src.indexOf("isStoryMarkdownPath(path)")).toBeLessThan(
      src.indexOf("return handlePublicCors")
    );
  });

  it("claims double-encoded and malformed Markdown paths in the Worker", () => {
    expect(isStoryMarkdownPath("/api/story/abcdef12%252emd")).toBe(true);
    expect(isStoryMarkdownPath("/api%252Fstory/abcdef12%252emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/%252emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/%ZZ.md")).toBe(true);
  });

  it("llms.txt response is non-empty aidr guidance", async () => {
    const res = llmsTxtResponse();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(llmsTxt());
    expect(body).toContain("aidr.today");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("sitemap builder still emits urlset including /subscribe and /submit", () => {
    const xml = buildSitemapXml(staticSitemapUrls());
    expect(xml).toContain("<urlset");
    expect(xml).toContain(`${SITE_URL}/subscribe`);
    expect(xml).toContain(`${SITE_URL}/submit`);
  });
});
