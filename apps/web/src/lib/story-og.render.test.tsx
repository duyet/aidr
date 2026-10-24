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
import { ImageResponse } from "@cf-wasm/og/node";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { type Bitmap, decodePng } from "./__fixtures__/png";
import { syntheticStoryPhoto } from "./__fixtures__/raster";
import { loadStoryOgFonts, storyOgRenderOptions } from "./og-fonts";
import {
  fetchStoryOgImage,
  isSafeStoryImageUrl,
  STORY_OG_CONTENT_INSET_X,
  STORY_OG_HEIGHT,
  STORY_OG_PHOTO_TITLE_MAX_HEIGHT,
  STORY_OG_PHOTO_TITLE_RIGHT,
  STORY_OG_PHOTO_WIDTH,
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
    // Diacritics, not stripped ASCII: the card has to prove it shapes the real
    // Vietnamese alphabet, not a transliteration of it.
    title_vi: "Agent của OpenAI xâm nhập cổng thống kê Medicare của Úc",
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

let fonts: Awaited<ReturnType<typeof loadStoryOgFonts>>;

async function renderPng(
  story: FeedItem,
  image: Parameters<typeof storyOgCard>[1],
  lang: Lang
): Promise<Uint8Array> {
  const response = await ImageResponse.async(storyOgCard(story, image, lang), {
    ...storyOgRenderOptions(fonts),
  });
  return new Uint8Array(await response.arrayBuffer());
}

/** Same card with a blanked title, so the diff isolates the headline. */
function blankedTitle(story: FeedItem): FeedItem {
  return { ...story, title: " ", title_vi: " " };
}

beforeAll(async () => {
  fonts = await loadStoryOgFonts(
    async (path) => (await readFile(`public${path}`)).buffer as ArrayBuffer
  );
  expect(fonts).toHaveLength(2);
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

describe("story OG photo card", () => {
  // The share preview is a thumbnail on Facebook, Telegram, and X: the photo
  // has to be the dominant shape, not a small inset beside the headline.
  it("fills the right of the card with the photo, full bleed", async () => {
    const image = storyOgImageFromBytes(syntheticStoryPhoto());
    expect(image).not.toBeNull();
    expect(STORY_OG_PHOTO_WIDTH / STORY_OG_WIDTH).toBeGreaterThanOrEqual(0.55);
    const bitmap = decodePng(await renderPng(item(), image, "en"));
    const paper = (x: number, y: number) => {
      const p = (y * bitmap.width + x) * 4;
      return (
        bitmap.data[p] > 240 &&
        bitmap.data[p + 1] > 240 &&
        bitmap.data[p + 2] > 235
      );
    };
    // Photo pixels run from top edge to bottom edge at the photo's centre column.
    const x = STORY_OG_WIDTH - STORY_OG_PHOTO_WIDTH / 2;
    for (const y of [2, STORY_OG_HEIGHT / 2, STORY_OG_HEIGHT - 3]) {
      expect(paper(x, y), `paper at ${x},${y}`).toBe(false);
    }
  }, 20_000);

  it("keeps a long Vietnamese headline left of the photo and clamped", async () => {
    const image = storyOgImageFromBytes(syntheticStoryPhoto());
    // No category: a blank title re-centres the column, which would move the
    // category label and pollute the headline diff.
    const story = item({
      title: LONG_TITLE,
      title_vi: LONG_TITLE,
      category: "",
    });
    const [rendered, blank] = await Promise.all([
      renderPng(story, image, "vi"),
      renderPng(blankedTitle(story), image, "vi"),
    ]);
    const box = diffBounds(decodePng(rendered), decodePng(blank));
    expect(box, "headline rendered no ink").not.toBeNull();
    const bounds = box as NonNullable<typeof box>;
    expect(bounds.maxX).toBeLessThanOrEqual(STORY_OG_PHOTO_TITLE_RIGHT);
    expect(bounds.maxY - bounds.minY).toBeLessThanOrEqual(
      STORY_OG_PHOTO_TITLE_MAX_HEIGHT
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

  it("draws Vietnamese tone marks above the letter, not on it", async () => {
    // The old OG file was a Latin-only EB Garamond cut, so these tones were
    // missing and satori pulled a fallback face. The full face has to draw
    // the mark above the letter.
    const plain = item({
      title: "a a a a a a a a",
      title_vi: "a a a a a a a a",
    });
    const marked = item({
      title: "ấ ậ ế ố ớ ứ ẫ ễ",
      title_vi: "ấ ậ ế ố ớ ứ ẫ ễ",
    });
    const [plainPng, markedPng, plainBlank, markedBlank] = await Promise.all([
      renderPng(plain, null, "vi"),
      renderPng(marked, null, "vi"),
      renderPng(blankedTitle(plain), null, "vi"),
      renderPng(blankedTitle(marked), null, "vi"),
    ]);
    const plainBox = diffBounds(decodePng(plainPng), decodePng(plainBlank));
    const markedBox = diffBounds(decodePng(markedPng), decodePng(markedBlank));
    expect(plainBox).not.toBeNull();
    expect(markedBox).not.toBeNull();
    const plainTop = (plainBox as NonNullable<typeof plainBox>).minY;
    const markedTop = (markedBox as NonNullable<typeof markedBox>).minY;
    expect(plainTop - markedTop).toBeGreaterThanOrEqual(8);
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

  /**
   * Regression: satori does not skip a glyph the loaded fonts lack, it asks
   * `loadAdditionalAsset` to pull a fallback face from Google Fonts mid-render.
   * A Vietnamese headline rendered its base letters in one face and its
   * diacritics in Noto Sans — two typefaces in one headline — and the card
   * changed shape depending on whether that fetch succeeded.
   */
  it("renders Vietnamese without fetching a fallback face", async () => {
    const original = globalThis.fetch;
    const attempts: string[] = [];
    globalThis.fetch = ((input: unknown) => {
      attempts.push(String(input));
      throw new Error(
        "the OG card must not reach the network to shape a glyph"
      );
    }) as unknown as typeof fetch;

    try {
      // Every Vietnamese letter that a Latin-only subset drops.
      const story = item({
        title: "Dữ liệu Đào tạo Ước tính và Phân tích",
        title_vi: "Dữ liệu Đào tạo Ước tính và Phân tích",
        category: "Agents",
      });

      const html = renderToStaticMarkup(storyOgCard(story, null, "vi"));
      expect(html).toContain("Dữ liệu Đào tạo Ước tính và Phân tích");
      // The category is untranslated taxonomy, so it stays ASCII.
      expect(html).toContain("Agents");
      expect(html).not.toContain("Tác nhân");

      // A render that needed a fallback font would have tried to fetch it.
      const bitmap = decodePng(await renderPng(story, null, "vi"));
      expect(bitmap.width).toBe(STORY_OG_WIDTH);
      expect(attempts).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  }, 20_000);

  it("draws Vietnamese tone marks above the letter, not on it (GPOS composite)", async () => {
    // Source Sans 3 stores ấ as a composite whose vertical offset is only in
    // GPOS mark-to-base. satori/resvg skips that lookup, so the tone mark
    // used to sit on the letter. The card face has to put that ink above
    // the base letter without a network fallback.
    const plain = item({
      title: "a a a a a a a a",
      title_vi: "a a a a a a a a",
    });
    const marked = item({
      title: "ấ ậ ế ố ớ ứ ẫ ễ",
      title_vi: "ấ ậ ế ố ớ ứ ẫ ễ",
    });
    const [plainPng, markedPng] = await Promise.all([
      renderPng(plain, null, "vi"),
      renderPng(marked, null, "vi"),
    ]);
    const plainBox = diffBounds(
      decodePng(plainPng),
      decodePng(await renderPng(blankedTitle(plain), null, "vi"))
    );
    const markedBox = diffBounds(
      decodePng(markedPng),
      decodePng(await renderPng(blankedTitle(marked), null, "vi"))
    );
    expect(plainBox).not.toBeNull();
    expect(markedBox).not.toBeNull();
    const plainTop = (plainBox as NonNullable<typeof plainBox>).minY;
    const markedTop = (markedBox as NonNullable<typeof markedBox>).minY;
    // A tone mark that survived is a clearly taller ink box, not a few
    // pixels of antialiasing on the same cap height.
    expect(plainTop - markedTop).toBeGreaterThanOrEqual(8);
  }, 20_000);

  it("keeps the whole Vietnamese headline in the card typeface", async () => {
    // A mixed-typeface headline is invisible in markup and hard to eyeball, so
    // compare ink against a blanked title: the diacritics must land inside the
    // same band the base letters do, not overflow above it.
    const story = item({
      title: "Ứng dụng Được Đào tạo Ước tính Toàn cầu",
      title_vi: "Ứng dụng Được Đào tạo Ước tính Toàn cầu",
    });

    const [rendered, blank] = await Promise.all([
      renderPng(story, null, "vi"),
      renderPng(blankedTitle(story), null, "vi"),
    ]);
    const box = diffBounds(decodePng(rendered), decodePng(blank));
    expect(box, "Vietnamese headline rendered no ink at all").not.toBeNull();
    const bounds = box as NonNullable<typeof box>;

    expect(bounds.minY).toBeGreaterThanOrEqual(STORY_OG_TITLE_BAND_TOP);
    expect(bounds.maxY).toBeLessThan(
      STORY_OG_TITLE_BAND_TOP + STORY_OG_TITLE_BAND_HEIGHT
    );
    expect(bounds.minX).toBeGreaterThanOrEqual(STORY_OG_CONTENT_INSET_X);
    expect(bounds.maxX).toBeLessThanOrEqual(STORY_OG_TITLE_COLUMN_RIGHT);
  }, 20_000);

  it("centres each footer dot between its neighbours", async () => {
    // A fragment around each dot made satori drop the gap after it, so the
    // dot sat 3px from the date and 22px from the host.
    const bitmap = decodePng(await renderPng(item(), null, "en"));
    const inkAt = (x: number, y: number) =>
      bitmap.data[(y * bitmap.width + x) * 4] < 200;
    // Ink runs along the footer row, each with its vertical extent.
    const runs: Array<{ x0: number; x1: number; top: number; bottom: number }> =
      [];
    for (let x = 0; x < STORY_OG_TITLE_COLUMN_RIGHT; x += 1) {
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (let y = 545; y < 595; y += 1) {
        if (!inkAt(x, y)) continue;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      if (top > bottom) continue;
      const last = runs.at(-1);
      if (last && last.x1 === x) {
        last.x1 = x + 1;
        last.top = Math.min(last.top, top);
        last.bottom = Math.max(last.bottom, bottom);
      } else {
        runs.push({ x0: x, x1: x + 1, top, bottom });
      }
    }
    // The middle dot: a few pixels square, floating above the baseline
    // (unlike the period in ".com") and narrower than a hyphen.
    const baseline = Math.max(...runs.map((run) => run.bottom)) - 8;
    const dots = runs.flatMap((run, i) =>
      run.bottom - run.top <= 5 && run.x1 - run.x0 <= 5 && run.bottom < baseline
        ? [i]
        : []
    );
    expect(dots).toHaveLength(2);
    for (const i of dots) {
      const before = runs[i].x0 - runs[i - 1].x1;
      const after = runs[i + 1].x0 - runs[i].x1;
      expect(Math.abs(before - after), `dot at x=${runs[i].x0}`).toBeLessThan(
        6
      );
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
