import { describe, expect, it } from "vitest";
import {
  hasServerFnId,
  hasServerFnMarker,
  isServerFnBasePath,
  isServerFnPath,
  isServerFnRequest,
  serverFnIdOf,
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
    expect(isServerFnPath("/deadbeef")).toBe(false);
    expect(isServerFnPath("/submit")).toBe(false);
    expect(isServerFnPath("/_serverFn")).toBe(false);
    // A prefix that is not a path boundary is not the transport path.
    expect(isServerFnPath("/_serverFnx/submitStory")).toBe(false);
    expect(isServerFnPath("/api/public")).toBe(false);
  });
});

describe("isServerFnBasePath", () => {
  it("recognises the bare base and nothing that merely starts with it", () => {
    expect(isServerFnBasePath("/_serverFn")).toBe(true);
    expect(isServerFnBasePath("/_serverFn/")).toBe(true);
    expect(isServerFnBasePath("/_serverFnx")).toBe(false);
    expect(isServerFnBasePath("/_serverFn/abc")).toBe(false);
    expect(isServerFnBasePath("/submit")).toBe(false);
  });
});

describe("serverFnIdOf", () => {
  it("keeps both id alphabets Start's compiler can emit", () => {
    // Production: sha256 hex. Assembled rather than pasted so this file adds
    // no high-entropy literal; the real `submitStory` id is exercised
    // end-to-end against the built bundle in `server-server-fn.test.ts`.
    const sha256Id = "deadbeef".repeat(8);
    expect(serverFnIdOf(`/_serverFn/${sha256Id}`)).toBe(sha256Id);
    // Dev: base64url of the encoded module specifier and export name. The
    // base64url alphabet is [A-Za-z0-9_-]; standard base64's + and / are not
    // emitted, so a slash can never be part of a real id.
    const devId = Buffer.from(
      JSON.stringify({
        file: "/src/lib/submit-fn.ts",
        export: "submitStory_createServerFn_handler",
      }),
      "utf8"
    ).toString("base64url");
    expect(serverFnIdOf(`/_serverFn/${devId}`)).toBe(devId);
    // A build-time dedup collision appends _N.
    expect(serverFnIdOf(`/_serverFn/${devId}_2`)).toBe(`${devId}_2`);
  });

  it("returns null for a path that cannot carry an id", () => {
    expect(serverFnIdOf("/_serverFn/")).toBe(null);
    expect(serverFnIdOf("/_serverFn//")).toBe(null);
    expect(serverFnIdOf("/_serverFn/abc/extra")).toBe(null);
    expect(serverFnIdOf("/_serverFnx/abc")).toBe(null);
    expect(serverFnIdOf("/deadbeef")).toBe(null);
  });

  it("rejects every character shape Start cannot emit", () => {
    // Percent-encoded traversal and separators must never reach a resolver.
    for (const id of [
      "%2e%2e%2f%2e%2e%2fadmin",
      "%2Fabc",
      "..%2f..%2fadmin",
      "..%2f..%2fweb.config",
      "abc%00",
      "a+b",
      "a=b",
      "a.b",
      "..",
      ".",
      "a\\b",
      "a:b",
      "a b",
      "a?b",
      "a#b",
      "ä".repeat(4),
    ]) {
      expect(serverFnIdOf(`/_serverFn/${id}`)).toBe(null);
    }
  });

  it("rejects an id long enough to be a smuggling attempt", () => {
    // A build id is 64 hex characters; a dev id is the base64url of a JSON
    // descriptor and was observed up to 139 characters across this app's
    // functions. The 200 ceiling is a safety bound above the observed output,
    // not a derived maximum.
    expect(serverFnIdOf(`/_serverFn/${"a".repeat(139)}`)).not.toBe(null);
    expect(serverFnIdOf(`/_serverFn/${"a".repeat(200)}`)).not.toBe(null);
    expect(serverFnIdOf(`/_serverFn/${"a".repeat(201)}`)).toBe(null);
  });
});

describe("hasServerFnId", () => {
  it("accepts one non-empty function id segment", () => {
    expect(hasServerFnId("/_serverFn/deadbeefdeadbeef")).toBe(true);
    expect(hasServerFnId("/_serverFn/src_lib_submit-fn_ts--submitStory")).toBe(
      true
    );
  });

  it("rejects the bare base and nested, empty, or unsafe ids", () => {
    expect(hasServerFnId("/_serverFn/")).toBe(false);
    expect(hasServerFnId("/_serverFn//")).toBe(false);
    expect(hasServerFnId("/_serverFn/abc/extra")).toBe(false);
    expect(hasServerFnId("/_serverFnx/abc")).toBe(false);
    expect(hasServerFnId("/_serverFn/..%2f..%2fadmin")).toBe(false);
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
