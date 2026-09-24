/**
 * Proxy Clerk Frontend API through this Worker so browsers never hit
 * clerk.aidr.today directly. Cloudflare Error 1014 ("DNS points to
 * prohibited IP") blocks CNAMEs from a CF zone to Clerk's CF-hosted FAPI.
 *
 * See https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 */

import {
  CLERK_PROXY_PATH,
  resolveClerkProxyUrl,
} from "../src/lib/clerk-proxy-config.js";

export { CLERK_PROXY_PATH } from "../src/lib/clerk-proxy-config.js";

/** Upstream Frontend API (Clerk's shared edge — not the broken custom CNAME). */
export const CLERK_FAPI_ORIGIN = "https://frontend-api.clerk.dev";
const APPROVED_CLERK_FAPI_ORIGIN = new URL(CLERK_FAPI_ORIGIN).origin;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_CANONICALIZATION_LAYERS = 8;
export const CLERK_PROXY_MAX_REQUEST_BODY_BYTES = 1_048_576;
// Bound response buffering so a stalled body can become a controlled 504
// before headers are returned; never buffer an unbounded upstream stream.
const MAX_RESPONSE_BODY_BYTES = 16 * 1024 * 1024;
const TIMEOUT = Symbol("clerk proxy timeout");
const ABSOLUTE_URL_PATH = /^\/[a-z][a-z\d+.-]*:\/\//i;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "http2-settings",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const REQUEST_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "cache-control",
  "content-type",
  "cookie",
  "dnt",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "origin",
  "pragma",
  "range",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "user-agent",
  "x-requested-with",
]);
const REQUEST_HEADER_PREFIXES = ["sec-ch-", "x-clerk-", "x-client-"];
const RESPONSE_SENSITIVE_HEADERS = new Set(["clerk-secret-key"]);

export interface ClerkProxyEnv {
  CLERK_SECRET_KEY?: string;
  CLERK_PROXY_URL?: string;
  CLERK_PROXY_TIMEOUT_MS?: string | number;
}

class ResponseBodyTooLargeError extends Error {}

type ProxyRequestInit = RequestInit & { duplex?: "half" };
type Deadline = Promise<typeof TIMEOUT>;

function proxyError(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function invalidClerkProxyPath(): never {
  throw new Error("Invalid Clerk proxy path");
}

function invalidPublicProxyUrl(): never {
  throw new Error("Invalid Clerk proxy public URL");
}

function isUnsafeCanonicalPath(path: string): boolean {
  return (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("//") ||
    path.includes("\\") ||
    ABSOLUTE_URL_PATH.test(path)
  );
}

/**
 * Decode only a bounded number of layers. This catches split/nested encodings
 * before any downstream URL parser can reinterpret them as separators.
 */
function assertCanonicalClerkProxyPath(path: string): void {
  let current = path;

  for (let depth = 0; depth < MAX_CANONICALIZATION_LAYERS; depth += 1) {
    if (isUnsafeCanonicalPath(current)) invalidClerkProxyPath();

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      invalidClerkProxyPath();
    }

    if (decoded === current) return;
    current = decoded;
  }

  // More encoding layers than the bounded canonicalizer are ambiguous.
  invalidClerkProxyPath();
}

function isApprovedClerkTarget(target: URL): boolean {
  return (
    target.origin === APPROVED_CLERK_FAPI_ORIGIN &&
    !target.pathname.startsWith("//") &&
    !target.pathname.includes("\\") &&
    target.username === "" &&
    target.password === ""
  );
}

export function isClerkProxyPath(pathname: string): boolean {
  return (
    pathname === CLERK_PROXY_PATH || pathname.startsWith(`${CLERK_PROXY_PATH}/`)
  );
}

/**
 * Build a target from an absolute, fixed-origin URL. Resolving a path such as
 * `//host` against an origin would let the path replace the origin.
 */
export function buildClerkProxyTarget(request: Request): URL {
  const incoming = new URL(request.url);
  if (!isClerkProxyPath(incoming.pathname)) {
    invalidClerkProxyPath();
  }

  const suffix = incoming.pathname.slice(CLERK_PROXY_PATH.length) || "/";
  assertCanonicalClerkProxyPath(suffix);

  const target = new URL(CLERK_FAPI_ORIGIN);
  target.pathname = suffix;
  target.search = incoming.search;
  target.hash = "";

  if (!isApprovedClerkTarget(target)) invalidClerkProxyPath();
  return target;
}

function publicProxyUrl(env: ClerkProxyEnv): URL {
  const configured = resolveClerkProxyUrl(env.CLERK_PROXY_URL);
  if (!configured) invalidPublicProxyUrl();
  return new URL(configured);
}

function requestUsesPublicOrigin(request: Request, publicProxy: URL): boolean {
  try {
    // The request URL is only a consistency check; all outbound origin and
    // metadata values still come from validated configuration.
    return new URL(request.url).origin === publicProxy.origin;
  } catch {
    return false;
  }
}

function timeoutMs(env: ClerkProxyEnv): number {
  const raw = env.CLERK_PROXY_TIMEOUT_MS;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TIMEOUT_MS);
}

function isValidIpAddress(value: string | null): value is string {
  if (!value || value !== value.trim() || value.length > 45) return false;
  if (/[\s,;]/.test(value)) return false;

  if (value.includes(":")) {
    try {
      new URL(`http://[${value}]/`);
      return true;
    } catch {
      return false;
    }
  }

  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const octet = Number(part);
      return octet >= 0 && octet <= 255;
    })
  );
}

function connectionHeaderNames(headers: Headers): Set<string> {
  const names = new Set<string>();
  for (const value of headers.get("connection")?.split(",") ?? []) {
    const name = value.trim().toLowerCase();
    if (/^[!#$%&'*+\-.^_`|~0-9a-z]+$/i.test(name)) names.add(name);
  }
  return names;
}

function shouldForwardRequestHeader(
  name: string,
  connectionNames: Set<string>
): boolean {
  if (
    HOP_BY_HOP_HEADERS.has(name) ||
    connectionNames.has(name) ||
    name === "host" ||
    name === "clerk-proxy-url" ||
    name.includes("secret") ||
    name.startsWith("cf-") ||
    name.startsWith("x-forwarded-")
  ) {
    return false;
  }

  return (
    REQUEST_HEADER_ALLOWLIST.has(name) ||
    REQUEST_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

function buildClerkProxyHeaders(
  request: Request,
  env: ClerkProxyEnv,
  publicProxy: URL
): Headers {
  const source = request.headers;
  const connectionNames = connectionHeaderNames(source);
  const headers = new Headers();

  for (const [rawName, value] of source) {
    const name = rawName.toLowerCase();
    if (shouldForwardRequestHeader(name, connectionNames)) {
      headers.append(rawName, value);
    }
  }

  // Prevent transparent compression from changing the body/header contract.
  headers.set("Accept-Encoding", "identity");
  headers.set("Clerk-Proxy-Url", publicProxy.toString());
  headers.set("Clerk-Secret-Key", env.CLERK_SECRET_KEY ?? "");
  headers.set("X-Forwarded-Host", publicProxy.host);
  headers.set("X-Forwarded-Proto", publicProxy.protocol.slice(0, -1));

  const clientIp = source.get("CF-Connecting-IP");
  if (isValidIpAddress(clientIp)) {
    // Cloudflare's ingress header is the only accepted client-IP source.
    headers.set("X-Forwarded-For", clientIp);
  }

  return headers;
}

function unsupportedRequestEncoding(request: Request): boolean {
  const raw = request.headers.get("Content-Encoding");
  if (raw === null) return false;
  const encodings = raw.split(",").map((value) => value.trim().toLowerCase());
  return (
    encodings.length === 0 || encodings.some((value) => value !== "identity")
  );
}

function declaredBodySize(
  request: Request
): "invalid" | "too-large" | undefined {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return undefined;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return "invalid";
  return Number(value) > CLERK_PROXY_MAX_REQUEST_BODY_BYTES
    ? "too-large"
    : undefined;
}

function boundedRequestBody(
  body: ReadableStream<Uint8Array>,
  onTooLarge: () => void
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;

  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const result = await reader.read();
        if (result.done) {
          streamController.close();
          return;
        }

        total += result.value.byteLength;
        if (total > CLERK_PROXY_MAX_REQUEST_BODY_BYTES) {
          onTooLarge();
          try {
            await reader.cancel();
          } catch {
            // The abort/error path below remains authoritative.
          }
          streamController.error(new Error("Clerk request body too large"));
          return;
        }

        streamController.enqueue(result.value);
      } catch (error) {
        streamController.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function buildProxyRequest(
  request: Request,
  target: URL,
  headers: Headers,
  signal: AbortSignal,
  body: ReadableStream<Uint8Array> | null
): Request {
  if (!body) {
    // Constructing from the incoming Request preserves non-body metadata.
    const routed = new Request(target.toString(), request);
    return new Request(routed, {
      headers,
      redirect: "manual",
      signal,
    });
  }

  // Node's undici requires duplex for a streaming body; workerd ignores the
  // non-standard hint while retaining the same Fetch body semantics. Keep the
  // two-step construction so the body is transferred once, as in the original
  // streaming proxy path.
  const init: ProxyRequestInit = {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    signal,
    duplex: "half",
  };
  const routed = new Request(target.toString(), init);
  return new Request(routed, {
    headers,
    redirect: "manual",
    signal,
  });
}

function sanitizeResponseHeaders(source: Headers): Headers {
  const result = new Headers();
  const connectionNames = connectionHeaderNames(source);

  for (const [rawName, value] of source) {
    const name = rawName.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionNames.has(name) ||
      // Workers may transparently decompress an upstream response. Because
      // outbound Accept-Encoding is identity, never pass a stale encoding.
      name === "content-encoding" ||
      RESPONSE_SENSITIVE_HEADERS.has(name) ||
      name.includes("secret")
    ) {
      continue;
    }
    result.append(rawName, value);
  }

  return result;
}

function rewriteSameOriginRedirect(
  location: string,
  publicProxy: URL
): string | undefined {
  let upstream: URL;
  try {
    upstream = new URL(location, CLERK_FAPI_ORIGIN);
  } catch {
    return undefined;
  }

  if (
    upstream.origin !== APPROVED_CLERK_FAPI_ORIGIN ||
    upstream.username !== "" ||
    upstream.password !== ""
  ) {
    return undefined;
  }

  const rewritten = new URL(publicProxy.toString());
  const basePath = publicProxy.pathname.replace(/\/+$/, "");
  rewritten.pathname = `${basePath}${upstream.pathname === "/" ? "" : upstream.pathname}`;
  rewritten.search = upstream.search;
  rewritten.hash = upstream.hash;

  if (
    rewritten.origin !== publicProxy.origin ||
    rewritten.username !== "" ||
    rewritten.password !== ""
  ) {
    return undefined;
  }

  return rewritten.toString();
}

function safeUpstreamResponseHeaders(
  response: Response,
  publicProxy: URL
): Headers | undefined {
  const hasLocation = response.headers.has("Location");
  const location = response.headers.get("Location");
  const connectionNames = connectionHeaderNames(response.headers);
  const headers = sanitizeResponseHeaders(response.headers);

  if (!hasLocation) return headers;
  if (!location?.trim() || connectionNames.has("location")) return undefined;

  const rewritten = rewriteSameOriginRedirect(location, publicProxy);
  if (!rewritten) return undefined;
  headers.set("Location", rewritten);
  return headers;
}

async function cancelResponseBody(
  response: Response,
  deadline: Deadline
): Promise<void> {
  if (!response.body) return;
  try {
    await Promise.race([response.body.cancel(), deadline]);
  } catch {
    // The upstream is being discarded; no error detail is exposed.
  }
}

function concatChunks(chunks: Uint8Array[], total: number): ArrayBuffer {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

async function readBoundedResponseBody(
  response: Response,
  deadline: Deadline
): Promise<ArrayBuffer | null> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;

  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result === TIMEOUT) throw new Error("Clerk upstream timeout");
      if (result.done) break;

      total += result.value.byteLength;
      if (total > MAX_RESPONSE_BODY_BYTES) {
        throw new ResponseBodyTooLargeError();
      }
      chunks.push(result.value);
    }

    completed = true;
    return concatChunks(chunks, total);
  } finally {
    if (!completed) {
      try {
        await Promise.race([reader.cancel(), deadline]);
      } catch {
        // The response is being discarded or the deadline already won.
      }
    }
    try {
      reader.releaseLock();
    } catch {
      // The response is being discarded or the deadline already won.
    }
  }
}

export async function handleClerkProxy(
  request: Request,
  env: ClerkProxyEnv
): Promise<Response> {
  if (!env.CLERK_SECRET_KEY) {
    return proxyError(
      "Clerk proxy misconfigured: missing CLERK_SECRET_KEY",
      503
    );
  }

  let publicProxy: URL;
  try {
    publicProxy = publicProxyUrl(env);
  } catch {
    return proxyError(
      "Clerk proxy misconfigured: missing CLERK_PROXY_URL",
      503
    );
  }

  if (!requestUsesPublicOrigin(request, publicProxy)) {
    return proxyError("Clerk proxy public origin mismatch", 503);
  }

  if (unsupportedRequestEncoding(request)) {
    return proxyError("Clerk proxy request encoding unsupported", 415);
  }

  const declaredSize = declaredBodySize(request);
  if (declaredSize === "invalid") {
    return proxyError("Invalid Clerk proxy request length", 400);
  }
  if (declaredSize === "too-large") {
    return proxyError("Clerk proxy request body too large", 413);
  }

  let target: URL;
  try {
    target = buildClerkProxyTarget(request);
  } catch {
    return proxyError("Invalid Clerk proxy path", 400);
  }

  const controller = new AbortController();
  let timedOut = false;
  let requestBodyTooLarge = false;
  let resolveDeadline!: (value: typeof TIMEOUT) => void;
  const deadline = new Promise<typeof TIMEOUT>((resolve) => {
    resolveDeadline = resolve;
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
    resolveDeadline(TIMEOUT);
  }, timeoutMs(env));

  try {
    const requestBody =
      request.body && request.method !== "GET" && request.method !== "HEAD"
        ? boundedRequestBody(request.body, () => {
            requestBodyTooLarge = true;
            controller.abort();
          })
        : null;
    const proxyRequest = buildProxyRequest(
      request,
      target,
      buildClerkProxyHeaders(request, env, publicProxy),
      controller.signal,
      requestBody
    );

    const fetched = await Promise.race([fetch(proxyRequest), deadline]);
    if (fetched === TIMEOUT) throw new Error("Clerk upstream timeout");
    const response = fetched;
    const headers = safeUpstreamResponseHeaders(response, publicProxy);
    if (!headers) {
      await cancelResponseBody(response, deadline);
      return proxyError("Clerk upstream redirect rejected", 502);
    }

    const responseBody = await readBoundedResponseBody(response, deadline);
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    if (requestBodyTooLarge) {
      return proxyError("Clerk proxy request body too large", 413);
    }
    return proxyError(
      timedOut ? "Clerk upstream timed out" : "Clerk upstream unavailable",
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}
