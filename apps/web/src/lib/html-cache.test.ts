import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSET_RETENTION_MS } from "./deploy-assets";
import {
  EDGE_CACHE_FRESH_MAX_S,
  EDGE_CACHE_STALE_S,
  edgeCacheKey,
} from "./edge-cache";

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Files whose cache-control literals serve HTML, each with a page it serves.
 * The page decides whether the Worker cache (`caches.default`) sits in front
 * of the CDN, which adds a layer to the lifetime.
 */
const HTML_POLICY_FILES: Record<string, string> = {
  "src/lib/locale-response.ts": "/?lang=en",
  "src/routes/$slug.tsx": "/74c9e10c?lang=en",
  "src/routes/calendar.tsx": "/calendar?lang=en",
  "src/routes/weeks.tsx": "/weeks?lang=en",
  "src/lib/day-archive.ts": "/date/2026-01-01?lang=en",
  "src/lib/week.ts": "/week/2026-W01?lang=en",
  "src/routes/api/subscribe.preview.ts": "/api/subscribe/preview?lang=en",
};

/** Files whose cache-control literals never serve a page that loads `/assets/*`. */
const NON_HTML_FILES = new Set([
  "src/lib/agent-discovery.ts",
  "src/lib/feed-freshness.ts",
  "src/lib/lang.ts",
  "src/lib/llms-txt.ts",
  "src/lib/og-cache.ts",
  "src/lib/page-markdown.ts",
  "src/lib/public-api.ts",
  "src/lib/rss.ts",
  "src/lib/sitemap.ts",
  "src/lib/story-markdown.ts",
  "src/lib/system-api.ts",
  "src/routes/api/feed.ts",
  "src/routes/api/health.ts",
  "src/routes/api/og.$id.tsx",
  "src/routes/api/og.date.$date.tsx",
  "src/routes/api/story.$id.ts",
  "src/routes/api/thumb.$id.ts",
  "worker/public-assets.ts",
]);

/**
 * The zone's Browser Cache TTL. A Worker-cache hit reaches the browser with
 * `max-age=14400` in place of the Worker's `max-age=60` (seen on `/?lang=en`
 * with `x-aidr-cache: HIT`, 2026-10-14). CDN hits of pages the Worker cache
 * skips keep the Worker's value.
 */
const ZONE_BROWSER_TTL_S = 14_400;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const LIFETIME_LITERAL =
  /(["'`])([^"'`\n]*(?:max-age|s-maxage|stale-while-revalidate)=\d+[^"'`\n]*)\1/g;

const cacheLiterals = new Map<string, string[]>();
for (const file of ["src", "worker"].flatMap((dir) =>
  sourceFiles(join(WEB_ROOT, dir))
)) {
  const literals = [
    ...readFileSync(file, "utf8").matchAll(LIFETIME_LITERAL),
  ].map((match) => match[2]);
  if (literals.length > 0)
    cacheLiterals.set(relative(WEB_ROOT, file), literals);
}

function seconds(cacheControl: string, directive: string): number {
  const match = new RegExp(`(?:^|[\\s,])${directive}=(\\d+)`).exec(
    cacheControl
  );
  return match ? Number(match[1]) : 0;
}

/**
 * Longest a copy of this HTML can be served after it was rendered. The Worker
 * cache holds an entry for its `s-maxage` (capped) plus the stale window it
 * serves while revalidating. The CDN restarts `age` at 0 when it stores a
 * Worker-cache hit, so the two layers add; a browser counts from the CDN's
 * `age`, so it overlaps the CDN layer.
 */
function htmlLifetimeSeconds(cacheControl: string, samplePage: string): number {
  const workerCached =
    edgeCacheKey(
      new Request(`https://aidr.today${samplePage}`, {
        headers: { accept: "text/html" },
      })
    ) !== null;
  const sMaxAge = seconds(cacheControl, "s-maxage");
  const stale = seconds(cacheControl, "stale-while-revalidate");
  const browser = workerCached
    ? Math.max(seconds(cacheControl, "max-age"), ZONE_BROWSER_TTL_S)
    : seconds(cacheControl, "max-age");
  return (
    (workerCached
      ? Math.min(sMaxAge, EDGE_CACHE_FRESH_MAX_S) + EDGE_CACHE_STALE_S
      : 0) + Math.max(sMaxAge + stale, browser + stale)
  );
}

describe("HTML cache lifetime", () => {
  it("classifies every file that sets a cache lifetime", () => {
    const unclassified = [...cacheLiterals.keys()].filter(
      (file) => !(file in HTML_POLICY_FILES || NON_HTML_FILES.has(file))
    );
    expect(unclassified).toEqual([]);
  });

  // Cached HTML names the build's hashed chunks. A copy that outlives the
  // carried chunks loads 404s and never hydrates (issue #702).
  it.each(
    Object.entries(HTML_POLICY_FILES).flatMap(([file, page]) =>
      (cacheLiterals.get(file) ?? []).map((cc) => [file, cc, page] as const)
    )
  )("%s %j stays inside asset retention", (_, cacheControl, page) => {
    expect(htmlLifetimeSeconds(cacheControl, page) * 1000).toBeLessThanOrEqual(
      ASSET_RETENTION_MS
    );
  });

  it("finds a policy in every HTML file it lists", () => {
    const empty = Object.keys(HTML_POLICY_FILES).filter(
      (file) => !cacheLiterals.has(file)
    );
    expect(empty).toEqual([]);
  });

  it("adds the Worker cache layer for pages behind it", () => {
    const cc = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
    // 1h stale window: a quiet colo stays about two 30-minute editions behind.
    expect(htmlLifetimeSeconds(cc, "/?lang=en")).toBe(
      300 + 3600 + 14_400 + 600
    );
    expect(htmlLifetimeSeconds(cc, "/date/2026-01-01?lang=en")).toBe(
      300 + 3600 + 14_400 + 600
    );
  });
});
