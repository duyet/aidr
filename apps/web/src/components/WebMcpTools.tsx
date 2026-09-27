import { useEffect } from "react";
import { registerWebmcpTools } from "../lib/webmcp";

/**
 * Client-side WebMCP registration.
 *
 * Renders nothing. Runs once, in an effect, after hydration — so nothing
 * WebMCP-related is in the SSR HTML, the hydration payload, or the LCP
 * path. `registerWebmcpTools` is a no-op (returns 0) when
 * `document.modelContext` is undefined, so a browser without the
 * Cloudflare WebMCP bridge pays nothing and throws nothing.
 *
 * The bridge script itself (`/.webmcp/bridge.js`) is Cloudflare-injected.
 * It is deliberately NOT imported, vendored, or awaited here: the page
 * must work identically with or without it.
 */
export function WebMcpTools() {
  useEffect(() => {
    registerWebmcpTools();
  }, []);
  return null;
}
