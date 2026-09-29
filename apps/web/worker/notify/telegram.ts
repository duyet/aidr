import { DEFAULT_LANG } from "../../src/lib/lang.js";
import { withSiteLang } from "../../src/lib/locale-url.js";
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
import type {
  DailyDigest,
  Notifier,
  SendResult,
  StoryPayload,
} from "./types.js";

export { escapeHtml };

/**
 * Telegram channel adapter.
 *
 * - Daily digest: one message — TL;DR bullet list, each bullet linked to
 *   its story permalink, with a button to the site.
 * - Trending story: single post with the generated branded card
 *   (sendPhoto, text fallback), bold title + summary caption, Read/Discuss
 *   inline buttons.
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
 * - `is_disabled` — SET, on every message. Both messages build their links as
 *   HTML `<a>` entities and inline buttons, which Telegram never turns into a
 *   preview, so a preview can only appear if a future copy edit pastes a bare
 *   URL into a bullet. That preview would attach to ONE arbitrary bullet and
 *   misdescribe the whole digest, so it is turned off explicitly rather than
 *   inherited from whatever the API default happens to be.
 * - `prefer_small_media` — not set. There is no small-media affordance to
 *   prefer: the trending post already ships one large generated card, and a
 *   digest preview per bullet would be 8 images in one message.
 * - `prefer_large_media` — not set, for the same reason. The trending photo
 *   path is already large-media by construction (`/api/og/{id}.png`,
 *   1200x630), so asking for large media again changes nothing.
 * - `show_above_text` — not set. With `is_disabled` there is no preview to
 *   place, and on the photo path the card IS the message, not an attachment
 *   under the caption.
 *
 * Consequence worth stating: the reader-visible "plain link preview" a reader
 * gets when tapping a story link is produced by Telegram from the page's own
 * Open Graph tags, not by these options. That preview becomes predictable
 * through `articleHead` emitting the generated card as `og:image` and the
 * shared `SITE_NAME` as `og:site_name` (#231).
 */
export const DIGEST_LINK_PREVIEW: LinkPreviewOptions = { is_disabled: true };
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
export function buildDigestMessage(digest: DailyDigest): string {
  const header =
    digest.lang === "en"
      ? `<b>🗞 AI news today — ${digest.date}</b>`
      : `<b>🗞 AI hôm nay có gì — ${digest.date}</b>`;
  const lines: string[] = [header];
  let length = header.length;
  for (const bullet of digest.bullets) {
    const text = escapeHtml(bullet.text);
    const safeUrl = bullet.url ? canonicalizeMediaUrl(bullet.url) : null;
    const line = safeUrl
      ? `•  ${text} <a href="${escapeHtml(withUtm(safeUrl, digest.lang))}">→</a>`
      : `•  ${text}`;
    if (length + line.length + 2 > MESSAGE_CAP) break;
    lines.push(line);
    length += line.length + 2;
  }
  return lines.join("\n\n");
}

export function buildDigestReplyMarkup(lang: Lang = DEFAULT_LANG): object {
  return {
    inline_keyboard: [
      [
        {
          text:
            lang === "en"
              ? "Read the full digest on aidr.today →"
              : "Xem đầy đủ trên aidr.today →",
          url: withUtm(SITE_URL, lang),
        },
      ],
    ],
  };
}

/** Headlines are one bounded line in the feed; clip before the caption cap. */
const CAPTION_TITLE_CAP = 300;

/** Trending story caption: bold title, trimmed summary, meta line. */
export function buildStoryCaption(story: StoryPayload): string {
  const title = clipCaptionText(story.title, CAPTION_TITLE_CAP);
  const parts = [`<b>🔥 ${escapeHtml(title)}</b>`];
  const meta = storyMetaLine(story);
  // Telegram counts the caption AFTER entity parsing, so the raw string is an
  // upper bound. Budget from what the title and meta already spent instead of
  // hoping the 1024 ceiling holds by accident.
  const used =
    parts[0].length + (meta ? 2 + meta.length : 0) + 2 + 1 /* the "…" below */;
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

/**
 * Count the images this story actually has, so a single-photo delivery does
 * not silently look like a complete gallery. `sendMediaGroup`/album delivery
 * is a separate slice (#202); until then the copy says plainly that more
 * images exist. This is the record's "omit rather than silently drop" rule
 * applied to the plain message fallback.
 */
export function storyImageCount(story: StoryPayload): number {
  const manifestImages =
    story.media_manifest?.assets.filter((asset) => asset.type === "image")
      .length ?? 0;
  return Math.max(manifestImages, story.image_url ? 1 : 0);
}

function extraImageLine(story: StoryPayload): string {
  const extra = storyImageCount(story) - 1;
  if (extra < 1) return "";
  return story.lang === "en" ? `📎 +${extra} more` : `📎 +${extra} ảnh nữa`;
}

export function buildStoryReplyMarkup(story: StoryPayload): object {
  // Publisher links keep their own URL and receive only the Telegram
  // attribution parameter; the canonical aidr.today fallback is localed.
  const publisherLink =
    canonicalizeMediaUrl(story.url) ?? storyUrl(story, story.lang);
  return {
    inline_keyboard: [
      [
        {
          text: story.lang === "en" ? "Read →" : "Đọc bài →",
          url: withUtm(publisherLink, story.lang),
        },
        {
          text: "AI;DR",
          url: withUtm(storyUrl(story, story.lang), story.lang),
        },
      ],
    ],
  };
}

/**
 * Photo for the trending post: the GENERATED first-party card first.
 *
 * The card is the same deliberate choice `articleHead` already makes for
 * `og:image` ("Always the generated branded card — upstream image_urls can
 * 404"), and it is the same image the IV field gate points at
 * (`telegram-iv.ts`), so a reader's link preview and the channel post agree.
 * It is first-party, 200 by construction, 1200x630, under every documented
 * Telegram ceiling, and it composes the article photo itself — the record's
 * complaint was that an upstream thumb is unvalidatable (unknown dimensions,
 * hotlink behaviour, a 119 KiB huggingnews.com PNG).
 *
 * The normalized manifest thumbnail is the fallback for a story whose id
 * cannot address a card, so a story with no card shape still gets its photo.
 */
export function storyPhotoUrl(story: StoryPayload): string | null {
  const id8 = story.id.slice(0, 8);
  if (isIvStoryId(id8)) return ivCardUrl(id8, story.lang);
  return canonicalizeMediaImageUrl(
    primaryThumbnailUrl(story.media_manifest, story.image_url, story.url)
  );
}

interface TelegramResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<TelegramResponse> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  // Telegram can return non-JSON (proxy/HTML error pages); surface the
  // HTTP status instead of letting a parse error escape.
  const raw = await res.text();
  try {
    return JSON.parse(raw) as TelegramResponse;
  } catch {
    return {
      ok: false,
      description: `HTTP ${res.status}: ${raw.slice(0, 200)}`,
    };
  }
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
      const msg = await callTelegram(token, "sendMessage", {
        chat_id: options.chatId(env),
        text: buildDigestMessage(digest),
        parse_mode: "HTML",
        reply_markup: buildDigestReplyMarkup(digest.lang),
        link_preview_options: DIGEST_LINK_PREVIEW,
      });
      if (!msg.ok) return { ok: false, error: msg.description ?? "unknown" };
      return { ok: true, messageId: String(msg.result?.message_id ?? "") };
    },

    async sendStory(env: Env, story: StoryPayload): Promise<SendResult> {
      const token = env.TELEGRAM_BOT_TOKEN as string;
      const chatId = options.chatId(env);
      const caption = buildStoryCaption(story);
      const replyMarkup = buildStoryReplyMarkup(story);
      const photoUrl = storyPhotoUrl(story);

      if (photoUrl) {
        const photo = await callTelegram(token, "sendPhoto", {
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
          link_preview_options: STORY_PHOTO_LINK_PREVIEW,
        });
        if (photo.ok)
          return {
            ok: true,
            messageId: String(photo.result?.message_id ?? ""),
          };
        console.error(
          `telegram sendPhoto failed for ${story.id}: ${photo.description}; falling back to text`
        );
      }

      const msg = await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        link_preview_options: STORY_TEXT_LINK_PREVIEW,
      });
      if (!msg.ok) return { ok: false, error: msg.description ?? "unknown" };
      return { ok: true, messageId: String(msg.result?.message_id ?? "") };
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
