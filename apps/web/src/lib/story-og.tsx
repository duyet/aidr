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

const STORY_OG_CATEGORY_LABELS_VI: Record<string, string> = {
  agents: "Tác nhân",
  chips: "Chip",
  funding: "Gọi vốn",
  infra: "Hạ tầng",
  industry: "Doanh nghiệp",
  legal: "Pháp lý",
  models: "Mô hình",
  products: "Sản phẩm",
  regulation: "Chính sách",
  releases: "Phát hành",
  research: "Nghiên cứu",
};

export type { StoryOgMime };

export interface StoryOgImage {
  /** A data URI, never the publisher URL or its query string. */
  dataUri: string;
  mimeType: StoryOgMime;
  byteLength: number;
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
  return {
    dataUri: `data:${mimeType};base64,${encodeBase64(bytes)}`,
    mimeType,
    byteLength: bytes.byteLength,
  };
}

async function readBoundedBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_STORY_OG_IMAGE_BYTES) {
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

export interface StoryImageFetchOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
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
  try {
    const response = await fetcher(clean, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "image/png,image/jpeg,image/gif,image/webp",
      },
      signal: controller.signal,
    });
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
      if (!/^\d+$/.test(length) || Number(length) > MAX_STORY_OG_IMAGE_BYTES) {
        return null;
      }
    }
    const bytes = await readBoundedBody(response);
    return bytes ? storyOgImageFromBytes(bytes) : null;
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

function storyOgCategory(category: string, lang: Lang): string {
  return lang === "vi"
    ? (STORY_OG_CATEGORY_LABELS_VI[category.toLowerCase()] ?? category)
    : category;
}

export function storyOgCopy(item: FeedItem, lang: Lang): StoryOgCopy {
  const title = boundedText(localizedTitle(item, lang).text, MAX_TITLE_LENGTH);
  const host = boundedText(
    publisherHost(item.url) ?? "aidr.today",
    MAX_HOST_LENGTH
  );
  const date = storyDate(item.published_at);
  const category = item.category
    ? boundedText(storyOgCategory(item.category, lang), MAX_CATEGORY_LENGTH)
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

function imagePanel(image: StoryOgImage | null, lang: Lang): ReactElement {
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
  if (!image) {
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

  return (
    <div style={panelStyle}>
      <img
        src={image.dataUri}
        alt=""
        style={{
          position: "absolute",
          left: "-28px",
          top: "-28px",
          width: "416px",
          height: "416px",
          objectFit: "cover",
          filter: "blur(18px)",
          opacity: 0.56,
          transform: "scale(1.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: PAPER,
          opacity: 0.28,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "24px",
          top: "24px",
          padding: "8px 12px",
          backgroundColor: YELLOW,
          color: INK,
          fontSize: "18px",
          fontWeight: 700,
          letterSpacing: "1px",
        }}
      >
        {lang === "vi" ? "BÀI VIẾT" : "STORY"}
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: "24px",
          right: "24px",
          bottom: "24px",
          height: "218px",
          overflow: "hidden",
          borderRadius: "18px",
          border: `4px solid ${PAPER}`,
          backgroundColor: IMAGE_WASH,
        }}
      >
        <img
          src={image.dataUri}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.86,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "58px",
            backgroundColor: INK,
            opacity: 0.18,
          }}
        />
      </div>
    </div>
  );
}

/** Pure story-card renderer shared by the Worker route and preview script. */
export function storyOgCard(
  item: FeedItem,
  image: StoryOgImage | null,
  lang: Lang
): ReactElement {
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
        fontFamily: "EB Garamond",
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
        {imagePanel(image, lang)}
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
            overflow: "hidden",
            whiteSpace: "nowrap",
            // A 90-char host must degrade to an ellipsis instead of being
            // hard-clipped under the engagement counters.
            textOverflow: "ellipsis",
          }}
        >
          <span>{copy.host}</span>
          {copy.date ? (
            <>
              <span>·</span>
              <span>{copy.date}</span>
            </>
          ) : null}
          {copy.category ? (
            <>
              <span>·</span>
              <span style={{ color: accent }}>{copy.category}</span>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "16px", whiteSpace: "nowrap" }}>
          <span>
            {copy.points} {copy.pointsLabel}
          </span>
          <span>·</span>
          <span>
            {copy.comments} {copy.commentsLabel}
          </span>
        </div>
      </div>
      <div style={{ height: `${CARD_RULE}px`, backgroundColor: YELLOW }} />
    </div>
  );
}
