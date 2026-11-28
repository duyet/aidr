/**
 * Tells the AI;DR API which client is asking: `X-AIDR-Client: extension/<version>`.
 * The server counts requests per client with no identifier and keeps only
 * the app name and this version (apps/web/src/lib/usage.ts).
 *
 * Sent only from a real extension. A web preview has no manifest, and a
 * custom header there would turn a simple request into a CORS preflight the
 * API does not answer. An extension page or service worker is exempt from
 * CORS for hosts in host_permissions, so the header costs it nothing.
 */

export const CLIENT_HEADER = "X-AIDR-Client";

/** Chrome allows 1 to 4 dot-separated integers. */
const MANIFEST_VERSION = /^\d{1,5}(\.\d{1,5}){1,3}$/;

/** @returns {Record<string, string>} Empty when there is no manifest version. */
export function clientHeaders() {
  try {
    const version = globalThis.chrome?.runtime?.getManifest?.()?.version;
    if (typeof version === "string" && MANIFEST_VERSION.test(version)) {
      return { [CLIENT_HEADER]: `extension/${version}` };
    }
  } catch {
    // No runtime: send no identity.
  }
  return {};
}
