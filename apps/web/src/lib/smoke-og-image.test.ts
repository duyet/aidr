import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type HeadMeta, homepageHead, pageHead } from "./seo";
import {
  SITE_OG_HOME_IMAGE_PATH,
  SITE_OG_HOME_IMAGE_URL,
  SITE_OG_IMAGE_PATH,
  SITE_OG_IMAGE_URL,
  SITE_URL,
} from "./site";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "../../public");
const smokeSrc = readFileSync(join(here, "../../scripts/smoke.ts"), "utf8");

function metaContent(tags: HeadMeta[], key: string): string | undefined {
  const hit = tags.find(
    (t) =>
      ("name" in t && t.name === key) || ("property" in t && t.property === key)
  );
  return hit && "content" in hit ? hit.content : undefined;
}

describe("homepage OG image asset", () => {
  it("pins the homepage card to the deployed masthead variant", () => {
    expect(SITE_OG_HOME_IMAGE_PATH).toBe("/og-home.jpg");
    expect(SITE_OG_HOME_IMAGE_URL).toBe(`${SITE_URL}/og-home.jpg`);
    // The default card stays /og.jpg for every non-homepage page; the two
    // paths must not collapse into one asset.
    expect(SITE_OG_IMAGE_PATH).toBe("/og.jpg");
    expect(SITE_OG_HOME_IMAGE_PATH).not.toBe(SITE_OG_IMAGE_PATH);
  });

  it("ships a real JPEG at the path the metadata advertises", () => {
    for (const path of [SITE_OG_HOME_IMAGE_PATH, SITE_OG_IMAGE_PATH]) {
      const file = join(publicDir, path);
      expect(existsSync(file), `${path} missing from apps/web/public`).toBe(
        true
      );
      expect(statSync(file).size).toBeGreaterThan(5_000);
      const head = readFileSync(file).subarray(0, 2);
      expect([...head], `${path} is not a JPEG`).toEqual([0xff, 0xd8]);
    }
  });

  it("keeps the homepage card distinct from the default page card", () => {
    expect(metaContent(homepageHead().meta, "og:image")).toBe(
      SITE_OG_HOME_IMAGE_URL
    );
    expect(
      metaContent(pageHead({ path: "/about", title: "About" }).meta, "og:image")
    ).toBe(SITE_OG_IMAGE_URL);
  });
});

describe("post-deploy smoke homepage OG check", () => {
  // Regression guard for a stale literal that made `pnpm run smoke` fail
  // against production while the deployed homepage was correct.
  it("derives the expected homepage og:image from the shared constant", () => {
    expect(smokeSrc).toContain("SITE_OG_HOME_IMAGE_URL");
    expect(smokeSrc).toContain('from "../src/lib/site"');
    // No hard-coded share-image path may come back into the script.
    expect(smokeSrc).not.toContain('"/og.jpg"');
    expect(smokeSrc).not.toContain('"/og-home.jpg"');
  });

  it("asserts the rendered meta tag, not a loose substring", () => {
    expect(smokeSrc).toContain('metaContent(body, "property", "og:image")');
    expect(smokeSrc).toContain('metaContent(body, "name", "twitter:image")');
    expect(smokeSrc).not.toContain('body.includes("/og.jpg")');
  });

  it("fetches the advertised og:image URL as its own check", () => {
    expect(smokeSrc).toContain("GET homepage og:image -> 200 JPEG");
    expect(smokeSrc).toContain("const img = await fetch(url)");
    expect(smokeSrc).toContain('ctype.startsWith("image/")');
  });
});
