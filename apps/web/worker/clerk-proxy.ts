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
/** The documented request/response cap shared by tests, config, and docs. */
export const CLERK_PROXY_MAX_BODY_BYTES = 1_048_576;
export const CLERK_PROXY_MAX_REQUEST_BODY_BYTES = CLERK_PROXY_MAX_BODY_BYTES;
export const CLERK_PROXY_MAX_RESPONSE_BODY_BYTES = CLERK_PROXY_MAX_BODY_BYTES;
const TIMEOUT = Symbol("clerk proxy timeout");
const REQUEST_ABORTED = Symbol("clerk proxy request aborted");
const COMPLETED = Symbol("clerk proxy operation completed");
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

class RequestBodyTooLargeError extends Error {}
class ResponseBodyTooLargeError extends Error {}
class ProxyOperationError extends Error {
  constructor(readonly reason: typeof TIMEOUT | typeof REQUEST_ABORTED) {
    super("Clerk proxy operation stopped");
  }
}

type StopReason = typeof TIMEOUT | typeof REQUEST_ABORTED | typeof COMPLETED;
type StopPromise = Promise<StopReason>;

interface ProxyOperation {
  controller: AbortController;
  stop: StopPromise;
  timedOut: boolean;
  requestAborted: boolean;
  complete(): void;
}

function isStopReason(value: unknown): value is StopReason {
  return value === TIMEOUT || value === REQUEST_ABORTED || value === COMPLETED;
}

function createProxyOperation(
  request: Request,
  env: ClerkProxyEnv
): ProxyOperation {
  const controller = new AbortController();
  let timedOut = false;
  let requestAborted = false;
  let completed = false;
  let resolveStop!: (reason: StopReason) => void;
  const stop = new Promise<StopReason>((resolve) => {
    resolveStop = resolve;
  });

  const onRequestAbort = () => {
    if (completed) return;
    requestAborted = true;
    controller.abort(request.signal.reason);
    resolveStop(REQUEST_ABORTED);
  };

  if (request.signal.aborted) {
    onRequestAbort();
  } else {
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    if (completed) return;
    timedOut = true;
    controller.abort();
    resolveStop(TIMEOUT);
  }, timeoutMs(env));

  return {
    controller,
    stop,
    get timedOut() {
      return timedOut;
    },
    get requestAborted() {
      return requestAborted;
    },
    complete() {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onRequestAbort);
      resolveStop(COMPLETED);
    },
  };
}

function throwForStop(reason: StopReason): never {
  if (reason === TIMEOUT || reason === REQUEST_ABORTED) {
    throw new ProxyOperationError(reason);
  }
  throw new Error("Clerk proxy operation completed unexpectedly");
}

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
  return Number(value) > CLERK_PROXY_MAX_BODY_BYTES ? "too-large" : undefined;
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown,
  stop?: StopPromise
): Promise<void> {
  try {
    const cancellation = reader.cancel(reason);
    if (stop) {
      await Promise.race([cancellation, stop]);
    } else {
      await cancellation;
    }
  } catch {
    // The request is being rejected or aborted; cancellation is best effort.
  }
}

async function cancelRequestBody(request: Request): Promise<void> {
  if (!request.body) return;
  try {
    await request.body.cancel();
  } catch {
    // The request body may already be locked or closed by the runtime.
  }
}

async function readBoundedRequestBody(
  request: Request,
  operation: ProxyOperation
): Promise<ArrayBuffer | null> {
  if (!request.body) return null;

  const reader = request.body.getReader();
  const output = new Uint8Array(CLERK_PROXY_MAX_BODY_BYTES);
  let total = 0;

  try {
    while (true) {
      const result = await Promise.race([reader.read(), operation.stop]);
      if (isStopReason(result)) {
        await cancelReader(reader, result, operation.stop);
        throwForStop(result);
      }
      if (result.done) break;

      const chunk = result.value;
      if (chunk.byteLength > CLERK_PROXY_MAX_BODY_BYTES - total) {
        throw new RequestBodyTooLargeError();
      }

      output.set(chunk, total);
      total += chunk.byteLength;
    }

    return output.slice(0, total).buffer;
  } catch (error) {
    await cancelReader(reader, error, operation.stop);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The body is already closed or the operation was aborted.
    }
  }
}

function buildProxyRequest(
  request: Request,
  target: URL,
  headers: Headers,
  signal: AbortSignal,
  body: ArrayBuffer | null
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

  const routed = new Request(target.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    signal,
  });
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
  operation: ProxyOperation
): Promise<void> {
  if (!response.body) return;
  try {
    await Promise.race([response.body.cancel(), operation.stop]);
  } catch {
    // The upstream is being discarded; no error detail is exposed.
  }
}

function declaredResponseSize(
  response: Response
): "invalid" | "too-large" | undefined {
  const raw = response.headers.get("Content-Length");
  if (raw === null) return undefined;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return "invalid";
  return Number(value) > CLERK_PROXY_MAX_RESPONSE_BODY_BYTES
    ? "too-large"
    : undefined;
}

function releaseReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    reader.releaseLock();
  } catch {
    // The response is being discarded or the operation was aborted.
  }
}

function responseStreamError(reason: StopReason): Error {
  if (reason === TIMEOUT) return new Error("Clerk upstream timed out");
  if (reason === REQUEST_ABORTED) {
    return new DOMException("Clerk request aborted", "AbortError");
  }
  return new Error("Clerk upstream response failed");
}

async function readResponseChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  operation: ProxyOperation
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const result = await Promise.race([reader.read(), operation.stop]);
  if (isStopReason(result)) {
    await cancelReader(reader, result, operation.stop);
    throwForStop(result);
  }
  return result;
}

function createCountedResponseBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  firstChunk: Uint8Array | null,
  initiallyDone: boolean,
  operation: ProxyOperation
): ReadableStream<Uint8Array> {
  let total = 0;
  let pending = firstChunk;
  let upstreamDone = initiallyDone;
  let finished = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const finish = () => {
    if (finished) return;
    finished = true;
    releaseReader(reader);
    operation.complete();
  };

  const fail = async (error: Error) => {
    if (finished) return;
    finished = true;
    await cancelReader(reader, error, operation.stop);
    releaseReader(reader);
    try {
      streamController?.error(error);
    } catch {
      // The downstream consumer may already have cancelled the stream.
    }
    operation.complete();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (firstChunk) total = firstChunk.byteLength;
      operation.stop
        .then((reason) => {
          if (finished || reason === COMPLETED) return;
          return fail(responseStreamError(reason));
        })
        .catch(() => {
          // fail() owns the generic stream error; this only consumes a
          // rejected stop promise defensively.
        });
    },
    async pull(controller) {
      if (finished) return;
      try {
        if (pending) {
          const chunk = pending;
          pending = null;
          controller.enqueue(chunk);
          return;
        }
        if (upstreamDone) {
          controller.close();
          finish();
          return;
        }

        const result = await readResponseChunk(reader, operation);
        if (result.done) {
          upstreamDone = true;
          controller.close();
          finish();
          return;
        }

        total += result.value.byteLength;
        if (total > CLERK_PROXY_MAX_RESPONSE_BODY_BYTES) {
          await fail(new ResponseBodyTooLargeError());
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        if (finished) return;
        finished = true;
        try {
          controller.error(
            error instanceof Error
              ? error
              : new Error("Clerk upstream response failed")
          );
        } catch {
          // The downstream consumer may already have cancelled the stream.
        }
        await cancelReader(reader, error, operation.stop);
        releaseReader(reader);
        operation.complete();
      }
    },
    async cancel(reason) {
      if (finished) return;
      finished = true;
      await cancelReader(reader, reason, operation.stop);
      releaseReader(reader);
      operation.complete();
    },
  });

  return stream;
}

export async function handleClerkProxy(
  request: Request,
  env: ClerkProxyEnv
): Promise<Response> {
  if (!env.CLERK_SECRET_KEY) {
    await cancelRequestBody(request);
    return proxyError(
      "Clerk proxy misconfigured: missing CLERK_SECRET_KEY",
      503
    );
  }

  let publicProxy: URL;
  try {
    publicProxy = publicProxyUrl(env);
  } catch {
    await cancelRequestBody(request);
    return proxyError(
      "Clerk proxy misconfigured: missing CLERK_PROXY_URL",
      503
    );
  }

  if (!requestUsesPublicOrigin(request, publicProxy)) {
    await cancelRequestBody(request);
    return proxyError("Clerk proxy public origin mismatch", 503);
  }

  if (unsupportedRequestEncoding(request)) {
    await cancelRequestBody(request);
    return proxyError("Clerk proxy request encoding unsupported", 415);
  }

  const declaredSize = declaredBodySize(request);
  if (declaredSize === "invalid") {
    await cancelRequestBody(request);
    return proxyError("Invalid Clerk proxy request length", 400);
  }
  if (declaredSize === "too-large") {
    await cancelRequestBody(request);
    return proxyError("Clerk proxy request body too large", 413);
  }

  let target: URL;
  try {
    target = buildClerkProxyTarget(request);
  } catch {
    await cancelRequestBody(request);
    return proxyError("Invalid Clerk proxy path", 400);
  }

  const operation = createProxyOperation(request, env);
  let responseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let responseStreamOwnsOperation = false;

  try {
    if (operation.requestAborted) throwForStop(REQUEST_ABORTED);

    // Read and bound the body before dispatch. This makes the 1 MiB limit
    // independent of whether the upstream consumes the request or answers
    // early, while the linked signal still propagates client cancellation.
    const requestBody = await readBoundedRequestBody(request, operation);
    if (operation.requestAborted) throwForStop(REQUEST_ABORTED);
    if (operation.timedOut) throwForStop(TIMEOUT);
    const proxyRequest = buildProxyRequest(
      request,
      target,
      buildClerkProxyHeaders(request, env, publicProxy),
      operation.controller.signal,
      requestBody
    );

    const observedUpstream = fetch(proxyRequest);
    const fetched = await Promise.race([observedUpstream, operation.stop]);
    if (isStopReason(fetched)) {
      void observedUpstream
        .then((lateResponse) => cancelResponseBody(lateResponse, operation))
        .catch(() => {
          // The timeout/abort won; a late upstream rejection is irrelevant.
        });
      throwForStop(fetched);
    }
    const response = fetched;
    const headers = safeUpstreamResponseHeaders(response, publicProxy);
    if (!headers) {
      await cancelResponseBody(response, operation);
      return proxyError("Clerk upstream redirect rejected", 502);
    }

    const responseSize = declaredResponseSize(response);
    if (responseSize) {
      await cancelResponseBody(response, operation);
      throw new ResponseBodyTooLargeError();
    }

    let responseBody: ReadableStream<Uint8Array> | null = null;
    let firstChunk: Uint8Array | null = null;
    let initiallyDone = false;
    const bodyForbidden =
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304;

    if (response.body && !bodyForbidden) {
      responseReader = response.body.getReader();
      const first = await readResponseChunk(responseReader, operation);
      if (first.done) {
        initiallyDone = true;
        releaseReader(responseReader);
        responseReader = null;
      } else {
        if (first.value.byteLength > CLERK_PROXY_MAX_RESPONSE_BODY_BYTES) {
          throw new ResponseBodyTooLargeError();
        }
        firstChunk = first.value;
      }
    } else if (response.body) {
      await cancelResponseBody(response, operation);
    }

    if (responseReader) {
      responseBody = createCountedResponseBody(
        responseReader,
        firstChunk,
        initiallyDone,
        operation
      );
      const result = new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      responseStreamOwnsOperation = true;
      return result;
    }

    operation.complete();
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    if (responseReader) {
      await cancelReader(responseReader, error, operation.stop);
      releaseReader(responseReader);
      responseReader = null;
    }
    if (error instanceof RequestBodyTooLargeError) {
      return proxyError("Clerk proxy request body too large", 413);
    }
    if (operation.requestAborted) {
      return proxyError("Clerk proxy request aborted", 499);
    }
    if (operation.timedOut) {
      return proxyError("Clerk upstream timed out", 504);
    }
    return proxyError("Clerk upstream unavailable", 502);
  } finally {
    if (!responseStreamOwnsOperation) operation.complete();
  }
}
