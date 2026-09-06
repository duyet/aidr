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
    expect(manifest.homepage_url).toBe(`${SITE_URL}/extension`);
  });

  it("points privacy at the HTTPS site policy, not a chrome-extension page", () => {
    const body = extensionReleasePayload();
    expect(body.privacy).toBe(EXTENSION_PRIVACY_URL);
    expect(body.privacy.startsWith("https://")).toBe(true);
    expect(body.zip).toBe(`${SITE_URL}/aidr.zip`);
    expect(body.store).toBeNull();
    expect(body.autoUpdate).toBe("unpacked-banner");
  });
});
