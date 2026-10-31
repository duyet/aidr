#!/usr/bin/env tsx
/**
 * Renders pending story share cards off the Worker and uploads them to the
 * `aidr-og` R2 bucket, served as is at https://og.aidr.today. The Worker
 * (Workers Free, 10 ms CPU) only hashes and lists; this script does the
 * drawing with the same renderer the `/api/og/$id` route uses.
 *
 * Flow: GET /api/admin/og-cards/candidates → hash here (off the Worker's
 * CPU budget) → for each pending story, fetch its photo
 * once, draw en/vi → PUT /api/admin/og-cards/<hash>/<lang>.png, which the
 * Worker stores at og-story/<hash>/<lang>.png through its R2 binding → POST
 * /api/admin/og-cards/ack. Re-running is safe: a card whose hash is acked
 * stops being pending, and the Worker never replaces a stored key.
 *
 * Env: NEWS_ADMIN_TOKEN. Optional: AIDR_BASE_URL, OG_CARDS_LIMIT. A missing
 * token exits 0 with a notice, so the scheduled job stays green.
 *
 * Run: pnpm --filter @aidr/web exec tsx scripts/render-og-cards.ts
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@cf-wasm/og/node";
import sharp from "sharp";
import {
  MAX_CARD_UPLOAD_BYTES,
  type PendingStory,
  pendingFromRows,
} from "../src/lib/og-cards";
import { loadStoryOgFonts, storyOgRenderOptions } from "../src/lib/og-fonts";
import {
  fetchStoryOgImage,
  isCardSizedPhoto,
  type StoryOgImage,
  storyOgCard,
  storyOgImageCandidates,
} from "../src/lib/story-og";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.AIDR_BASE_URL ?? "https://aidr.today").replace(
  /\/$/,
  ""
);
const token = process.env.NEWS_ADMIN_TOKEN;
const limit = Number(process.env.OG_CARDS_LIMIT ?? 20);

if (!token) {
  console.log("og-cards: skipped, missing NEWS_ADMIN_TOKEN");
  process.exit(0);
}

const auth = { Authorization: `Bearer ${token}` };

/** WebP or oversized photo → JPEG ≤1200px, the job the Images binding does
 *  for the Worker route. */
async function transcode(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(
      await sharp(bytes)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
    );
  } catch {
    return null;
  }
}

async function firstPhoto(
  item: PendingStory["item"]
): Promise<StoryOgImage | null> {
  for (const url of storyOgImageCandidates(item)) {
    const image = await fetchStoryOgImage(url, { transcode });
    if (image && isCardSizedPhoto(image)) return image;
  }
  return null;
}

const candidatesRes = await fetch(`${base}/api/admin/og-cards/candidates`, {
  headers: auth,
});
if (!candidatesRes.ok) {
  throw new Error(`candidate list failed: HTTP ${candidatesRes.status}`);
}
const { rows } = (await candidatesRes.json()) as {
  rows: Record<string, unknown>[];
};
const pending = await pendingFromRows(rows, Date.now());
const stories = pending.slice(0, limit);
console.log(
  `og-cards: ${rows.length} candidates, ${pending.length} pending, drawing ${stories.length}`
);
if (stories.length === 0) process.exit(0);

const fonts = await loadStoryOgFonts(
  async (path) =>
    (await readFile(resolve(appDir, `public${path}`))).buffer as ArrayBuffer
);
if (fonts.length !== 2) throw new Error("story card fonts missing");

let uploaded = 0;
let failed = 0;
let skipped = 0;
for (const { item, cards } of stories) {
  const acks: {
    item_id: string;
    lang: string;
    hash: string;
    photoless: boolean;
  }[] = [];
  try {
    const image = await firstPhoto(item);
    const photoless = !image && storyOgImageCandidates(item).length > 0;
    for (const { lang, hash } of cards) {
      // A photoless card is not uploaded: a later try may draw the photo
      // under the same key, and og.aidr.today serves it as immutable. The
      // ack records the try so it is retried after a week.
      if (!photoless) {
        const started = performance.now();
        const png = await ImageResponse.async(
          storyOgCard(item, image, lang),
          storyOgRenderOptions(fonts)
        );
        const body = new Uint8Array(await png.arrayBuffer());
        // Left unacked, so the page keeps the Worker route for this card.
        if (body.byteLength > MAX_CARD_UPLOAD_BYTES) {
          skipped++;
          console.log(
            `::warning::og-cards: ${item.id.slice(0, 8)}/${lang} is ${body.byteLength} B, over the upload cap; skipped`
          );
          continue;
        }
        const put = await fetch(
          `${base}/api/admin/og-cards/${hash}/${lang}.png`,
          {
            method: "PUT",
            body,
            headers: { ...auth, "Content-Type": "image/png" },
          }
        );
        if (!put.ok) throw new Error(`card upload HTTP ${put.status}`);
        uploaded++;
        console.log(
          `og-cards: ${item.id.slice(0, 8)}/${lang} ${body.byteLength} B in ${Math.round(performance.now() - started)} ms`
        );
      }
      acks.push({ item_id: item.id, lang, hash, photoless });
    }
  } catch (error) {
    failed++;
    console.error(
      `og-cards: ${item.id.slice(0, 8)} failed: ${(error as Error).message}`
    );
  }
  if (acks.length === 0) continue;
  const ack = await fetch(`${base}/api/admin/og-cards/ack`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ cards: acks }),
  });
  if (!ack.ok) {
    failed++;
    console.error(`og-cards: ack failed HTTP ${ack.status}`);
  }
}

console.log(
  `og-cards: uploaded ${uploaded}, skipped ${skipped}, failed ${failed}`
);
if (failed > 0) process.exitCode = 1;
