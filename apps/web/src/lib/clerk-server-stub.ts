/**
 * Client-build stub for `@clerk/tanstack-react-start/server` (aliased in
 * vite.config.ts). src/start.ts statically imports clerkMiddleware and
 * TanStack Start bundles start.ts into the client graph for
 * startInstance.getOptions(); without this stub the whole Clerk SDK is
 * pulled back into the entry chunk. Request middleware never runs on the
 * client, so an inert factory is all getOptions() needs.
 */
export function clerkMiddleware(): Record<string, never> {
  return {};
}
