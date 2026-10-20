import type { Channel } from "../src/lib/analytics/events.js";
import { isSiteUrl } from "../src/lib/locale-url.js";

/**
 * One UTM convention for every link we post: email, Telegram, Facebook, RSS
 * (the video scripts and yt-meta.py follow it too, see
 * videos/daily-news/scripts/site-links.mjs).
 *
 * - `utm_source`: the channel, one of `CHANNELS` (`events.ts`), so
 *   `channel_landing` attributes it by name instead of to `other`.
 * - `utm_medium`: the mail kind for email (`digest`, `welcome`, `notes`),
 *   `social` for Telegram and Facebook (GA4 groups it as Organic Social),
 *   `feed` for RSS.
 * - `utm_campaign`: the edition (`digest-YYYY-MM-DD`, `weekly-…`) or `story`.
 * - `utm_content`: the slot in the post (`lead`, `button`, `link`, …). A story
 *   post's slot is followed by the story id, `button-1a2b3c4d` (`postContent`),
 *   so a landing names the post it came from.
 *
 * Values stay inside the landing reader's slug alphabet (see
 * `src/lib/analytics/landing.ts`), so `channel_landing` records them as sent.
 */

export type UtmSource = Exclude<Channel, "other">;

export interface UtmTag {
  source: UtmSource;
  medium: string;
  campaign: string;
  content?: string;
}

export interface UtmOptions {
  /** Tag a non-aidr.today link too (YouTube, Chrome Web Store). */
  external?: boolean;
  /** The caller built the URL from our own origin, which may be a fork's. */
  trustedOrigin?: boolean;
}

export const STORY_CAMPAIGN = "story";

/**
 * `<slot>-<id8>` for a story post. The platform's own post id does not exist
 * until the post is sent, so the story's 8-character id prefix (the one in
 * its permalink) is the key; `notifications` maps (channel, story) to the
 * platform id. 8 hex characters keep the value inside the landing reader's
 * 64-character slug cut-off.
 */
export function postContent<S extends string>(
  slot: S,
  storyId: string
): `${S}-${string}` {
  return `${slot}-${storyId.slice(0, 8)}`;
}

export function digestCampaign(date: string): string {
  return `digest-${date}`;
}

const TOKEN_PARAMS = ["token", "t", "unsubscribe", "settings", "confirm"];
const TOKEN_PATHS = ["/api/", "/feedback"];

/** Links that act for one subscriber. They must stay byte-for-byte as built. */
export function carriesToken(u: URL): boolean {
  if (TOKEN_PATHS.some((p) => u.pathname.startsWith(p))) return true;
  return TOKEN_PARAMS.some((k) => u.searchParams.has(k));
}

/** Pure. Returns `url` unchanged when it is not an http(s) link we should
 *  tag, already has a utm param, or carries a subscriber token. */
export function withUtm(
  url: string,
  tag: UtmTag,
  opts: UtmOptions = {}
): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return url;
    if (!opts.external && !opts.trustedOrigin && !isSiteUrl(url)) return url;
    if ([...u.searchParams.keys()].some((k) => k.startsWith("utm_"))) {
      return url;
    }
    if (carriesToken(u)) return url;
    u.searchParams.set("utm_source", tag.source);
    u.searchParams.set("utm_medium", tag.medium);
    u.searchParams.set("utm_campaign", tag.campaign);
    if (tag.content) u.searchParams.set("utm_content", tag.content);
    return u.toString();
  } catch {
    return url;
  }
}
