import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHROME_WEB_STORE_URL, EXTENSION_PATH, SITE_SLOGAN } from "./site";

const here = dirname(fileURLToPath(import.meta.url));

describe("site chrome copy", () => {
  it("uses the ranked-and-summary slogan, not translated hourly", () => {
    expect(SITE_SLOGAN).toBe("AI news ranked and summary");
    const footer = readFileSync(join(here, "../routes/__root.tsx"), "utf8");
    expect(footer).toContain("SITE_SLOGAN");
    expect(footer).not.toContain("translated hourly");
    expect(footer).not.toContain("Blog");
    expect(footer).toContain("duyet.net");
    expect(footer).toContain("EXTENSION_PATH");
    expect(footer).not.toContain("CHROME_WEB_STORE_URL");
  });

  it("points the header Chrome control at /extension, not the Web Store URL", () => {
    expect(EXTENSION_PATH).toBe("/extension");
    const header = readFileSync(
      join(here, "../components/HeaderBar.tsx"),
      "utf8"
    );
    expect(header).toContain("EXTENSION_PATH");
    expect(header).toContain("RiChromeLine");
    expect(header).not.toContain("CHROME_WEB_STORE_URL");
    expect(header).not.toContain(CHROME_WEB_STORE_URL);
    expect(header).not.toContain("label: \"Blog\"");
  });
});
