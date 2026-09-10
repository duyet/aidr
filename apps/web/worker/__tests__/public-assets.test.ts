import { describe, expect, it } from "vitest";
import { handlePublicAsset, isPublicAssetPath } from "../public-assets.js";

describe("isPublicAssetPath", () => {
  it("matches unhashed public logos and og/favicon", () => {
    expect(isPublicAssetPath("/logo-sm.png")).toBe(true);
    expect(isPublicAssetPath("/logo-icon.png")).toBe(true);
    expect(isPublicAssetPath("/og.jpg")).toBe(true);
    expect(isPublicAssetPath("/favicon.svg")).toBe(true);
    expect(isPublicAssetPath("/assets/logo-sm.png")).toBe(false);
    expect(isPublicAssetPath("/")).toBe(false);
  });
});

describe("handlePublicAsset", () => {
  it("returns the asset when ASSETS yields a PNG", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const env = {
      ASSETS: {
        fetch: async () =>
          new Response(png, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
      },
    };
    const res = await handlePublicAsset(
      new Request("https://aidr.today/logo-sm.png"),
      env
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toContain("image/png");
  });

  it("404s when ASSETS returns the SPA HTML shell", async () => {
    const env = {
      ASSETS: {
        fetch: async () =>
          new Response("<!DOCTYPE html>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      },
    };
    const res = await handlePublicAsset(
      new Request("https://aidr.today/logo-sm.png"),
      env
    );
    expect(res!.status).toBe(404);
  });

  it("skips non-public paths", async () => {
    const res = await handlePublicAsset(
      new Request("https://aidr.today/subscribe"),
      { ASSETS: { fetch: async () => new Response("nope") } }
    );
    expect(res).toBeNull();
  });
});
