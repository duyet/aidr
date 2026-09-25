import { describe, expect, it } from "vitest";
import { isLangToggleDisabledPath } from "./lib";

describe("header locale toggle paths", () => {
  it("disables the toggle on neutral and authenticated child routes", () => {
    for (const path of [
      "/about",
      "/sign-in",
      "/sign-in/account",
      "/sign-up",
      "/sign-up/verify",
    ]) {
      expect(isLangToggleDisabledPath(path)).toBe(true);
    }
    expect(isLangToggleDisabledPath("/")).toBe(false);
    expect(isLangToggleDisabledPath("/mcp")).toBe(false);
  });
});
