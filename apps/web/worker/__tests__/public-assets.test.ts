import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  handlePublicAsset,
  isPublicAssetPath,
  PUBLIC_ASSET_PATHS,
  publicAssetContentType,
} from "../public-assets.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public");

describe("isPublicAssetPath", () => {
  it("matches unhashed public logos and og/favicon", () => {
    expect(isPublicAssetPath("/logo-sm.png")).toBe(true);
    expect(isPublicAssetPath("/logo-icon.png")).toBe(true);
    expect(isPublicAssetPath("/og.jpg")).toBe(true);
    expect(isPublicAssetPath("/favicon.svg")).toBe(true);
    expect(isPublicAssetPath("/assets/logo-sm.png")).toBe(false);
    expect(isPublicAssetPath("/")).toBe(false);
  });

  it("matches every icon surface, so no favicon request falls into the SPA shell", () => {
    for (const path of [
      "/favicon.ico",
      "/favicon-120x120.png",
      "/apple-touch-icon.png",
    ]) {
      expect(isPublicAssetPath(path)).toBe(true);
    }
  });

  it("types the ICO and the PNG icon so crawlers accept the response", () => {
    expect(publicAssetContentType("/favicon.ico")).toBe("image/x-icon");
    expect(publicAssetContentType("/favicon-120x120.png")).toBe("image/png");
    expect(publicAssetContentType("/apple-touch-icon.png")).toBe("image/png");
  });
});

describe("public files on disk", () => {
  it("ships every allowlisted path from apps/web/public", () => {
    for (const path of PUBLIC_ASSET_PATHS) {
      const file = join(publicDir, path.slice(1));
      expect(existsSync(file)).toBe(true);
    }
    const favicon = readFileSync(join(publicDir, "favicon.svg"), "utf8");
    expect(favicon).toContain("<svg");
    expect(publicAssetContentType("/favicon.svg")).toBe("image/svg+xml");
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

  it("serves SVG even when ASSETS labels it text/html", async () => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    const env = {
      ASSETS: {
        fetch: async (req: Request) => {
          expect(new URL(req.url).pathname).toBe("/favicon.svg");
          expect(req.headers.get("Accept")).toBe("*/*");
          return new Response(svg, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    };
    const res = await handlePublicAsset(
      new Request("https://aidr.today/favicon.svg", {
        headers: { Accept: "text/html" },
      }),
      env
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await res!.text()).toContain("<svg");
  });

  it("still recognises the shipped SVG behind its leading comment", async () => {
    // favicon.svg opens with an explanatory comment, so a naive
    // `startsWith("<svg")` sniff would 404 the real mark.
    const onDisk = await readFile(join(publicDir, "favicon.svg"), "utf8");
    expect(onDisk.startsWith("<!--")).toBe(true);
    const env = {
      ASSETS: {
        fetch: async () =>
          new Response(onDisk, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      },
    };
    const res = await handlePublicAsset(
      new Request("https://aidr.today/favicon.svg", {
        headers: { Accept: "text/html" },
      }),
      env
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/svg+xml");
  });

  it("serves the root favicon.ico as an image instead of redirecting to SVG", async () => {
    const ico = await readFile(join(publicDir, "favicon.ico"));
    const env = {
      ASSETS: {
        fetch: async (req: Request) => {
          expect(new URL(req.url).pathname).toBe("/favicon.ico");
          return new Response(ico, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        },
      },
    };
    const res = await handlePublicAsset(
      new Request("https://aidr.today/favicon.ico"),
      env
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/x-icon");
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
