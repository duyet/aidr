import { describe, expect, it } from "vitest";
import { normalizeParams, slug } from "./schema";

const parse = (value: unknown) =>
  normalizeParams({ to: slug() }, { to: value });

describe("slug params", () => {
  it.each([
    "/",
    "/weeks",
    "/data",
    "duyet.net",
    "digest-2026-10-14",
    "channel_button",
  ])("accepts the code-written slug %s", (value) => {
    expect(parse(value)).toEqual({ to: value });
  });

  it.each([
    ["a URL", "https://duyet.net/a"],
    ["a query string", "/search?q=secret"],
    ["a key=value pair", "q=secret"],
    ["a chained query", "/x?a=1&b=2"],
    ["free text", "my secret query"],
    ["an email", "reader@example.com"],
    ["a hash", "/x#token"],
    ["a non-string", 42],
  ])("rejects %s so reader text never rides in a slug", (_, value) => {
    expect(parse(value)).toEqual({});
  });
});
