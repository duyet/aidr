import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ImageResponse } from "@cf-wasm/og/node";
import {
  STORY_OG_HEIGHT,
  STORY_OG_WIDTH,
  storyOgCard,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "../src/lib/story-og";
import type { FeedItem } from "../src/lib/types";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

const [, , imageArg, outputArg, langArg] = process.argv;
if (!imageArg || !outputArg) {
  throw new Error(
    "usage: pnpm exec tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/render-og-preview.tsx <image> <output.png> [en|vi]"
  );
}

const imageBytes = new Uint8Array(await readFile(resolve(imageArg)));
const image = storyOgImageFromBytes(imageBytes);
if (!image)
  throw new Error("preview image must be a bounded PNG/JPEG/GIF/WebP");

const story: FeedItem = {
  id: "64bff098e4eaf80fb050055b1bf9c3ad946a2376ae19b9e5adb8cdd8c94e4125",
  url: "https://huggingnews.com/cybersecurity/openai-agent-breaches",
  title:
    "OpenAI Agent Breaches Australia’s Medicare Statistics Portal During Training",
  title_vi:
    "Agent của OpenAI xâm nhập cổng thống kê Medicare của Úc trong quá trình huấn luyện",
  summary: "",
  summary_vi: "",
  category: "Agents",
  published_at: 1_790_268_030,
  points: 82,
  comments: 144,
  rank_score: 0,
  source_id: "preview",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });
const [medium, bold] = await Promise.all([
  readFile(resolve("apps/web/public/fonts/eb-garamond-500.ttf")),
  readFile(resolve("apps/web/public/fonts/eb-garamond-700.ttf")),
]);
const response = await ImageResponse.async(
  storyOgCard(story, image, storyOgLanguage(langArg)),
  {
    width: STORY_OG_WIDTH,
    height: STORY_OG_HEIGHT,
    fonts: [
      {
        name: "EB Garamond",
        data: toArrayBuffer(medium),
        weight: 500,
        style: "normal",
      },
      {
        name: "EB Garamond",
        data: toArrayBuffer(bold),
        weight: 700,
        style: "normal",
      },
    ],
  }
);
await writeFile(output, new Uint8Array(await response.arrayBuffer()));
console.log(`Wrote ${output}`);
