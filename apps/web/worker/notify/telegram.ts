import { dayArchivePath } from "../../src/lib/day-archive.js";
import { DEFAULT_LANG } from "../../src/lib/lang.js";
import { absoluteSiteUrl, withSiteLang } from "../../src/lib/locale-url.js";
import { SITE_URL } from "../../src/lib/site.js";
import { storyPath } from "../../src/lib/slug.js";
import type { Lang } from "../../src/lib/types.js";
import {
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  primaryThumbnailUrl,
} from "../media.js";
import { isIvStoryId, ivCardUrl, TELEGRAM_IV_LIMITS } from "../telegram-iv.js";
import type { Env } from "../types.js";
import { escapeHtml } from "./alert.js";
import { digestPages } from "./day-card.js";
import {
  type DailyDigest,
  type DigestBullet,
  isSubrequestLimitError,
  type Notifier,
  type SendResult,
  type StoryPayload,
} from "./types.js";
import { buildVideoAlbumMedia, planVideoDelivery } from "./video.js";

export { escapeHtml };

/**
 * Telegram channel adapter.
 *
 * - Daily digest: a highlight photo of the day's top card. Stories that
 *   do not fit go in a second message (another card, or a short text
 *   reply). The rolling TL;DR is not the caption: it still leads with
 *   yesterday after midnight.
 * - Trending story: the generated branded card, plus any other story images
 *   Telegram will take in one album (`sendMediaGroup`, 2–10). One image stays
 *   `sendPhoto` so the Read / AI;DR buttons remain. Text is the fallback.
 *
 * All links carry utm_source=telegram so clicks are measurable in
 * analytics (Telegram's Bot API exposes no read receipts).
 */

/** Telegram message hard limit is 4096 chars; keep headroom. */
const MESSAGE_CAP = 4000;
/** Telegram caption hard limit is 1024 chars (TELEGRAM_IV_LIMITS.captionChars);
 *  the title and meta line are part of the same caption, so the summary cap
 *  is computed from whatever is left rather than fixed at 500. */
const CAPTION_SUMMARY_CAP = 500;

/** Bot API `LinkPreviewOptions`; see https://core.telegram.org/bots/api#linkpreviewoptions */
export interface LinkPreviewOptions {
  is_disabled?: boolean;
  prefer_small_media?: boolean;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
}

/**
 * The four Bot API flags, and why this adapter sets the one it sets.
 *
 * - `is_disabled` — SET on story messages. Their links are HTML `<a>`
 *   entities and inline buttons; a preview could only attach to an arbitrary
 *   link, so it is turned off explicitly. The digest instead pins its preview
 *   to the day page (`digestLinkPreview`).
 * - `prefer_small_media` — not set. There is no small-media affordance to
 *   prefer: the trending post already ships one large generated card.
 * - `prefer_large_media` — set on the digest only, so the day card shows
 *   full width. Not set on stories: the trending photo
 *   path is already large-media by construction (`/api/og/{id}.png`,
 *   1200x630), so asking for large media again changes nothing.
 * - `show_above_text` — set on the digest only (card first, then bullets).
 *   Not set on stories: with `is_disabled` there is no preview to
 *   place, and on the photo path the card IS the message, not an attachment
 *   under the caption.
 *
 * Consequence worth stating: the reader-visible "plain link preview" a reader
 * gets when tapping a story link is produced by Telegram from the page's own
 * Open Graph tags, not by these options. That preview becomes predictable
 * through `articleHead` emitting the generated card as `og:image` and the
 * shared `SITE_NAME` as `og:site_name` (#231).
 */
/** Day page for the digest date, e.g. `/date/2026-10-03?lang=vi`. */
export function digestDayUrl(digest: Pick<DailyDigest, "date" | "lang">) {
  return withUtm(
    new URL(dayArchivePath(digest.date), SITE_URL).toString(),
    digest.lang
  );
}

/**
 * The digest shows the day page's preview above the text: Telegram builds it
 * from the page's `og:image`, the generated day card (`/api/og/date/…`). The
 * preview is pinned to the day URL, so a bullet link can never take its place.
 */
export function digestLinkPreview(
  digest: Pick<DailyDigest, "date" | "lang">
): LinkPreviewOptions & { url: string } {
  return {
    url: digestDayUrl(digest),
    prefer_large_media: true,
    show_above_text: true,
  };
}
export const STORY_TEXT_LINK_PREVIEW: LinkPreviewOptions = {
  is_disabled: true,
};
export const STORY_PHOTO_LINK_PREVIEW: LinkPreviewOptions = {
  is_disabled: true,
};

export function withUtm(url: string, lang: Lang = DEFAULT_LANG): string {
  try {
    const u = new URL(withSiteLang(url, lang));
    u.searchParams.set("utm_source", "telegram");
    return u.toString();
  } catch {
    return url;
  }
}

/** Canonical story permalink with the Telegram channel's selected locale. */
export function storyUrl(
  story: Pick<StoryPayload, "id">,
  lang: Lang = DEFAULT_LANG
): string {
  return new URL(storyPath(story, lang), SITE_URL).toString();
}

/** TL;DR digest: header + linked bullet list, capped under the message
 *  limit — bullets that would overflow are dropped from the tail. */
/** Telegram counts a caption's limit on visible text (after entity parsing);
 *  keep headroom under TELEGRAM_IV_LIMITS.captionChars. */
const DIGEST_CAPTION_CAP = 1000;

/** Day card image for the digest date, e.g. `/api/og/date/2026-10-03.png?lang=vi`.
 *  `version` is the tile-id token. Telegram caches a photo by URL, so a
 *  new grid needs a new URL. */
export function digestCardUrl(
  digest: Pick<DailyDigest, "date" | "lang">,
  version?: string,
  part?: 2
) {
  const url = new URL(
    absoluteSiteUrl(`/api/og/date/${digest.date}.png`, digest.lang)
  );
  if (version) url.searchParams.set("v", version);
  if (part === 2) url.searchParams.set("part", "2");
  return url.toString();
}

/** Digest as a photo caption: same lines, capped on visible length. */
export function buildDigestCaption(
  digest: DailyDigest,
  headline?: string
): string {
  return buildDigestMessage(digest, DIGEST_CAPTION_CAP, headline);
}

function clipHighlightText(value: string, cap: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (cap <= 1) return "";
  if (clean.length <= cap) return clean;
  return `${clean.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
}

/** Shorten every title so the whole card fits in one caption. Dropping
 *  the tail used to leave stories on the image that the text never named. */
export function fitHighlightDigest(
  digest: DailyDigest,
  headline?: string
): DailyDigest {
  const n = digest.bullets.length;
  if (n === 0) return digest;
  const label = headline ?? digestHeadline(digest);
  // Blank line, mark, spaces, and the arrow, per story.
  const fixed = label.length + n * (2 + 4 + 1 + 2);
  const each = Math.max(32, Math.floor((DIGEST_CAPTION_CAP - fixed) / n));
  return {
    ...digest,
    bullets: digest.bullets.map((bullet) => ({
      ...bullet,
      text: clipHighlightText(bullet.text, each),
    })),
  };
}

/** Fallback mark per category when the TL;DR model gave no emoji
 *  (older snapshots, title-fallback digests). */
const CATEGORY_MARKS: Record<string, string> = {
  agents: "🤖",
  chips: "🔌",
  data: "📊",
  frameworks: "🧩",
  funding: "💰",
  industry: "🏢",
  infra: "🏗️",
  legal: "⚖️",
  models: "🧠",
  opensource: "🔓",
  "open source": "🔓",
  products: "📱",
  regulation: "🏛️",
  releases: "🚀",
  research: "🔬",
  tools: "🛠️",
};

/** Story-specific mark: the model's emoji, else the category's, else 📰. */
export function digestMark(bullet: DigestBullet): string {
  if (bullet.emoji) return bullet.emoji;
  const key = bullet.category?.trim().toLowerCase() ?? "";
  return CATEGORY_MARKS[key] ?? "📰";
}

function digestHeadline(digest: Pick<DailyDigest, "date" | "lang">): string {
  return digest.lang === "en"
    ? `🗞 AI news today — ${digest.date}`
    : `🗞 AI hôm nay có gì — ${digest.date}`;
}

export function buildDigestMessage(
  digest: DailyDigest,
  visibleCap = MESSAGE_CAP,
  headline?: string
): string {
  const label = headline ?? digestHeadline(digest);
  // Plain bold: the button and the card already open the day page.
  const header = `<b>${label}</b>`;
  const lines: string[] = [header];
  // Raw HTML length bounds the 4096 message limit; a caption's 1024 is on
  // visible text, so count that when a smaller cap is asked for.
  const measure = (raw: string, visible: string) =>
    visibleCap < MESSAGE_CAP ? visible.length : raw.length;
  let length = measure(header, label);
  for (const bullet of digest.bullets) {
    const mark = digestMark(bullet);
    const text = escapeHtml(bullet.text);
    const safeUrl = bullet.url ? canonicalizeMediaUrl(bullet.url) : null;
    const line = safeUrl
      ? `${mark} ${text} <a href="${escapeHtml(withUtm(safeUrl, digest.lang))}">→</a>`
      : `${mark} ${text}`;
    const size = measure(line, `${mark} ${bullet.text}${safeUrl ? " →" : ""}`);
    if (length + size + 2 > visibleCap) break;
    lines.push(line);
    length += size + 2;
  }
  return lines.join("\n\n");
}

export function buildDigestReplyMarkup(
  digest: Pick<DailyDigest, "date" | "lang">
): object {
  const lang = digest.lang;
  return {
    inline_keyboard: [
      [
        {
          text:
            lang === "en"
              ? "Read the full digest on aidr.today →"
              : "Xem đầy đủ trên aidr.today →",
          url: digestDayUrl(digest),
        },
      ],
    ],
  };
}

/** Headlines are one bounded line in the feed; clip before the caption cap. */
const CAPTION_TITLE_CAP = 300;

/** Trending story caption: bold title, trimmed summary, meta line.
 *  `reservedVisible` keeps a trailing line (the album Read link) inside
 *  the 1024 cap. Telegram counts that line after entity parsing. */
export function buildStoryCaption(
  story: StoryPayload,
  reservedVisible = 0
): string {
  const title = clipCaptionText(story.title, CAPTION_TITLE_CAP);
  const parts = [`<b>🔥 ${escapeHtml(title)}</b>`];
  const meta = storyMetaLine(story);
  // Telegram counts the caption AFTER entity parsing, so the raw string is an
  // upper bound. Budget from what the title and meta already spent instead of
  // hoping the 1024 ceiling holds by accident.
  const used =
    parts[0].length +
    (meta ? 2 + meta.length : 0) +
    2 +
    1 /* the "…" below */ +
    reservedVisible;
  const summaryCap = Math.min(
    CAPTION_SUMMARY_CAP,
    TELEGRAM_IV_LIMITS.captionChars - used
  );
  if (story.summary && summaryCap > 1) {
    const summary = clipCaptionText(story.summary, summaryCap);
    if (summary) parts.push(escapeHtml(summary));
  }
  if (meta) parts.push(meta);
  return parts.join("\n\n");
}

function albumReadLabel(lang: Lang): string {
  return lang === "en" ? "Read →" : "Đọc bài →";
}

/** Visible chars of the blank line plus the Read label. The href is not
 *  visible, so it is not reserved against the 1024 caption cap. */
function albumLinkReserve(lang: Lang): number {
  return "\n\n".length + albumReadLabel(lang).length;
}

/** `sendMediaGroup` has no `reply_markup`, so the Read link is one HTML
 *  line under the story caption. */
export function buildAlbumCaption(story: StoryPayload): string {
  const caption = buildStoryCaption(story, albumLinkReserve(story.lang));
  const href = escapeHtml(withUtm(storyUrl(story, story.lang), story.lang));
  const label = escapeHtml(albumReadLabel(story.lang));
  return `${caption}\n\n<a href="${href}">${label}</a>`;
}

/** Clip with an ellipsis; escaping can only lengthen the result, never shorten
 *  it, so the cap is computed on the raw text first. */
function clipCaptionText(value: string, cap: number): string {
  if (cap <= 1) return "";
  if (value.length <= cap) return value;
  return `${value.slice(0, cap - 1).trimEnd()}…`;
}

function storyMetaLine(story: StoryPayload): string {
  const meta: string[] = [];
  if (story.category)
    meta.push(`#${story.category.replace(/[^a-z0-9_]/gi, "_")}`);
  if (story.points > 0) meta.push(`▲ ${story.points}`);
  if (story.comments > 0) meta.push(`💬 ${story.comments}`);
  const extra = extraImageLine(story);
  if (extra) meta.push(extra);
  return meta.join("  ·  ");
}

/** Bot API `sendMediaGroup` accepts 2–10 items. One photo uses `sendPhoto`. */
export const TELEGRAM_ALBUM_CAP = 10;

/**
 * Count the images this story actually has. The album attaches as many as
 * Telegram allows; the caption names only the ones that did not fit.
 */
export function storyImageCount(story: StoryPayload): number {
  // Uncapped: this is how many images the story has, not how many the album
  // can carry. The caption needs the difference to say "+N more".
  const gallery = galleryImageUrls(story, Infinity);
  if (gallery.length > 0) return gallery.length;
  return story.image_url ? 1 : 0;
}

/** Images the album could not fit, so the caption can say how many are left
 *  rather than implying the story has no more. */
function extraImageLine(story: StoryPayload): string {
  const { gallery } = resolveStoryMedia(story);
  const extra = Math.max(0, storyImageCount(story) - gallery.length);
  if (extra < 1) return "";
  return story.lang === "en" ? `📎 +${extra} more` : `📎 +${extra} ảnh nữa`;
}

/**
 * One button, and it opens the aidr story page.
 *
 * It used to be two: "Read →" to the publisher, "AI;DR" to the aidr permalink.
 * Splitting them sent the reader to the source for the *link*, while the *image*
 * above it was already the first-party generated card — so the post advertised
 * one story and the button opened another. Pointing "Read →" at the aidr
 * permalink makes the button, the card, and the link preview all agree on one
 * canonical, locale-stable URL, and gives the reader the ranked summary before
 * the publisher's page.
 *
 * Not a `t.me/iv` wrapper. Instant View needs a template approved in the
 * Telegram IV Editor and an editor-generated `rhash`, which only exists inside
 * the operator's editor session. See docs/decisions/telegram-instant-view.md —
 * an `rhash` is never fabricated or guessed here. Until a template is approved,
 * the direct source link is the documented fallback: Telegram builds a plain
 * link preview from the page's own Open Graph tags, which aidr serves.
 */
export function buildStoryReplyMarkup(story: StoryPayload): object {
  return {
    inline_keyboard: [
      [
        {
          text: story.lang === "en" ? "Read →" : "Đọc bài →",
          url: withUtm(storyUrl(story, story.lang), story.lang),
        },
      ],
    ],
  };
}

/**
 * The media a trending post can send, split by how much we trust it.
 *
 * `gallery` is the story's own imagery — manifest images and video posters,
 * with the normalized thumbnail as the single-image case. This is the real
 * photo of the story, so it is what the post leads with.
 *
 * `card` is the generated first-party OG card. It is a *fallback*, not the
 * lead: it is a text graphic, so it is only used when the story has no usable
 * image, or when Telegram rejects the gallery image (hotlink/hostile CDN,
 * 400 on a dead URL). That second case used to drop the post to bare text even
 * though a working first-party image was right there.
 *
 * The card is 200 by construction, 1200x630, first-party, and under every
 * documented Telegram ceiling, which is exactly why it is the safe retry.
 */
export interface StoryMedia {
  /** Trusted story imagery, de-duplicated, at most `TELEGRAM_ALBUM_CAP`. */
  gallery: string[];
  /** Generated card URL, or null when the id cannot address one. */
  card: string | null;
}

/** Photo path: a video contributes only its poster (`sendVideo` runs first
 *  when a video passes preflight). `cap` bounds the album; pass `Infinity` to count what the story actually
 *  has, which is what the caption's "+N more" line needs. */
function galleryImageUrls(story: StoryPayload, cap = TELEGRAM_ALBUM_CAP) {
  const urls: string[] = [];
  const push = (raw: string | null | undefined) => {
    const url = canonicalizeMediaImageUrl(raw);
    if (!url || urls.includes(url) || urls.length >= cap) return;
    urls.push(url);
  };
  for (const asset of story.media_manifest?.assets ?? []) {
    if (asset.type === "image") push(asset.url);
    else push(asset.poster_url);
  }
  // A lone legacy `image_url` only counts when the manifest has nothing, so a
  // story with a gallery does not repeat its own cover twice.
  if (urls.length === 0) {
    push(primaryThumbnailUrl(story.media_manifest, story.image_url, story.url));
  }
  return urls;
}

export function resolveStoryMedia(story: StoryPayload): StoryMedia {
  const id8 = story.id.slice(0, 8);
  return {
    gallery: galleryImageUrls(story),
    card: isIvStoryId(id8) ? ivCardUrl(id8, story.lang) : null,
  };
}

/** Every media URL for the post, gallery first. Kept for callers that only
 *  need the primary image. */
export function storyPhotoUrls(story: StoryPayload): string[] {
  const { gallery, card } = resolveStoryMedia(story);
  if (gallery.length > 0) return gallery;
  return card ? [card] : [];
}

export function storyPhotoUrl(story: StoryPayload): string | null {
  return storyPhotoUrls(story)[0] ?? null;
}

/**
 * Send the story's video (or a mixed album) when the preflight proved it.
 * Returns null on a skip or when Telegram rejects the call, so the caller
 * falls back to the photo path, then text: a rejected call posts nothing. An
 * ambiguous call may have posted, so it is returned and ends the send; so
 * does a call the runtime refused for lack of subrequests.
 */
async function sendVideoStory(
  token: string,
  chatId: string,
  story: StoryPayload,
  caption: string,
  replyMarkup: object
): Promise<SendResult | null> {
  let plan: Awaited<ReturnType<typeof planVideoDelivery>>;
  try {
    plan = await planVideoDelivery(story);
  } catch (error) {
    console.error(
      `telegram video plan failed for ${story.id}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
  if (!plan) return null;
  if (plan.method === "sendVideo") {
    const res = await callTelegram(token, "sendVideo", {
      chat_id: chatId,
      video: plan.video.url,
      duration: plan.video.durationSeconds,
      supports_streaming: true,
      ...(plan.thumbnail ? { thumbnail: plan.thumbnail } : {}),
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (res.ok) return { ok: true, messageId: telegramMessageId(res.result) };
    if (res.ambiguous || res.budgetExhausted) return sendFailure(res);
    console.error(
      `telegram sendVideo failed for ${story.id}: ${res.description}; falling back`
    );
    return null;
  }
  const res = await callTelegram(token, "sendMediaGroup", {
    chat_id: chatId,
    media: buildVideoAlbumMedia(plan.items, buildAlbumCaption(story)),
  });
  if (res.ambiguous || res.budgetExhausted) return sendFailure(res);
  if (!res.ok) {
    console.error(
      `telegram video sendMediaGroup failed for ${story.id}: ${res.description}; falling back`
    );
    return null;
  }
  return { ok: true, messageId: telegramMessageId(res.result) };
}

interface TelegramResponse {
  ok: boolean;
  /** No usable answer from Telegram, so the message may or may not be posted. */
  ambiguous?: boolean;
  /** The Worker refused the request (subrequest budget); nothing was sent. */
  budgetExhausted?: boolean;
  /** `sendMessage`/`sendPhoto` return one message; `sendMediaGroup` returns an array. */
  result?: { message_id?: number } | Array<{ message_id?: number }>;
  description?: string;
}

function telegramMessageId(result: TelegramResponse["result"]): string {
  const message = Array.isArray(result) ? result[0] : result;
  return String(message?.message_id ?? "");
}

/** A failed call as a SendResult, keeping the ambiguous mark. */
function sendFailure(res: TelegramResponse): SendResult {
  return {
    ok: false,
    error: res.description ?? "unknown",
    ...(res.ambiguous ? { ambiguous: true } : {}),
    ...(res.budgetExhausted ? { budgetExhausted: true } : {}),
  };
}

/**
 * Never throws. Only a JSON answer from Telegram is a definite outcome:
 * `ok: true` posted, `ok: false` posted nothing. Everything else is
 * `ambiguous`: Telegram fetches media URLs itself, so a timeout or a dropped
 * connection can come after it accepted the message, and a non-JSON body is a
 * proxy error page (the Bot API always answers in JSON) that says nothing
 * about what Telegram did. Callers must not send again after an ambiguous
 * result.
 */
async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<TelegramResponse> {
  let status: number;
  let raw: string;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    raw = await res.text();
  } catch (error) {
    // Out of subrequests: the runtime refused before anything was sent, so
    // this is a clean retry, not an unknown outcome.
    if (isSubrequestLimitError(error)) {
      return {
        ok: false,
        budgetExhausted: true,
        description: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      ok: false,
      ambiguous: true,
      description: `no answer from Telegram: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  try {
    const parsed = JSON.parse(raw) as TelegramResponse | null;
    if (typeof parsed?.ok === "boolean") return parsed;
  } catch {
    // Not JSON: handled below.
  }
  return {
    ok: false,
    ambiguous: true,
    description: `HTTP ${status}: ${raw.slice(0, 200)}`,
  };
}

/** Chat id for a language channel. Vietnamese still accepts the old
 *  `TELEGRAM_CHAT_ID` until `.env.local` is migrated. */
export function telegramChatId(
  env: Env,
  lang: Lang
): { id: string; source: string } {
  if (lang === "en") {
    const id = env.TELEGRAM_EN_CHAT_ID?.trim() ?? "";
    return { id, source: "TELEGRAM_EN_CHAT_ID" };
  }
  const next = env.TELEGRAM_VI_CHAT_ID?.trim() ?? "";
  if (next) return { id: next, source: "TELEGRAM_VI_CHAT_ID" };
  const legacy = env.TELEGRAM_CHAT_ID?.trim() ?? "";
  return { id: legacy, source: "TELEGRAM_CHAT_ID" };
}

function telegramEnabled(env: Env, lang: Lang): boolean {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chat = telegramChatId(env, lang);
  if (chat.id && !token) {
    throw new Error(`${chat.source} is set but TELEGRAM_BOT_TOKEN is missing`);
  }
  return Boolean(token && chat.id);
}

function telegramChannel(options: {
  id: string;
  lang: Lang;
  chatId: (env: Env) => string;
  enabled: (env: Env) => boolean;
}): Notifier {
  return {
    id: options.id,
    lang: options.lang,
    target: options.chatId,
    enabled: options.enabled,

    async sendDigest(env: Env, digest: DailyDigest): Promise<SendResult> {
      const token = env.TELEGRAM_BOT_TOKEN as string;
      const chatId = options.chatId(env);
      // Lead card is the highlight. Leftovers are a second card when they
      // fill a grid, otherwise a short text reply. The edition is the
      // fallback when the day has no published stories.
      const pages = await digestPages(env, digest);
      let firstId = "";
      for (const [index, page] of pages.entries()) {
        const fitted = fitHighlightDigest(page.digest, page.headline);
        const caption = buildDigestCaption(fitted, page.headline);
        const replyTo =
          index > 0 && firstId
            ? {
                message_id: Number(firstId),
                allow_sending_without_reply: true,
              }
            : undefined;
        const markup = index === 0 ? buildDigestReplyMarkup(digest) : undefined;
        if (!page.photo) {
          const text = await callTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: caption,
            parse_mode: "HTML",
            link_preview_options: STORY_TEXT_LINK_PREVIEW,
            reply_parameters: replyTo,
          });
          if (!text.ok) {
            console.error(
              `telegram digest follow-up failed: ${text.description}`
            );
          }
          continue;
        }
        const photo = await callTelegram(token, "sendPhoto", {
          chat_id: chatId,
          photo: digestCardUrl(digest, page.version, page.part),
          caption,
          parse_mode: "HTML",
          reply_markup: markup,
          reply_parameters: replyTo,
        });
        if (photo.ok) {
          const id = telegramMessageId(photo.result);
          if (index === 0) firstId = id;
          continue;
        }
        if (index > 0) {
          console.error(
            `telegram digest follow-up photo failed: ${photo.description}`
          );
          break;
        }
        // Only a definite rejection may fall back; an ambiguous one may be posted.
        if (photo.ambiguous || photo.budgetExhausted) return sendFailure(photo);
        console.error(
          `telegram digest sendPhoto failed: ${photo.description}; sending text`
        );
        const msg = await callTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: buildDigestMessage(fitted),
          parse_mode: "HTML",
          reply_markup: buildDigestReplyMarkup(digest),
          link_preview_options: digestLinkPreview(digest),
        });
        if (!msg.ok) return sendFailure(msg);
        return { ok: true, messageId: telegramMessageId(msg.result) };
      }
      if (!firstId) return { ok: false, error: "digest was not sent" };
      return { ok: true, messageId: firstId };
    },

    async sendStory(env: Env, story: StoryPayload): Promise<SendResult> {
      const token = env.TELEGRAM_BOT_TOKEN as string;
      const chatId = options.chatId(env);
      const caption = buildStoryCaption(story);
      const replyMarkup = buildStoryReplyMarkup(story);
      const { gallery, card } = resolveStoryMedia(story);

      const video = await sendVideoStory(
        token,
        chatId,
        story,
        caption,
        replyMarkup
      );
      if (video) return video;

      const sendOne = (photo: string) =>
        callTelegram(token, "sendPhoto", {
          chat_id: chatId,
          photo,
          caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
          link_preview_options: STORY_PHOTO_LINK_PREVIEW,
        });

      if (gallery.length >= 2) {
        const albumCaption = buildAlbumCaption(story);
        const album = await callTelegram(token, "sendMediaGroup", {
          chat_id: chatId,
          media: gallery.map((media, index) =>
            index === 0
              ? {
                  type: "photo",
                  media,
                  caption: albumCaption,
                  parse_mode: "HTML",
                }
              : { type: "photo", media }
          ),
        });
        if (album.ok) {
          return { ok: true, messageId: telegramMessageId(album.result) };
        }
        // Each fallback below runs only after a definite rejection. An
        // ambiguous result may already be in the channel, so it ends the send.
        // Out of subrequests, every fallback would be refused too.
        if (album.ambiguous || album.budgetExhausted) return sendFailure(album);
        console.error(
          `telegram sendMediaGroup failed for ${story.id}: ${album.description}; falling back to one photo`
        );
        const lead = await sendOne(gallery[0]);
        if (lead.ok) {
          return { ok: true, messageId: telegramMessageId(lead.result) };
        }
        if (lead.ambiguous || lead.budgetExhausted) return sendFailure(lead);
        console.error(
          `telegram sendPhoto failed for ${story.id} ${gallery[0]}: ${lead.description}`
        );
        if (card && card !== gallery[0]) {
          const retry = await sendOne(card);
          if (retry.ok) {
            return { ok: true, messageId: telegramMessageId(retry.result) };
          }
          if (retry.ambiguous || retry.budgetExhausted)
            return sendFailure(retry);
          console.error(
            `telegram sendPhoto card fallback failed for ${story.id}: ${retry.description}`
          );
        }
      } else {
        const lead = gallery[0] ?? null;
        if (lead) {
          const photo = await sendOne(lead);
          if (photo.ok) {
            return { ok: true, messageId: telegramMessageId(photo.result) };
          }
          if (photo.ambiguous || photo.budgetExhausted)
            return sendFailure(photo);
          console.error(
            `telegram sendPhoto failed for ${story.id} ${lead}: ${photo.description}`
          );
          if (card && card !== lead) {
            const retry = await sendOne(card);
            if (retry.ok) {
              return { ok: true, messageId: telegramMessageId(retry.result) };
            }
            if (retry.ambiguous || retry.budgetExhausted)
              return sendFailure(retry);
            console.error(
              `telegram sendPhoto card fallback failed for ${story.id}: ${retry.description}`
            );
          }
        } else if (card) {
          const photo = await sendOne(card);
          if (photo.ok) {
            return { ok: true, messageId: telegramMessageId(photo.result) };
          }
          if (photo.ambiguous || photo.budgetExhausted)
            return sendFailure(photo);
          console.error(
            `telegram sendPhoto failed for ${story.id} ${card}: ${photo.description}`
          );
        }
      }

      const msg = await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        link_preview_options: STORY_TEXT_LINK_PREVIEW,
      });
      if (!msg.ok) return sendFailure(msg);
      return { ok: true, messageId: telegramMessageId(msg.result) };
    },
  };
}

/** Vietnamese channel. A second English channel is a new notifier entry,
 *  not a flag on this one. */
export const telegramNotifier: Notifier = telegramChannel({
  id: "telegram",
  lang: "vi",
  chatId: (env) => telegramChatId(env, "vi").id,
  enabled: (env) => telegramEnabled(env, "vi"),
});

/** English channel. Same bot token and the same send path; the chat id
 *  comes from TELEGRAM_EN_CHAT_ID, not a hardcoded username. */
export const telegramEnNotifier: Notifier = telegramChannel({
  id: "telegram-en",
  lang: "en",
  chatId: (env) => telegramChatId(env, "en").id,
  enabled: (env) => telegramEnabled(env, "en"),
});

/** Admin preview: same send path, any chat (the staging channel), so a format
 *  change can be checked before it reaches the real channels. */
export function telegramPreviewNotifier(lang: Lang, chatId: string): Notifier {
  return telegramChannel({
    id: `telegram-preview-${lang}`,
    lang,
    chatId: () => chatId,
    enabled: (env) => Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && chatId),
  });
}
