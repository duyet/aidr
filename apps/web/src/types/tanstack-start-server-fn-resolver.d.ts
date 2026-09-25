/**
 * Start's build generates `#tanstack-start-server-fn-resolver` and aliases it to
 * the resolver that maps each server-function id to its module. Node resolves
 * the specifier through `@tanstack/start-server-core`'s `imports` map; the
 * Start Vite plugin replaces it with the generated manifest inside a build.
 *
 * The Worker imports it to answer "is this id a real server function?" before
 * letting a request reach the handler. The import is guarded at runtime, so a
 * consumer that cannot resolve it (unit tests, a non-Start bundle) simply
 * declines to answer rather than rejecting valid RPC.
 */
declare module "#tanstack-start-server-fn-resolver" {
  /** Throws when the id is absent from the manifest. */
  export function getServerFnById(
    id: string,
    access: { origin: "client" | "server" }
  ): Promise<unknown>;
}
