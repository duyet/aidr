/**
 * Clerk webhook endpoint logic (POST /api/webhooks/clerk).
 *
 * Clerk delivers `user.created` / `user.updated` / `user.deleted` through
 * Svix, which signs each delivery with the instance's webhook signing secret
 * (`CLERK_WEBHOOK_SECRET`, "whsec_…" from Clerk Dashboard → Webhooks). The
 * signature is verified before the body is parsed, and a delivery we cannot
 * verify is rejected with 401 — an unsigned or tampered event must never be
 * able to write to the account mirror or move the signup total.
 *
 * Verification is HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`
 * (WebCrypto, no SDK dependency) with a timestamp tolerance so a captured
 * delivery cannot be replayed later. Everything else — other event types,
 * unknown user shapes — is acknowledged and ignored rather than retried.
 */

import {
  type ClerkUserSyncRow,
  clerkUserEmail,
  softDeleteClerkUser,
  upsertClerkUser,
} from "./clerk-users.js";
import { toEpochSeconds } from "./time.js";

/** File route that exposes this handler. */
export const CLERK_WEBHOOK_PATH = "/api/webhooks/clerk";

const SVIX_ID_HEADER = "svix-id";
const SVIX_TIMESTAMP_HEADER = "svix-timestamp";
const SVIX_SIGNATURE_HEADER = "svix-signature";
const SVIX_TYPE_HEADER = "svix-type";
const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";

/** Replay window. Svix's documented default is 5 minutes. */
export const CLERK_WEBHOOK_TOLERANCE_SECONDS = 300;
/** A signed Clerk user event is a few KB; anything larger is not one. */
export const CLERK_WEBHOOK_MAX_BODY_BYTES = 65_536;
/** Shortest signing secret we accept (16 bytes) — rejects obvious garbage. */
const MIN_SECRET_BYTES = 16;

export const CLERK_USER_ID_PATTERN = /^user_[A-Za-z0-9_-]{1,64}$/;

export type ClerkWebhookEventType =
  | "user.created"
  | "user.updated"
  | "user.deleted";

export type ClerkWebhookAction = "upserted" | "deleted" | "ignored";

export interface ClerkWebhookEnv {
  DB?: D1Database;
  /** Svix signing secret for the Clerk webhook endpoint. */
  CLERK_WEBHOOK_SECRET?: string;
}

/* -------------------------------------------------------------------------- */
/* Signature verification                                                      */
/* -------------------------------------------------------------------------- */

export type ClerkWebhookVerifyReason =
  | "verified"
  | "missing_headers"
  | "malformed_secret"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "signature_mismatch";

export interface ClerkWebhookVerification {
  verified: boolean;
  reason: ClerkWebhookVerifyReason;
  /** svix-id, when the delivery carried one (used to key nothing today). */
  id: string | null;
  /** Verified delivery timestamp in epoch seconds. */
  timestamp: number | null;
}

function base64ToBytes(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    if (binary.length === 0) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `whsec_<base64 secret>` → raw key bytes, or null when unusable. */
export function decodeClerkWebhookSecret(secret: string): Uint8Array | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith(SECRET_PREFIX)) return null;
  const bytes = base64ToBytes(trimmed.slice(SECRET_PREFIX.length));
  if (!bytes || bytes.length < MIN_SECRET_BYTES) return null;
  return bytes;
}

async function hmacSha256(
  key: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    data as BufferSource
  );
  return new Uint8Array(signature);
}

/** Constant-time comparison: never leak a prefix match through timing. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** `<id>.<timestamp>.<body>` — the exact Svix signed content. */
export function svixSignedContent(
  id: string,
  timestamp: string,
  body: string
): string {
  return `${id}.${timestamp}.${body}`;
}

/** Build the `svix-signature` header Clerk would send. Test/fixture helper. */
export async function svixSignatureHeader(
  secret: string,
  id: string,
  timestamp: string,
  body: string
): Promise<string> {
  const key = decodeClerkWebhookSecret(secret);
  if (!key) throw new Error("invalid Clerk webhook secret");
  const mac = await hmacSha256(
    key,
    new TextEncoder().encode(svixSignedContent(id, timestamp, body))
  );
  return `${SIGNATURE_VERSION}=${bytesToBase64(mac)}`;
}

/** Every `v1=<base64>` entry in a space-separated signature header. */
function parseSignatureHeader(header: string): Uint8Array[] {
  const candidates: Uint8Array[] = [];
  for (const part of header.split(" ")) {
    const [version, value] = part.split("=", 2);
    if (version !== SIGNATURE_VERSION || !value) continue;
    const bytes = base64ToBytes(value);
    if (bytes) candidates.push(bytes);
  }
  return candidates;
}

/**
 * Verify a delivery's Svix signature. The reason is for logs and tests only —
 * every rejection is reported to the caller as a plain 401.
 */
export async function verifyClerkWebhookSignature(args: {
  headers: Headers;
  body: string;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<ClerkWebhookVerification> {
  const { headers, body, secret } = args;
  const id = headers.get(SVIX_ID_HEADER);
  const timestamp = headers.get(SVIX_TIMESTAMP_HEADER);
  const signature = headers.get(SVIX_SIGNATURE_HEADER);

  if (!id || !timestamp || !signature) {
    return { verified: false, reason: "missing_headers", id, timestamp: null };
  }

  const key = decodeClerkWebhookSecret(secret);
  if (!key) {
    return { verified: false, reason: "malformed_secret", id, timestamp: null };
  }

  if (!/^\d+$/.test(timestamp.trim())) {
    return {
      verified: false,
      reason: "malformed_timestamp",
      id,
      timestamp: null,
    };
  }
  const timestampSec = Number(timestamp.trim());
  const tolerance = args.toleranceSeconds ?? CLERK_WEBHOOK_TOLERANCE_SECONDS;
  const nowSec = toEpochSeconds(args.nowMs ?? Date.now());
  if (Math.abs(nowSec - timestampSec) > tolerance) {
    return { verified: false, reason: "stale_timestamp", id, timestamp: null };
  }

  const expected = await hmacSha256(
    key,
    new TextEncoder().encode(svixSignedContent(id, timestamp, body))
  );
  const received = parseSignatureHeader(signature);
  if (received.some((candidate) => equalBytes(candidate, expected))) {
    return { verified: true, reason: "verified", id, timestamp: timestampSec };
  }
  return { verified: false, reason: "signature_mismatch", id, timestamp: null };
}

/* -------------------------------------------------------------------------- */
/* Event parsing                                                               */
/* -------------------------------------------------------------------------- */

export interface ParsedClerkUserEvent {
  type: ClerkWebhookEventType;
  /** Verified delivery time in epoch seconds — when D1 saw this account. */
  receivedAt: number;
  /** Present for create/update; absent for delete (id is all that matters). */
  row: ClerkUserSyncRow | null;
  /** Always present; a delete only needs the id. */
  id: string;
}

export type ClerkWebhookEventResult =
  | { action: "handled"; event: ParsedClerkUserEvent }
  | { action: "ignored"; type: string };

export type ClerkEventParseResult =
  | { ok: true; result: ClerkWebhookEventResult }
  | { ok: false; error: string };

const HANDLED_EVENT_TYPES: ClerkWebhookEventType[] = [
  "user.created",
  "user.updated",
  "user.deleted",
];

/** `svix-type` header first, then an in-body `type` for older deliveries. */
export function clerkEventType(
  headers: Headers,
  payload: unknown
): string | null {
  const header = headers.get(SVIX_TYPE_HEADER);
  if (header) return header;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const type = (payload as { type?: unknown }).type;
    if (typeof type === "string" && type) return type;
  }
  return null;
}

function epochSecondsOrNull(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? toEpochSeconds(numeric)
    : null;
}

/**
 * Classify a verified delivery. Events outside the three user lifecycle types
 * (sessions, orgs, subscriptions, …) are ignored on purpose: the signup count
 * counts accounts, and an org membership is not an account.
 */
export function parseClerkUserEvent(
  payload: unknown,
  type: string | null,
  receivedAt: number
): ClerkEventParseResult {
  if (!type) return { ok: false, error: "missing event type" };
  if (!HANDLED_EVENT_TYPES.includes(type as ClerkWebhookEventType)) {
    return { ok: true, result: { action: "ignored", type } };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "invalid payload" };
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "missing event data" };
  }

  const user = data as Record<string, unknown>;
  const id = user.id;
  if (typeof id !== "string" || !CLERK_USER_ID_PATTERN.test(id)) {
    return { ok: false, error: "invalid user id" };
  }

  const eventType = type as ClerkWebhookEventType;
  if (eventType === "user.deleted") {
    return {
      ok: true,
      result: {
        action: "handled",
        event: { type: eventType, receivedAt, row: null, id },
      },
    };
  }

  // Fall back to the verified delivery time when Clerk omits created_at: that
  // records when D1 first saw the account, never a guessed creation date.
  const createdAt = epochSecondsOrNull(user.created_at) ?? receivedAt;
  return {
    ok: true,
    result: {
      action: "handled",
      event: {
        type: eventType,
        receivedAt,
        id,
        row: {
          id,
          email: clerkUserEmail(user),
          createdAt,
          updatedAt: receivedAt,
        },
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                     */
/* -------------------------------------------------------------------------- */

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST /api/webhooks/clerk. Statuses:
 * 200 acknowledged (upserted / deleted / ignored), 400 a signed but unusable
 * payload, 401 an unverifiable signature, 413 an oversized body, 500 a D1
 * write failure (Clerk retries), 503 the signing secret is not configured.
 */
export async function handleClerkWebhook(
  request: Request,
  env: ClerkWebhookEnv
): Promise<Response> {
  const secret = env.CLERK_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return json(503, { error: "clerk webhook not configured" });
  }

  const body = await request.text();
  if (body.length > CLERK_WEBHOOK_MAX_BODY_BYTES) {
    return json(413, { error: "payload too large" });
  }

  const verification = await verifyClerkWebhookSignature({
    headers: request.headers,
    body,
    secret,
  });
  if (!verification.verified || verification.timestamp === null) {
    // Never echo the signature, the secret, or the parsed body.
    console.warn("clerk webhook rejected:", verification.reason);
    return json(401, { error: "invalid signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(400, { error: "invalid payload" });
  }

  const parsed = parseClerkUserEvent(
    payload,
    clerkEventType(request.headers, payload),
    verification.timestamp
  );
  if (!parsed.ok) {
    console.warn("clerk webhook payload rejected:", parsed.error);
    return json(400, { error: parsed.error });
  }
  if (parsed.result.action === "ignored") {
    return json(200, { received: true, action: "ignored" });
  }

  const { event } = parsed.result;
  if (!env.DB) {
    return json(503, { error: "D1 binding DB not configured" });
  }

  try {
    if (event.type === "user.deleted") {
      await softDeleteClerkUser(env.DB, event.id, event.receivedAt);
      return json(200, { received: true, action: "deleted" });
    }
    if (event.row) {
      await upsertClerkUser(env.DB, event.row);
    }
    return json(200, { received: true, action: "upserted" });
  } catch (error) {
    console.error("clerk webhook sync failed:", error);
    // 5xx so Svix redelivers: losing a signup silently is worse than a retry.
    return json(500, { error: "sync failed" });
  }
}
