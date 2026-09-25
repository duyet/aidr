import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  gifBytes,
  jpegBytes,
  PNG_IEND,
  PNG_SIGNATURE,
  pngBytes,
  pngHeaderOnly,
  vp8lHeaderBytes,
  webpBytes,
  webpLosslessBytes,
  webpLossyBytes,
} from "./__fixtures__/raster";
import {
  detectRasterFormat,
  MAX_STORY_OG_IMAGE_PIXELS,
  MAX_STORY_OG_IMAGE_SIDE,
  readRasterContainer,
} from "./story-og-image";

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__"
);

/**
 * Real lossless WebP files produced by libwebp (via sharp, `lossless: true`).
 * These carry a simple VP8L chunk, which is the only WebP variant whose
 * dimensions live in the 28-bit little-endian header run.
 */
const REAL_VP8L_FIXTURES = [
  { name: "webp-lossless-1x1.webp", width: 1, height: 1, alpha: false },
  { name: "webp-lossless-16x16.webp", width: 16, height: 16, alpha: false },
  { name: "webp-lossless-300x200.webp", width: 300, height: 200, alpha: false },
  {
    name: "webp-lossless-1200x630.webp",
    width: 1200,
    height: 630,
    alpha: false,
  },
  { name: "webp-lossless-1024x13.webp", width: 1024, height: 13, alpha: false },
  { name: "webp-lossless-255x257.webp", width: 255, height: 257, alpha: false },
  { name: "webp-lossless-4096x1.webp", width: 4096, height: 1, alpha: false },
  {
    name: "webp-lossless-300x200-alpha.webp",
    width: 300,
    height: 200,
    alpha: true,
  },
  // One real file past the side ceiling: must be rejected, not mis-decoded.
  {
    name: "webp-lossless-4097x1.webp",
    width: 4097,
    height: 1,
    alpha: false,
    rejected: true,
  },
] as const;

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

  it("rejects a real lossless WebP truncated mid-chunk", async () => {
    const webp = new Uint8Array(
      await readFile(resolve(FIXTURE_DIR, "webp-lossless-300x200.webp"))
    );
    expect(readRasterContainer(webp)).not.toBeNull();
    for (const keep of [0.5, 0.9, 0.99]) {
      const cut = webp.subarray(0, Math.floor(webp.byteLength * keep));
      expect(readRasterContainer(cut), `keep=${keep}`).toBeNull();
    }
  });

  it("rejects a lossless WebP whose chunk is too small to hold a header", () => {
    // Declares a 4-byte VP8L payload: no room for the 5-byte header.
    const webp = webpLosslessBytes(64, 64);
    const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
    view.setUint32(16, 4, true);
    expect(readRasterContainer(webp)).toBeNull();
  });

  it("rejects a VP8L chunk with a bad signature byte", () => {
    const webp = webpLosslessBytes(64, 64);
    webp[20] = 0x2e;
    expect(readRasterContainer(webp)).toBeNull();
  });

  it("rejects a JPEG with no SOF segment", () => {
    // SOI immediately followed by EOI: a valid-looking but frame-less file.
    const noSof = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(detectRasterFormat(noSof)).toBe("jpeg");
    expect(readRasterContainer(noSof)).toBeNull();
  });
});

describe("WebP VP8L (lossless) dimensions", () => {
  /**
   * Regression: VP8L stores `width - 1` and `height - 1` as two 14-bit fields
   * inside one 28-bit little-endian run. Reading width as a 24-bit value folds
   * the top six bits of height into it, which pushed every real lossless file
   * past the pixel ceiling and rejected it.
   */
  it("accepts real libwebp lossless files and reads their exact size", async () => {
    for (const fixture of REAL_VP8L_FIXTURES) {
      const bytes = new Uint8Array(
        await readFile(resolve(FIXTURE_DIR, fixture.name))
      );
      // Guard the fixture itself: it must be a real simple VP8L chunk.
      expect(String.fromCharCode(...bytes.subarray(0, 4)), fixture.name).toBe(
        "RIFF"
      );
      expect(String.fromCharCode(...bytes.subarray(8, 12)), fixture.name).toBe(
        "WEBP"
      );
      expect(String.fromCharCode(...bytes.subarray(12, 16)), fixture.name).toBe(
        "VP8L"
      );
      expect(bytes[20], fixture.name).toBe(0x2f);

      const parsed = readRasterContainer(bytes);
      if ("rejected" in fixture) {
        // A genuine file one pixel past the side ceiling.
        expect(parsed, fixture.name).toBeNull();
        continue;
      }
      expect(parsed, fixture.name).toMatchObject({
        format: "webp",
        mimeType: "image/webp",
        width: fixture.width,
        height: fixture.height,
      });
    }
  });

  it("decodes the 28-bit little-endian header across the byte boundary", () => {
    // width-1 in bits 0..13, height-1 in bits 14..27, then alpha + version.
    // 1200x630 exercises both fields spanning bytes 22 and 23.
    expect(vp8lHeaderBytes(1200, 630)).toEqual([0xaf, 0x44, 0x9d, 0x00]);
    expect(vp8lHeaderBytes(16, 16)).toEqual([0x0f, 0xc0, 0x03, 0x00]);
    expect(vp8lHeaderBytes(1, 1)).toEqual([0x00, 0x00, 0x00, 0x00]);
    // alpha_is_used is bit 28, i.e. bit 4 of the fourth byte.
    expect(vp8lHeaderBytes(300, 200, true)).toEqual([0x2b, 0xc1, 0x31, 0x10]);
    expect(vp8lHeaderBytes(300, 200, false)).toEqual([0x2b, 0xc1, 0x31, 0x00]);
  });

  it("round-trips the header through the parser for many shapes", () => {
    const shapes = [
      [1, 1],
      [1, 63],
      [63, 1],
      [2, 2],
      [15, 15],
      [16, 16],
      [17, 33],
      [63, 64],
      [64, 63],
      [255, 257],
      [256, 256],
      [300, 200],
      [1000, 1],
      [1024, 13],
      [1200, 630],
      [2048, 1],
      [4096, 1],
      [4000, 1000],
    ] as const;
    for (const [w, h] of shapes) {
      expect(
        readRasterContainer(webpLosslessBytes(w, h)),
        `${w}x${h}`
      ).toMatchObject({ format: "webp", width: w, height: h });
    }
  });

  it("reproduces the committed libwebp files byte for byte", async () => {
    // Keeps the encoder honest: if the 28-bit layout drifts, the bytes drift.
    for (const fixture of REAL_VP8L_FIXTURES) {
      const real = new Uint8Array(
        await readFile(resolve(FIXTURE_DIR, fixture.name))
      );
      const built = webpLosslessBytes(
        fixture.width,
        fixture.height,
        "alpha" in fixture ? fixture.alpha : false
      );
      expect(Buffer.from(built).toString("hex"), fixture.name).toBe(
        Buffer.from(real).toString("hex")
      );
    }
  });

  it("applies the bounded ceiling to lossless files too", () => {
    // 14-bit fields top out at 16384 per side; both of these must be rejected.
    expect(readRasterContainer(webpLosslessBytes(16_384, 1))).toBeNull();
    expect(readRasterContainer(webpLosslessBytes(1, 16_384))).toBeNull();
    expect(readRasterContainer(webpLosslessBytes(4097, 1))).toBeNull();
    // Short sides but far too many pixels.
    expect(readRasterContainer(webpLosslessBytes(2048, 2048))).toBeNull();
    // Exactly at both ceilings.
    expect(readRasterContainer(webpLosslessBytes(4096, 1))).not.toBeNull();
  });

  it("refuses to encode a dimension VP8L cannot represent", () => {
    expect(vp8lHeaderBytes(0, 10)).toBeNull();
    expect(vp8lHeaderBytes(10, 0)).toBeNull();
    expect(vp8lHeaderBytes(-1, 10)).toBeNull();
    expect(vp8lHeaderBytes(16_385, 10)).toBeNull();
    expect(vp8lHeaderBytes(10.5, 10)).toBeNull();
    expect(() => webpLosslessBytes(0, 10)).toThrow();
  });
});
