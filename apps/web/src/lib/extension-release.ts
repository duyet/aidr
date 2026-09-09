import { SITE_URL } from "./site";

/**
 * Shipped extension version. Must match apps/extension/package.json and
 * apps/extension/manifest.json. Tests lock the three together.
 *
 * Chrome Web Store auto-updates once listed.
 */
export const EXTENSION_VERSION = "0.1.12";

/** Chrome Web Store URL for the extension. */
export const EXTENSION_STORE_URL =
  "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg";

export const EXTENSION_PRIVACY_PATH = "/privacy";
export const EXTENSION_PRIVACY_URL = `${SITE_URL}${EXTENSION_PRIVACY_PATH}`;
export const EXTENSION_HOMEPAGE_PATH = "/extension";
export const EXTENSION_HOMEPAGE_URL = `${SITE_URL}${EXTENSION_HOMEPAGE_PATH}`;

export function extensionReleasePayload() {
  return {
    name: "aidr",
    version: EXTENSION_VERSION,
    homepage: EXTENSION_HOMEPAGE_URL,
    privacy: EXTENSION_PRIVACY_URL,
    store: EXTENSION_STORE_URL,
    autoUpdate: "chrome-web-store",
  };
}
