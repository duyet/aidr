import type { ReactElement } from "react";
import { localizedTitle } from "./display-title";
import { publisherHost } from "./publisher-host";
import { readRasterContainer, type StoryOgMime } from "./story-og-image";
import { sanitizeImageUrl } from "./tldr-images";
import { categoryColor } from "./topic-color";
import type { FeedItem, Lang } from "./types";

export const STORY_OG_WIDTH = 1200;
export const STORY_OG_HEIGHT = 630;

/** Keep a single remote thumbnail small enough for a social-card request. */
export const MAX_STORY_OG_IMAGE_BYTES = 1_000_000;
/** Largest source download when a transcoder can shrink it under the cap
 *  above. Publisher heroes are often 1-3 MB 1920px JPEGs, and a day card
 *  holds six of these in memory at once. */
export const MAX_STORY_OG_SOURCE_BYTES = 4_000_000;
/** Shortest side a photo needs before a card shows it. Smaller ones are
 *  avatars and icons: a 96px author headshot, upscaled into the panel,
 *  replaced the real hero on live cards. */
export const MIN_STORY_OG_PHOTO_SIDE = 200;
const STORY_OG_TRANSCODE_SIDE = 1200;

export {
  MAX_STORY_OG_IMAGE_PIXELS,
  MAX_STORY_OG_IMAGE_SIDE,
  type RasterContainer,
  readRasterContainer,
} from "./story-og-image";

const MAX_STORY_IMAGE_URL_LENGTH = 2048;
const DEFAULT_STORY_IMAGE_TIMEOUT_MS = 2500;
const MAX_STORY_IMAGE_TIMEOUT_MS = 5000;
export const MIN_STORY_IMAGE_TIMEOUT_MS = 50;
const MAX_TITLE_LENGTH = 280;
const MAX_HOST_LENGTH = 90;
const MAX_CATEGORY_LENGTH = 48;

/** Hard cap on rendered title lines. Satori only honours the clamp below when
 * `textOverflow: "ellipsis"` is present alongside it, so the two must stay
 * together — see `src/text/processor.ts` in satori. */
const TITLE_LINE_CLAMP = 4;
const TITLE_FONT_SIZE = 52;
const TITLE_LINE_HEIGHT = 1.12;

/** Card chrome, in pixels, so the title band can be proved collision-free. */
const CARD_PADDING_TOP = 44;
const CARD_PADDING_X = 56;
const HEADER_BLOCK = 52 + 20 + 3; // mark + padding-bottom + rule
const FOOTER_MIN_HEIGHT = 76;
const FOOTER_PADDING_BOTTOM = 22;
const FOOTER_BLOCK = FOOTER_MIN_HEIGHT + FOOTER_PADDING_BOTTOM;
const CARD_RULE = 10;
const TITLE_COLUMN_WIDTH = 650;
const TITLE_COLUMN_GAP = 38;
const IMAGE_PANEL = 360;

/** Photo-led card: the photo takes the right 56% of the card, full bleed. */
export const STORY_OG_PHOTO_WIDTH = 672;
const PHOTO_TEXT_WIDTH = STORY_OG_WIDTH - STORY_OG_PHOTO_WIDTH;
const PHOTO_PADDING_Y = 40;
const PHOTO_PADDING_LEFT = 48;
const PHOTO_PADDING_RIGHT = 40;
const PHOTO_EDGE_RULE = 8;
const PHOTO_TITLE_FONT_SIZE = 44;
const PHOTO_TITLE_LINE_HEIGHT = 1.14;
const PHOTO_TITLE_LINE_CLAMP = 5;
export const STORY_OG_PHOTO_TITLE_MAX_HEIGHT = Math.ceil(
  PHOTO_TITLE_LINE_CLAMP * PHOTO_TITLE_FONT_SIZE * PHOTO_TITLE_LINE_HEIGHT
);
/** The headline never crosses into the photo. */
export const STORY_OG_PHOTO_TITLE_RIGHT =
  PHOTO_TEXT_WIDTH - PHOTO_PADDING_RIGHT;

/** Vertical space between the header rule and the footer row. */
export const STORY_OG_TITLE_BAND_TOP = CARD_PADDING_TOP + HEADER_BLOCK;
export const STORY_OG_TITLE_BAND_HEIGHT =
  STORY_OG_HEIGHT - CARD_PADDING_TOP - HEADER_BLOCK - FOOTER_BLOCK - CARD_RULE;
/** Maximum height the clamped headline may occupy. */
export const STORY_OG_TITLE_MAX_HEIGHT = Math.ceil(
  TITLE_LINE_CLAMP * TITLE_FONT_SIZE * TITLE_LINE_HEIGHT
);
/** Left/right inset the card reserves for its chrome. */
export const STORY_OG_CONTENT_INSET_X = CARD_PADDING_X;
/** The headline column ends before the image panel starts. */
export const STORY_OG_TITLE_COLUMN_RIGHT = CARD_PADDING_X + TITLE_COLUMN_WIDTH;

const PAPER = "#f7f7f5";
const INK = "#0a0a0a";
const MUTED = "#6b6b6b";
const HAIRLINE = "#d9d7d0";
const IMAGE_WASH = "#e9e7df";
const YELLOW = "#f5c518";

export type { StoryOgMime };

export interface StoryOgImage {
  /** A data URI, never the publisher URL or its query string. */
  dataUri: string;
  mimeType: StoryOgMime;
  byteLength: number;
  width: number;
  height: number;
}

export interface StoryOgCopy {
  title: string;
  host: string;
  date: string;
  category: string;
  points: string;
  pointsLabel: string;
  comments: string;
  commentsLabel: string;
}

function boundedText(value: string, max: number): string {
  const clean = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
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

/**
 * Canonicalize a hostname for blocklist matching. A fully-qualified name may
 * carry a root label — `localhost.`, `metadata.google.internal.`, `foo..` — and
 * `URL` preserves that trailing dot verbatim. Comparing the raw hostname
 * against `localhost` / `.internal` style rules would miss every one of them,
 * so strip all trailing dots before any suffix test.
 */
function normalizeHostname(rawHostname: string): string {
  return rawHostname.toLowerCase().replace(/\.+$/, "");
}

/**
 * Validate the URL before handing it to a Worker fetch. This is a first
 * boundary check (not DNS resolution): obvious loopback, link-local,
 * private, credential-bearing, and non-HTTP URLs are rejected before any
 * request is made. Redirects are disabled by the fetcher below.
 */
export function isSafeStoryImageUrl(
  value: string | null | undefined
): value is string {
  const clean = sanitizeImageUrl(value);
  if (!clean || clean.length > MAX_STORY_IMAGE_URL_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443")
    return false;

  const host = normalizeHostname(parsed.hostname);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return false;
  }
  // Reject IP literals that are not safely routable, and reject IPv6
  // literals altogether rather than maintaining a subtly incomplete parser.
  if (/^\d+(?:\.\d+){3}$/.test(host)) return !isPrivateIpv4(host);
  if (host.includes(":") || host.startsWith("[")) return false;
  return host.length > 0 && host.length <= 253;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}

/**
 * Accept a payload only when its container is a supported raster, is
 * structurally complete (not truncated or garbage-tailed), and declares
 * dimensions inside the bounded pixel ceiling. The byte ceiling is unchanged:
 * a small file that claims huge dimensions is rejected, not tolerated.
 */
export function storyOgImageFromBytes(bytes: Uint8Array): StoryOgImage | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_STORY_OG_IMAGE_BYTES) {
    return null;
  }
  const container = readRasterContainer(bytes);
  if (!container) return null;
  const mimeType = container.mimeType;
  // resvg (the @cf-wasm/og rasterizer) draws a WebP <img> as nothing, so the
  // card would show an empty panel. A miss lets the caller use a fallback.
  if (mimeType === "image/webp") return null;
  return {
    dataUri: `data:${mimeType};base64,${encodeBase64(bytes)}`,
    mimeType,
    byteLength: bytes.byteLength,
    width: container.width,
    height: container.height,
  };
}

export function isCardSizedPhoto(image: StoryOgImage): boolean {
  return Math.min(image.width, image.height) >= MIN_STORY_OG_PHOTO_SIDE;
}

export async function readBoundedBody(
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const MAX_STORY_IMAGE_CANDIDATES = 3;

/**
 * Thumbnail first, then the manifest's other images, deduped and capped. The
 * card tries them in order so one dead upstream URL does not drop a story with
 * working images to the branded fallback.
 */
export function storyOgImageCandidates(
  item: Pick<FeedItem, "image_url" | "media_manifest">
): string[] {
  const urls = [
    item.image_url,
    ...(item.media_manifest?.assets ?? []).map((asset) =>
      asset.type === "image" ? asset.url : null
    ),
  ];
  const seen = new Set<string>();
  for (const url of urls) {
    if (url) seen.add(url);
  }
  return [...seen].slice(0, MAX_STORY_IMAGE_CANDIDATES);
}

export interface StoryImageFetchOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Re-encode a payload the renderer cannot take as is (WebP, which it
   *  draws as nothing, or a file over `MAX_STORY_OG_IMAGE_BYTES`) to a
   *  smaller JPEG, e.g. via the Cloudflare Images binding. Null means a miss. */
  transcode?: (bytes: Uint8Array) => Promise<Uint8Array | null>;
}

/** WebP or oversized raster → JPEG, at most 1200px, through the Cloudflare
 *  Images binding. */
export function imagesBindingTranscoder(
  images: ImagesBinding | undefined
): StoryImageFetchOptions["transcode"] {
  if (!images) return undefined;
  return async (bytes) => {
    try {
      const out = await images
        .input(new Blob([new Uint8Array(bytes)]).stream())
        .transform({
          width: STORY_OG_TRANSCODE_SIDE,
          height: STORY_OG_TRANSCODE_SIDE,
          fit: "scale-down",
        })
        .output({ format: "image/jpeg", quality: 85 });
      return new Uint8Array(await out.response().arrayBuffer());
    } catch {
      return null;
    }
  };
}

/**
 * Fetch a bounded raster thumbnail and inline it as data. The returned
 * object deliberately contains no source URL, query string, or headers.
 * Any timeout, redirect, non-image, oversized, or malformed response is a
 * clean miss so the renderer can use its branded fallback.
 */
export async function fetchStoryOgImage(
  value: string | null | undefined,
  options: StoryImageFetchOptions = {}
): Promise<StoryOgImage | null> {
  if (!isSafeStoryImageUrl(value)) return null;
  const clean = sanitizeImageUrl(value);
  if (!clean) return null;

  const controller = new AbortController();
  const requestedTimeout = options.timeoutMs ?? DEFAULT_STORY_IMAGE_TIMEOUT_MS;
  const timeoutMs = Math.max(
    50,
    Math.min(MAX_STORY_IMAGE_TIMEOUT_MS, requestedTimeout)
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.transcode
    ? MAX_STORY_OG_SOURCE_BYTES
    : MAX_STORY_OG_IMAGE_BYTES;
  try {
    const response = await fetcher(clean, {
      method: "GET",
      // workerd only accepts "follow" and "manual": it throws a TypeError for
      // "error" before any request is made ("won't be implemented since it
      // does not make sense at the edge; use 'manual' and check the response
      // status code"). "manual" hands the 3xx back unfollowed, and the non-OK
      // check below turns it into a clean miss.
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        // No WebP: CDNs that negotiate (TechCrunch/Photon) would send it, and
        // the rasterizer cannot draw it.
        Accept: "image/png,image/jpeg,image/gif",
        // Without a User-Agent, TechCrunch's CDN answers WebP whatever the
        // Accept header says (checked from a Worker, 2026-10-03).
        "User-Agent":
          "Mozilla/5.0 (compatible; AIDRBot/1.0; +https://aidr.today)",
      },
      signal: controller.signal,
    });
    // Covers every 3xx: `redirect: "manual"` never follows, and a redirect
    // response is never `ok`, so no Location is ever read or forwarded.
    if (!response.ok) return null;
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      contentType &&
      (!contentType.startsWith("image/") || contentType === "image/svg+xml")
    ) {
      return null;
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^\d+$/.test(length) || Number(length) > maxBytes) {
        return null;
      }
    }
    const bytes = await readBoundedBody(response, maxBytes);
    if (!bytes) return null;
    if (options.transcode) {
      // The pixel ceiling applies to the source too: the transcoder decodes it.
      const source = readRasterContainer(bytes);
      if (
        source &&
        (source.mimeType === "image/webp" ||
          bytes.byteLength > MAX_STORY_OG_IMAGE_BYTES)
      ) {
        const jpeg = await options.transcode(bytes);
        return jpeg ? storyOgImageFromBytes(jpeg) : null;
      }
    }
    return storyOgImageFromBytes(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function storyOgLanguage(value: string | null | undefined): Lang {
  return value === "vi" ? "vi" : "en";
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value)
    ? Math.max(0, Math.min(9_999_999, Math.floor(value)))
    : 0;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function storyDate(publishedAt: number): string {
  const date = new Date(publishedAt * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function storyOgCopy(item: FeedItem, lang: Lang): StoryOgCopy {
  const title = boundedText(localizedTitle(item, lang).text, MAX_TITLE_LENGTH);
  const host = boundedText(
    publisherHost(item.url) ?? "aidr.today",
    MAX_HOST_LENGTH
  );
  const date = storyDate(item.published_at);
  // Categories are editorial taxonomy, not prose, so the card shows the raw
  // value in every locale. Do not re-add a translated "Tác nhân" / "Mô hình"
  // here on the belief that the card cannot render diacritics: the loaded
  // fonts carry the full Vietnamese alphabet (see `og-fonts.ts`), so the real
  // reason is taxonomy consistency, not glyph coverage.
  const category = item.category
    ? boundedText(item.category, MAX_CATEGORY_LENGTH)
    : "";
  return {
    title,
    host,
    date,
    category,
    points: formatMetric(item.points),
    pointsLabel: lang === "vi" ? "điểm" : "points",
    comments: formatMetric(item.comments),
    commentsLabel: lang === "vi" ? "bình luận" : "comments",
  };
}

/** Branded panel for a story with no usable photo. */
function fallbackPanel(): ReactElement {
  const panelStyle = {
    display: "flex" as const,
    position: "relative" as const,
    width: `${IMAGE_PANEL}px`,
    height: `${IMAGE_PANEL}px`,
    overflow: "hidden",
    borderRadius: "28px",
    border: `1px solid ${HAIRLINE}`,
    backgroundColor: IMAGE_WASH,
  };
  return (
    <div style={panelStyle}>
      <div
        style={{
          position: "absolute",
          left: "-74px",
          top: "24px",
          width: "280px",
          height: "280px",
          borderRadius: "50%",
          border: `2px solid ${INK}`,
          opacity: 0.1,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "-30px",
          bottom: "-46px",
          width: "210px",
          height: "210px",
          borderRadius: "50%",
          backgroundColor: YELLOW,
          opacity: 0.42,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "28px",
          top: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "92px",
          height: "92px",
          backgroundColor: YELLOW,
          color: INK,
          fontSize: "24px",
          fontWeight: 700,
        }}
      >
        AI;DR
      </div>
      <div
        style={{
          position: "absolute",
          left: "28px",
          bottom: "30px",
          color: MUTED,
          fontSize: "25px",
          letterSpacing: "1px",
        }}
      >
        AI NEWS
      </div>
    </div>
  );
}

/** Pure story-card renderer shared by the Worker route and preview script.
 *  A story with a photo gets the photo-led card; one without keeps the
 *  branded headline card. */
export function storyOgCard(
  item: FeedItem,
  image: StoryOgImage | null,
  lang: Lang
): ReactElement {
  return image ? photoCard(item, image, lang) : brandedCard(item, lang);
}

/** The photo fills the right of the card, full bleed, so it reads at
 *  thumbnail size in a Facebook, Telegram, or X preview. The headline column
 *  stays on paper for contrast, whatever the photo looks like. */
function photoCard(
  item: FeedItem,
  image: StoryOgImage,
  lang: Lang
): ReactElement {
  const copy = storyOgCopy(item, lang);
  const accent = item.category ? categoryColor(item.category).light : MUTED;
  const meta = [copy.host, copy.date].filter(Boolean).join(" · ");
  const metrics =
    copy.points !== "0" || copy.comments !== "0"
      ? `${copy.points} ${copy.pointsLabel} · ${copy.comments} ${copy.commentsLabel}`
      : "";

  return (
    <div
      style={{
        display: "flex",
        width: `${STORY_OG_WIDTH}px`,
        height: `${STORY_OG_HEIGHT}px`,
        backgroundColor: PAPER,
        color: INK,
        fontFamily: "Be Vietnam Pro",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: `${PHOTO_TEXT_WIDTH}px`,
          height: "100%",
          padding: `${PHOTO_PADDING_Y}px ${PHOTO_PADDING_RIGHT}px ${PHOTO_PADDING_Y}px ${PHOTO_PADDING_LEFT}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "46px",
              height: "46px",
              backgroundColor: YELLOW,
              color: INK,
              fontSize: "27px",
              fontWeight: 700,
            }}
          >
            ;
          </div>
          <div style={{ fontSize: "36px", fontWeight: 700 }}>AI;DR</div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {copy.category ? (
            <div
              style={{
                color: accent,
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "1px",
                textTransform: "uppercase",
                marginBottom: "14px",
              }}
            >
              {copy.category}
            </div>
          ) : null}
          <div
            style={{
              fontSize: `${PHOTO_TITLE_FONT_SIZE}px`,
              fontWeight: 700,
              lineHeight: PHOTO_TITLE_LINE_HEIGHT,
              wordBreak: "break-word",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: PHOTO_TITLE_LINE_CLAMP,
              // Satori only applies the clamp with an explicit ellipsis.
              textOverflow: "ellipsis",
              maxHeight: `${STORY_OG_PHOTO_TITLE_MAX_HEIGHT}px`,
              overflow: "hidden",
            }}
          >
            {copy.title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontSize: "21px",
            color: MUTED,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta}
          </span>
          {metrics ? <span>{metrics}</span> : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: `${STORY_OG_PHOTO_WIDTH}px`,
          height: "100%",
          overflow: "hidden",
          backgroundColor: IMAGE_WASH,
        }}
      >
        <img
          src={image.dataUri}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${PHOTO_EDGE_RULE}px`,
            backgroundColor: YELLOW,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "28px",
            bottom: "28px",
            padding: "8px 14px",
            backgroundColor: INK,
            color: PAPER,
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "1px",
          }}
        >
          {lang === "vi" ? "BÀI VIẾT · aidr.today" : "STORY · aidr.today"}
        </div>
      </div>
    </div>
  );
}

function brandedCard(item: FeedItem, lang: Lang): ReactElement {
  const copy = storyOgCopy(item, lang);
  const accent = item.category ? categoryColor(item.category).light : MUTED;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: `${STORY_OG_WIDTH}px`,
        height: `${STORY_OG_HEIGHT}px`,
        backgroundColor: PAPER,
        color: INK,
        padding: `${CARD_PADDING_TOP}px ${CARD_PADDING_X}px 0`,
        fontFamily: "Be Vietnam Pro",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "20px",
          borderBottom: `3px solid ${INK}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "52px",
              height: "52px",
              backgroundColor: YELLOW,
              color: INK,
              fontSize: "30px",
              fontWeight: 700,
            }}
          >
            ;
          </div>
          <div style={{ fontSize: "40px", fontWeight: 700 }}>AI;DR</div>
        </div>
        <div style={{ fontSize: "24px", color: MUTED }}>aidr.today</div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: `${TITLE_COLUMN_GAP}px`,
          padding: "22px 0 20px",
        }}
      >
        <div
          style={{
            width: `${TITLE_COLUMN_WIDTH}px`,
            fontSize: `${TITLE_FONT_SIZE}px`,
            fontWeight: 500,
            lineHeight: TITLE_LINE_HEIGHT,
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: TITLE_LINE_CLAMP,
            // Satori only applies the line clamp when `textOverflow` is
            // explicitly "ellipsis"; without it the box grows to Infinity and
            // the headline paints over the wordmark and the footer.
            textOverflow: "ellipsis",
            // Structural backstop so the headline can never outgrow the band
            // even if the clamp above is ever dropped.
            maxHeight: `${STORY_OG_TITLE_MAX_HEIGHT}px`,
            overflow: "hidden",
          }}
        >
          {copy.title}
        </div>
        {fallbackPanel()}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: `${FOOTER_MIN_HEIGHT}px`,
          padding: `0 0 ${FOOTER_PADDING_BOTTOM}px`,
          fontSize: "23px",
          color: MUTED,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            maxWidth: `${TITLE_COLUMN_WIDTH}px`,
            whiteSpace: "nowrap",
          }}
        >
          {/* Flat siblings, never fragments: satori drops the flex gap
              between the children of a fragment, which glued each dot to
              the text after it. */}
          {[
            { key: "host", text: copy.host, color: undefined },
            ...(copy.date
              ? [{ key: "date", text: copy.date, color: undefined }]
              : []),
            ...(copy.category
              ? [{ key: "category", text: copy.category, color: accent }]
              : []),
          ].flatMap((part, index) => [
            ...(index > 0 ? [<span key={`${part.key}-dot`}>·</span>] : []),
            <span
              key={part.key}
              style={{
                color: part.color,
                // A 90-char host must degrade to an ellipsis instead of
                // being hard-clipped under the engagement counters.
                ...(index === 0
                  ? { overflow: "hidden", textOverflow: "ellipsis" }
                  : { flexShrink: 0 }),
              }}
            >
              {part.text}
            </span>,
          ])}
        </div>
        {copy.points !== "0" || copy.comments !== "0" ? (
          <div style={{ display: "flex", gap: "16px", whiteSpace: "nowrap" }}>
            <span>
              {copy.points} {copy.pointsLabel}
            </span>
            <span>·</span>
            <span>
              {copy.comments} {copy.commentsLabel}
            </span>
          </div>
        ) : null}
      </div>
      <div style={{ height: `${CARD_RULE}px`, backgroundColor: YELLOW }} />
    </div>
  );
}
