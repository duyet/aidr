import {
  getBearerToken,
  timingSafeEqualStrings,
} from "@aidr/libs/workers-auth";
import type { HealthIssue } from "./health.js";
import type { Env } from "./types.js";

/**
 * The YouTube OAuth credentials live in Cloudflare. GitHub Actions asks the
 * broker route (`/api/internal/youtube-token`) for a short-lived access token
 * instead of holding the refresh token. Google can rotate a refresh token, so
 * the newest one is kept in KV (`yt:refresh`) and read before the Worker secret.
 * Nothing here logs or returns a token, a client secret or a Google body:
 * errors carry a code only.
 */

/** Pinned: the refresh request never goes anywhere else. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YT_ACCESS_KEY = "yt:access";
export const YT_REFRESH_KEY = "yt:refresh";
/** SHA-256 of the Worker-secret refresh token `yt:refresh` was rotated from. */
export const YT_REFRESH_BASE_KEY = "yt:refresh-base";
export const YT_STATUS_KEY = "yt:status";
export const YOUTUBE_TOKEN_ALERT_KEY = "youtube-token-invalid";
/** An access token is reused until this long before it expires. */
export const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
export const DAILY_REFRESH_MS = 24 * 3600 * 1000;
const TIMEOUT_MS = 10_000;

export type YoutubeTokenErrorCode =
  | "not_configured"
  | "invalid_grant"
  | "refresh_failed"
  | "network";

export class YoutubeTokenError extends Error {
  constructor(readonly code: YoutubeTokenErrorCode) {
    super(`youtube token: ${code}`);
    this.name = "YoutubeTokenError";
  }
}

export interface YoutubeTokenStatus {
  lastOkMs?: number;
  lastErrorCode?: YoutubeTokenErrorCode;
  lastErrorMs?: number;
}

export interface YoutubeAccessToken {
  accessToken: string;
  expiresInSec: number;
}

interface CachedAccess {
  token: string;
  expiresAtMs: number;
}

async function readJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readYoutubeTokenStatus(
  env: Pick<Env, "HTML_CACHE">
): Promise<YoutubeTokenStatus> {
  if (!env.HTML_CACHE) return {};
  return (
    (await readJson<YoutubeTokenStatus>(env.HTML_CACHE, YT_STATUS_KEY)) ?? {}
  );
}

async function writeStatus(
  kv: KVNamespace,
  patch: YoutubeTokenStatus
): Promise<void> {
  try {
    const prev = (await readJson<YoutubeTokenStatus>(kv, YT_STATUS_KEY)) ?? {};
    await kv.put(YT_STATUS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // The status record is a diagnostic; losing a write must not fail a refresh.
  }
}

/** Google's `error` code from a failed refresh, or null when the body is not JSON. */
function googleErrorCode(body: unknown): string | null {
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === "string" ? code : null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The rotated token in KV, unless the owner has since put a different
 *  `YOUTUBE_REFRESH_TOKEN` on the Worker (a re-mint): then that one wins. */
async function currentRefreshToken(
  env: Env,
  kv: KVNamespace
): Promise<string | undefined> {
  const stored = await kv.get(YT_REFRESH_KEY);
  const fromEnv = env.YOUTUBE_REFRESH_TOKEN;
  if (!stored) return fromEnv;
  if (!fromEnv) return stored;
  return (await kv.get(YT_REFRESH_BASE_KEY)) === (await sha256(fromEnv))
    ? stored
    : fromEnv;
}

async function refresh(
  env: Env,
  kv: KVNamespace,
  nowMs: number
): Promise<CachedAccess> {
  const clientId = env.YOUTUBE_CLIENT_ID;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = await currentRefreshToken(env, kv);
  if (!clientId || !clientSecret || !refreshToken)
    throw new YoutubeTokenError("not_configured");

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new YoutubeTokenError("network");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new YoutubeTokenError(
      googleErrorCode(body) === "invalid_grant"
        ? "invalid_grant"
        : "refresh_failed"
    );
  }
  const ok = body as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
  };
  if (typeof ok.access_token !== "string" || !ok.access_token)
    throw new YoutubeTokenError("refresh_failed");
  const expiresInSec = Number(ok.expires_in) > 0 ? Number(ok.expires_in) : 3600;
  if (typeof ok.refresh_token === "string" && ok.refresh_token) {
    await kv.put(YT_REFRESH_KEY, ok.refresh_token);
    await kv.put(
      YT_REFRESH_BASE_KEY,
      await sha256(env.YOUTUBE_REFRESH_TOKEN ?? "")
    );
  }
  return { token: ok.access_token, expiresAtMs: nowMs + expiresInSec * 1000 };
}

/**
 * A YouTube access token: the cached one until 5 minutes before it expires,
 * else a fresh one from Google. `force` skips the cache (the daily refresh).
 * Throws `YoutubeTokenError` only.
 */
export async function getYoutubeAccessToken(
  env: Env,
  opts: { nowMs?: number; force?: boolean } = {}
): Promise<YoutubeAccessToken> {
  const nowMs = opts.nowMs ?? Date.now();
  const kv = env.HTML_CACHE;
  if (!kv) throw new YoutubeTokenError("not_configured");
  if (!opts.force) {
    const cached = await readJson<CachedAccess>(kv, YT_ACCESS_KEY);
    if (cached && cached.expiresAtMs - nowMs > EXPIRY_MARGIN_MS)
      return {
        accessToken: cached.token,
        expiresInSec: Math.floor((cached.expiresAtMs - nowMs) / 1000),
      };
  }
  try {
    const fresh = await refresh(env, kv, nowMs);
    const ttl = Math.max(60, Math.floor((fresh.expiresAtMs - nowMs) / 1000));
    await kv.put(YT_ACCESS_KEY, JSON.stringify(fresh), { expirationTtl: ttl });
    await writeStatus(kv, {
      lastOkMs: nowMs,
      lastErrorCode: undefined,
      lastErrorMs: undefined,
    });
    return {
      accessToken: fresh.token,
      expiresInSec: Math.floor((fresh.expiresAtMs - nowMs) / 1000),
    };
  } catch (error) {
    const code =
      error instanceof YoutubeTokenError ? error.code : "refresh_failed";
    if (code !== "not_configured")
      await writeStatus(kv, { lastErrorCode: code, lastErrorMs: nowMs });
    throw error instanceof YoutubeTokenError
      ? error
      : new YoutubeTokenError(code);
  }
}

/**
 * Once a day (ingest runs every 30 minutes, this is a KV read in between) so
 * the refresh token never idles, and an `invalid_grant` becomes an alert with
 * the fix. Never throws; other failures only land in the status record.
 */
export async function keepYoutubeTokenAlive(
  env: Env,
  nowMs: number
): Promise<HealthIssue | null> {
  try {
    if (!env.HTML_CACHE || !env.YOUTUBE_CLIENT_ID) return null;
    const { lastOkMs } = await readYoutubeTokenStatus(env);
    if (lastOkMs !== undefined && nowMs - lastOkMs < DAILY_REFRESH_MS)
      return null;
    await getYoutubeAccessToken(env, { nowMs, force: true });
    return null;
  } catch (error) {
    if (!(error instanceof YoutubeTokenError) || error.code !== "invalid_grant")
      return null;
    return {
      key: YOUTUBE_TOKEN_ALERT_KEY,
      severity: "error",
      title: "YouTube refresh token rejected",
      detail: "Google answered invalid_grant: uploads to YouTube will fail",
      evidence: [
        "Re-mint the token: node .agents/skills/aidr-youtube-upload/bin/yt-oauth.mjs (channel owner's account).",
        "Store it on the Worker: wrangler secret put YOUTUBE_REFRESH_TOKEN (it replaces the rotated copy in KV).",
        "A token that dies every 7 days means the OAuth consent screen is still in Testing: publish it to In production (apps/web/ALGORITHM.md, YouTube credentials).",
      ],
    };
  }
}

/** `POST /api/internal/youtube-token`: 404 while the broker secret is unset. */
export async function handleYoutubeBrokerRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers });
  const secret = env.YOUTUBE_BROKER_SECRET;
  if (!secret) return json({ error: "not found" }, 404);
  if (request.method !== "POST")
    return json({ error: "method not allowed" }, 405);
  const bearer = getBearerToken(request);
  if (!bearer || !timingSafeEqualStrings(bearer, secret))
    return json({ error: "unauthorized" }, 401);
  try {
    const token = await getYoutubeAccessToken(env);
    return json(
      { access_token: token.accessToken, expires_in: token.expiresInSec },
      200
    );
  } catch (error) {
    const code =
      error instanceof YoutubeTokenError ? error.code : "refresh_failed";
    return json({ error: code }, code === "not_configured" ? 503 : 502);
  }
}
