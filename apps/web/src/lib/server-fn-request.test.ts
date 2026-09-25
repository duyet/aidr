import { describe, expect, it } from "vitest";
import {
  hasServerFnMarker,
  isServerFnPath,
  isServerFnRequest,
} from "./server-fn-request";

describe("isServerFnPath", () => {
  it("matches the server-function base and any id under it", () => {
    // Mirrors Start's own `pathname.startsWith(SERVER_FN_BASE)` test.
    expect(isServerFnPath("/_serverFn/")).toBe(true);
    expect(isServerFnPath("/_serverFn/src_lib_submit-fn_ts--submitStory")).toBe(
      true
    );
  });

  it("does not match page routes that resemble the base", () => {
    // A story permalink is the path a reader lands on, and the one a manual
    // curl against a submit attempt hits by mistake.
    expect(isServerFnPath("/98a5ddcb")).toBe(false);
    expect(isServerFnPath("/submit")).toBe(false);
    expect(isServerFnPath("/_serverFn")).toBe(false);
    // A prefix that is not a path boundary is not the transport path.
    expect(isServerFnPath("/_serverFnx/submitStory")).toBe(false);
    expect(isServerFnPath("/api/public")).toBe(false);
  });
});

describe("isServerFnRequest", () => {
  it("classifies by pathname, ignoring query and locale", () => {
    const url = "https://aidr.today/_serverFn/submitStory";
    expect(isServerFnRequest(new Request(url))).toBe(true);
    expect(isServerFnRequest(new Request(`${url}?lang=vi`))).toBe(true);
    expect(
      isServerFnRequest(new Request("https://aidr.today/submit?lang=vi"))
    ).toBe(false);
  });
});

describe("hasServerFnMarker", () => {
  it("reads the client marker", () => {
    expect(
      hasServerFnMarker(
        new Request("https://aidr.today/_serverFn/x", {
          headers: { "x-tsr-serverFn": "true" },
        })
      )
    ).toBe(true);
    expect(
      hasServerFnMarker(new Request("https://aidr.today/_serverFn/x"))
    ).toBe(false);
  });
});
