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
  /** Set when the Worker refused to make the request at all: the Workflow
   *  instance spent its subrequest budget earlier in the run. Nothing left
   *  the isolate, so it is safe to send again, and it costs no attempt. */
  budgetExhausted?: boolean;
}

/** The runtime's error when a Worker or Workflow instance is out of
 *  subrequests. The request was never made. */
export function isSubrequestLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /too many subrequests/i.test(message);
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

/** Big-news days (a launch event, a run of major stories): a story at this
 *  importance may go past the normal cap and gap, up to the burst limits.
 *  The day's own scores open the extra room, no event list is kept. Webhooks
 *  also mark these stories "warning". */
export const TRENDING_BURST_MIN_IMPORTANCE = 9;
