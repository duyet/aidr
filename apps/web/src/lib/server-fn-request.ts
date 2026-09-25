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
 * True for the server-function transport prefix. Keep this broad so unknown
 * calls stay on the RPC path long enough for the Worker to answer them with a
 * bounded JSON error instead of letting a document route claim them.
 */
export function isServerFnPath(pathname: string): boolean {
  return pathname.startsWith(serverFnBase());
}

/** The bare base, e.g. `/_serverFn`, which carries no function id at all. */
export function isServerFnBasePath(pathname: string): boolean {
  const base = serverFnBase();
  return pathname === base.slice(0, -1) || pathname === base;
}

export function isServerFnRequest(request: Request): boolean {
  return isServerFnPath(new URL(request.url).pathname);
}

/**
 * Start's compiler emits server-function ids from two alphabets: `base64url`
 * in dev (the encoded module specifier plus export name) and `sha256` hex in a
 * production build. A dedup collision appends `_N`. Nothing it can emit
 * contains `.`, `%`, `/`, `\`, `+`, or `=`, so a single segment drawn from
 * `[A-Za-z0-9_-]` is a necessary condition for a real id — and rejecting
 * everything else deterministically retires percent-encoded traversal, `.`/
 * `..`, and over-long segments before any resolver is consulted.
 *
 * Length bound: a build id is 64 hex characters, and a dev id is the
 * base64url of `{"file":…,"export":…}`, so its length tracks the dev module
 * specifier — observed up to 139 characters across this app's functions. 200
 * is a deliberate safety ceiling, not a derived maximum: it leaves headroom
 * over the observed output while still refusing an arbitrarily long segment
 * outright instead of carrying it into the resolver. A hypothetical dev id
 * longer than the ceiling would fail closed into the bounded JSON 404 rather
 * than the old unhandled 500, and production ids cannot approach it.
 */
const SAFE_SERVER_FN_ID = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * The function id carried by a transport path, or null when the path carries
 * none (the bare base) or more than one (a nested segment).
 */
export function serverFnIdOf(pathname: string): string | null {
  const base = serverFnBase();
  if (!pathname.startsWith(base)) return null;
  const id = pathname.slice(base.length);
  if (id.length === 0 || id.includes("/")) return null;
  return SAFE_SERVER_FN_ID.test(id) ? id : null;
}

/** A transport path must carry one non-empty, well-shaped function id. */
export function hasServerFnId(pathname: string): boolean {
  return serverFnIdOf(pathname) !== null;
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
