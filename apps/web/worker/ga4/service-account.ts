/**
 * Google service-account credentials for the GA4 Data API.
 *
 * The /data Audience tab reads page views / DAU / MAU from a GA4 property.
 * The Worker cannot read GA4 from the browser events it already collects, so
 * the property is pulled server-side on a schedule and stored in D1
 * (`ga4_insights`, migration 0028). This module owns the two-legged OAuth
 * handshake: a short-lived RS256 assertion signed with the service account's
 * private key, exchanged for an access token.
 *
 * Everything here is defensive on purpose. The credential arrives as one
 * env string, so a malformed or truncated value is a *configuration* answer
 * (`unconfigured`), never a crash on the sync path, and no error message ever
 * carries the key or the token back out.
 */

/** The only token endpoint we will ever post an assertion to. */
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** Read-only analytics scope — the sync must never be able to mutate GA4. */
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Google rejects `exp` more than an hour out, so keep well inside it. */
const ASSERTION_TTL_SECONDS = 3600;
/** Absorb small clock differences between the Worker and Google. */
const CLOCK_SKEW_SECONDS = 60;

/** Token requests are a fixed, tiny call — cap them so a hung socket cannot
 *  pin a sync (and the DO alarm that triggered it) open. */
export const GA4_TOKEN_TIMEOUT_MS = 10_000;

const CLIENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Ga4ServiceAccount {
  clientEmail: string;
  /** PKCS#8 PEM, exactly as downloaded from the Google console. */
  privateKey: string;
}

/**
 * Parse `GA4_SERVICE_ACCOUNT_JSON`. Returns null for anything that is not a
 * usable service-account key, so callers report `unconfigured` instead of
 * guessing a number — the same rule the Clerk mirror follows.
 */
export function parseGa4ServiceAccount(
  raw: string | undefined | null
): Ga4ServiceAccount | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  // A wrong `type` is the usual symptom of pasting a different credential
  // file; treat it as "not configured" rather than failing mid-signature.
  if (record.type !== undefined && record.type !== "service_account") {
    return null;
  }

  const clientEmail =
    typeof record.client_email === "string" ? record.client_email.trim() : "";
  const privateKey =
    typeof record.private_key === "string" ? record.private_key.trim() : "";
  if (!CLIENT_EMAIL_RE.test(clientEmail)) return null;
  if (!privateKey.includes("PRIVATE KEY")) return null;

  // `token_uri` is deliberately ignored and the endpoint is pinned to
  // GOOGLE_TOKEN_URI above. The value comes from the same env string as the
  // private key, so honouring it would only add a way to post the assertion
  // somewhere other than Google.
  return { clientEmail, privateKey };
}

function base64Url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Strip the PEM armour and return PKCS#8 DER bytes for `importKey`. */
function pkcs8FromPem(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Build the signed assertion. Split out from the exchange so the claim set is
 * testable without a network round-trip.
 */
export async function buildGa4Assertion(
  account: Ga4ServiceAccount,
  nowSec: number
): Promise<string> {
  const issuedAt = nowSec - CLOCK_SKEW_SECONDS;
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.clientEmail,
    scope: GA4_SCOPE,
    aud: GOOGLE_TOKEN_URI,
    iat: issuedAt,
    exp: issuedAt + ASSERTION_TTL_SECONDS,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claims)
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8FromPem(account.privateKey) as unknown as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput) as unknown as BufferSource
  );
  return `${signingInput}.${base64Url(signature)}`;
}

export class Ga4AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Ga4AuthError";
  }
}

/**
 * Exchange a signed assertion for a bearer token.
 *
 * Throws `Ga4AuthError` with a short, non-sensitive reason: Google's error
 * body can echo the request, so only the status is surfaced.
 */
export async function fetchGa4AccessToken(
  account: Ga4ServiceAccount,
  opts: { now?: number; fetcher?: typeof fetch } = {}
): Promise<string> {
  const nowSec = opts.now ?? Math.floor(Date.now() / 1000);
  const fetcher = opts.fetcher ?? fetch;
  const assertion = await buildGa4Assertion(account, nowSec);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GA4_TOKEN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(GOOGLE_TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Ga4AuthError(
      error instanceof Error && error.name === "AbortError"
        ? "token request timed out"
        : "token request failed"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Ga4AuthError(`token request rejected (${response.status})`);
  }

  const payload: unknown = await response.json().catch(() => null);
  const token =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { access_token?: unknown }).access_token === "string"
      ? ((payload as { access_token: string }).access_token ?? "").trim()
      : "";
  if (!token) throw new Ga4AuthError("token response carried no access token");
  return token;
}
