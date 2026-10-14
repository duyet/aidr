/**
 * Test-only PNG reader for render tests that measure where ink landed.
 * Nothing here ships: imported only by `*.test.ts(x)` files.
 */
import { inflateSync } from "node:zlib";

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Minimal 8-bit non-interlaced PNG reader covering the colour types resvg
 * emits. Deliberately dependency-free: this is a test, not a decoder.
 */
export function decodePng(bytes: Uint8Array): Bitmap {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: number[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      interlace = bytes[offset + 20];
    } else if (type === "IDAT") {
      for (const byte of bytes.subarray(offset + 8, offset + 8 + length)) {
        idat.push(byte);
      }
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = new Uint8Array(inflateSync(Uint8Array.from(idat)));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  let prior = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(
      y * (stride + 1) + 1,
      y * (stride + 1) + 1 + stride
    );
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prior[i];
      const upLeft = i >= channels ? prior[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      cur[i] = value & 0xff;
    }
    prior = cur;
  }
  // Normalise every colour type to RGBA.
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (channels === 1) {
      data[d] = data[d + 1] = data[d + 2] = out[s];
      data[d + 3] = 255;
    } else if (channels === 2) {
      data[d] = data[d + 1] = data[d + 2] = out[s];
      data[d + 3] = out[s + 1];
    } else if (channels === 3) {
      data[d] = out[s];
      data[d + 1] = out[s + 1];
      data[d + 2] = out[s + 2];
      data[d + 3] = 255;
    } else {
      data.set(out.subarray(s, s + 4), d);
    }
  }
  return { width, height, data };
}
