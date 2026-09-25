/**
 * Test-only builders for minimal, structurally valid raster containers.
 *
 * These are constructed in code rather than committed as binary blobs so the
 * exact header bytes under test stay reviewable. Nothing here ships: the
 * module is imported only by `*.test.ts(x)` files.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function be32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function le32(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function pngChunk(type: string, data: number[]): number[] {
  const body = Uint8Array.from([...ascii(type), ...data]);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** IHDR chunk for an 8-bit RGBA image with a real CRC. */
export function pngIhdr(width: number, height: number): number[] {
  return pngChunk("IHDR", [
    ...be32(width),
    ...be32(height),
    0x08, // bit depth
    0x06, // colour type: RGBA
    0x00, // compression
    0x00, // filter
    0x00, // interlace
  ]);
}

export const PNG_IEND = pngChunk("IEND", []);

/**
 * A complete, decodable solid-colour PNG of the requested size.
 */
export function pngBytes(
  width: number,
  height: number,
  color: [number, number, number] = [10, 10, 10]
): Uint8Array<ArrayBuffer> {
  return pngFromPixels(width, height, () => color);
}

/** A complete, decodable PNG whose pixels come from a per-pixel function. */
export function pngFromPixels(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number]
): Uint8Array<ArrayBuffer> {
  // One filter byte plus RGBA per pixel, per scanline.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const p = rowStart + 1 + x * 4;
      raw[p] = r & 0xff;
      raw[p + 1] = g & 0xff;
      raw[p + 2] = b & 0xff;
      raw[p + 3] = 255;
    }
  }
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngIhdr(width, height),
    ...pngChunk("IDAT", Array.from(deflateSync(raw))),
    ...PNG_IEND,
  ]);
}

/**
 * A deterministic, licence-clean stand-in for a publisher photo. Preview
 * artifacts are committed, so the source image has to be reproducible from
 * code rather than downloaded; this exercises the same decode path as a real
 * CDN thumbnail while staying byte-stable across runs and machines.
 */
export function syntheticStoryPhoto(
  width = 960,
  height = 720
): Uint8Array<ArrayBuffer> {
  const sunX = width * 0.68;
  const sunY = height * 0.3;
  const sunR = Math.min(width, height) * 0.22;
  return pngFromPixels(width, height, (x, y) => {
    const v = y / height;
    // Sky gradient into a darker ground band.
    let r = 40 + v * 120;
    let g = 70 + v * 110;
    let b = 120 + v * 90;
    if (v > 0.68) {
      const t = (v - 0.68) / 0.32;
      r = 30 + t * 40;
      g = 34 + t * 36;
      b = 40 + t * 30;
    }
    // A soft sun disc.
    const d = Math.hypot(x - sunX, y - sunY);
    if (d < sunR) {
      const glow = 1 - d / sunR;
      r += glow * 165;
      g += glow * 140;
      b += glow * 60;
    }
    // A few diagonal bands so the blurred backdrop has visible structure.
    const band = (x + y * 0.6) % 260;
    if (band < 26) {
      r += 26;
      g += 24;
      b += 18;
    }
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    return [clamp(r), clamp(g), clamp(b)];
  });
}

/**
 * A header-valid, structurally complete PNG header that declares the given
 * dimensions but carries no pixel data. Small on disk, so it proves the
 * dimension ceiling is read from the header rather than from the byte count.
 */
export function pngHeaderOnly(
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngIhdr(width, height),
    ...PNG_IEND,
  ]);
}

/** A real 1x1 GIF87a with a trailer byte. */
export function gifBytes(
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0x47,
    0x49,
    0x46,
    0x38,
    0x37,
    0x61, // "GIF87a"
    width & 0xff,
    (width >>> 8) & 0xff,
    height & 0xff,
    (height >>> 8) & 0xff,
    0xf0,
    0x00,
    0x00, // packed + background + aspect
    0x00,
    0x00,
    0x00,
    0xff,
    0xff,
    0xff, // global colour table
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // image descriptor
    width & 0xff,
    (width >>> 8) & 0xff,
    height & 0xff,
    (height >>> 8) & 0xff,
    0x00, // no local colour table
    0x02,
    0x02,
    0x44,
    0x01,
    0x00, // LZW min code size + data
    0x3b, // trailer
  ]);
}

function riffChunk(tag: string, data: number[]): number[] {
  const size = data.length;
  // WebP chunks carry a 4-byte little-endian size (unlike 3-byte AVI chunks).
  return [
    ...ascii(tag),
    ...le32(size),
    ...data,
    // RIFF chunks pad to an even length.
    ...(size & 1 ? [0] : []),
  ];
}

function riff(...chunks: number[][]): Uint8Array<ArrayBuffer> {
  const body = [...ascii("WEBP"), ...chunks.flat()];
  // RIFF is little-endian, unlike PNG's big-endian chunk lengths.
  return Uint8Array.from([...ascii("RIFF"), ...le32(body.length), ...body]);
}

/** Extended-format WebP whose canvas size comes from the VP8X chunk. */
export function webpBytes(
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  return riff(
    riffChunk("VP8X", [
      0x10,
      0x00,
      0x00,
      0x00, // flags: no alpha / no animation
      (width - 1) & 0xff,
      ((width - 1) >>> 8) & 0xff,
      ((width - 1) >>> 16) & 0xff,
      (height - 1) & 0xff,
      ((height - 1) >>> 8) & 0xff,
      ((height - 1) >>> 16) & 0xff,
    ]),
    // A real VP8X file always carries image chunk(s) after the header.
    riffChunk("VP8 ", [0x00, 0x00, 0x00])
  );
}

/** Lossy WebP whose frame size comes from the VP8 bitstream header. */
export function webpLossyBytes(
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  return riff(
    riffChunk("VP8 ", [
      0x00,
      0x00,
      0x00, // frame tag
      0x9d,
      0x01,
      0x2a, // sync code
      width & 0x3fff,
      (width >>> 8) & 0x3f,
      height & 0x3fff,
      (height >>> 8) & 0x3f,
    ])
  );
}

/**
 * A minimal but structurally complete JPEG: SOI, SOF0 carrying the frame
 * dimensions, an empty scan, and the EOI marker.
 */
export function jpegBytes(
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  const sof0 = [
    0xff,
    0xc0, // SOF0
    0x00,
    0x11, // segment length 17
    0x08, // 8-bit samples
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03, // 3 components
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ];
  return Uint8Array.from([
    0xff,
    0xd8, // SOI
    ...sof0,
    0xff,
    0xda, // SOS
    0x00,
    0x0c,
    0x03,
    0x01,
    0x00,
    0x02,
    0x11,
    0x03,
    0x11,
    0x00,
    0x3f,
    0x00,
    0x7f,
    0xff, // entropy-coded data
    0xff,
    0xd9, // EOI
  ]);
}
