/**
 * TanStack Start serves every server function under one base path
 * (`TSS_SERVER_FN_BASE`, `/_serverFn/` by default). Requests to that path are
 * same-origin RPC, not documents.
 *
 * Keeping the classification here — instead of duplicating the literal in the
 * Worker and the components — is what lets the locale gate answer an RPC call
 * in JSON while a page request keeps its HTML behaviour.
 */

const DEFAULT_SERVER_FN_BASE = "/_serverFn/";

/**
 * Resolved from the build-time define Start injects into both the client and
 * SSR bundles. Falls back to the documented default so tests and any caller
 * that runs before the define is applied still classify paths correctly.
 */
function serverFnBase(): string {
  const configured =
    typeof process === "undefined"
      ? undefined
      : process.env?.TSS_SERVER_FN_BASE;
  if (!configured?.startsWith("/")) {
    return DEFAULT_SERVER_FN_BASE;
  }
  return configured.endsWith("/") ? configured : `${configured}/`;
}

/**
 * True for the server-function transport prefix. Keep this broad so malformed
 * calls stay on the RPC path long enough for the Worker to answer them with a
 * bounded JSON error instead of letting a document route claim them.
 */
export function isServerFnPath(pathname: string): boolean {
  return pathname.startsWith(serverFnBase());
}

export function isServerFnRequest(request: Request): boolean {
  return isServerFnPath(new URL(request.url).pathname);
}

/** A transport path must contain exactly one non-empty function id segment. */
export function hasServerFnId(pathname: string): boolean {
  const base = serverFnBase();
  if (!pathname.startsWith(base)) return false;
  const id = pathname.slice(base.length);
  return id.length > 0 && !id.includes("/");
}

/**
 * Marker the Start client sets on every server-function call. Start answers a
 * marked request with a serialized envelope and an unmarked one with the raw
 * return value, so it also tells us whether a malformed call is expected to
 * produce a deserializable result.
 */
export function hasServerFnMarker(request: Request): boolean {
  return request.headers.get("x-tsr-serverFn") === "true";
}
