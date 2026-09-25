import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  gifBytes,
  jpegBytes,
  PNG_IEND,
  PNG_SIGNATURE,
  pngBytes,
  pngHeaderOnly,
  webpBytes,
  webpLossyBytes,
} from "./__fixtures__/raster";
import {
  detectRasterFormat,
  MAX_STORY_OG_IMAGE_PIXELS,
  MAX_STORY_OG_IMAGE_SIDE,
  readRasterContainer,
} from "./story-og-image";

describe("detectRasterFormat", () => {
  it("identifies each supported container from its magic bytes", () => {
    expect(detectRasterFormat(pngBytes(2, 2))).toBe("png");
    expect(detectRasterFormat(jpegBytes(8, 8))).toBe("jpeg");
    expect(detectRasterFormat(gifBytes(8, 8))).toBe("gif");
    expect(detectRasterFormat(webpBytes(8, 8))).toBe("webp");
  });

  it("rejects non-raster and near-miss signatures", () => {
    expect(detectRasterFormat(new Uint8Array())).toBeNull();
    expect(detectRasterFormat(new TextEncoder().encode("GIF8"))).toBeNull();
    expect(
      detectRasterFormat(new TextEncoder().encode("RIFFxxxxWAVE"))
    ).toBeNull();
    // PNG signature followed by nothing usable.
    expect(detectRasterFormat(Uint8Array.from(PNG_SIGNATURE))).toBe("png");
  });
});

describe("readRasterContainer dimensions", () => {
  it("reads the real dimensions from each container header", () => {
    expect(readRasterContainer(pngBytes(64, 32))).toMatchObject({
      format: "png",
      width: 64,
      height: 32,
    });
    expect(readRasterContainer(jpegBytes(1200, 630))).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 630,
    });
    expect(readRasterContainer(gifBytes(48, 24))).toMatchObject({
      format: "gif",
      width: 48,
      height: 24,
    });
    expect(readRasterContainer(webpBytes(300, 200))).toMatchObject({
      format: "webp",
      width: 300,
      height: 200,
    });
    expect(readRasterContainer(webpLossyBytes(320, 240))).toMatchObject({
      format: "webp",
      width: 320,
      height: 240,
    });
  });

  it("reads dimensions from real repository images", async () => {
    const png = new Uint8Array(await readFile("public/logo.png"));
    expect(readRasterContainer(png)).toMatchObject({
      format: "png",
      width: 640,
      height: 640,
    });
    const jpeg = new Uint8Array(await readFile("public/og-home.jpg"));
    expect(readRasterContainer(jpeg)).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 630,
    });
  });
});

describe("readRasterContainer pixel ceiling", () => {
  it("rejects a small file that declares an enormous canvas", () => {
    // 33 bytes on disk, 30000x30000 declared: a decompression bomb for the
    // card renderer that no byte ceiling can catch.
    const bomb = pngHeaderOnly(30_000, 30_000);
    expect(bomb.byteLength).toBeLessThan(64);
    expect(detectRasterFormat(bomb)).toBe("png");
    expect(readRasterContainer(bomb)).toBeNull();
  });

  it("rejects a long thin canvas over the side ceiling", () => {
    expect(
      readRasterContainer(pngHeaderOnly(MAX_STORY_OG_IMAGE_SIDE + 1, 8))
    ).toBeNull();
    expect(
      readRasterContainer(pngHeaderOnly(8, MAX_STORY_OG_IMAGE_SIDE + 1))
    ).toBeNull();
  });

  it("rejects a canvas over the total pixel budget despite short sides", () => {
    // Both sides are inside the per-side ceiling, but the area is not.
    const side = Math.floor(Math.sqrt(MAX_STORY_OG_IMAGE_PIXELS)) + 1;
    expect(side).toBeLessThan(MAX_STORY_OG_IMAGE_SIDE);
    expect(readRasterContainer(pngHeaderOnly(side, side))).toBeNull();
  });

  it("accepts a canvas exactly at the ceiling", () => {
    const side = Math.sqrt(MAX_STORY_OG_IMAGE_PIXELS);
    expect(Number.isInteger(side)).toBe(true);
    expect(readRasterContainer(pngHeaderOnly(side, side))).toMatchObject({
      width: side,
      height: side,
    });
    expect(
      readRasterContainer(pngHeaderOnly(MAX_STORY_OG_IMAGE_SIDE, 1))
    ).not.toBeNull();
  });

  it("rejects zero and non-integer dimensions", () => {
    expect(readRasterContainer(pngHeaderOnly(0, 10))).toBeNull();
    expect(readRasterContainer(pngHeaderOnly(10, 0))).toBeNull();
    // 0xFFFFFFFF has the high bit set, so it is negative as a signed int32.
    expect(readRasterContainer(pngHeaderOnly(-1, -1))).toBeNull();
  });
});

describe("readRasterContainer structural completeness", () => {
  it("rejects a PNG that is only a signature", () => {
    expect(readRasterContainer(Uint8Array.from(PNG_SIGNATURE))).toBeNull();
  });

  it("rejects a PNG with no IEND chunk", () => {
    const complete = pngHeaderOnly(8, 8);
    expect(readRasterContainer(complete)).not.toBeNull();
    const noIend = complete.subarray(0, complete.length - PNG_IEND.length);
    expect(readRasterContainer(noIend)).toBeNull();
  });

  it("rejects a real PNG truncated mid-stream", async () => {
    const png = new Uint8Array(await readFile("public/logo.png"));
    expect(readRasterContainer(png)).not.toBeNull();
    for (const keep of [0.1, 0.5, 0.9, 0.99]) {
      const cut = png.subarray(0, Math.floor(png.byteLength * keep));
      expect(readRasterContainer(cut), `keep=${keep}`).toBeNull();
    }
  });

  it("rejects a real PNG with trailing garbage", async () => {
    const png = new Uint8Array(await readFile("public/logo.png"));
    const padded = new Uint8Array(png.byteLength + 64);
    padded.set(png, 0);
    expect(readRasterContainer(padded)).toBeNull();
  });

  it("rejects a real JPEG with its EOI marker removed", async () => {
    const jpeg = new Uint8Array(await readFile("public/og-home.jpg"));
    expect(readRasterContainer(jpeg)).not.toBeNull();
    expect(
      readRasterContainer(jpeg.subarray(0, jpeg.byteLength - 2))
    ).toBeNull();
  });

  it("rejects a GIF without its trailer byte", () => {
    const gif = gifBytes(16, 16);
    expect(readRasterContainer(gif)).not.toBeNull();
    expect(readRasterContainer(gif.subarray(0, gif.byteLength - 1))).toBeNull();
  });

  it("rejects a WebP whose RIFF size does not match the buffer", () => {
    const webp = webpBytes(64, 64);
    expect(readRasterContainer(webp)).not.toBeNull();
    expect(
      readRasterContainer(webp.subarray(0, webp.byteLength - 4))
    ).toBeNull();
  });

  it("rejects a JPEG with no SOF segment", () => {
    // SOI immediately followed by EOI: a valid-looking but frame-less file.
    const noSof = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(detectRasterFormat(noSof)).toBe("jpeg");
    expect(readRasterContainer(noSof)).toBeNull();
  });
});
