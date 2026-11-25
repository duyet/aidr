import { SITE_URL } from "../src/lib/site.js";
import { sha256Hex } from "./hash.js";
import type { Env } from "./types.js";
import {
  linkNonceKey,
  STATE_TTL_MS,
  signPayload,
  stateNonceKey,
  verifyPayload,
  YOUTUBE_AUTH_PATH,
  youtubeAuthClient,
} from "./youtube-auth-link.js";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  YT_ACCESS_KEY,
  YT_CLIENT_KEY,
  YT_MINTED_KEY,
  YT_REFRESH_BASE_KEY,
  YT_REFRESH_KEY,
} from "./youtube-keys.js";
import { writeStatus } from "./youtube-token.js";

/**
 * One-click YouTube sign-in: `start` (from the emailed link) sends the owner
 * to Google, `callback` swaps the code for a refresh token, checks it belongs
 * to the expected channel and stores it in KV. No token, code or Google body is
 * ever logged, echoed or put in a page.
 */

const CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
export const DEFAULT_YOUTUBE_CHANNEL_ID = "UCGDB5uD8znydgMg2XLOj04w";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
].join(" ");
const TIMEOUT_MS = 10_000;

export const youtubeRedirectUri = () =>
  `${SITE_URL}${YOUTUBE_AUTH_PATH}/callback`;

function page(status: number, title: string, message: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${message}</p></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    }
  );
}

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });

const badLink = () =>
  page(
    400,
    "Link not valid",
    "This link is wrong or has expired. Ask for a new one."
  );
const usedLink = () =>
  page(410, "Link already used", "This link was used once. Ask for a new one.");

/** `GET /api/internal/youtube-auth/start?t=...`: burns the link, goes to Google. */
export async function handleYoutubeAuthStart(
  request: Request,
  env: Env,
  nowMs = Date.now()
): Promise<Response> {
  const secret = env.YOUTUBE_BROKER_SECRET;
  if (!secret) return notFound();
  const kv = env.HTML_CACHE;
  const client = youtubeAuthClient(env);
  if (!kv || !client)
    return page(
      503,
      "Not set up",
      "The YouTube OAuth client is not configured."
    );
  const t = new URL(request.url).searchParams.get("t");
  const link = await verifyPayload(secret, t, "link", nowMs);
  if (!link) return badLink();
  if (!(await kv.get(linkNonceKey(link.n)))) return usedLink();
  await kv.delete(linkNonceKey(link.n));
  await kv.put(stateNonceKey(link.n), "1", {
    expirationTtl: Math.ceil(STATE_TTL_MS / 1000),
  });
  const state = await signPayload(
    secret,
    "state",
    link.n,
    nowMs + STATE_TTL_MS
  );
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

async function postJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { ok: res.ok, body: body ?? {} };
  } catch {
    return null;
  }
}

/** `GET /api/internal/youtube-auth/callback`: stores the new refresh token. */
export async function handleYoutubeAuthCallback(
  request: Request,
  env: Env,
  nowMs = Date.now()
): Promise<Response> {
  const secret = env.YOUTUBE_BROKER_SECRET;
  if (!secret) return notFound();
  const kv = env.HTML_CACHE;
  const client = youtubeAuthClient(env);
  if (!kv || !client)
    return page(
      503,
      "Not set up",
      "The YouTube OAuth client is not configured."
    );
  const params = new URL(request.url).searchParams;
  const state = await verifyPayload(
    secret,
    params.get("state"),
    "state",
    nowMs
  );
  if (!state) return badLink();
  if (!(await kv.get(stateNonceKey(state.n)))) return usedLink();
  await kv.delete(stateNonceKey(state.n));
  const code = params.get("code");
  if (params.get("error") || !code)
    return page(
      400,
      "Sign-in not finished",
      "Google did not give access. Ask for a new link and try again."
    );

  const exchanged = await postJson(GOOGLE_TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: youtubeRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const accessToken = exchanged?.body.access_token;
  const refreshToken = exchanged?.body.refresh_token;
  if (
    !exchanged?.ok ||
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    !refreshToken
  )
    return page(
      502,
      "Google refused the code",
      "No new token was stored. Ask for a new link and try again."
    );

  const channels = await postJson(CHANNELS_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const items = channels?.body.items;
  const ids = Array.isArray(items)
    ? items.map((i) => (i as { id?: unknown })?.id)
    : [];
  if (!channels?.ok)
    return page(
      502,
      "Could not check the channel",
      "No new token was stored. Ask for a new link and try again."
    );
  if (
    !ids.includes(env.YOUTUBE_CHANNEL_ID?.trim() || DEFAULT_YOUTUBE_CHANNEL_ID)
  )
    return page(
      403,
      "Wrong Google account",
      "That account does not own the AI;DR YouTube channel. No token was stored. Ask for a new link and sign in with the channel owner."
    );

  await kv.put(YT_REFRESH_KEY, refreshToken);
  await kv.put(
    YT_REFRESH_BASE_KEY,
    await sha256Hex(env.YOUTUBE_REFRESH_TOKEN ?? "")
  );
  await kv.put(YT_CLIENT_KEY, client.id);
  await kv.put(YT_MINTED_KEY, String(nowMs));
  await kv.delete(YT_ACCESS_KEY);
  await writeStatus(kv, {
    lastErrorCode: undefined,
    lastErrorMs: undefined,
  });
  return page(
    200,
    "YouTube is signed in",
    "The new token is stored. You can close this page."
  );
}
