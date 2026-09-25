/**
 * Bounded registry lookup for the server-function transport.
 *
 * Start answers a server-function request by looking the id up in a build-time
 * generated manifest. An id that is absent from that manifest makes the lookup
 * throw, and the throw is unhandled: it becomes a 500 whose message embeds the
 * requested id, and it skips Start's own serialized-envelope contract. So the
 * Worker checks the manifest itself and answers a fixed, id-free JSON 404.
 *
 * This module is server-only. It imports Start's generated resolver, which the
 * Vite plugin materializes for the server environment alone; importing it from
 * the client graph would fail to resolve there.
 */
import {
  isServerFnBasePath,
  isServerFnPath,
  serverFnIdOf,
} from "./server-fn-request";

/** Start's generated resolver: id -> bound handler, or a throw when unknown. */
type ServerFnResolver = (
  id: string,
  access: { origin: "client" }
) => Promise<unknown>;

let injectedResolver: ServerFnResolver | null | undefined;

/**
 * Resolve Start's generated server-function resolver, the same module the
 * server-function handler uses. It only exists inside a Start build; a
 * consumer that cannot resolve it must treat that as "cannot decide" rather
 * than as a routing decision.
 */
function loadServerFnResolver(): Promise<ServerFnResolver | null> {
  if (injectedResolver !== undefined) return Promise.resolve(injectedResolver);
  return import("#tanstack-start-server-fn-resolver")
    .then((module) =>
      typeof module.getServerFnById === "function"
        ? (module.getServerFnById as ServerFnResolver)
        : null
    )
    .catch(() => null);
}

/**
 * True for a key inherited from `Object.prototype`.
 *
 * Such a key satisfies the id charset but can never be a manifest entry, since
 * the generated manifest is an object literal keyed by function id. The
 * generated resolver reads `manifest[id]`, so these keys pass its "not found"
 * guard and only fail one line later on `importer()` -- a TypeError we would
 * have to catch in order to recognise them. Rejecting them here, by own
 * property, keeps the decision deliberate and independent of how the
 * generated lookup happens to be written.
 */
function isObjectPrototypeKey(id: string): boolean {
  return Object.hasOwn(Object.prototype, id);
}

/**
 * Ask the resolver whether an id is registered. `null` means the registry
 * could not answer and the caller must leave the request to Start.
 *
 * For a registered id this warms the resolver's own module cache, so the
 * handler's own lookup afterwards costs nothing extra.
 */
export async function isRegisteredServerFnId(
  id: string
): Promise<boolean | null> {
  if (isObjectPrototypeKey(id)) return false;
  const resolver = await loadServerFnResolver();
  if (!resolver) return null;
  try {
    await resolver(id, { origin: "client" });
    return true;
  } catch {
    // The resolver throws for an id that is not in its manifest. It also
    // throws when a registered module fails to load, and Start answers that
    // case with an unhandled 500 anyway, so a bounded 404 is the better answer.
    return false;
  }
}

export type ServerFnPathVerdict =
  /** A well-shaped, registered function id. */
  | "ok"
  /** Structurally impossible id: no id, a nested path, or unsafe characters. */
  | "malformed"
  /** Well-shaped but absent from the resolver's manifest. */
  | "unknown"
  /** Not a transport path, or the registry could not answer. */
  | "unchecked";

/**
 * Decide whether a transport path names a real server function.
 *
 * Only `malformed` and `unknown` justify a bounded 404. `unchecked`
 * deliberately defers to Start, so a registry that cannot be loaded can never
 * turn a working RPC call into a 404.
 */
export async function classifyServerFnPath(
  pathname: string
): Promise<ServerFnPathVerdict> {
  // The bare base carries no id, with or without its trailing slash. It is not
  // the transport path, so it must not fall through to Start, which would
  // answer it as an ordinary unknown route and hand a document back.
  if (isServerFnBasePath(pathname)) return "malformed";
  if (!isServerFnPath(pathname)) return "unchecked";
  const id = serverFnIdOf(pathname);
  if (id === null) return "malformed";
  const registered = await isRegisteredServerFnId(id);
  if (registered === null) return "unchecked";
  return registered ? "ok" : "unknown";
}

/**
 * Pin the resolver so tests can exercise the `unknown` verdict without a Start
 * build. `undefined` restores the real generated module.
 */
function setServerFnResolverForTests(
  resolver: ServerFnResolver | null | undefined
): void {
  injectedResolver = resolver;
}

export { setServerFnResolverForTests as _setServerFnResolverForTests };
