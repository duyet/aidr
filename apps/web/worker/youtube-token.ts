import {
  getBearerToken,
  timingSafeEqualStrings,
} from "@aidr/libs/workers-auth";
import { sha256Hex } from "./hash.js";
import type { HealthIssue } from "./health.js";
import type { Env } from "./types.js";
import {
  maxTokenAgeMs,
  sendYoutubeOwnerMail,
  youtubeClientFor,
} from "./youtube-auth-link.js";
import {
  GOOGLE_TOKEN_URL,
  YOUTUBE_TOKEN_ALERT_KEY,
  YT_ACCESS_KEY,
  YT_CLIENT_KEY,
  YT_MINTED_KEY,
  YT_REFRESH_BASE_KEY,
  YT_REFRESH_KEY,
  YT_STATUS_KEY,
} from "./youtube-keys.js";
import { ytGet, ytPut } from "./yt-state.js";

export {
  GOOGLE_TOKEN_URL,
  YOUTUBE_TOKEN_ALERT_KEY,
  YT_ACCESS_KEY,
  YT_REFRESH_BASE_KEY,
  YT_REFRESH_KEY,
  YT_STATUS_KEY,
};

/**
 * The YouTube OAuth credentials live in Cloudflare. GitHub Actions asks the
 * broker route (`/api/internal/youtube-token`) for a short-lived access token
 * instead of holding the refresh token. Google can rotate a refresh token, so
 * the newest one is kept in D1 (`yt_state`, key `yt:refresh`) and read before the Worker secret.
 * Nothing here logs or returns a token, a client secret or a Google body:
 * errors carry a code only.
 */

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

async function readJson<T>(
  db: D1Database,
  key: string,
  nowMs: number
): Promise<T | null> {
  const raw = await ytGet(db, key, nowMs);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readYoutubeTokenStatus(
  env: Pick<Env, "DB">,
  nowMs: number
): Promise<YoutubeTokenStatus> {
  return (
    (await readJson<YoutubeTokenStatus>(env.DB, YT_STATUS_KEY, nowMs)) ?? {}
  );
}

export async function writeStatus(
  db: D1Database,
  patch: YoutubeTokenStatus,
  nowMs: number
): Promise<void> {
  try {
    const prev =
      (await readJson<YoutubeTokenStatus>(db, YT_STATUS_KEY, nowMs)) ?? {};
    await ytPut(
      db,
      YT_STATUS_KEY,
      JSON.stringify({ ...prev, ...patch }),
      nowMs
    );
  } catch {
    // The status record is a diagnostic; losing a write must not fail a refresh.
  }
}

/** Google's `error` code from a failed refresh, or null when the body is not JSON. */
function googleErrorCode(body: unknown): string | null {
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === "string" ? code : null;
}

/** The rotated token in D1, unless the owner has since put a different
 *  `YOUTUBE_REFRESH_TOKEN` on the Worker (a re-mint): then that one wins. */
async function currentRefreshToken(
  env: Env,
  nowMs: number
): Promise<{ token: string | undefined; viaStore: boolean }> {
  const stored = await ytGet(env.DB, YT_REFRESH_KEY, nowMs);
  const fromEnv = env.YOUTUBE_REFRESH_TOKEN;
  if (!stored) return { token: fromEnv, viaStore: false };
  if (!fromEnv) return { token: stored, viaStore: true };
  return (await ytGet(env.DB, YT_REFRESH_BASE_KEY, nowMs)) ===
    (await sha256Hex(fromEnv))
    ? { token: stored, viaStore: true }
    : { token: fromEnv, viaStore: false };
}

async function refresh(env: Env, nowMs: number): Promise<CachedAccess> {
  const current = await currentRefreshToken(env, nowMs);
  const refreshToken = current.token;
  // A refresh token only works with the client that minted it.
  const client = youtubeClientFor(
    env,
    current.viaStore ? await ytGet(env.DB, YT_CLIENT_KEY, nowMs) : null
  );
  if (!client || !refreshToken) throw new YoutubeTokenError("not_configured");
  const { id: clientId, secret: clientSecret } = client;

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
    await ytPut(env.DB, YT_REFRESH_KEY, ok.refresh_token, nowMs);
    await ytPut(
      env.DB,
      YT_REFRESH_BASE_KEY,
      await sha256Hex(env.YOUTUBE_REFRESH_TOKEN ?? ""),
      nowMs
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
  const db = env.DB;
  if (!opts.force) {
    const cached = await readJson<CachedAccess>(db, YT_ACCESS_KEY, nowMs);
    if (cached && cached.expiresAtMs - nowMs > EXPIRY_MARGIN_MS)
      return {
        accessToken: cached.token,
        expiresInSec: Math.floor((cached.expiresAtMs - nowMs) / 1000),
      };
  }
  try {
    const fresh = await refresh(env, nowMs);
    const ttl = Math.max(60, Math.floor((fresh.expiresAtMs - nowMs) / 1000));
    await ytPut(db, YT_ACCESS_KEY, JSON.stringify(fresh), nowMs, ttl);
    await writeStatus(
      db,
      { lastOkMs: nowMs, lastErrorCode: undefined, lastErrorMs: undefined },
      nowMs
    );
    return {
      accessToken: fresh.token,
      expiresInSec: Math.floor((fresh.expiresAtMs - nowMs) / 1000),
    };
  } catch (error) {
    const code =
      error instanceof YoutubeTokenError ? error.code : "refresh_failed";
    if (code !== "not_configured")
      await writeStatus(db, { lastErrorCode: code, lastErrorMs: nowMs }, nowMs);
    throw error instanceof YoutubeTokenError
      ? error
      : new YoutubeTokenError(code);
  }
}

/** Emails the owner a re-auth link once the one-click token is old enough to die
 *  (Testing-mode tokens last 7 days). No `yt:minted` record: age unknown, no warning. */
async function warnIfExpiring(env: Env, nowMs: number): Promise<void> {
  const maxAgeMs = maxTokenAgeMs(env);
  if (maxAgeMs === 0) return;
  const minted = Number(await ytGet(env.DB, YT_MINTED_KEY, nowMs));
  if (!Number.isFinite(minted) || minted <= 0) return;
  if (!(await currentRefreshToken(env, nowMs)).viaStore) return;
  if (nowMs - minted >= maxAgeMs)
    await sendYoutubeOwnerMail(env, "expiring", nowMs);
}

/**
 * Once a day (ingest runs every 30 minutes, this is a D1 read in between) so
 * the refresh token never idles, and an `invalid_grant` becomes an alert with
 * the fix. Never throws; other failures only land in the status record.
 */
export async function keepYoutubeTokenAlive(
  env: Env,
  nowMs: number
): Promise<HealthIssue | null> {
  try {
    if (!env.YOUTUBE_CLIENT_ID) return null;
    const { lastOkMs } = await readYoutubeTokenStatus(env, nowMs);
    if (lastOkMs !== undefined && nowMs - lastOkMs < DAILY_REFRESH_MS)
      return null;
    await getYoutubeAccessToken(env, { nowMs, force: true });
    await warnIfExpiring(env, nowMs);
    return null;
  } catch (error) {
    if (!(error instanceof YoutubeTokenError) || error.code !== "invalid_grant")
      return null;
    await sendYoutubeOwnerMail(env, "rejected", nowMs);
    return {
      key: YOUTUBE_TOKEN_ALERT_KEY,
      severity: "error",
      title: "YouTube refresh token rejected",
      detail: "Google answered invalid_grant: uploads to YouTube will fail",
      evidence: [
        "Re-mint the token: node .agents/skills/aidr-youtube-upload/bin/yt-oauth.mjs (channel owner's account).",
        "Store it on the Worker: wrangler secret put YOUTUBE_REFRESH_TOKEN (it replaces the rotated copy in D1).",
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
