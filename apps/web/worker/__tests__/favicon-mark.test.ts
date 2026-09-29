/**
 * The favicon must survive a font-less rasterizer.
 *
 * Yandex Webmaster flagged https://aidr.today for "add a favicon file in SVG
 * format or 120 x 120 pixels" even though `public/favicon.svg` was already
 * served and linked. The file drew the wordmark as
 *
 *   <text font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', ...">
 *
 * Crawlers rasterize favicons in a sandbox with no system fonts installed, so
 * that <text> resolved to nothing and the icon came out as a flat yellow square
 * — a file the engine could not use, hence the recommendation.
 *
 * These tests pin the fix: the wordmark is outlined vector geometry, and the
 * rasters Yandex may pick instead are real images of the right size.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public");

/** The marks that must never reintroduce a font dependency. */
const MARKS = ["/favicon.svg", "/logo.svg"] as const;

function readMark(name: string): string {
  return readFileSync(join(publicDir, name), "utf8");
}

/**
 * The mark with XML comments removed. The shipped marks document *why* the
 * wordmark is outlined, and that prose legitimately mentions `<text>` and
 * `font-family`; only real elements can pull in a font at raster time.
 */
function markBody(name: string): string {
  return readMark(name).replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Read a committed binary asset as an explicit byte view. `readFileSync` hands
 * back a `NonSharedBuffer` whose numeric readers are not visible to `tsc`
 * here, and the container layouts below are all defined by byte offset and
 * endianness, so a DataView states both.
 */
function readBytes(name: string): DataView {
  const bytes = readFileSync(join(publicDir, name));
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectPngSignature(view: DataView, at: number, label: string) {
  for (const [i, byte] of PNG_SIGNATURE.entries()) {
    expect(
      view.getUint8(at + i),
      `${label}: byte ${i} of the PNG signature`
    ).toBe(byte);
  }
}

/** PNG dimensions live in the IHDR chunk, 8 bytes past the 8-byte signature. */
function pngSize(name: string): { width: number; height: number } {
  const view = readBytes(name);
  expectPngSignature(view, 0, name);
  // 8..11 IHDR length, 12..15 "IHDR", 16..19 width, 20..23 height (big-endian).
  expect(
    [12, 13, 14, 15].map((i) => view.getUint8(i)),
    `${name} is not a PNG (no IHDR)`
  ).toEqual([0x49, 0x48, 0x44, 0x52]);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** ICONDIR: reserved(0) type(2) count(4), then 16 bytes per frame. */
function icoFrames(name: string): number[] {
  const view = readBytes(name);
  expect(view.getUint16(0, true), `${name} reserved field`).toBe(0);
  expect(view.getUint16(2, true), `${name} type field`).toBe(1);
  const count = view.getUint16(4, true);
  const sizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    // 0 is the ICO encoding for 256; none of our frames use it.
    const w = view.getUint8(at);
    const h = view.getUint8(at + 1);
    expect(h, `${name} frame ${i} is not square`).toBe(w);
    sizes.push(w === 0 ? 256 : w);
  }
  return sizes;
}

describe("shipped SVG marks", () => {
  it.each(MARKS)("%s draws no text, so it needs no installed font", (name) => {
    const svg = markBody(name);
    expect(svg).not.toMatch(/<text[\s>]/i);
    expect(svg).not.toMatch(/font-family/i);
  });

  it.each(MARKS)("%s carries the wordmark as real path geometry", (name) => {
    const svg = markBody(name);
    // A usable outline, not an empty or degenerate <path/>.
    const outlines = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(outlines.length).toBeGreaterThan(0);
    for (const d of outlines) {
      expect(d.length).toBeGreaterThan(200);
      expect(d).toMatch(/[MLQ]/); // at least one absolute move/line/curve
    }
  });

  it.each(MARKS)("%s declares intrinsic width and height", (name) => {
    // Yandex asks for a concrete size; a bare viewBox leaves the rasterizer to
    // guess one.
    const svg = markBody(name);
    expect(svg).toMatch(/<svg[^>]*\bwidth="\d+"/);
    expect(svg).toMatch(/<svg[^>]*\bheight="\d+"/);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it("positions the wordmark with a transform, not a font baseline", () => {
    // Centring used to depend on `dominant-baseline="central"`, which only
    // means something to a renderer that has the font. The mark now carries its
    // own transform.
    const svg = markBody("favicon.svg");
    expect(svg).toMatch(
      /<path[^>]*transform="translate\([-\d.]+ [-\d.]+\) scale\([\d.]+\)"/
    );
  });
});

describe("raster fallbacks", () => {
  it("ships the 120x120 PNG Yandex asks for", () => {
    expect(pngSize("favicon-120x120.png")).toEqual({
      width: 120,
      height: 120,
    });
  });

  it("ships a 180x180 apple touch icon", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("packs 16/32/48 frames into the root favicon.ico", () => {
    expect(icoFrames("favicon.ico")).toEqual([16, 32, 48]);
  });

  it("packs self-contained PNG frames, as every shipping browser accepts", () => {
    // PNG-in-ICO has been readable since Windows Vista, which is why the
    // generator needs no BMP encoder. Verify each frame is a real PNG and that
    // the directory offsets actually address it.
    const view = readBytes("favicon.ico");
    const count = view.getUint16(4, true);
    for (let i = 0; i < count; i += 1) {
      const at = 6 + i * 16;
      const length = view.getUint32(at + 8, true);
      const offset = view.getUint32(at + 12, true);
      expect(
        offset + length,
        `favicon.ico frame ${i} runs past the end of the file`
      ).toBeLessThanOrEqual(view.byteLength);
      expectPngSignature(view, offset, `favicon.ico frame ${i}`);
    }
  });
});
