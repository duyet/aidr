import { describe, expect, it } from "vitest";
import {
  idPrefixFromSlug,
  legacyStoryRedirectPath,
  storyCanonicalRedirect,
  storyPath,
} from "./slug";

describe("storyPath", () => {
  it("uses the 8-char id prefix with no category", () => {
    expect(storyPath({ id: "abcdef12deadbeef" })).toBe("/abcdef12");
  });

  it("adds explicit Vietnamese and English locale parameters", () => {
    expect(storyPath({ id: "abcdef12deadbeef" }, "vi")).toBe(
      "/abcdef12?lang=vi"
    );
    expect(storyPath({ id: "abcdef12deadbeef" }, "en")).toBe(
      "/abcdef12?lang=en"
    );
  });
});

describe("idPrefixFromSlug", () => {
  it("accepts a bare hex id", () => {
    expect(idPrefixFromSlug("abcdef12")).toBe("abcdef12");
  });

  it("accepts a legacy title-hash slug", () => {
    expect(idPrefixFromSlug("some-title-abcdef12")).toBe("abcdef12");
  });

  it("rejects non-hex slugs", () => {
    expect(idPrefixFromSlug("not-a-story")).toBeNull();
  });
});

describe("storyCanonicalRedirect", () => {
  const item = { id: "abcdef12deadbeef", category: "Models" };

  it("returns null when the request is already the canonical path", () => {
    expect(storyCanonicalRedirect("abcdef12", item)).toBeNull();
  });

  it("redirects a full-hash URL to one explicit canonical locale", () => {
    expect(storyCanonicalRedirect("abcdef12deadbeef", item)).toBe(
      "/abcdef12?lang=vi"
    );
    expect(
      storyCanonicalRedirect(
        "abcdef12deadbeef",
        item,
        "en",
        "?utm_source=telegram&locale=vi",
        "#sources"
      )
    ).toBe("/abcdef12?utm_source=telegram&lang=en#sources");
  });
});

describe("legacyStoryRedirectPath", () => {
  it("maps /:cat/:slug to /:8-char", () => {
    expect(legacyStoryRedirectPath("/models/abcdef12")).toBe("/abcdef12");
    expect(legacyStoryRedirectPath("/ai/abcdef12deadbeef")).toBe("/abcdef12");
    expect(legacyStoryRedirectPath("/ai/some-title-abcdef12")).toBe(
      "/abcdef12"
    );
  });

  it("does not steal /api or auth prefixes", () => {
    expect(legacyStoryRedirectPath("/api/feed")).toBeNull();
    expect(legacyStoryRedirectPath("/sign-in/sso")).toBeNull();
  });

  it("shortens a single-segment full hash", () => {
    expect(legacyStoryRedirectPath("/abcdef12deadbeef")).toBe("/abcdef12");
    expect(legacyStoryRedirectPath("/abcdef12")).toBeNull();
  });
});
