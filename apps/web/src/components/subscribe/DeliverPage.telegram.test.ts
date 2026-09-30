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
import { TELEGRAM_DIGEST } from "./TelegramPreview";

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), "utf8");
const previewSrc = read("TelegramPreview.tsx");
const channelSrc = read("TelegramChannel.tsx");

/** The `en` sample the channel mock renders, imported straight from the
 *  preview module so it is compared against what the bot actually sends. */
function sampleCopy() {
  const en = TELEGRAM_DIGEST.en;
  return { bullets: [...en.bullets], story: en.story };
}

describe("telegram tab preview", () => {
  it("shows a channel mock instead of copy and a button only", () => {
    expect(channelSrc).toContain("<TelegramPreview");
    // Rendered inside the shared frame, like the other two tabs.
    expect(previewSrc).toMatch(/function TelegramPreview[\s\S]*BrowserFrame/);
    // Feature list, so the tab matches the Chrome tab's rhythm.
    expect(channelSrc).toContain("TELEGRAM_FEATURES");
  });

  it("offers both channels, each tracked under its own name", () => {
    expect(channelSrc).toContain("TELEGRAM_URL");
    expect(channelSrc).toContain("TELEGRAM_EN_URL");
    expect(channelSrc).toContain("TELEGRAM_HANDLE");
    expect(channelSrc).toContain("TELEGRAM_EN_HANDLE");
    expect(channelSrc).toContain('track: "telegram"');
    expect(channelSrc).toContain('track: "telegram-en"');
    expect(channelSrc).toContain(
      'trackChannelClick("telegram", { to: c.track })'
    );
  });

  it("keeps the preview copy inside the existing en/vi pattern", () => {
    expect(previewSrc).toContain("TELEGRAM_DIGEST");
    expect(previewSrc).toMatch(
      /const copy = TELEGRAM_DIGEST\[channel === "vi"/
    );
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
      // `id` is required on StoryPayload and `buildStoryCaption` reads its
      // first 8 characters to decide whether a generated card exists, so the
      // fixture has to carry one. This test only asserts the caption copy, so
      // the value itself is arbitrary — just a real-looking story id.
      id: "abcdef1234567890",
      title: story.title,
      summary: story.summary,
      category: "Infra",
      points: 412,
      comments: 96,
    } as unknown as StoryPayload);

    expect(caption).toContain(story.title);
    expect(caption).toContain(story.summary);
    // The bot replaces every non-alphanumeric in the category, so the sample
    // must show a slug-safe ASCII hashtag — never a raw accented category.
    expect(caption).toContain("#Infra");
    expect(story.meta).toContain("#Infra");
  });

  it("uses the digest's YYYY-MM-DD stamp, not a prettified date", () => {
    const { bullets } = sampleCopy();
    const message = buildDigestMessage({
      date: "2026-09-27",
      lang: "en",
      bullets: bullets.map((text) => ({ text, url: null })),
    } as unknown as DailyDigest);
    expect(message).toContain("2026-09-27");
    expect(TELEGRAM_DIGEST.en.date).toBe("2026-09-27");
  });
});
