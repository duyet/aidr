import { createRouter } from "@tanstack/react-router";
import { adoptSubscribeLink } from "./lib/analytics/url-privacy";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
  // The router has set up the history entry; hydration has not started.
  if (typeof window !== "undefined") adoptSubscribeLink();
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
