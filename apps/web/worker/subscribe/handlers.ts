import { ensureMailSchema } from "../mail/schema.js";
import { checkRateLimit, hashIp, ONE_DAY_SEC } from "../rate-limit.js";
import type { Env } from "../types.js";
import { sendWelcomeEmail } from "./send.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export function isValidEmail(email: unknown): email is string {
  return (
    typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email)
  );
}

/** True iff `tz` is a IANA timezone name `Intl` actually recognizes. Guards
 * against a subscriber-supplied string that isn't a real timezone (typo,
 * garbage, or a non-IANA offset like "UTC+7") reaching storage or, worse,
 * throwing later when it's used to format a date. */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface SubscribeError {
  error: string;
  status: number;
}

export function isSubscribeError(value: unknown): value is SubscribeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

export const SUBSCRIBE_SOURCES = ["blog", "news", "home", "extension"] as const;
export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];
export const DIGEST_SIZES = [3, 5, 10] as const;
export type DigestSize = (typeof DIGEST_SIZES)[number];
const SUBSCRIBE_IP_LIMIT = 8;

export function normalizeDigestSize(value: unknown): DigestSize {
  const n = typeof value === "string" ? Number(value) : value;
  return DIGEST_SIZES.includes(n as DigestSize) ? (n as DigestSize) : 5;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
}

async function hmacUnsubscribeToken(
  email: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(email.toLowerCase())
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC(email, secret) when configured; legacy UUID otherwise. Pre-existing
 * rows keep their stored token until the subscriber re-subscribes. */
export async function deriveUnsubscribeToken(
  env: Env,
  email: string
): Promise<string> {
  if (env.NEWS_UNSUBSCRIBE_SECRET) {
    return hmacUnsubscribeToken(email, env.NEWS_UNSUBSCRIBE_SECRET);
  }
  return crypto.randomUUID();
}

export function normalizeSource(source: unknown): SubscribeSource {
  return SUBSCRIBE_SOURCES.includes(source as SubscribeSource)
    ? (source as SubscribeSource)
    : "news";
}

/** Inserts (or re-activates) a subscriber. `lang` defaults to 'vi' unless
 * 'en' is explicitly given. `timezone` defaults to DEFAULT_TIMEZONE unless
 * a valid IANA timezone string is given. */
export async function subscribe(
  env: Env,
  email: unknown,
  lang: unknown,
  timezone?: unknown,
  source?: unknown,
  ip?: string | null,
  digestSize?: unknown
): Promise<{ ok: true } | SubscribeError> {
  if (!isValidEmail(email)) {
    return { error: "invalid email", status: 400 };
  }
  const normalizedLang = lang === "en" ? "en" : "vi";
  const normalizedTimezone = isValidTimezone(timezone)
    ? timezone
    : DEFAULT_TIMEZONE;
  const normalizedSource = normalizeSource(source);
  const size = normalizeDigestSize(digestSize);
  const token = await deriveUnsubscribeToken(env, email);
  const now = Date.now();

  await ensureMailSchema(env.DB);

  if (ip) {
    const ipHash = await hashIp(ip);
    const blocked = await checkRateLimit(env.DB, {
      table: "subscribe_attempts",
      column: "ip_hash",
      key: ipHash,
      windowSec: ONE_DAY_SEC,
      limit: SUBSCRIBE_IP_LIMIT,
      now,
    });
    if (blocked) {
      return { error: "too many subscribe attempts", status: 429 };
    }
    await env.DB.prepare(
      "INSERT INTO subscribe_attempts (ip_hash, created_at) VALUES (?, ?)"
    )
      .bind(ipHash, now)
      .run();
  } else {
    console.warn("subscribe: no cf context; skipping rate limit");
  }

  await env.DB.prepare(
    `INSERT INTO subscribers (email, lang, timezone, created_at, confirmed, unsubscribe_token, digest_size)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       lang = excluded.lang, timezone = excluded.timezone, confirmed = 1,
       digest_size = excluded.digest_size`
  )
    .bind(email, normalizedLang, normalizedTimezone, now, token, size)
    .run();

  await env.DB.prepare(
    `INSERT INTO subscriber_sources (email, source, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       source = excluded.source, updated_at = excluded.updated_at`
  )
    .bind(email, normalizedSource, now)
    .run();

  // Welcome mail is best-effort — subscribe still succeeds if EMAIL is down.
  void sendWelcomeEmail(env, {
    email,
    lang: normalizedLang,
    unsubscribe_token: token,
  }).catch((error) => {
    console.error(
      "welcome email skipped:",
      error instanceof Error ? error.message : "error"
    );
  });

  return { ok: true };
}

/** Removes a subscriber by their unsubscribe token. */
export async function unsubscribe(
  env: Env,
  token: unknown
): Promise<{ ok: true } | SubscribeError> {
  if (typeof token !== "string" || token.length === 0) {
    return { error: "token is required", status: 400 };
  }
  await env.DB.prepare("DELETE FROM subscribers WHERE unsubscribe_token = ?")
    .bind(token)
    .run();
  return { ok: true };
}

export interface SubscriberPrefs {
  email_masked: string;
  lang: "en" | "vi";
  timezone: string;
  digest_size: DigestSize;
}

export async function getPrefsByToken(
  env: Env,
  token: unknown
): Promise<SubscriberPrefs | SubscribeError> {
  if (typeof token !== "string" || token.length === 0) {
    return { error: "token is required", status: 400 };
  }
  await ensureMailSchema(env.DB);
  const row = await env.DB.prepare(
    "SELECT email, lang, timezone, digest_size FROM subscribers WHERE unsubscribe_token = ?"
  )
    .bind(token)
    .first<{
      email: string;
      lang: string;
      timezone: string | null;
      digest_size: number | null;
    }>();
  if (!row) return { error: "not found", status: 404 };
  return {
    email_masked: maskEmail(row.email),
    lang: row.lang === "en" ? "en" : "vi",
    timezone: isValidTimezone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE,
    digest_size: normalizeDigestSize(row.digest_size),
  };
}

export async function updatePrefsByToken(
  env: Env,
  token: unknown,
  prefs: { lang?: unknown; timezone?: unknown; digest_size?: unknown }
): Promise<{ ok: true } | SubscribeError> {
  if (typeof token !== "string" || token.length === 0) {
    return { error: "token is required", status: 400 };
  }
  await ensureMailSchema(env.DB);
  const existing = await env.DB.prepare(
    "SELECT email FROM subscribers WHERE unsubscribe_token = ?"
  )
    .bind(token)
    .first<{ email: string }>();
  if (!existing) return { error: "not found", status: 404 };

  const lang = prefs.lang === "en" ? "en" : prefs.lang === "vi" ? "vi" : null;
  const timezone = isValidTimezone(prefs.timezone) ? prefs.timezone : null;
  const size =
    prefs.digest_size === undefined
      ? null
      : normalizeDigestSize(prefs.digest_size);

  await env.DB.prepare(
    `UPDATE subscribers SET
       lang = COALESCE(?, lang),
       timezone = COALESCE(?, timezone),
       digest_size = COALESCE(?, digest_size)
     WHERE unsubscribe_token = ?`
  )
    .bind(lang, timezone, size, token)
    .run();
  return { ok: true };
}
