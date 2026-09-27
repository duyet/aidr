import { fetchWithSafeRedirects } from "../enrich.js";
import {
  buildMediaManifest,
  type MediaCandidate,
  primaryThumbnailUrl,
} from "../media.js";
import { KEYWORD_FILTERS } from "./keywords.js";
import type { FetchedItem, SourceAdapter, SourceLanguage } from "./types.js";

/**
 * Thrown by the adapter when a fetch cannot produce items for a reason the
 * per-source observability layer must distinguish from "the feed was quiet".
 *
 * The workflow catches this and records the typed `reason`; without it a 403
 * and a genuinely empty feed are both just `[]`, which is precisely the
 * invisibility #230 is about. The message is always passed through
 * `sanitizeError` before it can reach D1 or an API response, so no URL,
 * header, or provider body leaks.
 *
 * Both reasons are thrown, so the fetch step's existing
 * `retries: { limit: 3, backoff: "exponential" }` applies to both. That is
 * deliberate for `fetch_failed` (429/5xx are transient and the backoff is the
 * right response) and slightly wasteful for `parse_failed` (a 200 HTML page is
 * deterministic, so retrying it cannot succeed). The cost is two extra GETs
 * against a publisher's own feed, once per hour, on a per-source step that
 * runs in parallel with its group — and the payoff is that a feed which has
 * quietly become an HTML error page is visible on the dashboard the next hour
 * instead of after a week of silence.
 */
export class SourceFetchError extends Error {
  readonly reason: "fetch_failed" | "parse_failed";

  constructor(reason: "fetch_failed" | "parse_failed", message: string) {
    super(message);
    this.name = "SourceFetchError";
    this.reason = reason;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  );
  if (!match) return null;
  const text = decodeXml(match[1]);
  return text || null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkHref(block: string): string | null {
  const match = block.match(/<link[^>]*href="([^"]+)"/i);
  const href = match?.[1]?.trim();
  return href || null;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([\w:-]+)\s*=\s*["']([^"']*)["']/g;
  let match: RegExpExecArray | null = pattern.exec(tag);
  while (match !== null) {
    result[match[1].toLowerCase()] = decodeXml(match[2]);
    match = pattern.exec(tag);
  }
  return result;
}

function mediaCandidatesFromBlock(block: string): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const poster = block.match(
    /<(?:media:thumbnail|thumbnail)\b[^>]*(?:url|href)\s*=\s*["']([^"']+)["']/i
  )?.[1];
  const tags =
    block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = attributes(tag);
    const url = attrs.url ?? attrs.href ?? attrs.src;
    if (!url) continue;
    const typeHint = `${attrs.type ?? ""} ${attrs.medium ?? ""}`.toLowerCase();
    const isVideo =
      typeHint.includes("video") ||
      /\.(?:mp4|m4v|mov|webm)(?:$|[?#])/i.test(url);
    const isImage =
      /^<(?:media:thumbnail|thumbnail)\b/i.test(tag) ||
      typeHint.includes("image") ||
      /\.(?:jpe?g|png|webp|gif|avif|svg)(?:$|[?#])/i.test(url);
    if (!isVideo && !isImage) continue;
    candidates.push({
      type: isVideo ? "video" : "image",
      url,
      ...(isVideo && poster ? { poster_url: poster } : {}),
    });
  }
  return candidates;
}

/**
 * Apply the config-driven flood gate to an already parsed + since-filtered
 * list. Exported for the arXiv gate test and for the live feed verifier, so
 * the production ordering (filter, then cap) is what gets asserted rather
 * than a re-implementation of it.
 *
 * Order matters and is the point of the gate:
 *
 * 1. `keywordFilter` runs first, so a high-volume firehose (arXiv emits
 *    hundreds of submissions a day) is cut down to the AI-relevant slice
 *    *before* anything is counted.
 * 2. `maxItems` then takes the **newest** N of what survived. Newest-first is
 *    what makes the cap safe: `worker/workflow.ts` re-reads a 26-hour window
 *    every hour, so at the next run the head of the feed is exactly the
 *    handful of items published since the last run. The cap therefore samples
 *    the live edge and lets the dedupe pass drop the rest, instead of
 *    re-reading (and re-scoring) the same head of the feed forever.
 */
export function applyFloodGate(
  items: FetchedItem[],
  config: Record<string, unknown>
): FetchedItem[] {
  const named =
    typeof config.keywordFilter === "string"
      ? KEYWORD_FILTERS[config.keywordFilter.trim().toLowerCase()]
      : undefined;
  const filtered = named
    ? items.filter((item) => named.test(item.title))
    : items;
  const rawMax = config.maxItems;
  const max =
    typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0
      ? Math.floor(rawMax)
      : Number.POSITIVE_INFINITY;
  if (filtered.length <= max) return filtered;
  return [...filtered]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, max);
}

/**
 * Per-host minimum spacing between fetches.
 *
 * The workflow fetches sources in parallel groups of 4, so two `rss` rows
 * pointed at the same host hit it at the same instant. arXiv answers that
 * with a bare HTTP 406 (measured live while building this — the PR records
 * the evidence), so a row can declare `minRequestIntervalMs` and the adapter
 * serialises same-host requests instead of racing.
 *
 * Keyed by host, so unrelated sources keep full parallelism. The FIRST
 * request to a host is never delayed — the delay is measured from the previous
 * request's *start*, so a slow fetch does not push the next one further out
 * than necessary, and an isolate that has never touched a host pays nothing.
 */
const hostQueues = new Map<string, Promise<unknown>>();
const hostLastStart = new Map<string, number>();

async function pacedFetch(
  url: string,
  intervalMs: number,
  init: RequestInit
): Promise<Response> {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return fetchWithSafeRedirects(url, init);
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return fetchWithSafeRedirects(url, init);
  }
  const previous = hostQueues.get(host);
  const run = (async () => {
    if (previous) {
      // The predecessor is awaited (not just its result) so two same-host
      // requests cannot overlap, and a rejected predecessor still releases the
      // chain instead of stalling this host forever.
      await previous.catch(() => undefined);
      const lastStart = hostLastStart.get(host);
      if (lastStart !== undefined) {
        const waitMs = lastStart + intervalMs - Date.now();
        if (waitMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }
    hostLastStart.set(host, Date.now());
    return fetchWithSafeRedirects(url, init);
  })();
  // The chain stores a *settled-forever* wrapper: awaiting it never throws, so
  // one failed fetch cannot poison the queue for the rest of the isolate.
  const chainEntry = run.then(
    () => undefined,
    () => undefined
  );
  hostQueues.set(host, chainEntry);
  try {
    return await run;
  } finally {
    // Only the tail of the chain clears the bookkeeping, so a long-lived
    // isolate does not accumulate one entry per host forever.
    if (hostQueues.get(host) === chainEntry) {
      hostQueues.delete(host);
      hostLastStart.delete(host);
    }
  }
}

/** Test helper — the pacing queue is module-level state, exactly like the
 *  seed's `seeded` flag, and would otherwise leak between test files. */
export function resetRssHostQueues(): void {
  hostQueues.clear();
  hostLastStart.clear();
}

export function parseRssItems(xml: string): FetchedItem[] {
  const chunks =
    xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const items: FetchedItem[] = [];
  for (const chunk of chunks) {
    const title = tagText(chunk, "title");
    const url =
      tagText(chunk, "link") ??
      linkHref(chunk) ??
      tagText(chunk, "guid") ??
      tagText(chunk, "id");
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    const pub =
      tagText(chunk, "pubDate") ??
      tagText(chunk, "published") ??
      tagText(chunk, "updated");
    const publishedMs = pub ? Date.parse(pub) : Number.NaN;
    const publishedAt = Number.isFinite(publishedMs) ? publishedMs : Date.now();
    const rawSummary =
      tagText(chunk, "description") ?? tagText(chunk, "summary");
    const summary = rawSummary
      ? stripHtml(rawSummary).slice(0, 1200)
      : undefined;
    const media = mediaCandidatesFromBlock(chunk);
    const mediaManifest = buildMediaManifest(media);
    const imageUrl = primaryThumbnailUrl(mediaManifest);
    items.push({
      url,
      title,
      summary: summary || undefined,
      publishedAt,
      ...(media.length > 0 ? { media } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(mediaManifest.assets.length > 0 ? { mediaManifest } : {}),
      sources: [
        { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
      ],
    });
  }
  return items;
}

/**
 * Generic RSS (`<item>`) and Atom (`<entry>`, `<link href>`) feeds.
 *
 * Config: `{ "feed": "https://…/rss.xml", … }`. Optional keys — all of them
 * documented in `worker/sources/catalog.ts`, which is the list operators and
 * migrations actually read:
 *
 * - `homepage` — publisher home (used by the `/data` sources table for the
 *   favicon). Not read here.
 * - `sourceLang` — `"en"` (default) or `"vi"`. `"vi"` is *explicit* metadata:
 *   it is what puts an item on the real VI→EN translation-QA path in
 *   `worker/translation-qa.ts` (an English candidate is generated by
 *   `ANYROUTER_ENGLISH_TRANSLATE_MODEL` and then independently reviewed by
 *   `ANYROUTER_REVIEW_MODEL`). It is never inferred from Vietnamese
 *   diacritics, per ALGORITHM.md § Translate.
 * - `maxItems` / `keywordFilter` — the flood gate, see `applyFloodGate`.
 * - `minRequestIntervalMs` — per-host pacing, see `pacedFetch`.
 */
export const rssAdapter: SourceAdapter = {
  type: "rss",

  async fetchItems(config, sinceEpochSec) {
    const feed = typeof config.feed === "string" ? config.feed.trim() : "";
    if (!feed) return [];
    const intervalMs =
      typeof config.minRequestIntervalMs === "number"
        ? config.minRequestIntervalMs
        : 0;
    let res: Response;
    try {
      res = await pacedFetch(feed, intervalMs, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });
    } catch (error) {
      // Transport-level failure (DNS, TLS, timeout). Surfaced as a typed
      // error so the run records `fetch_failed` instead of a bare `[]`.
      throw new SourceFetchError(
        "fetch_failed",
        error instanceof Error ? error.message : "rss fetch failed"
      );
    }
    if (!res.ok) {
      throw new SourceFetchError(
        "fetch_failed",
        `rss feed returned ${res.status}`
      );
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const xml = await res.text();
    // A 200 that is really an HTML error/challenge page is the most common
    // way a feed rots silently. Treat it as unparseable rather than empty so
    // the dashboard says why.
    if (contentType.includes("text/html") && !/<(?:item|entry)\b/i.test(xml)) {
      throw new SourceFetchError(
        "parse_failed",
        "rss feed returned an HTML document"
      );
    }
    const sinceMs = sinceEpochSec * 1000;
    const inWindow = parseRssItems(xml).filter(
      (item) => item.publishedAt >= sinceMs
    );
    const sourceLang = sourceLangOf(config);
    return applyFloodGate(inWindow, config).map((item) => ({
      ...item,
      ...(sourceLang ? { sourceLang } : {}),
    }));
  },
};

/** Only the two languages the pipeline can actually score and translate.
 *  Anything else is ignored rather than trusted — a typo in a config must
 *  not put an item on the wrong side of the VI→EN QA path. */
function sourceLangOf(config: Record<string, unknown>): SourceLanguage | null {
  return config.sourceLang === "vi" ? "vi" : null;
}
