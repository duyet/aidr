import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("aidr install guide copy", () => {
  it("promotes Chrome Web Store as the only official install method", () => {
    const src = readFileSync(join(here, "../routes/extension.tsx"), "utf8");
    expect(src).toContain("CHROME_WEB_STORE_URL");
    expect(src).toContain("Chrome Web Store");
    expect(src).not.toContain("aidr.zip");
    expect(src).not.toContain("AIDR_ZIP_HREF");
    expect(src).not.toContain("AIDR_ZIP_FILENAME");
    expect(src).not.toContain("AIDR_ZIP_ERROR_IMG");
    expect(src).not.toContain("GUIDE_COPY");
  });
});
