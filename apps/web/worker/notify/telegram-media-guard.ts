/**
 * The media rules every Telegram send obeys, checked once, before the Bot API
 * call, in `callTelegram`. A rejected call never reaches Telegram; it answers
 * like a definite `ok: false`, so the sender's own fallback chain runs and the
 * reason lands in `notifications.last_error`.
 *
 * Rules, by post kind:
 * - A story (trending post, digest highlight) shows the story's own picture.
 *   The first-party share card (`/api/og/<id>`, any host spelling of this
 *   site) is a text graphic and is rejected everywhere on a story: photo,
 *   album item, video thumbnail, text preview, and the same through
 *   `editMessageMedia` / `editMessageText`. A story preview may not point at
 *   any first-party page either: the story page's og:image is the card.
 * - Telegram never picks a preview: `sendMessage` / `editMessageText` pin
 *   `link_preview_options.url` (the publisher page for a story, the day card
 *   for the digest, the watch link for a day video) on a public http(s)
 *   host. Only a story may turn the preview off, for a publisher URL that
 *   cannot be previewed; the post still goes out, as text.
 * - A media call carries media, and an image URL is one Telegram fetches by
 *   URL: https, a public host, and a JPEG/PNG/WebP (or no extension, which
 *   Telegram sniffs). GIF, SVG, AVIF and the like are not photos to Telegram,
 *   whether the type shows as the extension or as a `format=` query.
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

/** One `sendMediaGroup` item, or the `media` of `editMessageMedia`. */
interface InputMedia {
  type?: unknown;
  media?: unknown;
  thumbnail?: unknown;
}

const SITE_HOSTNAME = new URL(SITE_URL).hostname.replace(/^www\./, "");

/** Any http(s) URL on a public host. */
function parsePublicUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return isPrivateHostname(url.hostname) ? null : url;
}

function parseHttps(raw: unknown): URL | null {
  const url = parsePublicUrl(raw);
  return url?.protocol === "https:" ? url : null;
}

function isFirstPartyHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return hostname === SITE_HOSTNAME || hostname === `www.${SITE_HOSTNAME}`;
}

/** The generated share card: `/api/og/<id>` on this site, with or without
 *  `.png`, the id8 the IV caption uses or the full id `og:image` uses. One
 *  path segment only: the day card (`/api/og/date/<day>`) is a different
 *  image and the digest's by design. */
export function isFirstPartyStoryCard(raw: unknown): boolean {
  const url = parsePublicUrl(raw);
  return (
    url !== null &&
    isFirstPartyHost(url) &&
    /^\/api\/og\/[^/]+\/?$/i.test(url.pathname)
  );
}

/** The image type a URL declares: its extension, else a `format=` query. */
function declaredImageType(url: URL): string | undefined {
  const path = url.pathname.replace(/\/+$/, "");
  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return (ext ?? url.searchParams.get("format") ?? undefined)?.toLowerCase();
}

/** Whether Telegram can take this URL as the photo of a `kind` post. */
export function imageVerdict(
  kind: TelegramPostKind,
  raw: unknown
): MediaVerdict {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, reason: "image:missing" };
  }
  const url = parseHttps(raw);
  if (!url) return { ok: false, reason: "image:unsafe_url" };
  if (kind !== "digest" && isFirstPartyStoryCard(url.toString())) {
    return { ok: false, reason: "image:first_party_card" };
  }
  const type = declaredImageType(url);
  if (type && REJECTED_IMAGE_TYPES.has(type)) {
    return { ok: false, reason: `image:unsupported_type:${type}` };
  }
  return OK;
}

function videoVerdict(raw: unknown): MediaVerdict {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, reason: "video:missing" };
  }
  return parseHttps(raw) ? OK : { ok: false, reason: "video:unsafe_url" };
}

function inputMediaVerdict(
  kind: TelegramPostKind,
  item: InputMedia | undefined
): MediaVerdict {
  if (item?.type !== "video") return imageVerdict(kind, item?.media);
  const video = videoVerdict(item.media);
  if (!video.ok || item.thumbnail === undefined) return video;
  return imageVerdict(kind, item.thumbnail);
}

/** Whether `link_preview_options` on a text post of `kind` is allowed. */
export function previewVerdict(
  kind: TelegramPostKind,
  options: unknown
): MediaVerdict {
  const preview = options as
    | { url?: unknown; is_disabled?: unknown }
    | undefined;
  if (kind === "story" && preview?.is_disabled === true) return OK;
  if (!preview || preview.is_disabled === true || !preview.url) {
    return { ok: false, reason: "text:no_preview" };
  }
  const url = parsePublicUrl(preview.url);
  if (!url) return { ok: false, reason: "text:unsafe_url" };
  if (kind === "digest") return OK;
  if (isFirstPartyStoryCard(url.toString())) {
    return { ok: false, reason: "image:first_party_card" };
  }
  return kind === "story" && isFirstPartyHost(url)
    ? { ok: false, reason: "text:first_party_preview" }
    : OK;
}

/**
 * The verdict for one Bot API call. Methods that carry no media and no
 * preview (`editMessageReplyMarkup`, `editMessageCaption`, `forwardMessage`,
 * …) pass.
 */
export function checkTelegramMedia(
  kind: TelegramPostKind,
  method: string,
  body: Record<string, unknown>
): MediaVerdict {
  switch (method) {
    case "sendPhoto":
      return imageVerdict(kind, body.photo);
    case "sendVideo":
      return inputMediaVerdict(kind, {
        type: "video",
        media: body.video,
        thumbnail: body.thumbnail,
      });
    case "editMessageMedia":
      return inputMediaVerdict(kind, body.media as InputMedia | undefined);
    case "sendMediaGroup": {
      const media = Array.isArray(body.media)
        ? (body.media as InputMedia[])
        : [];
      if (media.length === 0) return { ok: false, reason: "album:empty" };
      for (const item of media) {
        const verdict = inputMediaVerdict(kind, item);
        if (!verdict.ok) return verdict;
      }
      return OK;
    }
    case "sendMessage":
    case "editMessageText":
      return previewVerdict(kind, body.link_preview_options);
    default:
      return OK;
  }
}
