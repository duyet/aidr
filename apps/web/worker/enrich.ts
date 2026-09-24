import {
  buildMediaManifest,
  canonicalizeMediaUrl,
  firstImageUrl,
  type MediaCandidate,
  type MediaManifest,
  parseMediaMetadata,
} from "./media.js";
import type { FetchedItem } from "./sources/types.js";

const MAX_ENRICH_FETCHES = 20;
const ENRICH_BATCH_SIZE = 4;
const ENRICH_FETCH_TIMEOUT_MS = 8_000;
/** Read at most this many bytes of the article HTML — og/description meta
 * tags live in <head>, no need to download the whole page. */
const MAX_HTML_BYTES = 100_000;

export interface OgData {
  imageUrl?: string;
  description?: string;
  /** Present when the page exposes more than one image or any video. */
  mediaManifest?: MediaManifest;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeHtmlEntitiesOnce(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(
      /&([a-zA-Z]+);/g,
      (whole, name: string) => NAMED_ENTITIES[name] ?? whole
    );
}

/** Decodes numeric (decimal/hex) and the common named HTML entities found
 * in meta content. Repeats so double-escaped `&amp;amp;` query strings
 * become a real `&`. Unknown named entities are left as-is. */
export function decodeHtmlEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Hostname-only SSRF guard before server-side fetches. No DNS resolution
 * in Workers — blocks obvious private/link-local targets by name. */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return false;
  }
  if (/^(10|127)\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false;
  if (/^(::1|fc00:|fd[0-9a-f]{2}:|fe80:)/i.test(h)) return false;
  return true;
}

/** Matches a <meta> tag's `content` regardless of whether `content` comes
 * before or after the property/name attribute, single- or double-quoted. */
function extractMetaContent(
  html: string,
  attr: "property" | "name",
  key: string
): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contentThenAttr = new RegExp(
    `<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${escapedKey}["']`,
    "i"
  );
  const attrThenContent = new RegExp(
    `<meta[^>]*\\b${attr}=["']${escapedKey}["'][^>]*\\bcontent=["']([^"']*)["']`,
    "i"
  );
  return (
    html.match(attrThenContent)?.[1] ?? html.match(contentThenAttr)?.[1] ?? null
  );
}

/**
 * Pure HTML parsing: extracts og:image (absolute http(s) URLs only — a
 * relative or non-http(s) value is dropped rather than resolved, since we
 * don't reliably know the page's base URL) and a description from
 * og:description, falling back to <meta name="description">. HTML
 * entities in the description and og:image URL are decoded.
 */
export function parseOgTags(html: string): OgData {
  const manifest = buildMediaManifest(parseMediaMetadata(html));
  const imageUrl = firstImageUrl(manifest) ?? undefined;

  const rawDescription =
    extractMetaContent(html, "property", "og:description") ??
    extractMetaContent(html, "name", "description");
  const description = rawDescription
    ? decodeHtmlEntities(rawDescription).trim() || undefined
    : undefined;

  const hasUsefulManifest =
    manifest.assets.some((asset) => asset.type === "video") ||
    manifest.assets.filter((asset) => asset.type === "image").length > 1;
  return {
    imageUrl,
    description,
    ...(hasUsefulManifest ? { mediaManifest: manifest } : {}),
  };
}

async function readCappedText(
  res: Response,
  capBytes: number
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, capBytes);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < capBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  try {
    await reader.cancel();
  } catch {
    // best-effort; nothing to do if the stream is already closed
  }

  const buf = new Uint8Array(Math.min(total, capBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= buf.length) break;
    const remaining = buf.length - offset;
    buf.set(chunk.subarray(0, remaining), offset);
    offset += Math.min(chunk.length, remaining);
  }
  return new TextDecoder().decode(buf);
}

/** Fetches `url` and extracts og:image/description. Only text/html
 * responses are read. Any failure (network, non-2xx, wrong content type)
 * resolves to `{}`, never throws. */
export async function fetchOgData(url: string): Promise<OgData> {
  if (!isFetchableUrl(url)) {
    try {
      console.warn("enrich: blocked url", new URL(url).hostname);
    } catch {
      console.warn("enrich: blocked url", url);
    }
    return {};
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ENRICH_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; duyet-news-bot/1.0)" },
    });
    if (!res.ok) return {};

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) return {};

    const html = await readCappedText(res, MAX_HTML_BYTES);
    return parseOgTags(html);
  } catch (error) {
    console.error(`enrich: og fetch failed for ${url}:`, error);
    return {};
  }
}

function mediaCandidatesFromOg(
  data: OgData,
  priority: number
): MediaCandidate[] {
  if (data.mediaManifest) {
    return data.mediaManifest.assets.map((asset, index) => ({
      ...asset,
      priority: priority + index / 1000,
    }));
  }
  return data.imageUrl ? [{ type: "image", url: data.imageUrl, priority }] : [];
}

function normalizeExistingMedia(item: FetchedItem): void {
  const existing = buildMediaManifest([
    ...(item.media ?? []),
    ...(item.mediaManifest?.assets ?? []),
    ...(item.imageUrl
      ? [{ type: "image" as const, url: item.imageUrl, priority: 0 }]
      : []),
  ]);
  const legacyImageUrl = item.imageUrl;
  if (existing.assets.length > 0) item.mediaManifest = existing;
  item.imageUrl =
    firstImageUrl(existing) ??
    (legacyImageUrl
      ? (canonicalizeMediaUrl(legacyImageUrl) ?? undefined)
      : undefined);
}

function hasMedia(item: FetchedItem): boolean {
  return (
    Boolean(item.imageUrl) ||
    (item.media?.length ?? 0) > 0 ||
    (item.mediaManifest?.assets.length ?? 0) > 0
  );
}

/**
 * Mutates `items` in place, filling in summary/media fields from the article
 * and its original source page. Legacy `imageUrl` is retained as the primary
 * image URL while `mediaManifest` stores the bounded, ordered candidates.
 * Only the first MAX_ENRICH_FETCHES items needing content are fetched, in
 * batches of ENRICH_BATCH_SIZE.
 */
export async function enrichMissingContent(
  items: FetchedItem[]
): Promise<void> {
  for (const item of items) normalizeExistingMedia(item);
  const candidates = items.filter((item) => !item.summary || !hasMedia(item));
  const toEnrich = candidates.slice(0, MAX_ENRICH_FETCHES);

  for (let i = 0; i < toEnrich.length; i += ENRICH_BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + ENRICH_BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        const fetched: MediaCandidate[] = [];
        const originalUrl = item.sources?.find(
          (source) => source.kind === "source" && source.url
        )?.url;
        if (originalUrl && originalUrl !== item.url) {
          const sourceOg = await fetchOgData(originalUrl);
          fetched.push(...mediaCandidatesFromOg(sourceOg, 10));
        }

        const og = await fetchOgData(item.url);
        fetched.push(...mediaCandidatesFromOg(og, 20));
        if (!item.summary && og.description) item.summary = og.description;

        const manifest = buildMediaManifest([
          ...(item.media ?? []),
          ...(item.mediaManifest?.assets ?? []),
          ...(item.imageUrl
            ? [{ type: "image" as const, url: item.imageUrl, priority: 0 }]
            : []),
          ...fetched,
        ]);
        if (manifest.assets.length > 0) {
          item.mediaManifest = manifest;
          item.imageUrl = firstImageUrl(manifest) ?? item.imageUrl;
        }
      })
    );
  }
}
