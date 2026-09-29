import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  loadStoryOgFonts,
  STORY_OG_FONT_FAMILY,
  STORY_OG_FONT_SOURCES,
  storyOgRenderOptions,
  VIETNAMESE_ALPHABET,
} from "./og-fonts";

/** The two committed weights, read from disk. */
const FONT_PATHS = [
  STORY_OG_FONT_SOURCES.medium,
  STORY_OG_FONT_SOURCES.bold,
] as const;

/**
 * Minimal TrueType `cmap` format-4/12 reader. Deliberately dependency-free:
 * this asserts a property of a committed binary, it is not a font library.
 */
async function coveredCodepoints(path: string): Promise<Set<number>> {
  const bytes = new Uint8Array(await readFile(`public${path}`));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const numTables = view.getUint16(4);
  let cmapOffset = 0;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    if (tag === "cmap") {
      cmapOffset = view.getUint32(record + 8);
      break;
    }
  }
  if (!cmapOffset) throw new Error(`${path} has no cmap table`);

  const covered = new Set<number>();
  const subtableCount = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < subtableCount; i += 1) {
    const sub = cmapOffset + view.getUint32(cmapOffset + 4 + i * 8 + 4);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segCountX2 = view.getUint16(sub + 6);
      const segCount = segCountX2 / 2;
      const endBase = sub + 14;
      const startBase = endBase + segCountX2 + 2;
      for (let s = 0; s < segCount; s += 1) {
        const end = view.getUint16(endBase + s * 2);
        const start = view.getUint16(startBase + s * 2);
        if (start === 0xffff) continue;
        for (let cp = start; cp <= end; cp += 1) covered.add(cp);
      }
    } else if (format === 12) {
      const groupCount = view.getUint32(sub + 12);
      for (let g = 0; g < groupCount; g += 1) {
        const group = sub + 16 + g * 12;
        const start = view.getUint32(group);
        const end = view.getUint32(group + 4);
        for (let cp = start; cp <= end; cp += 1) covered.add(cp);
      }
    }
  }
  return covered;
}

describe("story OG font coverage", () => {
  it("ships the full Vietnamese alphabet in both weights", async () => {
    // Regression: the committed fonts covered latin + latin-ext only. Satori
    // does not skip an uncovered glyph, it fetches a fallback face mid-render,
    // so a Vietnamese headline came out half serif and half Noto Sans.
    // `Ơ` and `Ư` are the trap — they live in Latin Extended-B (U+0180-024F),
    // so a subset that stops at U+017F keeps the tone block and loses them.
    const expected = Array.from(VIETNAMESE_ALPHABET);
    expect(expected).toHaveLength(130);

    for (const path of FONT_PATHS) {
      const covered = await coveredCodepoints(path);
      const missing = expected.filter((c) => !covered.has(c.codePointAt(0)!));
      expect(
        missing,
        `${path} is missing ${missing.length} characters`
      ).toEqual([]);
    }
  });

  it("covers basic Latin, the tone block, and the horned letters", async () => {
    for (const path of FONT_PATHS) {
      const covered = await coveredCodepoints(path);
      for (const c of "AZaz09 .,:;!?()[]{}&@#%'\"-–—…“”‘’•→×©®™€") {
        expect(covered.has(c.codePointAt(0)!), `${path} missing ${c}`).toBe(
          true
        );
      }
      // Spot-check the ranges that are easy to get wrong, by codepoint.
      for (const cp of [0x0110, 0x01af, 0x01b0, 0x1ea0, 0x1ef9]) {
        expect(covered.has(cp), `${path} missing U+${cp.toString(16)}`).toBe(
          true
        );
      }
    }
  });
});

describe("loadStoryOgFonts", () => {
  it("loads both weights under the family the card asks for", async () => {
    const requested: string[] = [];
    const fonts = await loadStoryOgFonts(async (path) => {
      requested.push(path);
      return (await readFile(`public${path}`)).buffer as ArrayBuffer;
    });

    expect(requested).toEqual([
      STORY_OG_FONT_SOURCES.medium,
      STORY_OG_FONT_SOURCES.bold,
    ]);
    expect(fonts).toHaveLength(2);
    expect(fonts.map((font) => font.weight)).toEqual([500, 700]);
    for (const font of fonts) {
      expect(font.name).toBe(STORY_OG_FONT_FAMILY);
      expect(font.style).toBe("normal");
      expect(font.data.byteLength).toBeGreaterThan(1000);
    }
  });

  it("degrades to the weights it can load instead of failing the render", async () => {
    // A missing asset must not 500 the route: satori falls back to its own
    // default face for the absent weight, which is a worse card but a served
    // one.
    const missing = await loadStoryOgFonts(async (path) =>
      path === STORY_OG_FONT_SOURCES.medium
        ? null
        : ((await readFile(`public${path}`)).buffer as ArrayBuffer)
    );
    expect(missing.map((font) => font.weight)).toEqual([700]);

    const none = await loadStoryOgFonts(() => null);
    expect(none).toEqual([]);
    // `fonts` is omitted rather than passed as an empty array: satori reads the
    // two differently, and an absent list is what lets it use its own default.
    const options = storyOgRenderOptions(none);
    expect(options).toEqual({ width: 1200, height: 630 });
    expect("fonts" in options).toBe(false);
  });

  it("passes both weights through once they load", async () => {
    const options = storyOgRenderOptions(
      await loadStoryOgFonts(
        async (path) => (await readFile(`public${path}`)).buffer as ArrayBuffer
      )
    );
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
    expect(options.fonts).toHaveLength(2);
  });

  it("rejects a zero-byte asset rather than passing it to satori", async () => {
    // satori throws on an empty buffer, which would take the route down instead
    // of degrading the card.
    const fonts = await loadStoryOgFonts(() => new ArrayBuffer(0));
    expect(fonts).toEqual([]);
  });
});
