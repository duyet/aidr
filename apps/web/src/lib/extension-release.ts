import { AIDR_UNPACKED_DIR, AIDR_ZIP_HREF } from "./aidr-public";
import { SITE_URL } from "./site";

/**
 * Shipped extension version. Must match apps/extension/package.json and
 * apps/extension/manifest.json. Tests lock the three together.
 *
 * Chrome Web Store auto-updates once listed. Unpacked zip installs never
 * auto-update; the new-tab page compares this to the installed manifest.
 */
export const EXTENSION_VERSION = "0.1.7"; // x-release-please-version

/** Empty until a CWS listing exists. Do not invent a store URL. */
export const EXTENSION_STORE_URL = "";

export const EXTENSION_PRIVACY_PATH = "/privacy";
export const EXTENSION_PRIVACY_URL = `${SITE_URL}${EXTENSION_PRIVACY_PATH}`;
export const EXTENSION_HOMEPAGE_PATH = "/extension";
export const EXTENSION_HOMEPAGE_URL = `${SITE_URL}${EXTENSION_HOMEPAGE_PATH}`;

export function extensionReleasePayload() {
  return {
    name: "aidr",
    version: EXTENSION_VERSION,
    zip: `${SITE_URL}${AIDR_ZIP_HREF}`,
    unpackedDir: AIDR_UNPACKED_DIR,
    homepage: EXTENSION_HOMEPAGE_URL,
    privacy: EXTENSION_PRIVACY_URL,
    store: EXTENSION_STORE_URL || null,
    autoUpdate: EXTENSION_STORE_URL ? "chrome-web-store" : "unpacked-banner",
  };
}
