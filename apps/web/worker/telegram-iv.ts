/**
 * Telegram Instant View **field gate** (no-go slice).
 *
 * `docs/decisions/telegram-instant-view.md` used to claim no automated media
 * gate exists: the notify path only did "limited URL syntax/protocol handling"
 * and could not prove byte size, MIME/format, dimensions, reachability,
 * hotlink behaviour, or Telegram acceptance. This module turns the *fields*
 * of that record into a machine-checkable preflight so "is this story
 * IV-eligible?" is a query, while keeping every hard rule the record states:
 *
 * - There is NO approved template and NO `rhash` here. `TELEGRAM_IV_LINK_SHAPE`
 *   is a documentation shape with a literal `{rhash-from-editor}` placeholder.
 * - There is NO query template: `editor_query_template` stays `null`.
 * - The Worker never proxies remote media. The bounded probe below asks for a
 *   byte range, reads a header window, and cancels the body.
 * - Nothing here enables IV, changes a delivery key, or sends a message.
 *
 * The image candidate is the generated first-party card (`/api/og/{id}.png`),
 * the same deliberate choice `articleHead` already makes for `og:image`
 * ("Always the generated branded card — upstream image_urls can 404"), so
 * hotlinking, MIME, and dimension checks are deterministic.
 */

import { localizedTitle } from "../src/lib/display-title.js";
import { absoluteSiteUrl } from "../src/lib/locale-url.js";
import {
  SITE_NAME,
  SITE_OG_IMAGE_HEIGHT,
  SITE_OG_IMAGE_WIDTH,
} from "../src/lib/site.js";
import { storyPath } from "../src/lib/slug.js";
import {
  renderStoryMarkdown,
  STORY_MARKDOWN_SUMMARY_MAX_CHARS,
  storyMarkdownLanguage,
} from "../src/lib/story-markdown.js";
import type { FeedItem, Lang } from "../src/lib/types.js";
import {
  fetchWithSafeRedirects,
  isFetchableUrl,
  redactUrlForLog,
} from "./enrich.js";
import { canonicalizeMediaImageUrl, isPrivateHostname } from "./media.js";
import { sanitizeText } from "./telemetry-safe.js";

/* ------------------------------------------------------------------ *
 * Documented Telegram ceilings
 * ------------------------------------------------------------------ */

/**
 * The numeric limits this gate encodes, with the source that documents each
 * one. They are transport/format ceilings, not an aidr runtime guarantee, and
 * they do NOT replace the manual editor checks in the decision record.
 */
export const TELEGRAM_IV_LIMITS = {
  /** Bot API `sendPhoto` with an HTTP URL: 5 MB. */
  httpUrlPhotoBytes: 5 * 1024 * 1024,
  /** Bot API `sendPhoto` `multipart/form-data` upload: 10 MB. */
  multipartUploadPhotoBytes: 10 * 1024 * 1024,
  /** width + height must be at most 10,000 px. */
  dimensionSumPx: 10_000,
  /** long side / short side must be at most 20. */
  aspectRatio: 20,
  /** `sendPhoto` caption: 0-1024 characters. */
  captionChars: 1024,
} as const;

export interface IvLimitSource {
  key: string;
  value: number;
  source: string;
  note: string;
}

export const TELEGRAM_IV_LIMIT_SOURCES: readonly IvLimitSource[] = [
  {
    key: "httpUrlPhotoBytes",
    value: TELEGRAM_IV_LIMITS.httpUrlPhotoBytes,
    source: "https://core.telegram.org/bots/api#sendphoto",
    note: "5 MB for a photo passed as an HTTP URL — the current adapter path.",
  },
  {
    key: "multipartUploadPhotoBytes",
    value: TELEGRAM_IV_LIMITS.multipartUploadPhotoBytes,
    source: "https://core.telegram.org/bots/api#sendphoto",
    note: "10 MB for a photo uploaded with multipart/form-data.",
  },
  {
    key: "dimensionSumPx",
    value: TELEGRAM_IV_LIMITS.dimensionSumPx,
    source: "https://core.telegram.org/bots/api#sendphoto",
    note: "width + height must be at most 10,000.",
  },
  {
    key: "aspectRatio",
    value: TELEGRAM_IV_LIMITS.aspectRatio,
    source: "https://core.telegram.org/bots/api#sendphoto",
    note: "aspect ratio must be at most 20.",
  },
  {
    key: "captionChars",
    value: TELEGRAM_IV_LIMITS.captionChars,
    source: "https://core.telegram.org/bots/api#sendphoto",
    note: "caption must be 0-1024 characters.",
  },
  {
    key: "iv_rendered_image_bytes",
    value: TELEGRAM_IV_LIMITS.httpUrlPhotoBytes,
    source: "https://instantview.telegram.org/checklist#6-2-1-image-quality",
    note: "The IV checklist recommends 1280-2560 px and warns that images over 5 MB fail to load in IV. Distinct from the Bot API transport ceilings.",
  },
];

/** The IV Editor. An operator pastes the source URL there; this code never does. */
export const TELEGRAM_IV_EDITOR_URL = "https://instantview.telegram.org/";

/**
 * Documentation shape only. `{rhash-from-editor}` is a PLACEHOLDER: the
 * editor generates the real value through **View in Telegram**, and the record
 * forbids fabricating, guessing, or reusing one. Nothing in this repository
 * may fill it in.
 */
export const TELEGRAM_IV_LINK_SHAPE =
  "https://t.me/iv?url={url-encoded-source-url}&rhash={rhash-from-editor}";

/** Literal placeholder text for the unresolved `rhash`. Never a real value. */
export const RHASH_PLACEHOLDER = "{rhash-from-editor}";

/** Raster containers Telegram accepts for a photo / IV image. */
export const TELEGRAM_IV_SUPPORTED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type IvSupportedImageMime =
  (typeof TELEGRAM_IV_SUPPORTED_IMAGE_MIME)[number];

/**
 * Bytes read from a NON-generated candidate to prove its container and
 * dimensions. The request asks for a byte range and the body is cancelled
 * afterwards, so a 5 MB file is never pulled into the Worker.
 */
export const IV_MEDIA_PROBE_BYTES = 64 * 1024;

/** Upper bound for one probe's wall clock. */
export const IV_MEDIA_PROBE_TIMEOUT_MS = 8_000;

/**
 * `published_at` sanity window. A millisecond value that was not normalized
 * lands in the year 2286 — the documented epoch ms/seconds bug class in
 * `ALGORITHM.md` § "Ingest HTTP / D1 contract". A corrupt value lands far
 * outside this window. Either way the gate fails closed instead of emitting it.
 */
const PUBLISHED_AT_MIN_SECONDS = Date.UTC(2000, 0, 1) / 1000;
const PUBLISHED_AT_MAX_SECONDS = Date.UTC(2100, 0, 1) / 1000;

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

export type IvReason =
  | "ok"
  | "story_not_found"
  | "ambiguous_id_prefix"
  | "invalid_id_prefix"
  | "title_missing"
  | "body_missing_summary"
  | "body_missing_source_links"
  | "published_at_missing"
  | "published_at_out_of_range"
  | "image_missing"
  | "image_url_malformed"
  | "image_url_not_https"
  | "image_url_credentialed"
  | "image_url_non_default_port"
  | "image_url_private_host"
  | "image_url_not_fetchable"
  | "image_url_unsafe"
  | "image_unreachable"
  | "image_oversized"
  | "image_unsupported_container"
  | "image_dimensions_unknown"
  | "image_dimensions_exceeded"
  | "image_aspect_exceeded"
  | "site_name_unresolved"
  | "description_missing"
  | "caption_too_long";

/** True only for the exact 8-lowercase-hex story id the record allows. */
export function isIvStoryId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}$/.test(value);
}

export interface PublishedAtSeconds {
  ok: boolean;
  /** Unix SECONDS. Only meaningful when `ok`. */
  unixSeconds: number | null;
  /** True when a millisecond value was normalized instead of rejected. */
  normalizedFromMilliseconds: boolean;
  reason: IvReason | null;
}

/**
 * `published_at` -> Unix seconds, with the documented epoch ms/seconds
 * normalization. Fails closed for a non-finite, non-positive, or
 * out-of-window value. Never returns milliseconds; never returns a year-2286
 * date.
 */
export function normalizePublishedAtSeconds(
  value: unknown
): PublishedAtSeconds {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      unixSeconds: null,
      normalizedFromMilliseconds: false,
      reason: "published_at_missing",
    };
  }
  const looksMilliseconds = value > 1e12;
  const seconds = looksMilliseconds ? value / 1000 : value;
  if (
    !Number.isFinite(seconds) ||
    seconds < PUBLISHED_AT_MIN_SECONDS ||
    seconds >= PUBLISHED_AT_MAX_SECONDS
  ) {
    return {
      ok: false,
      unixSeconds: null,
      normalizedFromMilliseconds: false,
      reason: "published_at_out_of_range",
    };
  }
  return {
    ok: true,
    unixSeconds: Math.floor(seconds),
    normalizedFromMilliseconds: looksMilliseconds,
    reason: null,
  };
}

/** The generated first-party card: 1200x630 image/png by construction. */
export function ivCardUrl(id8: string, lang: Lang): string {
  return absoluteSiteUrl(`/api/og/${id8}.png`, lang);
}

/** The exact source URL to paste into the IV Editor. No UTM, no fragment. */
export function ivSourceUrl(id8: string, lang: Lang): string {
  return absoluteSiteUrl(storyPath({ id: id8 }, lang), lang);
}

export interface IvDimensionVerdict {
  ok: boolean;
  width: number;
  height: number;
  aspectRatio: number | null;
  reason: IvReason | null;
}

function isPositiveDimension(
  value: number | null | undefined
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** width + height <= 10,000 and long/short aspect ratio <= 20. */
export function checkIvDimensions(
  width: number | null | undefined,
  height: number | null | undefined
): IvDimensionVerdict {
  if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
    return {
      ok: false,
      width: 0,
      height: 0,
      aspectRatio: null,
      reason: "image_dimensions_unknown",
    };
  }
  const w = Math.round(width);
  const h = Math.round(height);
  const aspectRatio = Math.max(w, h) / Math.min(w, h);
  if (w + h > TELEGRAM_IV_LIMITS.dimensionSumPx) {
    return {
      ok: false,
      width: w,
      height: h,
      aspectRatio,
      reason: "image_dimensions_exceeded",
    };
  }
  if (aspectRatio > TELEGRAM_IV_LIMITS.aspectRatio) {
    return {
      ok: false,
      width: w,
      height: h,
      aspectRatio,
      reason: "image_aspect_exceeded",
    };
  }
  return { ok: true, width: w, height: h, aspectRatio, reason: null };
}

export interface IvCaptionVerdict {
  ok: boolean;
  length: number;
  remaining: number;
  reason: IvReason | null;
}

/**
 * The raw string is measured, not the post-entity parse: the raw caption is
 * never shorter than what Telegram counts, so a raw fit always fits.
 */
export function checkIvCaption(caption: string): IvCaptionVerdict {
  const length = caption.length;
  const ok = length <= TELEGRAM_IV_LIMITS.captionChars;
  return {
    ok,
    length,
    remaining: TELEGRAM_IV_LIMITS.captionChars - length,
    reason: ok ? null : "caption_too_long",
  };
}

/* ------------------------------------------------------------------ *
 * Container sniffing — header only, bounded
 * ------------------------------------------------------------------ */

export interface IvImageHeader {
  mime: IvSupportedImageMime;
  width: number;
  height: number;
}

interface IvImageSize {
  width: number;
  height: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1)
    out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function pngSize(view: DataView): IvImageSize | null {
  // 8-byte signature, then the IHDR chunk: length, type, width, height.
  if (view.byteLength < 24) return null;
  if (
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(12) !== 0x49484452
  ) {
    return null;
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gifSize(bytes: Uint8Array): IvImageSize | null {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "GIF") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegSize(view: DataView, bytes: Uint8Array): IvImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  // SOF0..SOF15 carry the frame dimensions, except DHT (c4), JPG (c8) and
  // DAC (cc).
  while (offset + 9 < view.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        width: view.getUint16(offset + 7),
        height: view.getUint16(offset + 5),
      };
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpSize(view: DataView, bytes: Uint8Array): IvImageSize | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  return null;
}

/**
 * Identify a supported raster container and its dimensions from the probe
 * window. Returns null for anything not provable from the header, which the
 * caller treats as an unsupported container (fail closed).
 */
export function sniffIvImageHeader(bytes: Uint8Array): IvImageHeader | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = pngSize(view);
  if (png) return { mime: "image/png", ...png };
  const gif = gifSize(bytes);
  if (gif) return { mime: "image/gif", ...gif };
  const jpeg = jpegSize(view, bytes);
  if (jpeg) return { mime: "image/jpeg", ...jpeg };
  const webp = webpSize(view, bytes);
  if (webp) return { mime: "image/webp", ...webp };
  return null;
}

/* ------------------------------------------------------------------ *
 * Bounded, SSRF-checked preflight for a NON-generated candidate
 * ------------------------------------------------------------------ */

/** Reject a URL the gate must never probe, without any network call. */
export function rejectIvMediaUrl(raw: unknown): IvReason | null {
  if (typeof raw !== "string" || !raw.trim()) return "image_missing";
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "image_url_malformed";
  }
  // Plain HTTP is never a verifiable preview source: the response can be
  // rewritten in transit, so MIME/dimension proof would not hold.
  if (url.protocol !== "https:") return "image_url_not_https";
  if (url.username || url.password) return "image_url_credentialed";
  if (url.port && url.port !== "443") return "image_url_non_default_port";
  if (isPrivateHostname(url.hostname)) return "image_url_private_host";
  if (!isFetchableUrl(url.toString())) return "image_url_not_fetchable";
  if (!canonicalizeMediaImageUrl(url.toString())) return "image_url_unsafe";
  return null;
}

export interface IvMediaPreflight {
  ok: boolean;
  reason: IvReason | null;
  /** Redacted for logs/operators: origin only, never a signed query string. */
  redactedUrl: string;
  httpStatus: number | null;
  declaredBytes: number | null;
  mime: string | null;
  dimensions: IvDimensionVerdict | null;
  /** Bytes actually read. Bounded by IV_MEDIA_PROBE_BYTES. */
  probeBytes: number;
}

async function readProbeWindow(
  res: Response,
  capBytes: number
): Promise<Uint8Array> {
  const body = res.body;
  if (!body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.subarray(0, capBytes);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < capBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
  }
  // The rest of the file is never read: the Worker does not proxy media.
  try {
    await reader.cancel();
  } catch {
    /* stream already closed */
  }
  const out = new Uint8Array(Math.min(total, capBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    const slice = chunk.subarray(0, out.length - offset);
    out.set(slice, offset);
    offset += slice.byteLength;
  }
  return out;
}

function isSupportedIvImageMime(value: string): value is IvSupportedImageMime {
  return (TELEGRAM_IV_SUPPORTED_IMAGE_MIME as readonly string[]).includes(
    value
  );
}

export interface IvGeneratedCardCheck extends IvDimensionVerdict {
  mime: IvSupportedImageMime;
}

/**
 * The generated card is first-party and deterministic, so it is checked
 * against the documented ceilings with the same code path rather than assumed
 * safe: a 1200x630 PNG is under both the 10,000 px sum and the 20:1 aspect
 * ceiling, and the route answers 200 image/png by construction.
 */
export function checkIvGeneratedCard(): IvGeneratedCardCheck {
  const dimensions = checkIvDimensions(
    SITE_OG_IMAGE_WIDTH,
    SITE_OG_IMAGE_HEIGHT
  );
  return { ...dimensions, mime: "image/png" };
}

/**
 * Prove what the decision record says the notify path cannot prove — bytes,
 * container/MIME, dimensions, and reachability — for a candidate that is NOT
 * the generated first-party card.
 *
 * The probe sends `Range: bytes=0-<cap-1>`, reads at most `cap` bytes, and
 * cancels the body. It never downloads a whole media file and never puts a
 * signed query string into a log line or a verdict.
 */
export async function preflightIvRemoteMedia(
  rawUrl: string,
  options: { maxBytes?: number; capBytes?: number } = {}
): Promise<IvMediaPreflight> {
  const maxBytes = options.maxBytes ?? TELEGRAM_IV_LIMITS.httpUrlPhotoBytes;
  const capBytes = Math.min(options.capBytes ?? IV_MEDIA_PROBE_BYTES, maxBytes);
  const base: IvMediaPreflight = {
    ok: false,
    reason: null,
    redactedUrl: redactUrlForLog(rawUrl),
    httpStatus: null,
    declaredBytes: null,
    mime: null,
    dimensions: null,
    probeBytes: 0,
  };

  const rejection = rejectIvMediaUrl(rawUrl);
  if (rejection) return { ...base, reason: rejection };

  let res: Response;
  try {
    res = await fetchWithSafeRedirects(rawUrl, {
      method: "GET",
      headers: { Range: `bytes=0-${capBytes - 1}`, Accept: "image/*" },
      signal: AbortSignal.timeout(IV_MEDIA_PROBE_TIMEOUT_MS),
    });
  } catch {
    // A blocked policy hop and a timeout are the same operator-visible
    // outcome here: the candidate is not provable.
    return { ...base, reason: "image_unreachable" };
  }

  const httpStatus = res.status;
  const declared = res.headers.get("content-length");
  const declaredBytes = declared === null ? null : Number(declared);
  const declaredMime = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (httpStatus !== 200 && httpStatus !== 206) {
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return { ...base, httpStatus, reason: "image_unreachable" };
  }

  if (declaredBytes !== null && Number.isFinite(declaredBytes)) {
    if (declaredBytes > maxBytes) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return { ...base, httpStatus, declaredBytes, reason: "image_oversized" };
    }
  }

  if (!isSupportedIvImageMime(declaredMime)) {
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return {
      ...base,
      httpStatus,
      declaredBytes,
      mime: declaredMime || null,
      reason: "image_unsupported_container",
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = await readProbeWindow(res, capBytes);
  } catch {
    return { ...base, httpStatus, declaredBytes, reason: "image_unreachable" };
  }

  const header = sniffIvImageHeader(bytes);
  if (!header || header.mime !== declaredMime) {
    return {
      ...base,
      httpStatus,
      declaredBytes,
      mime: header?.mime ?? declaredMime,
      probeBytes: bytes.byteLength,
      reason: "image_unsupported_container",
    };
  }

  const dimensions = checkIvDimensions(header.width, header.height);
  return {
    ok: dimensions.ok,
    reason: dimensions.reason,
    redactedUrl: base.redactedUrl,
    httpStatus,
    declaredBytes,
    mime: header.mime,
    dimensions,
    probeBytes: bytes.byteLength,
  };
}

/* ------------------------------------------------------------------ *
 * The field gate
 * ------------------------------------------------------------------ */
export interface IvFieldCheck {
  ok: boolean;
  /** Redacted, length-bounded operator-facing value. */
  value: string | null;
  reason: IvReason | null;
  detail?: Record<string, unknown>;
}

export interface IvFieldGate {
  iv_eligible: boolean;
  /** First failing gate, or "ok". */
  reason: IvReason;
  /** Every failing gate, in field order. */
  reasons: IvReason[];
  id: string;
  requested_lang: Lang;
  /** Language the fields actually resolve to (EN when VI falls back). */
  rendered_lang: Lang;
  /** True when a VI request resolved to English content. Never a translation. */
  fallback_from_en: boolean;
  fields: {
    title: IvFieldCheck;
    body: IvFieldCheck;
    published_date: IvFieldCheck;
    image_url: IvFieldCheck;
    site_name: IvFieldCheck;
    description: IvFieldCheck;
  };
  limits: typeof TELEGRAM_IV_LIMITS;
}

export interface IvUnresolvedItem {
  key: string;
  value: string;
  /** Why code cannot resolve it. */
  note: string;
}

/** The record's hard rules, restated as data the tooling cannot bypass. */
export const IV_UNRESOLVED: readonly IvUnresolvedItem[] = [
  {
    key: "rhash",
    value: RHASH_PLACEHOLDER,
    note: "Editor-generated only, through View in Telegram. Never fabricated, guessed, or reused from another template, and never committed.",
  },
  {
    key: "editor_query_template",
    value: "null",
    note: "The IV Editor has not been run against both ?lang=en and ?lang=vi. One query/rhash is NOT assumed to cover both variants.",
  },
  {
    key: "site_name_agrees_with_visible_header",
    value: "unresolved-brand-decision",
    note: "site_name is read from the single shared SITE_NAME constant, so og:site_name and this gate cannot drift. Whether that constant matches the visible header brand is a separate product decision (#224) plus one editor confirmation.",
  },
  {
    key: "telegram_acceptance",
    value: "unproven",
    note: "This gate proves fields, bytes, container, dimensions, and reachability. It does NOT prove Telegram's rendering, hotlink behaviour, cache freshness, or editor acceptance.",
  },
];

export interface IvPreflightVerdict extends IvFieldGate {
  /** Exactly the string to paste into the IV Editor. No UTM, no fragment. */
  source_url: string;
  editor_url: string;
  /** Documentation shape carrying a literal placeholder. Never a real rhash. */
  iv_link_shape: string;
  /** Still null: the editor has not been run against both language variants. */
  editor_query_template: null;
  /** Items a human must still do. */
  unresolved: IvUnresolvedItem[];
  /**
   * Present only when a NON-generated candidate was probed. It never replaces
   * the generated-card recommendation, and it only reports the redacted
   * origin, so a signed CDN query string cannot leak through the API.
   */
  remote_candidate?: IvRemoteCandidateReport;
  checked_at: number;
}

export interface IvRemoteCandidateReport {
  ok: boolean;
  reason: IvReason | null;
  redacted_url: string;
  http_status: number | null;
  declared_bytes: number | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  /** Bytes actually read from the bounded range probe. */
  probe_bytes: number;
  max_bytes: number;
  note: string;
}

/** What the generated card answered, when the caller probed it over HTTP. */
export interface IvCardProbe {
  url: string;
  status: number | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
  within_limits: boolean;
  error: string | null;
}

/**
 * The operator-facing checklist text: the field table, the exact source URL
 * to paste into the IV Editor, and the unresolved items as clearly-labelled
 * placeholders.
 *
 * It deliberately cannot print a usable `t.me/iv` link. The only `rhash` token
 * it can emit is the literal `{rhash-from-editor}` placeholder inside
 * `TELEGRAM_IV_LINK_SHAPE`, and the only query it can emit is the documented
 * `editor_query_template: null`. Both are asserted by the unit tests so this
 * function cannot become a way around the record's hard rules.
 */
export function renderIvChecklist(
  verdict: IvPreflightVerdict,
  card?: IvCardProbe
): string {
  const lines: string[] = [];
  lines.push(
    `Telegram IV field gate — ${verdict.iv_eligible ? "ELIGIBLE" : "NOT ELIGIBLE"} (${verdict.reason})`
  );
  lines.push("");
  lines.push(`story id       ${verdict.id}`);
  lines.push(`requested lang ${verdict.requested_lang}`);
  lines.push(
    `rendered lang  ${verdict.rendered_lang}${
      verdict.fallback_from_en
        ? "  (EXPLICIT EN FALLBACK — no Vietnamese content exists for this story)"
        : ""
    }`
  );
  lines.push("");
  for (const [name, check] of Object.entries(verdict.fields)) {
    lines.push(
      `${(check.ok ? "PASS" : `FAIL(${check.reason})`).padEnd(24)} ${name}`
    );
    if (check.value) lines.push(`  ${check.value}`);
    for (const [key, value] of Object.entries(check.detail ?? {})) {
      lines.push(`  ${key}: ${String(value)}`);
    }
  }
  if (card) {
    lines.push("");
    lines.push("generated card (first-party, probed over HTTP)");
    lines.push(
      `  ${card.status} ${card.content_type ?? "-"} ${card.width ?? "?"}x${card.height ?? "?"} within_limits=${card.within_limits}${card.error ? ` error=${card.error}` : ""}`
    );
    lines.push(`  ${card.url}`);
  }
  if (verdict.remote_candidate) {
    lines.push("");
    lines.push(
      "non-generated candidate (bounded range probe, never a full download)"
    );
    lines.push(`  ${JSON.stringify(verdict.remote_candidate)}`);
  }
  lines.push("");
  lines.push("STEP 1 — paste this exact source URL into the IV Editor:");
  lines.push(`  ${TELEGRAM_IV_EDITOR_URL}`);
  lines.push(`  ${verdict.source_url}`);
  lines.push("");
  lines.push(
    "STEP 2 — copy the View in Telegram link OUT of the editor, by hand."
  );
  lines.push("        This tool does not build the wrapper, and must never:");
  lines.push(`  ${TELEGRAM_IV_LINK_SHAPE}`);
  lines.push("");
  lines.push("UNRESOLVED — placeholders only, never invented values:");
  for (const item of verdict.unresolved) {
    lines.push(`  ${item.key} = ${item.value}`);
    lines.push(`      ${item.note}`);
  }
  return lines.join("\n");
}

function okField(
  value: string | null,
  detail?: Record<string, unknown>
): IvFieldCheck {
  return { ok: true, value, reason: null, ...(detail ? { detail } : {}) };
}

function badField(
  reason: IvReason,
  detail?: Record<string, unknown>
): IvFieldCheck {
  return { ok: false, value: null, reason, ...(detail ? { detail } : {}) };
}

/** First non-empty paragraph of a summary, whitespace-collapsed. */
function firstSummaryParagraph(summary: string): string {
  const paragraphs = summary
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return paragraphs[0] ?? "";
}

/**
 * The summary actually available for the rendered locale, using the same
 * VI-preferred / EN-fallback rule as `renderStoryMarkdown` and `StoryRow`:
 * a VI render takes `summary_vi` when it exists and falls back to the English
 * summary otherwise. Raw (pre-clip) text, because `clipText` inside the
 * Markdown renderer collapses newlines, so the first paragraph is only
 * recoverable here.
 *
 * Returns "" when no real summary exists. The Markdown renderer substitutes a
 * "No summary is available." placeholder in that case; the gate must NOT
 * treat that placeholder as a body or a description, because the record
 * forbids inventing or copying a translation that does not exist.
 */
function localizedSummary(item: FeedItem, lang: Lang): string {
  if (lang === "vi") {
    const vi = (item.summary_vi ?? "").trim();
    if (vi) return vi;
  }
  return (item.summary ?? "").trim();
}

/**
 * `renderStoryMarkdown` emits a frontmatter block whose values are all JSON
 * (`jsonField`). Reading `source_urls` back from the rendered body is what
 * makes the gate agree with the page: the source links it counts are literally
 * the links the public representation renders, not a second derivation.
 */
function markdownSourceUrls(markdown: string): string[] {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(": ");
    if (separator < 1 || line.slice(0, separator) !== "source_urls") continue;
    const raw = line.slice(separator + 2);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((url): url is string => typeof url === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * The machine-checkable field gate over real data.
 *
 * Every field is derived from the same source the public page renders, so the
 * verdict and the page cannot disagree silently: the title comes from
 * `localizedTitle` (what `StoryRow` paints), the body and its source links
 * come from `renderStoryMarkdown` (the bounded public representation the
 * record names as the body source of truth), and the description is the first
 * summary paragraph of the same locale that body renders.
 */
export function evaluateIvFieldGate(item: FeedItem, lang: Lang): IvFieldGate {
  const id8 = typeof item.id === "string" ? item.id.slice(0, 8) : "";
  const renderedLang = storyMarkdownLanguage(item, lang);
  const { text: title, fallbackFromEnglish } = localizedTitle(item, lang);
  const markdown = renderStoryMarkdown(item, lang);
  const published = normalizePublishedAtSeconds(item.published_at);

  const summary = localizedSummary(item, lang);
  const sourceUrls = markdownSourceUrls(markdown);
  const description = firstSummaryParagraph(summary).slice(
    0,
    STORY_MARKDOWN_SUMMARY_MAX_CHARS
  );
  const card = checkIvGeneratedCard();
  const imageUrl = isIvStoryId(id8) ? ivCardUrl(id8, lang) : null;

  const fields: IvFieldGate["fields"] = {
    title: title.trim()
      ? okField(sanitizeText(title, 240), {
          rendered_lang: renderedLang,
          fallback_from_en: fallbackFromEnglish,
        })
      : badField("title_missing"),
    body:
      summary.trim() && sourceUrls.length > 0
        ? okField(sanitizeText(summary, 240), {
            markdown_chars: markdown.length,
            summary_chars: summary.length,
            source_links: sourceUrls.length,
          })
        : badField(
            summary.trim()
              ? "body_missing_source_links"
              : "body_missing_summary",
            { source_links: sourceUrls.length }
          ),
    published_date: published.ok
      ? okField(
          new Date((published.unixSeconds as number) * 1000).toISOString(),
          {
            unix_seconds: published.unixSeconds,
            normalized_from_milliseconds: published.normalizedFromMilliseconds,
          }
        )
      : badField(published.reason as IvReason, {
          normalized_from_milliseconds: false,
        }),
    image_url:
      imageUrl && card.ok
        ? okField(imageUrl, {
            kind: "generated_first_party_card",
            mime: card.mime,
            width: card.width,
            height: card.height,
            dimension_sum: card.width + card.height,
            aspect_ratio: Number(card.aspectRatio?.toFixed(4)),
            max_bytes: TELEGRAM_IV_LIMITS.httpUrlPhotoBytes,
          })
        : badField(card.ok ? "image_missing" : (card.reason as IvReason)),
    site_name: SITE_NAME.trim()
      ? okField(SITE_NAME, {
          source: "src/lib/site.ts#SITE_NAME",
          consumed_by: ["og:site_name", "telegram-iv-field-gate"],
        })
      : badField("site_name_unresolved"),
    description: description.trim()
      ? okField(sanitizeText(description, 240), {
          summary_chars: summary.length,
        })
      : badField("description_missing"),
  };

  const reasons = (
    Object.keys(fields) as (keyof IvFieldGate["fields"])[]
  ).flatMap((key) => (fields[key].ok ? [] : [fields[key].reason as IvReason]));

  return {
    iv_eligible: reasons.length === 0,
    reason: reasons[0] ?? "ok",
    reasons,
    id: id8,
    requested_lang: lang,
    rendered_lang: renderedLang,
    fallback_from_en: lang === "vi" && fallbackFromEnglish,
    fields,
    limits: TELEGRAM_IV_LIMITS,
  };
}

/** Wrap the field gate with the operator-facing, still-manual items. */
export function ivPreflightVerdict(
  item: FeedItem,
  lang: Lang,
  nowMs: number = Date.now()
): IvPreflightVerdict {
  const gate = evaluateIvFieldGate(item, lang);
  const id8 = gate.id;
  return {
    ...gate,
    source_url: isIvStoryId(id8) ? ivSourceUrl(id8, lang) : "",
    editor_url: TELEGRAM_IV_EDITOR_URL,
    iv_link_shape: TELEGRAM_IV_LINK_SHAPE,
    editor_query_template: null,
    unresolved: IV_UNRESOLVED.map((entry) => ({ ...entry })),
    checked_at: nowMs,
  };
}

/**
 * A NOT-FOUND verdict for an id that resolved to zero rows (or to more than
 * one). Structurally the same shape as an eligible verdict so an operator
 * never has to branch on "the gate crashed", and it still carries the source
 * URL so a wrong id is obvious from the report alone.
 */
export function ivPreflightMissing(
  id: string,
  reason: Extract<
    IvReason,
    "story_not_found" | "ambiguous_id_prefix" | "invalid_id_prefix"
  >,
  lang: Lang,
  nowMs: number = Date.now()
): IvPreflightVerdict {
  const id8 = isIvStoryId(id) ? id : "";
  const field = badField(reason);
  return {
    iv_eligible: false,
    reason,
    reasons: [reason],
    id: id8,
    requested_lang: lang,
    rendered_lang: lang,
    fallback_from_en: false,
    fields: {
      title: field,
      body: field,
      published_date: field,
      image_url: field,
      site_name: field,
      description: field,
    },
    limits: TELEGRAM_IV_LIMITS,
    source_url: id8 ? ivSourceUrl(id8, lang) : "",
    editor_url: TELEGRAM_IV_EDITOR_URL,
    iv_link_shape: TELEGRAM_IV_LINK_SHAPE,
    editor_query_template: null,
    unresolved: IV_UNRESOLVED.map((entry) => ({ ...entry })),
    checked_at: nowMs,
  };
}
