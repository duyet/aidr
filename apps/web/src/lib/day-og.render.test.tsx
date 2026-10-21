/**
 * Every day-card layout through the real satori/resvg pipeline the route
 * uses. A mocked ImageResponse never runs the JSX, so CSS satori rejects or
 * a headline that outgrows its box only shows up here.
 */
import { readFile } from "node:fs/promises";
import { ImageResponse } from "@cf-wasm/og/node";
import { beforeAll, describe, expect, it } from "vitest";
import { type Bitmap, decodePng } from "./__fixtures__/png";
import { syntheticStoryPhoto } from "./__fixtures__/raster";
import {
  chooseDayCardLayout,
  type DayCardStory,
  layoutStories,
} from "./day-card-layout";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayOgCard,
  fourTilesFit,
  MIN_HEADLINE_PX,
} from "./day-og";
import { drawnHeadlines } from "./day-og-headlines";
import { loadStoryOgFonts, type StoryOgFontAsset } from "./og-fonts";
import { storyOgImageFromBytes } from "./story-og";
import type { Lang } from "./types";

/** Real long headlines (2026-10-12 and 2026-08-15 editions). */
const TITLES: Record<Lang, string[]> = {
  en: [
    "Character.ai's Bankruptcy Documents Show the Economics of AI Don't Work",
    "Microsoft plans to scale its own Maia AI chips to gigawatt levels by 2027, betting on in-house silicon to cut its dependence on Nvidia",
    "Flock Cameras Join AI Data Centers as 2026 Midterm Liability, Expanding Anti AI Frenzy",
    "Why your local LLM feels dumber than it is",
    "Top 7 Hyperscalers to Spend $1.489 Trillion in 2027, Tripling CapEx Since 2025",
    "GLM-5.3 Ties Kimi K3 as Leading Open Weights Model, Ranking 2nd Globally",
  ],
  vi: [
    "Alibaba ra mắt mô hình Qwen 3.8 27B mã nguồn mở, đưa AI đỉnh cao lên smartphone với hỗ trợ Day 0 cho hơn 40 ngôn ngữ và các bộ tăng tốc phần cứng mới nhất",
    "Mỹ siết kiểm soát biên giới bằng AI, cáo buộc 40 quốc gia tiếp tay cho Trung Quốc né 60 tỷ USD tiền thuế",
    "OpenAI chạm mốc định giá 852 tỷ USD, quỹ đầu tư sớm Thrive Capital thắng lớn",
    "Chủ tịch Microsoft cho rằng Vương quốc Anh có vị thế tốt nhất để dẫn dắt quy định về AI",
    "ReplaySSM: Tư duy lại về lưu trữ trạng thái để giải mã mô hình lai nhanh hơn",
    "GitHub Copilot tích hợp Grok 4.6 trên toàn bộ CLI, IDE và nền tảng đám mây",
  ],
};

const YELLOW = [0xf5, 0xc5, 0x18];

let fonts: StoryOgFontAsset[] = [];
const photo = storyOgImageFromBytes(syntheticStoryPhoto());

beforeAll(async () => {
  fonts = await loadStoryOgFonts(
    async (path) => (await readFile(`public${path}`)).buffer as ArrayBuffer
  );
  expect(fonts).toHaveLength(2);
  expect(photo).not.toBeNull();
});

function stories(pattern: string, lang: Lang): DayCardStory[] {
  return [...pattern].map((ch, i) => ({
    id: `s${i + 1}`,
    rank: i + 1,
    title: TITLES[lang][i],
    kicker: "AGENTS",
    image: ch === "P" ? photo : null,
  }));
}

async function render(pattern: string, lang: Lang, today = false) {
  const layout = chooseDayCardLayout(
    stories(pattern, lang),
    today,
    fourTilesFit
  );
  const res = await ImageResponse.async(
    dayOgCard({ date: "2026-10-12", lang, layout }),
    { width: DAY_OG_WIDTH, height: DAY_OG_HEIGHT, fonts }
  );
  return {
    variant: layout.variant,
    bitmap: decodePng(new Uint8Array(await res.arrayBuffer())),
  };
}

/** Pixels in the card's outer 30px margin that are not the yellow ground. */
function inkInMargin(b: Bitmap): number {
  let count = 0;
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const inMargin =
        x < 30 || x >= b.width - 30 || y >= b.height - 30 || y < 30;
      if (!inMargin) continue;
      const p = (y * b.width + x) * 4;
      const off =
        Math.abs(b.data[p] - YELLOW[0]) +
        Math.abs(b.data[p + 1] - YELLOW[1]) +
        Math.abs(b.data[p + 2] - YELLOW[2]);
      if (off > 30) count++;
    }
  }
  return count;
}

describe("dayOgCard renders every layout inside the card", () => {
  it.each([
    ["", "empty"],
    ["P", "single"],
    ["-", "single"],
    ["PP", "split"],
    ["P--", "lead-list"],
    // Thin days whose photos partly failed: one or two tall list rows.
    ["P-", "lead-list"],
    ["-P", "headlines"],
    ["-PP", "headlines"],
    ["PPPPPP", "mosaic"],
    ["PPP---", "mosaic"],
    ["------", "headlines"],
  ] as const)(
    "%s → %s",
    async (pattern, variant) => {
      for (const lang of ["en", "vi"] as const) {
        const { variant: got, bitmap } = await render(pattern, lang);
        expect(got).toBe(variant);
        expect([bitmap.width, bitmap.height]).toEqual([
          DAY_OG_WIDTH,
          DAY_OG_HEIGHT,
        ]);
        // Nothing (a long headline, a photo, a list row) spills past the body
        // into the margin.
        expect(inkInMargin(bitmap)).toBe(0);
      }
    },
    60_000
  );
});

describe("a six-story day card reads at phone width", () => {
  it.each(["en", "vi"] as const)(
    "%s: every story keeps a headline at MIN_HEADLINE_PX or larger",
    async (lang) => {
      const layout = chooseDayCardLayout(
        stories("PPPPPP", lang),
        false,
        fourTilesFit
      );
      const drawn = drawnHeadlines(
        dayOgCard({ date: "2026-10-12", lang, layout }),
        layoutStories(layout)
      );
      expect(drawn.map((h) => h.id)).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
      ]);
      for (const h of drawn) {
        expect(h.fontSize).toBeGreaterThanOrEqual(MIN_HEADLINE_PX);
      }
      const { bitmap } = await render("PPPPPP", lang);
      expect(inkInMargin(bitmap)).toBe(0);
    },
    60_000
  );
});
