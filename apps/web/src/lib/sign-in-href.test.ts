/** @vitest-environment happy-dom */

import { RedirectUrls } from "@clerk/shared/internal/clerk-js/redirectUrls";
import { describe, expect, it } from "vitest";
import { clerkProviderLocaleOptions } from "../components/ClerkRootProvider";
import { sameOriginReturnPath, signInHref } from "./sign-in-href";

function redirectParam(href: string): string | null {
  return new URL(href, "https://aidr.today").searchParams.get("redirect_url");
}

describe("signInHref", () => {
  it("carries the story path and its lang as redirect_url", () => {
    const href = signInHref("vi", "/abcdef12?lang=vi");
    expect(new URL(href, "https://aidr.today").pathname).toBe("/sign-in");
    expect(new URL(href, "https://aidr.today").searchParams.get("lang")).toBe(
      "vi"
    );
    expect(redirectParam(href)).toBe("/abcdef12?lang=vi");
  });

  // Clerk is a third party. A mailed /subscribe token in the return path
  // would hand it the power to change that subscription.
  it("drops params outside SAFE_PARAMS and the hash", () => {
    const token = ["fake", "settings", "value"].join("-");
    const back = sameOriginReturnPath(
      `/subscribe?settings=${token}&lang=en&q=private#top`
    );
    expect(back).toBe("/subscribe?lang=en");
  });

  it.each([
    "//evil.example/abcdef12",
    "/\\evil.example/abcdef12",
    "https://evil.example/abcdef12",
    "javascript:alert(1)",
    "/.//evil.example",
    "/..//evil.example",
    "/x/../../\\evil.example",
    "https://return.invalid//evil.example",
  ])("drops %s, which a browser would resolve off this site", (target) => {
    expect(sameOriginReturnPath(target)).toBeNull();
    expect(signInHref("en", target)).toBe("/sign-in?lang=en");
  });

  it.each(["/.//", "/..//", "/%2e//", "/.//?x"])(
    "returns null rather than throwing when %s collapses to a bare //",
    (target) => {
      expect(sameOriginReturnPath(target)).toBeNull();
      expect(signInHref("en", target)).toBe("/sign-in?lang=en");
    }
  );

  it.each(["/sign-in", "/sign-in/factor-one", "/sign-up?lang=vi"])(
    "never returns to the auth page %s itself",
    (target) => {
      expect(redirectParam(signInHref("en", target))).toBeNull();
    }
  );

  it("keeps /contribute, which needs Clerk but is a reader destination", () => {
    expect(redirectParam(signInHref("en", "/contribute?lang=en"))).toBe(
      "/contribute?lang=en"
    );
  });

  // The behavior this module exists for: Clerk sends the reader to the
  // story, not to the provider's homepage fallback.
  it("outranks the provider's homepage fallback in Clerk's redirect order", () => {
    const href = signInHref("en", "/abcdef12?lang=en");
    const options = {
      ...clerkProviderLocaleOptions("en"),
      allowedRedirectOrigins: [window.location.origin],
    };
    const redirects = new RedirectUrls(
      options,
      {},
      new URL(href, window.location.origin).searchParams
    );
    expect(redirects.getAfterSignInUrl()).toBe(
      `${window.location.origin}/abcdef12?lang=en`
    );
    expect(redirects.getAfterSignUpUrl()).toBe(
      `${window.location.origin}/abcdef12?lang=en`
    );
  });
});
