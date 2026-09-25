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
 * True for any function id under the server-function base. Matches Start's own
 * `pathname.startsWith(SERVER_FN_BASE)` test, so the bare base (which Start
 * serves as an ordinary unknown route) keeps its document treatment here.
 */
export function isServerFnPath(pathname: string): boolean {
  return pathname.startsWith(serverFnBase());
}

export function isServerFnRequest(request: Request): boolean {
  return isServerFnPath(new URL(request.url).pathname);
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
