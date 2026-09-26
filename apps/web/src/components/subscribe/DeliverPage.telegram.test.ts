import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDigestMessage,
  buildStoryCaption,
} from "../../../worker/notify/telegram.js";
import type {
  DailyDigest,
  StoryPayload,
} from "../../../worker/notify/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "DeliverPage.tsx"), "utf8");

/** Pull the `en` branch of TELEGRAM_DIGEST out of the module source. Parsed
 *  rather than imported: the file is a route component, and this test only
 *  needs the literal to compare against what the bot actually sends. */
function sampleCopy(): { bullets: string[]; story: Record<string, unknown> } {
  const block = src.slice(
    src.indexOf("const TELEGRAM_DIGEST"),
    src.indexOf("} as const;", src.indexOf("const TELEGRAM_DIGEST"))
  );
  const en = block.slice(block.indexOf("en: {"), block.indexOf("vi: {"));
  const bullets = [...en.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]);
  const story: Record<string, unknown> = {};
  for (const field of ["title", "summary", "meta"]) {
    const m = en.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    story[field] = m?.[1];
  }
  return { bullets, story };
}

describe("telegram tab preview", () => {
  it("shows a channel mock instead of copy and a button only", () => {
    expect(src).toContain("TelegramPreview");
    // Rendered inside the shared frame, like the other two tabs.
    expect(src).toMatch(/function TelegramPreview[\s\S]*BrowserFrame/);
    // Feature list, so the tab matches the Chrome tab's rhythm.
    expect(src).toContain("TELEGRAM_FEATURES");
  });

  it("keeps the preview copy inside the existing en/vi pattern", () => {
    expect(src).toContain("TELEGRAM_DIGEST");
    expect(src).toMatch(/const copy = TELEGRAM_DIGEST\[lang === "vi"/);
  });

  // The preview claims to mirror what the bot sends. These assert that claim
  // against the real builders, so it fails the moment the channel format
  // drifts — rather than only when a comment stops mentioning it.
  it("renders bullets the digest message would actually contain", () => {
    const { bullets } = sampleCopy();
    expect(bullets.length).toBeGreaterThan(0);

    const message = buildDigestMessage({
      date: "2026-09-27",
      lang: "en",
      bullets: bullets.map((text) => ({ text, url: null })),
    } as unknown as DailyDigest);

    for (const bullet of bullets) {
      expect(message).toContain(bullet);
    }
  });

  it("renders a trending post the channel would actually send", () => {
    const { story } = sampleCopy();
    const caption = buildStoryCaption({
      title: story.title as string,
      summary: story.summary as string,
      category: "Infra",
      points: 412,
      comments: 96,
    } as unknown as StoryPayload);

    expect(caption).toContain(story.title as string);
    expect(caption).toContain(story.summary as string);
    // The bot replaces every non-alphanumeric in the category, so the sample
    // must show a slug-safe ASCII hashtag — never a raw accented category.
    expect(caption).toContain("#Infra");
    expect(story.meta as string).toContain("#Infra");
  });

  it("uses the digest's YYYY-MM-DD stamp, not a prettified date", () => {
    const { bullets } = sampleCopy();
    const message = buildDigestMessage({
      date: "2026-09-27",
      lang: "en",
      bullets: bullets.map((text) => ({ text, url: null })),
    } as unknown as DailyDigest);
    expect(message).toContain("2026-09-27");
    expect(src).toContain('date: "2026-09-27"');
  });
});
