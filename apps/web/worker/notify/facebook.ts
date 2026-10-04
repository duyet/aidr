import { dayArchivePath } from "../../src/lib/day-archive.js";
import { withLang } from "../../src/lib/locale-url.js";
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
 * The Facebook Page named by FACEBOOK_PAGE_ID. No Page is built in.
 *
 * Official Graph only: one link post to `/{page-id}/feed`. Facebook builds
 * the preview from our own page, so the Worker never uploads a photo,
 * a video, or a publisher image. No comments, no Messenger, no likes.
 *
 * The dispatcher already caps this channel the same way as the other
 * English channel: one digest per local day, and the same trending bar,
 * cap, and gap. Copy is a short summary plus one link on this install's
 * public origin. Engagement-bait lines are refused before the request.
 *
 * A policy or auth error (and any answer we cannot trust) is recorded as
 * `ambiguous`, which the dispatcher does not retry. Repeating those calls
 * is how a Page gets restricted. A rate-limit answer is a normal failure:
 * the next hourly run tries once.
 */

const DEFAULT_GRAPH_VERSION = "v26.0";
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

/** Graph version for this install. Unset stays on the current default. */
export function facebookGraphVersion(env: Env): string {
  const raw = env.FACEBOOK_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(raw)) {
    throw new Error("FACEBOOK_GRAPH_VERSION is not a Graph version");
  }
  return raw;
}

/** Origin of the day page and story permalinks. One place to retarget a fork. */
export function facebookSiteOrigin(env: Env): string {
  const raw = env.SITE_URL?.trim();
  if (!raw) return SITE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SITE_URL is not an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SITE_URL is not an absolute URL");
  }
  return parsed.origin;
}

/** Day page or story permalink, attributed to the Page.
 *  `withLang`, not `withSiteLang`: the latter only rewrites aidr.today, and
 *  the default language is Vietnamese. A fork origin would otherwise post
 *  the English digest onto the Vietnamese day page. */
export function facebookLink(url: string, lang: Lang): string {
  const localized = withLang(url, lang);
  const parsed = new URL(localized);
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
export function buildFacebookDigest(
  digest: DailyDigest,
  origin: string = SITE_URL
): {
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
    new URL(dayArchivePath(digest.date), origin).toString(),
    digest.lang
  );
  return { message, link };
}

/** One trending story. The link attachment is that story, not the publisher. */
export function buildFacebookStory(
  story: StoryPayload,
  origin: string = SITE_URL
): {
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
    new URL(storyPath(story, story.lang), origin).toString(),
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
  link: string,
  version: string
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
      `${GRAPH_ORIGIN}/${version}/${encodeURIComponent(pageId)}/feed`,
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
    const post = buildFacebookDigest(digest, facebookSiteOrigin(env));
    return publishLink(
      token,
      pageId,
      post.message,
      post.link,
      facebookGraphVersion(env)
    );
  },

  async sendStory(env, story): Promise<SendResult> {
    const { pageId, token } = facebookConfigured(env);
    const post = buildFacebookStory(story, facebookSiteOrigin(env));
    return publishLink(
      token,
      pageId,
      post.message,
      post.link,
      facebookGraphVersion(env)
    );
  },
};
