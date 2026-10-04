import { dayArchivePath } from "../../src/lib/day-archive.js";
import { withSiteLang } from "../../src/lib/locale-url.js";
import { SITE_URL } from "../../src/lib/site.js";
import { storyPath } from "../../src/lib/slug.js";
import type { Lang } from "../../src/lib/types.js";
import type { Env } from "../types.js";
import {
  type DailyDigest,
  isSubrequestLimitError,
  type Notifier,
  type SendResult,
  type StoryPayload,
} from "./types.js";

/**
 * English Facebook Page (https://www.facebook.com/aidr.today).
 *
 * Official Graph only: one link post to `/{page-id}/feed`. Facebook builds
 * the preview from our own page, so the Worker never uploads a photo,
 * a video, or a publisher image. No comments, no Messenger, no likes.
 *
 * The dispatcher already caps this channel: one digest per local day from
 * 08:00 Asia/Ho_Chi_Minh, and the same trending bar, 3/day and 3h gap as
 * Telegram (6/day and 1h on a burst day). Copy is a short summary plus one
 * aidr.today link. Engagement-bait lines are refused before the request.
 *
 * A policy or auth error (and any answer we cannot trust) is recorded as
 * `ambiguous`, which the dispatcher does not retry. Repeating those calls
 * is how a Page gets restricted. A rate-limit answer is a normal failure:
 * the next hourly run tries once.
 */

const GRAPH_VERSION = "v26.0";
const GRAPH_ORIGIN = "https://graph.facebook.com";
const MESSAGE_CAP = 1500;
const TITLE_CAP = 200;
const SUMMARY_CAP = 280;
const BULLET_CAP = 160;

/** Meta asked us to stop. Another call in the same hour makes a ban likelier. */
const TERMINAL_CODES = new Set([10, 100, 190, 200, 368]);
/** Try again on the next hourly run, not in a loop. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80001, 80006]);

const ENGAGEMENT_BAIT =
  /\b(like and share|tag a friend|comment (yes|below)|share if you agree)\b/i;

export function facebookConfigured(env: Env): {
  pageId: string;
  token: string;
} {
  const pageId = env.FACEBOOK_PAGE_ID?.trim() ?? "";
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? "";
  if (pageId && !/^[A-Za-z0-9.]{3,64}$/.test(pageId)) {
    throw new Error("FACEBOOK_PAGE_ID is not a Page id");
  }
  // The Page id is public config. The token is what turns the channel on.
  // A token without an id is a deploy bug and must not post to a guessed Page.
  if (token && !pageId) {
    throw new Error(
      "FACEBOOK_PAGE_ACCESS_TOKEN is set but FACEBOOK_PAGE_ID is missing"
    );
  }
  return { pageId, token };
}

export function facebookEnabled(env: Env): boolean {
  const { pageId, token } = facebookConfigured(env);
  return Boolean(pageId && token);
}

/** Day page or story permalink, attributed to the Page. */
export function facebookLink(url: string, lang: Lang): string {
  const withLang = withSiteLang(url, lang);
  const parsed = new URL(withLang);
  parsed.searchParams.set("utm_source", "facebook");
  parsed.searchParams.set("utm_medium", "social");
  return parsed.toString();
}

function clip(value: string, cap: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= cap) return clean;
  return `${clean.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
}

/** Digest body. The link attachment is the day page, so bullets stay text. */
export function buildFacebookDigest(digest: DailyDigest): {
  message: string;
  link: string;
} {
  const heading =
    digest.lang === "en"
      ? `AI news today — ${digest.date}`
      : `AI hôm nay — ${digest.date}`;
  const lines = [heading, ""];
  for (const bullet of digest.bullets) {
    const text = clip(bullet.text, BULLET_CAP);
    if (!text) continue;
    lines.push(`• ${text}`);
  }
  const message = clip(lines.join("\n"), MESSAGE_CAP);
  const link = facebookLink(
    new URL(dayArchivePath(digest.date), SITE_URL).toString(),
    digest.lang
  );
  return { message, link };
}

/** One trending story. The link attachment is that story, not the publisher. */
export function buildFacebookStory(story: StoryPayload): {
  message: string;
  link: string;
} {
  const parts = [clip(story.title, TITLE_CAP)];
  if (story.summary) {
    const summary = clip(story.summary, SUMMARY_CAP);
    if (summary) parts.push(summary);
  }
  const message = clip(parts.join("\n\n"), MESSAGE_CAP);
  const link = facebookLink(
    new URL(storyPath(story, story.lang), SITE_URL).toString(),
    story.lang
  );
  return { message, link };
}

function redact(value: string, token: string): string {
  const clipped = value.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!token) return clipped;
  return clipped.split(token).join("[redacted]");
}

interface GraphError {
  message?: string;
  code?: number;
}

function readGraph(raw: string): { id?: string; error?: GraphError } | null {
  try {
    const parsed = JSON.parse(raw) as {
      id?: unknown;
      error?: GraphError;
    } | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      error: parsed.error,
    };
  } catch {
    return null;
  }
}

async function publishLink(
  token: string,
  pageId: string,
  message: string,
  link: string
): Promise<SendResult> {
  if (ENGAGEMENT_BAIT.test(message)) {
    return {
      ok: false,
      ambiguous: true,
      error: "refused: engagement bait",
    };
  }
  let status = 0;
  let raw = "";
  try {
    const res = await fetch(
      `${GRAPH_ORIGIN}/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message, link }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    status = res.status;
    raw = await res.text();
  } catch (error) {
    if (isSubrequestLimitError(error)) {
      return {
        ok: false,
        budgetExhausted: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      ok: false,
      ambiguous: true,
      error: `no answer from Facebook: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const graph = readGraph(raw);
  if (graph?.id && !graph.error) return { ok: true, messageId: graph.id };

  const code = graph?.error?.code;
  const detail = redact(graph?.error?.message ?? raw, token);
  const error = `Facebook ${code ?? status}: ${detail}`;
  // No JSON, or a 5xx: the post may already be on the Page.
  if (!graph || status >= 500) return { ok: false, ambiguous: true, error };
  if (code !== undefined && TERMINAL_CODES.has(code)) {
    return { ok: false, ambiguous: true, error };
  }
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    return { ok: false, error };
  }
  return { ok: false, error };
}

export const facebookEnNotifier: Notifier = {
  id: "facebook-en",
  lang: "en",
  target: (env) => facebookConfigured(env).pageId,
  enabled: facebookEnabled,

  async sendDigest(env, digest): Promise<SendResult> {
    const { pageId, token } = facebookConfigured(env);
    const post = buildFacebookDigest(digest);
    return publishLink(token, pageId, post.message, post.link);
  },

  async sendStory(env, story): Promise<SendResult> {
    const { pageId, token } = facebookConfigured(env);
    const post = buildFacebookStory(story);
    return publishLink(token, pageId, post.message, post.link);
  },
};
