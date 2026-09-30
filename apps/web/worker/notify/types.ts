import type { Lang } from "../../src/lib/types.js";
import type { MediaManifest } from "../media.js";
import type { Env } from "../types.js";

/** A trending story posted individually. Title and summary are already
 *  language-resolved: English uses the source fields; Vietnamese uses the
 *  translation when the title is present, otherwise the source fields. */
export interface StoryPayload {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  /** Typed candidates. Image URLs (and video posters) ride a Telegram album
   * when there is more than one. Video files stay deferred. */
  media_manifest?: MediaManifest | null;
  category: string | null;
  points: number;
  comments: number;
  rank_score: number;
  llm_importance: number | null;
  /** Content language the notifier query resolved for this story. */
  lang: Lang;
}

/** One TL;DR bullet in the daily digest; `url` is the story permalink on
 *  aidr.today (null when the bullet has no resolvable item). */
export interface DigestBullet {
  text: string;
  url: string | null;
}

export interface DailyDigest {
  /** Language of the rendered bullets and every aidr.today link. */
  lang: Lang;
  /** Local calendar date (YYYY-MM-DD) the digest covers. */
  date: string;
  bullets: DigestBullet[];
}

export interface SendResult {
  ok: boolean;
  /** Channel-native message id (Telegram message_id, Discord snowflake, ...). */
  messageId?: string;
  error?: string;
  /** Set on a failure whose outcome is unknown: the channel gave no usable
   *  answer (timeout, dropped connection, proxy error page), so the message
   *  may already be posted. It must not be sent again, now or on a later run. */
  ambiguous?: boolean;
}

/** One delivery channel (telegram, discord, ...). Each enabled channel
 *  gets ONE TL;DR digest message per local day, plus individual posts only
 *  for algo-detected trending stories (rate-limited by the dispatcher). */
export interface Notifier {
  /** Stable id — the `notifications.channel` value. */
  id: string;
  /**
   * The only language this channel carries. A locale is its own notifier
   * (`telegram` is `vi`, `telegram-en` is `en`), not a flag. The dispatcher
   * never substitutes the other language: a story or digest column in this
   * language is required, or the channel skips.
   */
  lang: Lang;
  /** Where posts go (chat id, webhook host, ...) — stored for observability. */
  target(env: Env): string;
  /** False when the channel is fully unset (local/dev). Throws when
   *  half-configured (e.g. chat id without token) so a deploy bug
   *  cannot silently skip sends. */
  enabled(env: Env): boolean;
  /** Sends the once-a-day TL;DR summary (bullet list + links). */
  sendDigest(env: Env, digest: DailyDigest): Promise<SendResult>;
  /** Sends one breaking/trending story as its own post. */
  sendStory(env: Env, story: StoryPayload): Promise<SendResult>;
}
