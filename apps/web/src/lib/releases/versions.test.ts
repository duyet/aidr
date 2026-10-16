import { describe, expect, it } from "vitest";
import { RELEASES, releasePath } from "./index";
import { RELEASE_VERSIONS, releasePathForVersion } from "./versions";

describe("RELEASE_VERSIONS", () => {
  it("lists every registered release in order, so a new release page is indexable and in the sitemap", () => {
    expect(RELEASE_VERSIONS).toEqual(RELEASES.map((r) => r.version));
  });

  it("builds the same path as releasePath", () => {
    for (const release of RELEASES) {
      expect(releasePathForVersion(release.version)).toBe(releasePath(release));
    }
  });
});
