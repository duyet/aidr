/**
 * The media rules every Telegram send obeys, checked once, before the Bot API
 * call, in `callTelegram`. A rejected call never reaches Telegram; it answers
 * like a definite `ok: false`, so the sender's own fallback chain runs and the
 * reason lands in `notifications.last_error`.
 *
 * Rules, by post kind:
 * - A story (trending post, digest highlight) shows the story's own picture.
 *   The first-party share card (`/api/og/{id8}.png`) is a text graphic and
 *   is rejected everywhere on a story: photo, album item, video thumbnail,
 *   text preview.
 * - A post is never bare text: `sendMessage` must pin `link_preview_options.url`
 *   (the publisher page for a story, the day card for the digest, the watch
 *   link for a day video).
 * - A media call carries media, and an image URL is one Telegram fetches by
 *   URL: https, a public host, and a JPEG/PNG/WebP (or no extension, which
 *   Telegram sniffs). GIF, SVG, AVIF and the like are not photos to Telegram.
 *
 * Reachability and size are not checked here: Telegram fetches the URL
 * itself and answers with a definite rejection (`WEBPAGE_CURL_FAILED`,
 * `failed to get HTTP URL content`) that the sender already handles. A HEAD
 * from the Worker would spend a subrequest per image and still not predict
 * what Telegram's fetcher is allowed to reach.
 */

import { SITE_URL } from "../../src/lib/site.js";
import { isPrivateHostname } from "../media.js";

export type TelegramPostKind = "story" | "digest" | "day_video";

export type MediaVerdict = { ok: true } | { ok: false; reason: string };

const OK: MediaVerdict = { ok: true };

/** Extensions Telegram will not take as a photo by URL. Anything else with
 *  no extension is left to Telegram's own sniffing. */
const REJECTED_IMAGE_TYPES = new Set([
  "gif",
  "svg",
  "avif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
  "ico",
]);

interface AlbumItem {
  type?: unknown;
  media?: unknown;
}

function parseHttps(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) return null;
  return url;
}

/** The generated share card on this install: `/api/og/{id8}.png`. The day
 *  card (`/api/og/date/…`) is a different image and the digest's by design. */
export function isFirstPartyStoryCard(raw: unknown): boolean {
  const url = parseHttps(raw);
  if (!url) return false;
  const site = new URL(SITE_URL);
  return (
    url.host === site.host &&
    /^\/api\/og\/[^/]+\.png$/i.test(url.pathname) &&
    !url.pathname.startsWith("/api/og/date/")
  );
}

function imageVerdict(kind: TelegramPostKind, raw: unknown): MediaVerdict {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, reason: "image:missing" };
  }
  const url = parseHttps(raw);
  if (!url) return { ok: false, reason: "image:unsafe_url" };
  if (kind !== "digest" && isFirstPartyStoryCard(url.toString())) {
    return { ok: false, reason: "image:first_party_card" };
  }
  const ext = url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (ext && REJECTED_IMAGE_TYPES.has(ext)) {
    return { ok: false, reason: `image:unsupported_type:${ext}` };
  }
  return OK;
}

function videoVerdict(raw: unknown): MediaVerdict {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, reason: "video:missing" };
  }
  return parseHttps(raw) ? OK : { ok: false, reason: "video:unsafe_url" };
}

function previewVerdict(
  kind: TelegramPostKind,
  options: unknown
): MediaVerdict {
  const preview = options as
    | { url?: unknown; is_disabled?: unknown }
    | undefined;
  if (!preview || preview.is_disabled === true || !preview.url) {
    return { ok: false, reason: "text:no_preview" };
  }
  if (!parseHttps(preview.url)) return { ok: false, reason: "text:unsafe_url" };
  if (kind !== "digest" && isFirstPartyStoryCard(preview.url)) {
    return { ok: false, reason: "image:first_party_card" };
  }
  return OK;
}

/**
 * The verdict for one Bot API call. Methods that carry no media
 * (`editMessageReplyMarkup`, `getChat`, …) pass.
 */
export function checkTelegramMedia(
  kind: TelegramPostKind,
  method: string,
  body: Record<string, unknown>
): MediaVerdict {
  switch (method) {
    case "sendPhoto":
      return imageVerdict(kind, body.photo);
    case "sendVideo": {
      const video = videoVerdict(body.video);
      if (!video.ok) return video;
      return body.thumbnail === undefined
        ? OK
        : imageVerdict(kind, body.thumbnail);
    }
    case "sendMediaGroup": {
      const media = Array.isArray(body.media)
        ? (body.media as AlbumItem[])
        : [];
      if (media.length === 0) return { ok: false, reason: "album:empty" };
      for (const item of media) {
        const verdict =
          item.type === "video"
            ? videoVerdict(item.media)
            : imageVerdict(kind, item.media);
        if (!verdict.ok) return verdict;
      }
      return OK;
    }
    case "sendMessage":
      return previewVerdict(kind, body.link_preview_options);
    default:
      return OK;
  }
}
