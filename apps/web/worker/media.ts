/**
 * Bounded media metadata for a story.
 *
 * The manifest is intentionally a small, ordered list. The first asset is the
 * primary candidate and the rest are alternates. A video owns its poster URL;
 * a poster is never emitted as a second image asset.
 */

export const MEDIA_MANIFEST_VERSION = 1 as const;
export const MAX_MEDIA_ASSETS = 6;
export const MAX_PUBLIC_MEDIA_ASSETS = 3;
export const MAX_PUBLIC_MEDIA_URL_LENGTH = 512;
export const MAX_MEDIA_URL_LENGTH = 2048;
export const MAX_MEDIA_MANIFEST_JSON_LENGTH = 64_000;

const MAX_ENTITY_PASSES = 3;
const MAX_JSON_LD_DEPTH = 8;
const MAX_JSON_LD_NODES = 100;

export type MediaType = "image" | "video";

export interface MediaCandidate {
  type: MediaType;
  url: string;
  /** A video's single poster/thumbnail URL, if present. */
  poster_url?: string;
  /** Lower values sort first. Never persisted. */
  priority?: number;
}

export type MediaAsset =
  | {
      type: "image";
      url: string;
    }
  | {
      type: "video";
      url: string;
      poster_url?: string;
    };

export interface MediaManifest {
  version: typeof MEDIA_MANIFEST_VERSION;
  assets: MediaAsset[];
}

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref_src",
  "ref_url",
  "source",
  "spm",
]);

const RESIZE_QUERY_KEYS = new Set([
  "auto",
  "crop",
  "dpr",
  "fit",
  "format",
  "h",
  "height",
  "name",
  "q",
  "quality",
  "resize",
  "s",
  "size",
  "w",
  "width",
]);

const BLOCKED_IMAGE_URLS = new Set(["https://huggingnews.com/og-image.png"]);

const ENTITY_NAMES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeUrlEntities(value: string): string {
  let output = value.trim();
  for (let pass = 0; pass < MAX_ENTITY_PASSES; pass++) {
    const next = output
      .replace(/&#(\d+);/g, (_, decimal: string) => {
        const code = Number.parseInt(decimal, 10);
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : _;
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hexadecimal: string) => {
        const code = Number.parseInt(hexadecimal, 16);
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : _;
      })
      .replace(/&([a-z]+);/gi, (whole, name: string) => {
        return ENTITY_NAMES[name.toLowerCase()] ?? whole;
      });
    if (next === output) break;
    output = next;
  }
  return output;
}

function isPrivateHostname(rawHostname: string): boolean {
  const hostname = rawHostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map((part) => Number(part));
    if (octets.some((part) => part > 255)) return true;
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const mappedIpv4 = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4 && isPrivateHostname(mappedIpv4[1])) return true;
  if (
    hostname === "::1" ||
    (hostname.includes(":") &&
      (/^f[cd][0-9a-f]{2}:/i.test(hostname) || /^fe80:/i.test(hostname)))
  ) {
    return true;
  }
  return false;
}

function removeQueryKeys(url: URL, keys: Set<string>): void {
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (keys.has(normalized) || normalized.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
}

/** Validate and normalize one external media URL for storage/display. */
export function canonicalizeMediaUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const decoded = decodeUrlEntities(raw);
  if (!decoded || decoded.length > MAX_MEDIA_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(decoded);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password || !parsed.hostname) return null;
  if (isPrivateHostname(parsed.hostname)) return null;

  parsed.hash = "";
  removeQueryKeys(parsed, TRACKING_QUERY_KEYS);
  const normalized = parsed.toString();
  return normalized.length <= MAX_MEDIA_URL_LENGTH ? normalized : null;
}

/** A key that ignores common resize variants while retaining content path. */
export function mediaIdentityKey(
  type: MediaType,
  canonicalUrl: string
): string | null {
  const url = canonicalizeMediaUrl(canonicalUrl);
  if (!url) return null;
  const parsed = new URL(url);
  let pathname = parsed.pathname;
  if (type === "image") {
    pathname = pathname
      .replace(/[.:@](?:orig|large|medium|small|thumb|\d+x\d+)$/i, "")
      .replace(
        /[._-](?:width|resize|resized|size)[-_]?\d+(?:x\d+)?(?=\.[^/.]+$)/i,
        ""
      )
      .replace(/\.(?:jpe?g|png|webp|gif|avif|svg)$/i, "");
  }
  removeQueryKeys(parsed, RESIZE_QUERY_KEYS);
  // http and https variants of the same host/path are one content identity.
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${parsed.hostname.toLowerCase()}${port}${pathname}${parsed.search}`;
}

function isGenericImageUrl(url: string): boolean {
  if (BLOCKED_IMAGE_URLS.has(url)) return true;
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return true;
  }
  let filename: string;
  try {
    filename = decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return true;
  }
  filename = filename.replace(/\.[a-z0-9]+$/, "").replace(/[._-]+/g, "-");
  return /(^|-)(logo|favicon|icon|avatar|placeholder|default|brandmark|wordmark)(-|$)/.test(
    filename
  );
}

function normalizeCandidate(
  candidate: MediaCandidate,
  allowGenericImage = false
): MediaAsset | null {
  const url = canonicalizeMediaUrl(candidate.url);
  if (!url) return null;
  if (candidate.type === "image") {
    if (!allowGenericImage && isGenericImageUrl(url)) return null;
    return { type: "image", url };
  }
  if (candidate.type !== "video") return null;

  const poster = canonicalizeMediaUrl(candidate.poster_url);
  return poster && isGenericImageUrl(poster)
    ? { type: "video", url }
    : poster
      ? { type: "video", url, poster_url: poster }
      : { type: "video", url };
}

function candidatePriority(candidate: MediaCandidate): number {
  return typeof candidate.priority === "number" &&
    Number.isFinite(candidate.priority)
    ? candidate.priority
    : 100;
}

function assetIdentity(asset: MediaAsset): string {
  return `${asset.type}:${mediaIdentityKey(asset.type, asset.url) ?? asset.url}`;
}

function compareCandidates(
  a: { asset: MediaAsset; priority: number; order: number },
  b: { asset: MediaAsset; priority: number; order: number }
): number {
  const urlOrder =
    a.asset.url < b.asset.url ? -1 : a.asset.url > b.asset.url ? 1 : 0;
  return (
    a.priority - b.priority ||
    a.order - b.order ||
    (a.asset.type === b.asset.type ? 0 : a.asset.type === "image" ? -1 : 1) ||
    urlOrder
  );
}

/**
 * Build a deterministic manifest from untrusted candidates.
 *
 * Candidates are ranked by optional source priority, then document order,
 * then kind and canonical URL. The first surviving asset is primary. Resize
 * variants and canonical URL duplicates are removed by content identity.
 */
export function buildMediaManifest(
  candidates: readonly MediaCandidate[] = []
): MediaManifest {
  const normalized = candidates
    .map((candidate, order) => {
      const asset = normalizeCandidate(candidate);
      return asset
        ? { asset, priority: candidatePriority(candidate), order }
        : null;
    })
    .filter(
      (
        entry
      ): entry is {
        asset: MediaAsset;
        priority: number;
        order: number;
      } => entry !== null
    );
  normalized.sort(compareCandidates);

  const ranked: Array<{
    asset: MediaAsset;
    priority: number;
    order: number;
  }> = [];
  const byIdentity = new Map<string, number>();
  for (const entry of normalized) {
    const identity = assetIdentity(entry.asset);
    const existingIndex = byIdentity.get(identity);
    if (existingIndex !== undefined) {
      const existing = ranked[existingIndex];
      // A later duplicate may carry the first useful poster for a video.
      if (
        entry.asset.type === "video" &&
        existing.asset.type === "video" &&
        !existing.asset.poster_url &&
        entry.asset.poster_url
      ) {
        existing.asset = {
          ...existing.asset,
          poster_url: entry.asset.poster_url,
        };
      }
      continue;
    }
    byIdentity.set(identity, ranked.length);
    ranked.push(entry);
  }

  const posterIdentities = new Set(
    ranked
      .map(({ asset }) =>
        asset.type === "video" && asset.poster_url
          ? mediaIdentityKey("image", asset.poster_url)
          : null
      )
      .filter((identity): identity is string => identity !== null)
  );
  const assets = ranked
    .filter(({ asset }) => {
      if (asset.type !== "image") return true;
      return !posterIdentities.has(mediaIdentityKey("image", asset.url) ?? "");
    })
    .slice(0, MAX_MEDIA_ASSETS)
    .map(({ asset }) => asset);

  return { version: MEDIA_MANIFEST_VERSION, assets };
}

function emptyManifest(): MediaManifest {
  return { version: MEDIA_MANIFEST_VERSION, assets: [] };
}

function legacyImageManifest(raw: unknown): MediaManifest {
  const url = canonicalizeMediaUrl(raw);
  return url
    ? { version: MEDIA_MANIFEST_VERSION, assets: [{ type: "image", url }] }
    : emptyManifest();
}

function mergeLegacyImage(
  manifest: MediaManifest,
  legacyImageUrl: unknown
): MediaManifest {
  const legacy = legacyImageManifest(legacyImageUrl);
  if (legacy.assets.length === 0) return manifest;
  return buildMediaManifest([
    ...manifest.assets,
    {
      type: "image",
      url: legacy.assets[0].type === "image" ? legacy.assets[0].url : "",
      priority: -1,
    },
  ]);
}

function assetToCandidate(value: unknown): MediaCandidate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record.type ?? record.kind;
  const url = record.url ?? record.src ?? record.contentUrl;
  if (typeof type !== "string" || typeof url !== "string") return null;
  if (type !== "image" && type !== "video") return null;
  const poster = record.poster_url ?? record.posterUrl ?? record.thumbnail_url;
  return {
    type,
    url,
    ...(typeof poster === "string" ? { poster_url: poster } : {}),
  };
}

/**
 * Parse a stored manifest defensively. Invalid JSON, unknown versions, and
 * malformed entries are ignored. A legacy image_url is used as a fallback
 * image when the manifest is absent or has no usable image.
 */
export function parseMediaManifest(
  raw: unknown,
  legacyImageUrl?: unknown
): MediaManifest {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim() || raw.length > MAX_MEDIA_MANIFEST_JSON_LENGTH) {
      return mergeLegacyImage(emptyManifest(), legacyImageUrl);
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return mergeLegacyImage(emptyManifest(), legacyImageUrl);
    }
  }

  let candidates: MediaCandidate[] = [];
  if (Array.isArray(value)) {
    candidates = value
      .map(assetToCandidate)
      .filter((candidate): candidate is MediaCandidate => candidate !== null);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const version = record.version;
    if (
      (version === undefined || version === MEDIA_MANIFEST_VERSION) &&
      Array.isArray(record.assets)
    ) {
      candidates = record.assets
        .map(assetToCandidate)
        .filter((candidate): candidate is MediaCandidate => candidate !== null);
    }
  }

  const manifest = buildMediaManifest(candidates);
  return mergeLegacyImage(manifest, legacyImageUrl);
}

export function serializeMediaManifest(
  manifest: MediaManifest | null | undefined
): string {
  const candidates = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return JSON.stringify(buildMediaManifest(candidates));
}

export function firstMediaAsset(
  manifest: MediaManifest | null | undefined
): MediaAsset | null {
  return manifest?.assets[0] ?? null;
}

export function firstImageUrl(
  manifest: MediaManifest | null | undefined
): string | null {
  return (
    manifest?.assets.find(
      (asset): asset is Extract<MediaAsset, { type: "image" }> =>
        asset.type === "image"
    )?.url ?? null
  );
}

/** Keep public responses small and useful without exposing a raw candidate list. */
export function boundedPublicManifest(
  manifest: MediaManifest,
  maxAssets = MAX_PUBLIC_MEDIA_ASSETS
): MediaManifest | undefined {
  const normalized = buildMediaManifest(
    Array.isArray(manifest.assets) ? manifest.assets : []
  );
  const assets = normalized.assets
    .filter(
      (asset) =>
        asset.url.length <= MAX_PUBLIC_MEDIA_URL_LENGTH &&
        (asset.type !== "video" ||
          !asset.poster_url ||
          asset.poster_url.length <= MAX_PUBLIC_MEDIA_URL_LENGTH)
    )
    .slice(0, Math.max(0, Math.min(maxAssets, MAX_MEDIA_ASSETS)));
  const hasVideo = assets.some((asset) => asset.type === "video");
  const imageCount = assets.filter((asset) => asset.type === "image").length;
  if (!hasVideo && imageCount < 2) return undefined;
  return { version: MEDIA_MANIFEST_VERSION, assets };
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null = pattern.exec(tag);
  while (match !== null) {
    attributes[match[1].toLowerCase()] = decodeUrlEntities(
      match[2] ?? match[3] ?? match[4] ?? ""
    );
    match = pattern.exec(tag);
  }
  return attributes;
}

function firstUrl(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstUrl(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "url",
      "src",
      "contentUrl",
      "embedUrl",
      "thumbnailUrl",
      "image",
    ]) {
      const found = firstUrl(record[key], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function typeNames(value: Record<string, unknown>): string[] {
  const raw = value["@type"] ?? value.type;
  if (typeof raw === "string") return [raw.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.toLowerCase());
  }
  return [];
}

function collectJsonLdMedia(
  value: unknown,
  candidates: MediaCandidate[],
  depth = 0,
  budget = { count: 0 }
): void {
  if (depth > MAX_JSON_LD_DEPTH || budget.count >= MAX_JSON_LD_NODES) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectJsonLdMedia(entry, candidates, depth + 1, budget);
      if (budget.count >= MAX_JSON_LD_NODES) break;
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  budget.count++;
  const record = value as Record<string, unknown>;
  const names = typeNames(record);
  const isVideo = names.some((name) =>
    ["videoobject", "video", "newsmediaobject", "mediaobject"].includes(name)
  );
  const isImage = names.some((name) =>
    ["imageobject", "image", "newsarticle", "article"].includes(name)
  );

  if (isVideo) {
    const videoUrl = firstUrl(
      record.contentUrl ?? record.embedUrl ?? record.url ?? record.videoUrl
    );
    if (videoUrl) {
      candidates.push({
        type: "video",
        url: videoUrl,
        poster_url: firstUrl(
          record.thumbnailUrl ??
            record.thumbnail_url ??
            record.posterUrl ??
            record.image
        ),
        priority: 30,
      });
    }
  } else if (isImage) {
    const imageUrl = firstUrl(
      record.contentUrl ?? record.url ?? record.image ?? record.thumbnailUrl
    );
    if (imageUrl) {
      candidates.push({ type: "image", url: imageUrl, priority: 30 });
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "url" || key === "contentUrl" || key === "embedUrl") continue;
    collectJsonLdMedia(child, candidates, depth + 1, budget);
    if (budget.count >= MAX_JSON_LD_NODES) break;
  }
}

function videoTagCandidates(html: string): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const blocks = html.match(/<video\b[\s\S]*?<\/video\s*>/gi) ?? [];
  for (const block of blocks) {
    const openTag = block.match(/<video\b[^>]*>/i)?.[0] ?? "";
    const videoAttributes = parseAttributes(openTag);
    const poster = videoAttributes.poster;
    const add = (url: string | undefined, typeHint: string | undefined) => {
      if (!url) return;
      const lower = `${typeHint ?? ""} ${url}`.toLowerCase();
      const type =
        typeHint === "image" || lower.includes("image") ? "image" : "video";
      candidates.push({
        type,
        url,
        poster_url: poster,
        priority: type === "video" ? 50 : 60,
      });
    };
    add(videoAttributes.src, videoAttributes.type);
    for (const sourceTag of block.match(/<source\b[^>]*>/gi) ?? []) {
      const attrs = parseAttributes(sourceTag);
      add(attrs.src, attrs.type);
    }
  }
  return candidates;
}

/** Extract bounded media candidates from common article metadata formats. */
export function parseMediaMetadata(html: string): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  let imageOrder = 0;
  let videoOrder = 0;

  for (const tag of metaTags) {
    const attrs = parseAttributes(tag);
    const key = (
      attrs.property ??
      attrs.name ??
      attrs.itemprop ??
      ""
    ).toLowerCase();
    const content = attrs.content;
    if (!key || !content) continue;
    if (
      [
        "og:image",
        "og:image:url",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
      ].includes(key)
    ) {
      candidates.push({
        type: "image",
        url: content,
        priority: 10 + imageOrder++ / 1000,
      });
    }
    if (
      [
        "og:video",
        "og:video:url",
        "og:video:secure_url",
        "twitter:player:stream",
        "twitter:player",
      ].includes(key)
    ) {
      candidates.push({
        type: "video",
        url: content,
        priority: 40 + videoOrder++ / 1000,
      });
    }
  }

  candidates.push(...videoTagCandidates(html));

  const scriptPattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let script: RegExpExecArray | null = scriptPattern.exec(html);
  let scriptCount = 0;
  while (script !== null && scriptCount < 8) {
    scriptCount++;
    try {
      collectJsonLdMedia(JSON.parse(script[1]), candidates);
    } catch {
      // A malformed JSON-LD block must not hide valid meta/video tags.
    }
    script = scriptPattern.exec(html);
  }

  const firstImage = candidates
    .filter((candidate) => candidate.type === "image")
    .map((candidate) => buildMediaManifest([candidate]).assets[0]?.url)
    .find((url): url is string => Boolean(url));
  if (firstImage) {
    for (const candidate of candidates) {
      if (candidate.type === "video" && !candidate.poster_url) {
        candidate.poster_url = firstImage;
      }
    }
  }
  return candidates;
}
