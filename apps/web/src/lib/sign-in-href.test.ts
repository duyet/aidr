/** @vitest-environment happy-dom */

import { RedirectUrls } from "@clerk/shared/internal/clerk-js/redirectUrls";
import { describe, expect, it } from "vitest";
import { clerkProviderLocaleOptions } from "../components/ClerkRootProvider";
import { sameOriginReturnPath, signInHref } from "./sign-in-href";

function redirectParam(href: string): string | null {
  return new URL(href, "https://aidr.today").searchParams.get("redirect_url");
}

describe("signInHref", () => {
  it("carries the story path, query intact, as redirect_url", () => {
    const href = signInHref("vi", "/abcdef12?lang=vi#sources");
    expect(new URL(href, "https://aidr.today").pathname).toBe("/sign-in");
    expect(new URL(href, "https://aidr.today").searchParams.get("lang")).toBe(
      "vi"
    );
    expect(redirectParam(href)).toBe("/abcdef12?lang=vi#sources");
  });

  it.each([
    "//evil.example/abcdef12",
    "/\\evil.example/abcdef12",
    "https://evil.example/abcdef12",
    "javascript:alert(1)",
  ])("drops %s, which a browser would resolve off this site", (target) => {
    expect(sameOriginReturnPath(target)).toBeNull();
    expect(signInHref("en", target)).toBe("/sign-in?lang=en");
  });

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
