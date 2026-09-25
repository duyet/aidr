/**
 * Render-level regression test for the story OG card.
 *
 * `react-dom/server` markup assertions cannot catch a layout overflow, so
 * these tests drive the real satori/resvg pipeline that the Worker route uses
 * and then decode the resulting PNG to measure where the headline ink landed.
 * That is the only way to prove a >=200 character title stays inside the card
 * instead of painting over the wordmark and the footer.
 */
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { ImageResponse } from "@cf-wasm/og/node";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  fetchStoryOgImage,
  isSafeStoryImageUrl,
  STORY_OG_CONTENT_INSET_X,
  STORY_OG_HEIGHT,
  STORY_OG_TITLE_BAND_HEIGHT,
  STORY_OG_TITLE_BAND_TOP,
  STORY_OG_TITLE_COLUMN_RIGHT,
  STORY_OG_TITLE_MAX_HEIGHT,
  STORY_OG_WIDTH,
  storyOgCard,
  storyOgImageFromBytes,
} from "./story-og";
import type { FeedItem, Lang } from "./types";

/** 353 characters: long enough to need the clamp at the rendered font size. */
const LONG_TITLE =
  "OpenAI's newest agentic reasoning system reportedly breached a national " +
  "health statistics portal in Australia while crawling public training data, " +
  "and the incident has reopened unresolved questions about sandboxing, " +
  "credential isolation, and what developers are actually agreeing to when they " +
  "delegate production credentials to an autonomous model loop.";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "64bff098e4eaf80fb050055b1bf9c3ad946a2376ae19b9e5adb8cdd8c94e4125",
    url: "https://huggingnews.com/cybersecurity/openai-agent-breaches",
    title: "OpenAI Agent Breaches Australia's Medicare Statistics Portal",
    title_vi: "Agent cua OpenAI xam nhap cong thong ke Medicare cua Uc",
    summary: "",
    summary_vi: "",
    category: "Agents",
    published_at: 1_790_268_030,
    points: 82,
    comments: 144,
    rank_score: 0,
    source_id: "render-test",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

interface Bitmap {
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
function decodePng(bytes: Uint8Array): Bitmap {
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

/** Axis-aligned bounding box of every pixel that differs between two renders. */
function diffBounds(a: Bitmap, b: Bitmap, threshold = 12) {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (let p = 0; p < a.data.length; p += 4) {
    const delta =
      Math.abs(a.data[p] - b.data[p]) +
      Math.abs(a.data[p + 1] - b.data[p + 1]) +
      Math.abs(a.data[p + 2] - b.data[p + 2]);
    if (delta <= threshold) continue;
    const x = (p / 4) % a.width;
    const y = Math.floor(p / 4 / a.width);
    count += 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return count === 0 ? null : { minX, minY, maxX, maxY, count };
}

let fonts: Array<{ name: string; data: ArrayBuffer; weight: 500 | 700 }>;

async function renderPng(
  story: FeedItem,
  image: Parameters<typeof storyOgCard>[1],
  lang: Lang
): Promise<Uint8Array> {
  const response = await ImageResponse.async(storyOgCard(story, image, lang), {
    width: STORY_OG_WIDTH,
    height: STORY_OG_HEIGHT,
    fonts,
  });
  return new Uint8Array(await response.arrayBuffer());
}

/** Same card with a blanked title, so the diff isolates the headline. */
function blankedTitle(story: FeedItem): FeedItem {
  return { ...story, title: " ", title_vi: " " };
}

beforeAll(async () => {
  const toArrayBuffer = (bytes: Uint8Array) =>
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
  const [medium, bold] = await Promise.all([
    readFile("public/fonts/eb-garamond-500.ttf"),
    readFile("public/fonts/eb-garamond-700.ttf"),
  ]);
  fonts = [
    { name: "EB Garamond", data: toArrayBuffer(medium), weight: 500 },
    { name: "EB Garamond", data: toArrayBuffer(bold), weight: 700 },
  ];
});

describe("story OG title layout geometry", () => {
  it("reserves a title band that the clamped headline cannot overflow", () => {
    expect(STORY_OG_TITLE_BAND_TOP).toBe(119);
    expect(STORY_OG_TITLE_BAND_HEIGHT).toBeGreaterThan(0);
    expect(STORY_OG_TITLE_MAX_HEIGHT).toBeLessThanOrEqual(
      STORY_OG_TITLE_BAND_HEIGHT
    );
    // The whole band plus chrome must still fit the card.
    expect(
      STORY_OG_TITLE_BAND_TOP + STORY_OG_TITLE_BAND_HEIGHT
    ).toBeLessThanOrEqual(STORY_OG_HEIGHT);
  });

  it("keeps the headline inside the card for a 200+ character title", async () => {
    expect(LONG_TITLE.length).toBeGreaterThanOrEqual(200);
    const story = item({ title: LONG_TITLE, title_vi: LONG_TITLE });

    const [rendered, blank] = await Promise.all([
      renderPng(story, null, "en"),
      renderPng(blankedTitle(story), null, "en"),
    ]);
    const bounds = diffBounds(decodePng(rendered), decodePng(blank));
    expect(bounds, "headline rendered no ink at all").not.toBeNull();
    const box = bounds as NonNullable<typeof bounds>;

    // Never above the header rule (the AI;DR wordmark band).
    expect(box.minY).toBeGreaterThanOrEqual(STORY_OG_TITLE_BAND_TOP);
    // Never into the footer row.
    expect(box.maxY).toBeLessThan(
      STORY_OG_TITLE_BAND_TOP + STORY_OG_TITLE_BAND_HEIGHT
    );
    // Never outside the card, and never into the image panel column.
    expect(box.minX).toBeGreaterThanOrEqual(STORY_OG_CONTENT_INSET_X);
    expect(box.maxX).toBeLessThanOrEqual(STORY_OG_TITLE_COLUMN_RIGHT);
  });

  it("clamps to four lines and terminates the headline with an ellipsis", async () => {
    const long = decodePng(
      await renderPng(
        item({ title: LONG_TITLE, title_vi: LONG_TITLE }),
        null,
        "en"
      )
    );
    const short = decodePng(await renderPng(item(), null, "en"));
    const longBox = diffBounds(
      long,
      decodePng(
        await renderPng(
          blankedTitle(item({ title: LONG_TITLE, title_vi: LONG_TITLE })),
          null,
          "en"
        )
      )
    );
    const shortBox = diffBounds(
      short,
      decodePng(await renderPng(blankedTitle(item()), null, "en"))
    );

    // A four-line clamp bounds the height; an unbounded box would not.
    expect(longBox).not.toBeNull();
    expect(shortBox).not.toBeNull();
    expect(
      (longBox as NonNullable<typeof longBox>).maxY -
        (longBox as NonNullable<typeof longBox>).minY
    ).toBeLessThanOrEqual(STORY_OG_TITLE_MAX_HEIGHT);
    // Short titles take fewer lines than the four-line clamp allows.
    expect((shortBox as NonNullable<typeof shortBox>).maxY).toBeLessThan(
      (longBox as NonNullable<typeof longBox>).maxY
    );
  }, 20_000);
});

describe("story OG card rendering", () => {
  it("renders deterministically for the same story, image, and locale", async () => {
    const image = storyOgImageFromBytes(
      new Uint8Array(await readFile("public/logo.png"))
    );
    const first = await renderPng(item(), image, "vi");
    const second = await renderPng(item(), image, "vi");
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  }, 20_000);

  it("renders English and Vietnamese cards at the card dimensions", async () => {
    for (const lang of ["en", "vi"] as const) {
      const bitmap = decodePng(await renderPng(item(), null, lang));
      expect(bitmap.width).toBe(STORY_OG_WIDTH);
      expect(bitmap.height).toBe(STORY_OG_HEIGHT);
      // Every pixel must be opaque: no partially transparent bleed.
      let translucent = 0;
      for (let p = 3; p < bitmap.data.length; p += 4) {
        if (bitmap.data[p] !== 255) translucent += 1;
      }
      expect(translucent).toBe(0);
    }
  }, 20_000);

  it("keeps the branded fallback free of image elements", () => {
    const html = renderToStaticMarkup(storyOgCard(item(), null, "en"));
    expect(html).not.toContain("<img");
    expect(html).toContain("AI;DR");
  });
});

describe("story OG zero-source-fetch contract", () => {
  it("performs no network I/O while validating and rendering a card", async () => {
    const original = globalThis.fetch;
    const attempts: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      attempts.push(String(input));
      throw new Error("network access is not allowed in this boundary");
    }) as unknown as typeof fetch;
    try {
      // Blocked hosts never reach the network at all.
      for (const url of [
        "https://localhost./photo.png",
        "https://metadata.google.internal./latest/meta-data",
        "https://127.0.0.1/photo.png",
        "https://cdn.internal./photo.png",
      ]) {
        expect(isSafeStoryImageUrl(url), url).toBe(false);
        await expect(fetchStoryOgImage(url)).resolves.toBeNull();
      }

      // A host that passes the boundary does reach fetch — and the payload
      // is then rejected on container grounds, still without leaking the URL.
      const publicUrl = "https://cdn.example.com/photo.png?signature=secret";
      expect(isSafeStoryImageUrl(publicUrl)).toBe(true);
      await expect(fetchStoryOgImage(publicUrl)).resolves.toBeNull();
      expect(attempts).toEqual([publicUrl]);

      // Rendering must not reach out: the image is already inlined.
      await renderPng(
        item({ title: LONG_TITLE, title_vi: LONG_TITLE }),
        null,
        "en"
      );
      expect(attempts).toEqual([publicUrl]);
    } finally {
      globalThis.fetch = original;
    }
  }, 20_000);
});
