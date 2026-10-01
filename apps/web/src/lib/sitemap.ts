import type { DbReader } from "./db";
import { DEFAULT_LANG } from "./lang";
import { isLocalizedSsrPath } from "./locale-routing";
import { absoluteSiteUrl, withLang } from "./locale-url";
import { PAGE_MARKDOWN_PATHS } from "./page-markdown";
import { NEWS_SITEMAP_PATH, SITE_URL } from "./site";
import { storyPath } from "./slug";
import type { Lang } from "./types";

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/about",
  "/brand",
  "/changelog",
  "/privacy",
  "/terms",
  "/mcp",
  "/contribute",
  "/subscribe",
  "/data",
] as const;

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  /** Absolute `<image:image><image:loc>`; adds the image namespace. */
  image?: string;
  imageTitle?: string;
}

/**
 * Characters XML 1.0 forbids outright in a document (C0 controls other than
 * tab/LF/CR, plus U+FFFE/U+FFFF). Publisher text reaches this module from the
 * open web, so one stray control byte would make the whole document
 * unparseable and every URL in it undiscoverable. Dropped rather than
 * escaped: there is no legal escape for them.
 */
const XML_ILLEGAL_CHARS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * Escape the five markup-sensitive characters and drop XML-illegal control
 * characters. Shared by the sitemap, the sitemap index, the news sitemap, and
 * the RSS document so none of them can fork the convention.
 */
export function escapeXml(value: string): string {
  return value
    .replace(XML_ILLEGAL_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const SITEMAP_IMAGE_NAMESPACE =
  "http://www.google.com/schemas/sitemap-image/1.1";

export function buildSitemapXml(urls: SitemapUrl[]): string {
  // The image extension namespace is declared only when an entry uses it, so
  // the plain static urlset stays byte-identical to what it always emitted.
  const withImages = urls.some((url) => url.image);
  const entries = urls
    .map((url) => {
      const lastmod = url.lastmod
        ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`
        : "";
      const changefreq = url.changefreq
        ? `\n    <changefreq>${escapeXml(url.changefreq)}</changefreq>`
        : "";
      const priority = url.priority
        ? `\n    <priority>${escapeXml(url.priority)}</priority>`
        : "";
      const image = url.image
        ? `\n    <image:image>\n      <image:loc>${escapeXml(url.image)}</image:loc>${
            url.imageTitle
              ? `\n      <image:title>${escapeXml(url.imageTitle)}</image:title>`
              : ""
          }\n    </image:image>`
        : "";
      return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>${lastmod}${changefreq}${priority}${image}\n  </url>`;
    })
    .join("\n");
  const imageNs = withImages ? ` xmlns:image="${SITEMAP_IMAGE_NAMESPACE}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNs}>\n${entries}\n</urlset>\n`;
}

/**
 * robots.txt is parsed by strict readers: one unknown directive fails the whole
 * file (Lighthouse: "robots.txt is not valid — 1 error found, Line 5, Unknown
 * directive"). `LLMs-txt` is not a standard directive, so it is kept as a
 * comment. `/llms.txt` stays discoverable through the agent-discovery headers
 * in `lib/agent-discovery.ts`; do not add any other non-standard directive.
 */
export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n# LLMs-txt: ${SITE_URL}/llms.txt\n`;
}

/**
 * `YYYY-MM-DD` (UTC) for a sitemap `<lastmod>`. Epoch values above 1e12 are
 * milliseconds: the pipeline documents `published_at` as seconds and has
 * already shipped a seconds/ms bug once, so every timestamp written into a
 * sitemap or feed document goes through this one normalizer.
 */
export function sitemapLastmod(
  epoch: number | null | undefined
): string | undefined {
  if (typeof epoch !== "number" || !Number.isFinite(epoch)) return undefined;
  const seconds = epoch > 1e12 ? Math.floor(epoch / 1000) : Math.floor(epoch);
  if (seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * The static pages. `now` is the generation time of the document, used as a
 * single honest `lastmod` for every marketing/static URL — the alternative
 * (no `lastmod` at all) told crawlers these pages never change, and a
 * fabricated per-page date would be worse than both. Nothing here reads D1,
 * which is what makes the fail-closed fallback possible.
 */
export function staticSitemapUrls(now: number = Date.now()): SitemapUrl[] {
  const lastmod = sitemapLastmod(now);
  return SITEMAP_STATIC_PATHS.flatMap((path) => {
    if (isLocalizedSsrPath(path)) {
      return (["vi", "en"] as const).map((lang) => ({
        loc: absoluteSiteUrl(path, lang),
        ...(lastmod ? { lastmod } : {}),
        changefreq: path === "/" ? "hourly" : "weekly",
        priority: path === "/" ? "1.0" : "0.4",
      }));
    }
    return [
      {
        loc: `${SITE_URL}${path}`,
        ...(lastmod ? { lastmod } : {}),
        changefreq: "weekly",
        priority: "0.4",
      },
    ];
  }).concat(
    PAGE_MARKDOWN_PATHS.map((path) => ({
      loc: `${SITE_URL}${path}`,
      ...(lastmod ? { lastmod } : {}),
      changefreq: "weekly" as const,
      priority: "0.3",
    }))
  );
}

/** The generated, always-200 story card used as the sitemap image. */
export function storySitemapImage(id: string): string {
  return `${SITE_URL}${withLang(`/api/og/${id}.png`, DEFAULT_LANG)}`;
}

export function storySitemapUrl(
  item: {
    id: string;
    category: string | null;
    published_at: number;
    /** Latest stored content/media/translation update, epoch seconds. */
    updated_at?: number | null;
  },
  lang: Lang = "vi"
): SitemapUrl {
  // `lastmod` is the newest of publication and any later stored edit, so a
  // corrected summary, a repaired translation, or a backfilled thumbnail all
  // signal an update instead of silently looking frozen at publish time.
  const published = sitemapLastmod(item.published_at);
  const updated = sitemapLastmod(item.updated_at);
  const lastmod =
    published && updated
      ? updated > published
        ? updated
        : published
      : (published ?? updated);
  return {
    loc: absoluteSiteUrl(storyPath(item), lang),
    ...(lastmod ? { lastmod } : {}),
    changefreq: "daily",
    priority: "0.7",
  };
}

export function storySitemapUrls(item: {
  id: string;
  category: string | null;
  published_at: number;
  updated_at?: number | null;
}): SitemapUrl[] {
  const [vi, en] = [storySitemapUrl(item, "vi"), storySitemapUrl(item, "en")];
  // One image per story: the default-locale variant carries the generated
  // card (always 200, 1200×630). The English variant is the same story in
  // another language, not a second image.
  if (vi.loc) {
    return [{ ...vi, image: storySitemapImage(item.id) }, en];
  }
  return [vi, en];
}

export function sitemapResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control":
        "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}

export function robotsResponse(): Response {
  return new Response(robotsTxt(), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

/** Always 200 XML. Any load/build failure falls back to static URLs. */
export async function safeSitemapResponse(
  loadUrls: () => Promise<SitemapUrl[]> | SitemapUrl[]
): Promise<Response> {
  try {
    return sitemapResponse(buildSitemapXml(await loadUrls()));
  } catch (error) {
    console.error("sitemap.xml failed; serving static fallback", error);
    return sitemapResponse(buildSitemapXml(staticSitemapUrls()));
  }
}

// ---------------------------------------------------------------------------
// Sitemap index + date-sharded children
//
// The old flat document selected the 1,000 newest published items and emitted
// nothing else, so every story older than the 1,000th newest was absent from
// the sitemap entirely — a coverage loss for a site whose whole value is its
// archive. `/sitemap.xml` is now a <sitemapindex>: one static child, one child
// per UTC month of publication, and the news sitemap. A month larger than
// `SITEMAP_SHARD_ITEM_LIMIT` splits into `-2`, `-3`, … parts so no child ever
// approaches the 50,000-URL / 50 MiB protocol ceiling.
// ---------------------------------------------------------------------------

/** Items per shard; each item contributes exactly two explicit-locale URLs. */
export const SITEMAP_SHARD_ITEM_LIMIT = 1000;
export const SITEMAP_CHILD_DIR = "/sitemaps";
export const SITEMAP_STATIC_CHILD_PATH = `${SITEMAP_CHILD_DIR}/static.xml`;
const SHARD_MONTH_RE = /^(\d{4}-\d{2})(?:-(\d+))?$/;

export interface SitemapIndexEntry {
  loc: string;
  lastmod?: string;
}

export interface SitemapShard {
  /** `YYYY-MM` in UTC, matching the `strftime` key in the loader query. */
  month: string;
  /** 1-based part index; part 1 omits the suffix. */
  part: number;
}

export function sitemapShardPath(shard: SitemapShard): string {
  const suffix = shard.part > 1 ? `-${shard.part}` : "";
  return `${SITEMAP_CHILD_DIR}/sitemap-${shard.month}${suffix}.xml`;
}

/** Parse a child path back into its shard, or null when it is not one. */
export function parseSitemapShardPath(pathname: string): SitemapShard | null {
  const match = /^\/sitemaps\/sitemap-(\d{4}-\d{2})(?:-(\d+))?\.xml$/.exec(
    pathname
  );
  if (!match) return null;
  const part = match[2] ? Number.parseInt(match[2], 10) : 1;
  if (!Number.isFinite(part) || part < 1 || part > 999) return null;
  return { month: match[1], part };
}

/** How many parts a month needs at `SITEMAP_SHARD_ITEM_LIMIT` items per part. */
export function sitemapShardParts(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.max(1, Math.ceil(count / SITEMAP_SHARD_ITEM_LIMIT));
}

export function buildSitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const children = entries
    .map((entry) => {
      const lastmod = entry.lastmod
        ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : "";
      return `  <sitemap>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${children}\n</sitemapindex>\n`;
}

interface SitemapMonthRow {
  month: string | null;
  count: number;
  /** Newest `published_at` in the month. */
  newest: number | null;
  /** Newest stored content/translation update in the month. */
  updated?: number | null;
}

/**
 * The children of the index, newest month first. `monthCounts` is the grouped
 * count query result; when it is empty the index still lists the static child
 * and the news sitemap, so a crawler always has something valid to fetch.
 */
export function sitemapIndexEntries(
  monthCounts: SitemapMonthRow[],
  now: number = Date.now()
): SitemapIndexEntry[] {
  const generated = sitemapLastmod(now);
  const entries: SitemapIndexEntry[] = [
    {
      loc: `${SITE_URL}${SITEMAP_STATIC_CHILD_PATH}`,
      ...(generated ? { lastmod: generated } : {}),
    },
  ];
  for (const row of monthCounts) {
    if (!row.month || !SHARD_MONTH_RE.test(row.month)) continue;
    // A child's own `lastmod` is when its content last changed, so a later
    // translation/summary correction inside the month moves it too.
    const lastmod = sitemapLastmod(
      Math.max(row.newest ?? 0, row.updated ?? 0) || null
    );
    for (let part = 1; part <= sitemapShardParts(row.count); part += 1) {
      entries.push({
        loc: `${SITE_URL}${sitemapShardPath({ month: row.month, part })}`,
        ...(lastmod ? { lastmod } : {}),
      });
    }
  }
  entries.push({
    loc: `${SITE_URL}${NEWS_SITEMAP_PATH}`,
    ...(generated ? { lastmod: generated } : {}),
  });
  return entries;
}

const MONTH_COUNTS_SQL = `SELECT strftime('%Y-%m', published_at, 'unixepoch') AS month,
       COUNT(*) AS count, MAX(published_at) AS newest,
       MAX(COALESCE((SELECT MAX(t.qa_at) FROM translations t WHERE t.item_id = items.id), 0)) AS updated
FROM items WHERE status = 'published'
GROUP BY month ORDER BY month DESC`;

/**
 * `updated_at` is the newest of publication, the item's own `fetched_at`
 * (when the enriched summary/thumbnail were first persisted), and the latest
 * translation review timestamp. `source_revision` is deliberately not used:
 * it is a monotonic counter with no timestamp column, and adding one is a
 * schema change, which this slice does not make.
 */
const SHARD_ROWS_SQL = `SELECT i.id AS id, i.category AS category,
       i.published_at AS published_at,
       max(i.published_at, COALESCE(i.fetched_at, 0),
           COALESCE((SELECT MAX(t.qa_at) FROM translations t WHERE t.item_id = i.id), 0)) AS updated_at
FROM items i
WHERE i.status = 'published'
  AND strftime('%Y-%m', i.published_at, 'unixepoch') = ?
ORDER BY i.published_at DESC
LIMIT ? OFFSET ?`;

interface SitemapShardRow {
  id: string;
  category: string | null;
  published_at: number;
  updated_at: number | null;
}

export async function loadSitemapMonthCounts(
  db: DbReader
): Promise<SitemapMonthRow[]> {
  const { results } = await db.prepare(MONTH_COUNTS_SQL).all<{
    month: string | null;
    count: number;
    newest: number | null;
    updated: number | null;
  }>();
  return results ?? [];
}

/** One shard's URLs. Every published story in the month is in some part. */
export async function loadSitemapShardUrls(
  db: DbReader,
  shard: SitemapShard
): Promise<SitemapUrl[]> {
  const offset = (shard.part - 1) * SITEMAP_SHARD_ITEM_LIMIT;
  const { results } = await db
    .prepare(SHARD_ROWS_SQL)
    .bind(shard.month, SITEMAP_SHARD_ITEM_LIMIT, offset)
    .all<SitemapShardRow>();
  return (results ?? []).flatMap((row) => storySitemapUrls(row));
}

/** Always 200 XML. A D1 failure degrades to the static child content. */
export async function safeSitemapIndexResponse(
  loadMonths: () => Promise<SitemapMonthRow[]> | SitemapMonthRow[]
): Promise<Response> {
  try {
    return sitemapResponse(
      buildSitemapIndexXml(sitemapIndexEntries(await loadMonths()))
    );
  } catch (error) {
    console.error("sitemap index failed; serving static-only index", error);
    return sitemapResponse(
      buildSitemapIndexXml(sitemapIndexEntries([], Date.now()))
    );
  }
}
