/**
 * Bounded raster container inspection for story OG cards.
 *
 * Magic bytes alone are not a safety boundary: a tiny file can claim enormous
 * pixel dimensions (a decompression bomb for the card renderer) and a
 * header-valid file can be truncated or garbage-tailed, which renders as an
 * empty gray panel instead of the branded fallback. This module parses just
 * enough of each container to know its real dimensions and to prove the
 * byte stream is structurally complete, without decoding pixels and without
 * raising the existing byte ceiling.
 */

export type StoryOgMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp";

export type RasterFormat = "png" | "jpeg" | "gif" | "webp";

export interface RasterContainer {
  format: RasterFormat;
  mimeType: StoryOgMime;
  width: number;
  height: number;
}

/** Longest edge we will hand to the card renderer. */
export const MAX_STORY_OG_IMAGE_SIDE = 4096;
/** Total decoded pixel budget. A 1 MB file can otherwise claim 30000x30000. */
export const MAX_STORY_OG_IMAGE_PIXELS = 4_000_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Canonical, uncompressed IHDR type + IEND tail markers. */
const PNG_IHDR_TYPE = [0x49, 0x48, 0x44, 0x52];
const PNG_IEND_TAIL = [0x49, 0x45, 0x4e, 0x44];

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function matchesAt(bytes: Uint8Array, offset: number, expected: number[]) {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1)
    out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function le16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function le24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function le32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/** Identify the container from its leading magic bytes. */
export function detectRasterFormat(bytes: Uint8Array): RasterFormat | null {
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) return "png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a") {
    return "gif";
  }
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  return null;
}

/**
 * PNG: 8-byte signature, a first IHDR chunk carrying the real dimensions, and
 * a terminal IEND chunk. Both are required, so a signature-only or truncated
 * file is rejected before it can reach the renderer.
 */
function readPng(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 8 + 4 + 4 + 13 + 4) return null;
  if (be32(bytes, 8) !== 13) return null;
  if (!matchesAt(bytes, 12, PNG_IHDR_TYPE)) return null;
  // IEND is the last 12 bytes: a zero length field plus the type tag.
  if (bytes.length < 12) return null;
  const tail = bytes.length - 8;
  if (!matchesAt(bytes, tail, PNG_IEND_TAIL)) return null;
  if (
    bytes[tail - 4] !== 0 ||
    bytes[tail - 3] !== 0 ||
    bytes[tail - 2] !== 0 ||
    bytes[tail - 1] !== 0
  ) {
    return null;
  }
  return { width: be32(bytes, 16), height: be32(bytes, 20) };
}

/**
 * JPEG: walk the marker segments for the first SOF, which carries the frame
 * dimensions, and require a terminal EOI marker so a truncated scan is caught.
 */
function readJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return null;
  }
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Skip any fill bytes before the marker code.
    let markerAt = offset;
    while (markerAt < bytes.length && bytes[markerAt] === 0xff) markerAt += 1;
    if (markerAt >= bytes.length) return null;
    const marker = bytes[markerAt];
    // Standalone markers carry no length payload.
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset = markerAt + 1;
      continue;
    }
    if (marker === 0xd9) return null; // EOI before any frame header
    if (marker === 0xda) return null; // scan data: no SOF was ever seen
    const segment = markerAt + 1;
    if (segment + 2 > bytes.length) return null;
    const length = be16(bytes, segment);
    if (length < 2) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segment + 7 > bytes.length) return null;
      return {
        width: be16(bytes, segment + 5),
        height: be16(bytes, segment + 3),
      };
    }
    offset = segment + length;
  }
  return null;
}

/** GIF: logical screen descriptor at offset 6, trailer byte 0x3b at the end. */
function readGif(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 13) return null;
  if (bytes[bytes.length - 1] !== 0x3b) return null;
  return { width: le16(bytes, 6), height: le16(bytes, 8) };
}

/**
 * Byte length of the first RIFF sub-chunk's payload, or null when the
 * declared size runs past the end of the buffer. Chunk sizes are 4-byte
 * little-endian and payloads pad to an even length.
 */
function firstChunkPayloadLength(bytes: Uint8Array): number | null {
  const size = le32(bytes, 16);
  const padded = size + (size & 1);
  if (12 + 8 + padded > bytes.length) return null;
  return size;
}

/**
 * WebP: the RIFF size must account for the whole buffer (a truncation check),
 * then read canvas/frame dimensions from the VP8, VP8L, or VP8X chunk.
 */
function readWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  if (le32(bytes, 4) + 8 !== bytes.length) return null;
  const payload = firstChunkPayloadLength(bytes);
  if (payload === null) return null;
  const chunk = asciiAt(bytes, 12, 4);
  if (chunk === "VP8 ") {
    if (payload < 10) return null;
    if (!matchesAt(bytes, 23, [0x9d, 0x01, 0x2a])) return null;
    return {
      width: le16(bytes, 26) & 0x3fff,
      height: le16(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    // Lossless bitstream. The header is one 0x2f signature byte followed by
    // a 28-bit little-endian run: 14 bits of width-1, then 14 bits of
    // height-1, then 1 bit of alpha_is_used and a 3-bit version. Bits are
    // packed LSB-first, so the 28 bits span bytes 21..24 and the two 14-bit
    // fields straddle the byte 22/23 boundary. Reading width as a plain
    // 24-bit value instead folds the top of height into it and rejects
    // every real lossless file.
    if (payload < 5) return null;
    if (bytes[20] !== 0x2f) return null;
    const width = (le16(bytes, 21) & 0x3fff) + 1;
    const height =
      ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) + 1;
    return { width, height };
  }
  if (chunk === "VP8X") {
    if (payload < 10) return null;
    return { width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 };
  }
  return null;
}

/**
 * Parse the container header and prove the stream is structurally complete.
 * Returns null when the format is unknown, the structure is truncated or
 * garbage-tailed, or the declared dimensions exceed the bounded ceiling.
 */
export function readRasterContainer(bytes: Uint8Array): RasterContainer | null {
  const format = detectRasterFormat(bytes);
  if (!format) return null;
  const size =
    format === "png"
      ? readPng(bytes)
      : format === "jpeg"
        ? readJpeg(bytes)
        : format === "gif"
          ? readGif(bytes)
          : readWebp(bytes);
  if (!size) return null;
  const { width, height } = size;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width <= 0 || height <= 0) return null;
  if (width > MAX_STORY_OG_IMAGE_SIDE || height > MAX_STORY_OG_IMAGE_SIDE) {
    return null;
  }
  if (width * height > MAX_STORY_OG_IMAGE_PIXELS) return null;
  return {
    format,
    mimeType: `image/${format}` as StoryOgMime,
    width,
    height,
  };
}
