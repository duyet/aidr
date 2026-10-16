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
const MAX_UNICODE_CODE_POINT = 0x10ffff;
const FIRST_SURROGATE = 0xd800;
const LAST_SURROGATE = 0xdfff;

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

/**
 * These parameters are deliberately preserved: removing them can invalidate
 * a CDN signature and turn a valid image/video into a broken URL. They are
 * still bounded by the URL length and the public response budget.
 */
export const SIGNED_MEDIA_QUERY_KEYS = new Set([
  "AWSAccessKeyId",
  "Policy",
  "X-Amz-Algorithm",
  "X-Amz-Credential",
  "X-Amz-Date",
  "X-Amz-Expires",
  "X-Amz-Security-Token",
  "X-Amz-Signature",
  "X-Goog-Algorithm",
  "X-Goog-Credential",
  "X-Goog-Date",
  "X-Goog-Expires",
  "X-Goog-Signature",
  "auth",
  "expires",
  "key",
  "kid",
  "policy",
  "se",
  "sig",
  "signature",
  "sp",
  "st",
  "sv",
  "token",
]);

export function isSignedMediaQueryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    SIGNED_MEDIA_QUERY_KEYS.has(key) ||
    SIGNED_MEDIA_QUERY_KEYS.has(normalized) ||
    [...SIGNED_MEDIA_QUERY_KEYS].some(
      (signed) => signed.toLowerCase() === normalized
    )
  );
}

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "si",
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

function isUnicodeScalarValue(codePoint: number): boolean {
  return (
    Number.isSafeInteger(codePoint) &&
    codePoint >= 0 &&
    codePoint <= MAX_UNICODE_CODE_POINT &&
    (codePoint < FIRST_SURROGATE || codePoint > LAST_SURROGATE)
  );
}

/**
 * Decode one numeric character reference without allowing malformed or
 * out-of-range input to reach String.fromCodePoint. Invalid references remain
 * literal so a later URL policy can reject or preserve them explicitly.
 */
function decodeNumericEntity(
  whole: string,
  digits: string,
  radix: 10 | 16
): string {
  const codePoint = Number.parseInt(digits, radix);
  if (!isUnicodeScalarValue(codePoint)) return whole;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    // Keep this boundary total even if the runtime's conversion contract
    // changes independently of the validation above.
    return whole;
  }
}

/** Decode the small set of URL-safe HTML entities used by article metadata. */
export function decodeUrlEntities(value: string): string {
  let output = value.trim();
  for (let pass = 0; pass < MAX_ENTITY_PASSES; pass++) {
    const next = output
      .replace(/&#(\d+);/g, (whole, decimal: string) =>
        decodeNumericEntity(whole, decimal, 10)
      )
      .replace(/&#x([0-9a-f]+);/gi, (whole, hexadecimal: string) =>
        decodeNumericEntity(whole, hexadecimal, 16)
      )
      .replace(/&([a-z]+);/gi, (whole, name: string) => {
        return ENTITY_NAMES[name.toLowerCase()] ?? whole;
      });
    if (next === output) break;
    output = next;
  }
  return output;
}

function parseIpv4(hostname: string): number[] | null {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map((part) => Number(part));
  return octets.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255
  )
    ? octets
    : null;
}

function parseIpv6(hostname: string): number[] | null {
  let value = hostname.toLowerCase();
  if (value.includes("%")) return null;

  // URL normally expands dotted-quad IPv6 tails, but accepting the textual
  // form here keeps the policy correct in non-browser runtimes and tests.
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(value.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1) ||
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }
  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every(Number.isInteger) ? groups : null;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const groups = parseIpv6(hostname);
  if (!groups) return false;
  const [first, second] = groups;
  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback =
    groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isIpv4Compatible = groups.slice(0, 6).every((group) => group === 0);
  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isIpv4Translated =
    groups.slice(0, 4).every((group) => group === 0) &&
    groups[4] === 0xffff &&
    groups[5] === 0;
  const isNat64 = first === 0x64 && second === 0xff9b;
  const isUla = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  const isMulticast = (first & 0xff00) === 0xff00;
  const isDocumentation = first === 0x2001 && second === 0x0db8;
  const isBenchmarking = first === 0x2001 && second === 0x0002;
  const isDiscard =
    first === 0x0100 && groups.slice(1, 4).every((group) => group === 0);
  const isOrchid = first === 0x2001 && second >= 0x0010 && second <= 0x002f;
  const isSixToFour = first === 0x2002;
  const isTeredo = first === 0x2001 && second === 0x0000;

  return (
    isUnspecified ||
    isLoopback ||
    isIpv4Compatible ||
    isIpv4Mapped ||
    isIpv4Translated ||
    isNat64 ||
    isUla ||
    isLinkLocal ||
    isMulticast ||
    isDocumentation ||
    isBenchmarking ||
    isDiscard ||
    isOrchid ||
    isSixToFour ||
    isTeredo
  );
}

/** Syntactic host policy shared by media storage and outbound fetches. */
export function isPrivateHostname(rawHostname: string): boolean {
  const hostname = rawHostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan")
  ) {
    return true;
  }
  if (hostname.includes(":")) {
    return !parseIpv6(hostname) || isPrivateIpv6(hostname);
  }
  return isPrivateIpv4(hostname);
}

function removeQueryKeys(url: URL, keys: Set<string>): void {
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (
      (keys.has(normalized) || normalized.startsWith("utm_")) &&
      !isSignedMediaQueryKey(normalized)
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
}

const STORY_MEDIA_HOSTS = new Set([
  "static.marketbrief.now",
  "static.huggingnews.com",
]);

/**
 * marketbrief serves `/story-media/<tweetId>/<hash>` only with a size suffix:
 * the bare path is a 404, `<hash>-large.jpg` is the image. Applied to every
 * canonical media URL, so rows stored with the bare path still render.
 */
export function withStoryMediaSuffix(url: URL): void {
  if (url.hostname.toLowerCase() !== "static.marketbrief.now") return;
  if (!url.pathname.startsWith("/story-media/")) return;
  const last = url.pathname.split("/").pop() ?? "";
  if (last && !last.includes(".")) url.pathname += "-large.jpg";
}

/**
 * Canonical forms and identity keys are pure functions of their input, and
 * the feed asks for the same few hundred URLs several times per request and
 * again on every request, so each is kept once per isolate. The maps evict
 * their oldest entry past the cap, so a scan of distinct URLs cannot grow
 * them without bound.
 */
const MEMO_MAX_ENTRIES = 4096;
// Real snapshot URLs peak near 350 chars; a low cap bounds what a flood of
// long submitted URLs can pin (4096 entries x 2048 chars x 2 maps is ~30 MB).
const MEMO_MAX_KEY_LENGTH = 512;
const canonicalMediaUrls = new Map<string, string | null>();
const mediaIdentityKeys = new Map<string, string | null>();

function memoized(
  cache: Map<string, string | null>,
  key: string,
  compute: () => string | null
): string | null {
  if (key.length > MEMO_MAX_KEY_LENGTH) return compute();
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size >= MEMO_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/** Validate and normalize one external media URL for storage/display. */
export function canonicalizeMediaUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return memoized(canonicalMediaUrls, raw, () => computeCanonicalMediaUrl(raw));
}

function computeCanonicalMediaUrl(raw: string): string | null {
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
  const defaultPort = parsed.protocol === "https:" ? "443" : "80";
  if (parsed.port && parsed.port !== defaultPort) return null;
  if (isPrivateHostname(parsed.hostname)) return null;

  parsed.hash = "";
  withStoryMediaSuffix(parsed);
  removeQueryKeys(parsed, TRACKING_QUERY_KEYS);
  const normalized = parsed.toString();
  return normalized.length <= MAX_MEDIA_URL_LENGTH ? normalized : null;
}

export function canonicalizeMediaImageUrl(raw: unknown): string | null {
  const url = canonicalizeMediaUrl(raw);
  return url && !isGenericImageUrl(url) ? url : null;
}

/** A key that ignores common resize variants while retaining content path. */
export function mediaIdentityKey(
  type: MediaType,
  canonicalUrl: string
): string | null {
  return memoized(mediaIdentityKeys, `${type} ${canonicalUrl}`, () =>
    computeMediaIdentityKey(type, canonicalUrl)
  );
}

function computeMediaIdentityKey(
  type: MediaType,
  canonicalUrl: string
): string | null {
  const url = canonicalizeMediaUrl(canonicalUrl);
  if (!url) return null;
  const parsed = new URL(url);
  let host = parsed.hostname.toLowerCase();
  let pathname = parsed.pathname;
  // Jetpack Photon (`i0.wp.com/example.com/path`) proxies the origin file.
  const photon = /^i[0-3]\.wp\.com$/.test(host)
    ? pathname.match(/^\/([^/]+\.[^/]+)(\/.+)$/)
    : null;
  if (photon) {
    host = photon[1].toLowerCase();
    pathname = photon[2];
  }
  // marketbrief and huggingnews serve the same `<tweetId>/<hash>` story media.
  if (STORY_MEDIA_HOSTS.has(host) && pathname.startsWith("/story-media/")) {
    host = "static.huggingnews.com";
    if (type === "image")
      pathname = pathname.replace(/-large(?=\.[^/.]+$)/i, "");
    // The hash is the tweet photo's own media key, so the mirror and the
    // `pbs.twimg.com/media/<key>` original are one image.
    const mediaKey =
      type === "image"
        ? pathname.match(
            /^\/story-media\/\d+\/([A-Za-z0-9_-]{15})(?:\.[^/.]+)?$/
          )
        : null;
    if (mediaKey) {
      host = "pbs.twimg.com";
      pathname = `/media/${mediaKey[1]}`;
    }
  }
  if (type === "image") {
    pathname = pathname
      .replace(/[.:@](?:orig|large|medium|small|thumb|\d+x\d+)$/i, "")
      // WordPress derivatives: `photo-1024x576.jpg`, `photo-scaled.jpg`.
      .replace(/-(?:\d{2,5}x\d{2,5}|scaled)(?=\.[^/.]+$)/i, "")
      .replace(
        /[._-](?:width|resize|resized|size)[-_]?\d+(?:x\d+)?(?=\.[^/.]+$)/i,
        ""
      )
      .replace(/\.(?:jpe?g|png|webp|gif|avif|svg)$/i, "");
  }
  removeQueryKeys(parsed, RESIZE_QUERY_KEYS);
  // http and https variants of the same host/path are one content identity.
  const port = parsed.port && !photon ? `:${parsed.port}` : "";
  return `${host}${port}${pathname}${parsed.search}`;
}

export function isGenericImageUrl(url: string): boolean {
  if (BLOCKED_IMAGE_URLS.has(url)) return true;
  let pathname: string;
  let hostname: string;
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname.toLowerCase();
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return true;
  }
  // Tweet avatars and banners are people, not the story.
  if (
    hostname === "pbs.twimg.com" &&
    /^\/profile_(?:images|banners)\//.test(pathname)
  ) {
    return true;
  }
  if (/^\/(?:.+\/)?(?:avatars?|profile_images)\//.test(pathname)) return true;
  let filename: string;
  try {
    filename = decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return true;
  }
  filename = filename.replace(/\.[a-z0-9]+$/, "").replace(/[._-]+/g, "-");
  return /(^|-)(logo|favicon|site-icon|icon|avatar|placeholder|default|default-image|og-image|brand|brandmark|wordmark|spacer|pixel|blank)(-|$)/.test(
    filename
  );
}

/**
 * A text-on-card share image rendered by a site's OG generator
 * (`/og/<slug>.png`, `/api/og?...`, `og-card-*.png`). It shows the
 * headline, not the story, so it is only a fallback picture.
 */
export function isGeneratedOgCard(url: string): boolean {
  try {
    const parts = new URL(url).pathname.toLowerCase().split("/");
    return (
      parts.includes("og") ||
      parts.some((part) => /og[-_]?(image|card)/.test(part))
    );
  } catch {
    return false;
  }
}

/**
 * An image uploaded to imgur. Techmeme and HN posts carry these, and they are
 * raw screen captures with the capturing desktop's window bars, dock and
 * hover tooltips in the pixels, so they are only a fallback picture.
 */
function isImageHostUpload(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "imgur.com" || host.endsWith(".imgur.com");
  } catch {
    return false;
  }
}

const CARD_TIER = 2;

/**
 * Rank an image as a picture of the story: 0 for real media, 1 for an
 * image-host upload, 2 for a generated share card. An imgur capture still
 * shows the story; a share card shows only its headline.
 */
function imageTier(url: string): number {
  if (isImageHostUpload(url)) return 1;
  return isGeneratedOgCard(url) ? CARD_TIER : 0;
}

/** The tier of the picture an asset gives, or null for a video without a
 * poster, which gives none. A video's picture is its poster. */
function pictureTier(asset: {
  type: string;
  url: string;
  poster_url?: string | null;
}): number | null {
  if (asset.type === "image") return imageTier(asset.url);
  return asset.poster_url ? imageTier(asset.poster_url) : null;
}

/**
 * Keep only the best tier of image that the assets offer, and lead with it.
 * A cluster merges several pages, and aggregators (marketbrief,
 * huggingnews) each add their own card for the same story; those are noise
 * next to the original article's image, but still better than nothing when
 * they are all we have. A video is never dropped. It ranks by its poster, so
 * a video whose poster is a share card sorts after an imgur image, and a
 * video without a poster neither counts as a picture nor costs the story its
 * fallback image.
 */
export function withoutFallbackImages<
  T extends { type: string; url: string; poster_url?: string | null },
>(assets: readonly T[]): T[] {
  const pictured = assets
    .map(pictureTier)
    .filter((tier): tier is number => tier !== null);
  if (pictured.length === 0) return [...assets];
  const best = Math.min(...pictured);
  const rank = (asset: T) => pictureTier(asset) ?? 0;
  // Two aggregator cards for one story are near-identical, so a card-only
  // story keeps the first one. Better images may be many.
  let cardKept = false;
  return assets
    .filter((asset) => {
      if (asset.type !== "image" || imageTier(asset.url) > best) {
        return asset.type !== "image";
      }
      if (best !== CARD_TIER) return true;
      if (cardKept) return false;
      cardKept = true;
      return true;
    })
    .sort((a, b) => rank(a) - rank(b));
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

export interface BuildMediaOptions {
  /**
   * The story's own page URLs (the article, its source post). A page is not
   * story media. It leaves before ranking, because the fallback rule would
   * otherwise drop an imgur image or a share card for an asset that is then
   * removed too. Matched by content identity, so `?w=600` and http variants
   * of the page go as well.
   */
  articleUrls?: readonly unknown[];
}

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif|svg)$/i;

function hasImageExtension(url: string): boolean {
  return IMAGE_EXTENSION.test(new URL(url).pathname);
}

/**
 * The image identity key ignores the extension, so a page `/story` would
 * match its own avatar `/story.png`. A page URL without an image extension
 * therefore claims only image assets without one (resize and http variants);
 * an article URL that is itself an image keeps the extension-blind match.
 */
function articleIdentities(urls: readonly unknown[] = []): Set<string> {
  const identities = new Set<string>();
  for (const raw of urls) {
    const url = canonicalizeMediaUrl(raw);
    if (!url) continue;
    const imageKey = mediaIdentityKey("image", url);
    identities.add(
      `${hasImageExtension(url) ? "image" : "page-image"}:${imageKey}`
    );
    identities.add(`video:${mediaIdentityKey("video", url)}`);
  }
  return identities;
}

function isArticleImage(url: string, articles: Set<string>): boolean {
  const key = mediaIdentityKey("image", url);
  return (
    articles.has(`image:${key}`) ||
    (!hasImageExtension(url) && articles.has(`page-image:${key}`))
  );
}

function withoutArticle(
  asset: MediaAsset,
  articles: Set<string>
): MediaAsset | null {
  if (asset.type === "image" && isArticleImage(asset.url, articles)) {
    return null;
  }
  if (asset.type === "video" && articles.has(assetIdentity(asset))) {
    return null;
  }
  if (
    asset.type === "video" &&
    asset.poster_url &&
    isArticleImage(asset.poster_url, articles)
  ) {
    return { type: "video", url: asset.url };
  }
  return asset;
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
  candidates: readonly MediaCandidate[] = [],
  options: BuildMediaOptions = {}
): MediaManifest {
  const articles = articleIdentities(options.articleUrls);
  const normalized = candidates
    .map((candidate, order) => {
      const normal = normalizeCandidate(candidate);
      const asset = normal && withoutArticle(normal, articles);
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
  const assets = withoutFallbackImages(ranked.map(({ asset }) => asset))
    .filter((asset) => {
      if (asset.type !== "image") return true;
      return !posterIdentities.has(mediaIdentityKey("image", asset.url) ?? "");
    })
    .slice(0, MAX_MEDIA_ASSETS);

  return { version: MEDIA_MANIFEST_VERSION, assets };
}

function emptyManifest(): MediaManifest {
  return { version: MEDIA_MANIFEST_VERSION, assets: [] };
}

function legacyImageUrlFor(
  raw: unknown,
  options: BuildMediaOptions
): string | null {
  return typeof raw === "string"
    ? firstImageUrl(buildMediaManifest([{ type: "image", url: raw }], options))
    : null;
}

function mergeLegacyImage(
  manifest: MediaManifest,
  legacyImageUrl: unknown,
  options: BuildMediaOptions
): MediaManifest {
  // A stored manifest is authoritative once it has a usable thumbnail. Do
  // not let a stale/raw image_url win over a current image or video poster.
  if (
    manifest.assets.some(
      (asset) =>
        asset.type === "image" ||
        (asset.type === "video" && Boolean(asset.poster_url))
    )
  ) {
    return manifest;
  }
  const legacy = legacyImageUrlFor(legacyImageUrl, options);
  if (!legacy) return manifest;
  return buildMediaManifest(
    [...manifest.assets, { type: "image", url: legacy, priority: -1 }],
    options
  );
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
 * image when the manifest is absent or has no usable image. The row's
 * `articleUrl` is removed from both (see `BuildMediaOptions`).
 */
export function parseMediaManifest(
  raw: unknown,
  legacyImageUrl?: unknown,
  articleUrl?: unknown
): MediaManifest {
  const options = { articleUrls: [articleUrl] };
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim() || raw.length > MAX_MEDIA_MANIFEST_JSON_LENGTH) {
      return mergeLegacyImage(emptyManifest(), legacyImageUrl, options);
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return mergeLegacyImage(emptyManifest(), legacyImageUrl, options);
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

  const manifest = buildMediaManifest(candidates, options);
  return mergeLegacyImage(manifest, legacyImageUrl, options);
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

/** Shared image/video thumbnail contract: image asset, video poster, then
 * the normalized legacy image_url fallback. The article URL is never one. */
export function primaryThumbnailUrl(
  manifest: MediaManifest | null | undefined,
  legacyImageUrl?: unknown,
  articleUrl?: unknown
): string | null {
  const options = { articleUrls: [articleUrl] };
  const usable = buildMediaManifest(
    Array.isArray(manifest?.assets) ? manifest.assets : [],
    options
  );
  const primary = usable.assets[0];
  if (primary?.type === "image") return canonicalizeMediaImageUrl(primary.url);
  if (primary?.type === "video" && primary.poster_url) {
    return canonicalizeMediaImageUrl(primary.poster_url);
  }
  // A manifest with a video but no poster may still have an image alternate.
  return firstImageUrl(usable) ?? legacyImageUrlFor(legacyImageUrl, options);
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

/** The media a public story row exposes: its thumbnail and, when it has
 * more than one picture or a video, the bounded manifest. */
export interface PublicStoryMedia {
  image_url: string | null;
  media_manifest?: MediaManifest;
}

function computePublicStoryMedia(
  rawManifest: unknown,
  legacyImageUrl: unknown,
  articleUrl: unknown
): PublicStoryMedia {
  const manifest = parseMediaManifest(rawManifest, legacyImageUrl, articleUrl);
  const exposed = boundedPublicManifest(manifest);
  const imageUrl = canonicalizeMediaImageUrl(
    primaryThumbnailUrl(manifest, legacyImageUrl, articleUrl)
  );
  return {
    image_url:
      imageUrl && imageUrl.length <= MAX_PUBLIC_MEDIA_URL_LENGTH
        ? imageUrl
        : null,
    ...(exposed ? { media_manifest: exposed } : {}),
  };
}

function copyPublicStoryMedia(media: PublicStoryMedia): PublicStoryMedia {
  return {
    image_url: media.image_url,
    ...(media.media_manifest
      ? {
          media_manifest: {
            version: media.media_manifest.version,
            assets: media.media_manifest.assets.map((asset) => ({ ...asset })),
          },
        }
      : {}),
  };
}

/**
 * Deriving a row's public media parses its manifest JSON and canonicalizes
 * every candidate URL, and the same few hundred rows are read on every feed,
 * day and story render, so each row's result is kept once per isolate. The
 * key is the stored triple, so a row edit is a new entry. Real manifests run
 * 25-1,500 characters; the cap bounds what a flood of long rows can pin
 * (2,048 entries x 8 KB). Callers get a copy, never the stored object.
 */
const STORY_MEDIA_MEMO_MAX_ENTRIES = 2048;
const STORY_MEDIA_MEMO_MAX_KEY_LENGTH = 8192;
const publicStoryMediaByRow = new Map<string, PublicStoryMedia>();

export function publicStoryMedia(
  rawManifest: unknown,
  legacyImageUrl: unknown,
  articleUrl: unknown
): PublicStoryMedia {
  const key = JSON.stringify([rawManifest, legacyImageUrl, articleUrl]);
  if (key.length > STORY_MEDIA_MEMO_MAX_KEY_LENGTH) {
    return computePublicStoryMedia(rawManifest, legacyImageUrl, articleUrl);
  }
  const hit = publicStoryMediaByRow.get(key);
  if (hit) return copyPublicStoryMedia(hit);
  const media = computePublicStoryMedia(
    rawManifest,
    legacyImageUrl,
    articleUrl
  );
  if (publicStoryMediaByRow.size >= STORY_MEDIA_MEMO_MAX_ENTRIES) {
    const oldest = publicStoryMediaByRow.keys().next().value;
    if (oldest !== undefined) publicStoryMediaByRow.delete(oldest);
  }
  publicStoryMediaByRow.set(key, copyPublicStoryMedia(media));
  return media;
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
  const normalize = (entry: string): string => {
    const trimmed = entry.trim().toLowerCase();
    const qualified = trimmed.match(/(?:^|[/#:])([a-z0-9]+)$/);
    return qualified?.[1] ?? trimmed;
  };
  if (typeof raw === "string") return [normalize(raw)];
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is string => typeof entry === "string")
      .map(normalize);
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
  const isImageObject = names.some((name) =>
    ["imageobject", "image"].includes(name)
  );
  const isArticle = names.some((name) =>
    ["newsarticle", "article"].includes(name)
  );
  const isImage = isImageObject || isArticle;

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
    const imageUrl = isImageObject
      ? firstUrl(
          record.contentUrl ?? record.url ?? record.image ?? record.thumbnailUrl
        )
      : firstUrl(record.image ?? record.thumbnailUrl);
    const articleUrl = isArticle
      ? firstUrl(record.url ?? record["@id"])
      : undefined;
    if (
      imageUrl &&
      canonicalizeMediaUrl(imageUrl) !== canonicalizeMediaUrl(articleUrl)
    ) {
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
  let videoPoster: string | undefined;

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
    if (["og:video:poster", "twitter:player:poster"].includes(key)) {
      videoPoster = content;
      continue;
    }
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
        ...(videoPoster ? { poster_url: videoPoster } : {}),
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
  const explicitPoster = videoPoster
    ? buildMediaManifest([{ type: "image", url: videoPoster, priority: 0 }])
        .assets[0]?.url
    : undefined;
  for (const candidate of candidates) {
    if (candidate.type === "video" && !candidate.poster_url) {
      candidate.poster_url = explicitPoster ?? firstImage;
    }
  }
  return candidates.filter(
    (candidate) =>
      candidate.type !== "image" || candidate.url !== explicitPoster
  );
}
