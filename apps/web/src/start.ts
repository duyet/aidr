import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";
import { resolveClerkProxyUrl } from "./lib/clerk-proxy-config";

const configuredProxyUrl = resolveClerkProxyUrl(
  import.meta.env.VITE_CLERK_PROXY_URL
);

export const startInstance = createStart(() => {
  return {
    // Use one environment-specific absolute URL for browser and server auth.
    // Never derive this from an arbitrary request Host/forwarded-host value.
    requestMiddleware: [
      clerkMiddleware(() => {
        if (!configuredProxyUrl) {
          throw new Error("VITE_CLERK_PROXY_URL must be an absolute URL");
        }
        return { proxyUrl: configuredProxyUrl };
      }),
    ],
  };
});
