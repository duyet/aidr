import { dayArchiveOgPath } from "../../src/lib/day-archive.js";
import { absoluteSiteUrl, isSiteUrl } from "../../src/lib/locale-url.js";
import type { Env } from "../types.js";
import type { DailyDigest, Notifier, SendResult } from "./types.js";

/**
 * English Threads account. Not registered in `notifiers`.
 *
 * Official Threads API only, when a later poster is added: one image post
 * per local day. Create a container with `media_type=IMAGE` at
 * `POST /{threads-user-id}/threads`, then publish it with
 * `POST /{threads-user-id}/threads_publish` on `graph.threads.com`. Threads
 * fetches `image_url` from a public server. That URL is this site's day
 * card. Publisher images are never sent. There is no token mint here.
 *
 * Unset `THREADS_USER_ID` or `THREADS_ACCESS_TOKEN` leaves the channel off.
 * A token without a user id is a deploy bug and must not guess an account.
 * `sendDigest` and `sendStory` do not call the API.
 */

/** Threads counts a post as 500 characters. Emoji count as UTF-8 bytes. */
const TEXT_CAP = 500;
const BULLET_CAP = 160;

const NOT_WIRED: SendResult = {
  ok: false,
  error: "threads poster is not wired",
};

export interface ThreadsDailyPayload {
  /** Local calendar day. One thread for this day, not a Facebook post. */
  date: string;
  /** Caption listing that day's edition. No publisher URL. */
  text: string;
  /** Day card on aidr.today. A later poster passes this as `image_url`. */
  imageUrl: string;
}

export function threadsConfigured(env: Env): {
  userId: string;
  token: string;
} {
  const userId = env.THREADS_USER_ID?.trim() ?? "";
  const token = env.THREADS_ACCESS_TOKEN?.trim() ?? "";
  if (userId && !/^\d{5,32}$/.test(userId)) {
    throw new Error("THREADS_USER_ID is not a Threads user id");
  }
  // No committed user id. A token must not post to a guessed account.
  if (token && !userId) {
    throw new Error(
      "THREADS_ACCESS_TOKEN is set but THREADS_USER_ID is missing"
    );
  }
  return { userId, token };
}

export function threadsEnabled(env: Env): boolean {
  const { userId, token } = threadsConfigured(env);
  return Boolean(userId && token);
}

function clipLine(value: string, cap: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= cap) return clean;
  return `${clean.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
}

/** One local day's edition: the bullet list plus this site's day card. */
export function buildThreadsDaily(digest: DailyDigest): ThreadsDailyPayload {
  const heading =
    digest.lang === "en"
      ? `AI news today — ${digest.date}`
      : `AI hôm nay — ${digest.date}`;
  const lines = [heading, ""];
  for (const bullet of digest.bullets) {
    const text = clipLine(bullet.text, BULLET_CAP);
    if (!text) continue;
    const next = [...lines, `• ${text}`];
    if (next.join("\n").length > TEXT_CAP) break;
    lines.push(`• ${text}`);
  }
  const imageUrl = absoluteSiteUrl(dayArchiveOgPath(digest.date), digest.lang);
  // Threads downloads image_url. Anything off this site is a publisher file.
  if (!isSiteUrl(imageUrl)) {
    throw new Error("Threads image is not on aidr.today");
  }
  return { date: digest.date, text: lines.join("\n").trim(), imageUrl };
}

export const threadsEnNotifier: Notifier = {
  id: "threads-en",
  lang: "en",
  target: (env) => threadsConfigured(env).userId,
  enabled: threadsEnabled,

  async sendDigest(): Promise<SendResult> {
    return NOT_WIRED;
  },

  async sendStory(): Promise<SendResult> {
    return NOT_WIRED;
  },
};
