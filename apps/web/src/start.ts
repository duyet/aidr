import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";
import { resolveClerkProxyUrl } from "./lib/clerk-proxy-config";

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

  return {
    // Use one environment-specific absolute URL for browser and server auth.
    // Never derive this from an arbitrary request Host/forwarded-host value.
    requestMiddleware: [
      clerkMiddleware(() => {
        if (configuredProxyUrl) return { proxyUrl: configuredProxyUrl };
        if (import.meta.env.DEV) return {};
        throw new Error("CLERK_PROXY_URL must be an absolute URL");
      }),
    ],
  };
});
