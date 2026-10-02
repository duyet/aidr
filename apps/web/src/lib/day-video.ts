/**
 * The optional YouTube video on a day archive page (`/date/YYYY-MM-DD`).
 * Dependency-free so the admin handler, the D1 query and the page all
 * validate an id with the same rule.
 */

/** At least one of `youtube_id` (16:9, desktop) or `short_id` (9:16, mobile). */
export interface DayVideo {
  youtube_id: string | null;
  short_id: string | null;
  title: string | null;
}

/** A YouTube video id is exactly 11 URL-safe base64 characters. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Day video titles are display text; keep them short. */
export const DAY_VIDEO_TITLE_MAX = 200;

export function isYoutubeId(value: unknown): value is string {
  return typeof value === "string" && YOUTUBE_ID_RE.test(value);
}

/**
 * Accepts a bare id, `youtu.be/ID`, `youtube.com/watch?v=ID`,
 * `youtube.com/shorts/ID`, `youtube.com/embed/ID` (also `/live/ID`, `/v/ID`
 * and the nocookie host). Returns the id, or null for anything else.
 */
export function parseYoutubeId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (isYoutubeId(raw)) return raw;
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    );
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let candidate: string | null | undefined = null;
  if (host === "youtu.be") {
    candidate = parts.length === 1 ? parts[0] : null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0] === "watch") {
      candidate = url.searchParams.get("v");
    } else if (
      parts.length === 2 &&
      ["shorts", "embed", "live", "v"].includes(parts[0])
    ) {
      candidate = parts[1];
    }
  }
  return isYoutubeId(candidate) ? candidate : null;
}

/** Privacy-enhanced embed URL; autoplay because it loads on click. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

export function youtubeThumbnailUrl(
  id: string,
  size: "hq" | "maxres" = "hq"
): string {
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}

export function youtubeWatchUrl(id: string, short: boolean): string {
  return short
    ? `https://www.youtube.com/shorts/${id}`
    : `https://www.youtube.com/watch?v=${id}`;
}
