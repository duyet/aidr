import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ImageResponse } from "@cf-wasm/og/node";
import { syntheticStoryPhoto } from "../src/lib/__fixtures__/raster";
import {
  STORY_OG_HEIGHT,
  STORY_OG_WIDTH,
  type StoryOgImage,
  storyOgCard,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "../src/lib/story-og";
import type { FeedItem, Lang } from "../src/lib/types";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

const USAGE = `usage:
  render-og-preview.tsx <image.png> <output.png> [en|vi]   one card from a real image
  render-og-preview.tsx fallback    <output.png> [en|vi]   branded no-image fallback
  render-og-preview.tsx all         <output-dir>          all three committed artifacts
  render-og-preview.tsx source      <output.png>          the synthetic preview source

Run with: pnpm exec tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/render-og-preview.tsx ...`;

const [, , modeArg, outputArg, langArg] = process.argv;
if (!modeArg || !outputArg) throw new Error(USAGE);

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

const [medium, bold] = await Promise.all([
  readFile(resolve("apps/web/public/fonts/eb-garamond-500.ttf")),
  readFile(resolve("apps/web/public/fonts/eb-garamond-700.ttf")),
]);

async function render(image: StoryOgImage | null, lang: Lang) {
  const response = await ImageResponse.async(
    storyOgCard(story, image, storyOgLanguage(lang)),
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
  return new Uint8Array(await response.arrayBuffer());
}

async function emit(path: string, bytes: Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  console.log(`${path}  ${bytes.byteLength} bytes  sha256=${sha}`);
  return sha;
}

/** The deterministic, licence-clean stand-in for a publisher photo. */
const photo = storyOgImageFromBytes(syntheticStoryPhoto());
if (!photo) throw new Error("synthetic preview source failed validation");

if (modeArg === "all") {
  const dir = resolve(outputArg);
  await emit(resolve(dir, "og-story-preview.png"), await render(photo, "en"));
  await emit(
    resolve(dir, "og-story-preview-vi.png"),
    await render(photo, "vi")
  );
  await emit(
    resolve(dir, "og-story-preview-fallback.png"),
    await render(null, "en")
  );
} else if (modeArg === "fallback") {
  await emit(resolve(outputArg), await render(null, storyOgLanguage(langArg)));
} else if (modeArg === "source") {
  await emit(resolve(outputArg), syntheticStoryPhoto());
} else {
  const imageBytes = new Uint8Array(await readFile(resolve(modeArg)));
  const image = storyOgImageFromBytes(imageBytes);
  if (!image) {
    throw new Error(
      "preview image must be a complete, bounded PNG/JPEG/GIF/WebP"
    );
  }
  await emit(resolve(outputArg), await render(image, storyOgLanguage(langArg)));
}
