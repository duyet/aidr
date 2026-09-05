import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";
import { CLERK_PROXY_PATH } from "../worker/clerk-proxy";

export const startInstance = createStart(() => {
  return {
    // Without proxyUrl, expired-session handshakes redirect to
    // clerk.aidr.today (PK domain). That CNAME is CF→CF and returns
    // Error 1000/1014. Force handshake through /__clerk instead.
    requestMiddleware: [clerkMiddleware({ proxyUrl: CLERK_PROXY_PATH })],
  };
});
