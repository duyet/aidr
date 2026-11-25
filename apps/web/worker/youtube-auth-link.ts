import { timingSafeEqualStrings } from "@aidr/libs/workers-auth";
import { SITE_URL } from "../src/lib/site.js";
import { notesFrom } from "./mail/send.js";
import type { Env } from "./types.js";

/**
 * The one-click YouTube re-auth link: an HMAC-signed, single-use token emailed
 * to the owner. Testing-mode refresh tokens die after 7 days and no API mints
 * one, so the owner signs in with Google once and the Worker stores the result
 * (`worker/youtube-auth.ts`). Nothing here logs or returns a token.
 */

export const YOUTUBE_AUTH_PATH = "/api/internal/youtube-auth";
export const LINK_TTL_MS = 24 * 3600 * 1000;
export const STATE_TTL_MS = 15 * 60 * 1000;
const MAIL_DEDUPE_SEC = 24 * 3600;
const DEFAULT_MAX_AGE_DAYS = 5;

export type SignedPurpose = "link" | "state";
interface SignedPayload {
  p: SignedPurpose;
  exp: number;
  n: string;
}

const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function macKey(secret: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  // A key derived for this purpose only, so the broker bearer is never the MAC key itself.
  const derived = await crypto.subtle.sign(
    "HMAC",
    root,
    enc.encode("aidr/youtube-auth/v1")
  );
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function mac(secret: string, body: string): Promise<string> {
  return b64u(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await macKey(secret), enc.encode(body))
    )
  );
}

export function newNonce(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(18)));
}

export async function signPayload(
  secret: string,
  p: SignedPurpose,
  n: string,
  exp: number
): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify({ p, exp, n })));
  return `${body}.${await mac(secret, body)}`;
}

/** The payload of a token that is genuine, of this purpose and not expired. */
export async function verifyPayload(
  secret: string,
  token: string | null,
  purpose: SignedPurpose,
  nowMs: number
): Promise<{ n: string } | null> {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!timingSafeEqualStrings(sig, await mac(secret, body))) return null;
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const p = JSON.parse(json) as Partial<SignedPayload>;
    if (p.p !== purpose || typeof p.n !== "string" || !p.n) return null;
    if (typeof p.exp !== "number" || p.exp <= nowMs) return null;
    return { n: p.n };
  } catch {
    return null;
  }
}

export const linkNonceKey = (n: string) => `yt:link:${n}`;
export const stateNonceKey = (n: string) => `yt:state:${n}`;

/** Web-application client when set, else the Desktop one. */
export function youtubeClientFor(
  env: Env,
  mintedBy: string | null
): { id: string; secret: string } | null {
  const web =
    env.YOUTUBE_WEB_CLIENT_ID && env.YOUTUBE_WEB_CLIENT_SECRET
      ? { id: env.YOUTUBE_WEB_CLIENT_ID, secret: env.YOUTUBE_WEB_CLIENT_SECRET }
      : null;
  const desktop =
    env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET
      ? { id: env.YOUTUBE_CLIENT_ID, secret: env.YOUTUBE_CLIENT_SECRET }
      : null;
  // A token minted by the web client must be refreshed by it, not by the desktop one.
  if (mintedBy && web && mintedBy === web.id) return web;
  if (mintedBy && desktop && mintedBy === desktop.id) return desktop;
  return desktop ?? web;
}

/** Link-minting client: the web one first (a hosted redirect needs it). */
export function youtubeAuthClient(
  env: Env
): { id: string; secret: string } | null {
  return youtubeClientFor(
    env,
    env.YOUTUBE_WEB_CLIENT_ID ?? env.YOUTUBE_CLIENT_ID ?? null
  );
}

/** Age in ms at which the owner is warned. 0: warnings off (app in production). */
export function maxTokenAgeMs(env: Env): number {
  const raw = env.YOUTUBE_TOKEN_MAX_AGE_DAYS?.trim();
  const days = raw ? Number(raw) : DEFAULT_MAX_AGE_DAYS;
  return Number.isFinite(days) && days > 0 ? days * 24 * 3600 * 1000 : 0;
}

async function mintLink(
  env: Env,
  secret: string,
  nowMs: number
): Promise<string> {
  const n = newNonce();
  await env.HTML_CACHE?.put(linkNonceKey(n), "1", {
    expirationTtl: Math.ceil(LINK_TTL_MS / 1000) + 3600,
  });
  const t = await signPayload(secret, "link", n, nowMs + LINK_TTL_MS);
  return `${SITE_URL}${YOUTUBE_AUTH_PATH}/start?t=${t}`;
}

export type OwnerMailReason = "expiring" | "rejected";

const COPY: Record<OwnerMailReason, { subject: string; lead: string }> = {
  expiring: {
    subject: "[aidr] YouTube sign-in expires soon",
    lead: "The YouTube sign-in for the daily video is about to expire.",
  },
  rejected: {
    subject: "[aidr] YouTube sign-in stopped working",
    lead: "Google rejected the YouTube sign-in. The daily video cannot upload until you sign in again.",
  },
};

/**
 * Emails the owner the one-click link, at most once per 24 hours per reason.
 * Needs the mail binding, `OWNER_NOTIFY_EMAIL`, the broker secret and a client.
 * Never throws.
 */
export async function sendYoutubeOwnerMail(
  env: Env,
  reason: OwnerMailReason,
  nowMs: number
): Promise<boolean> {
  try {
    const kv = env.HTML_CACHE;
    const to = env.OWNER_NOTIFY_EMAIL?.trim();
    const secret = env.YOUTUBE_BROKER_SECRET;
    if (!kv || !to || !secret || !env.EMAIL || !youtubeAuthClient(env))
      return false;
    const dedupeKey = `yt:mail:${reason}`;
    if (await kv.get(dedupeKey)) return false;
    const link = await mintLink(env, secret, nowMs);
    const { subject, lead } = COPY[reason];
    const steps =
      "Open this link and sign in with the Google account that owns the channel. It works once and for 24 hours.";
    await env.EMAIL.send({
      to,
      from: notesFrom(env),
      subject,
      text: `${lead}\n\n${steps}\n\n${link}\n`,
      html: `<p>${lead}</p><p>${steps}</p><p><a href="${link}">Sign in to YouTube</a></p>`,
    });
    await kv.put(dedupeKey, String(nowMs), { expirationTtl: MAIL_DEDUPE_SEC });
    return true;
  } catch (error) {
    console.error(
      "youtube owner mail failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
