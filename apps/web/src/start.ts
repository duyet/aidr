import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { resolveClerkProxyUrl } from "./lib/clerk-proxy-config";
import { isSubscribeTokenPath } from "./lib/locale-routing";

const configuredProxyUrl = resolveClerkProxyUrl(
  import.meta.env.CLERK_PROXY_URL
);

function clerkSecretConfigured(): boolean {
  return (
    typeof process !== "undefined" && Boolean(process.env?.CLERK_SECRET_KEY)
  );
}

export const startInstance = createStart(() => {
  // Local dev with no Clerk keys renders signed out instead of failing every
  // request on Clerk's missing-secret error. Deployed builds still fail loud.
  if (import.meta.env.DEV && !clerkSecretConfigured()) return {};

  // Use one environment-specific absolute URL for browser and server auth.
  // Never derive this from an arbitrary request Host/forwarded-host value.
  const clerk = clerkMiddleware(() => {
    if (configuredProxyUrl) return { proxyUrl: configuredProxyUrl };
    if (import.meta.env.DEV) return {};
    throw new Error("CLERK_PROXY_URL must be an absolute URL");
  });

  return {
    requestMiddleware: [
      // Clerk may answer a request with a handshake redirect whose
      // `redirect_url` is the full URL. A tokened subscribe link would hand
      // its token to Clerk, and those views never read auth.
      createMiddleware().server((options) => {
        const url = new URL(options.request.url);
        if (isSubscribeTokenPath(url.pathname, url.search)) {
          return options.next();
        }
        const runClerk = clerk.options.server;
        if (!runClerk) throw new Error("clerkMiddleware has no server handler");
        return runClerk(options);
      }),
    ],
  };
});
