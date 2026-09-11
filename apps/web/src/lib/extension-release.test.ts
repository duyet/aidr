import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_PRIVACY_URL,
  EXTENSION_VERSION,
  extensionReleasePayload,
} from "./extension-release";
import { SITE_URL } from "./site";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = join(here, "../../../extension");

describe("extensionReleasePayload", () => {
  it("matches the unpacked extension version in package.json and manifest", () => {
    const pkg = JSON.parse(
      readFileSync(join(extRoot, "package.json"), "utf8")
    ) as { version: string };
    const manifest = JSON.parse(
      readFileSync(join(extRoot, "manifest.json"), "utf8")
    ) as { version: string; homepage_url?: string };
    expect(EXTENSION_VERSION).toBe(pkg.version);
    expect(EXTENSION_VERSION).toBe(manifest.version);
    expect(manifest.homepage_url).toBe(`${SITE_URL}/subscribe`);
  });

  it("points privacy at the HTTPS site policy and uses Chrome Web Store", () => {
    const body = extensionReleasePayload();
    expect(body.privacy).toBe(EXTENSION_PRIVACY_URL);
    expect(body.privacy.startsWith("https://")).toBe(true);
    expect(body.store).toBe(
      "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg"
    );
    expect(body.store).not.toBeNull();
    expect(body.autoUpdate).toBe("chrome-web-store");
  });
});
