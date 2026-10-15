/**
 * Every Telegram send passes `checkTelegramMedia` before the Bot API call.
 * The rules are the contract the channel readers see: a trending post shows
 * the story's own picture or the publisher's preview, never the first-party
 * share card; a post is never bare text; only image types Telegram accepts by
 * URL go out.
 */
import { describe, expect, it } from "vitest";
import { checkTelegramMedia } from "../notify/telegram-media-guard.js";

const CARD = "https://aidr.today/api/og/abcdef12.png?lang=vi";
const DAY_CARD = "https://aidr.today/api/og/date/2026-10-15.png?lang=vi&v=abc";
const PHOTO = "https://img.example/story.jpg";
const PREVIEW = { url: "https://example.com/story", prefer_large_media: true };

describe("checkTelegramMedia", () => {
  it("rejects the first-party share card as a story photo", () => {
    expect(checkTelegramMedia("story", "sendPhoto", { photo: CARD })).toEqual({
      ok: false,
      reason: "image:first_party_card",
    });
    expect(
      checkTelegramMedia("story", "sendMediaGroup", {
        media: [
          { type: "photo", media: PHOTO },
          { type: "photo", media: CARD },
        ],
      })
    ).toEqual({ ok: false, reason: "image:first_party_card" });
    expect(
      checkTelegramMedia("story", "sendVideo", {
        video: "https://cdn.example/clip.mp4",
        thumbnail: CARD,
      })
    ).toEqual({ ok: false, reason: "image:first_party_card" });
  });

  it("rejects the card as a story text preview too", () => {
    expect(
      checkTelegramMedia("story", "sendMessage", {
        link_preview_options: { url: CARD, prefer_large_media: true },
      })
    ).toEqual({ ok: false, reason: "image:first_party_card" });
  });

  it("lets the digest pin its preview to the day card by design", () => {
    expect(
      checkTelegramMedia("digest", "sendMessage", {
        link_preview_options: { url: DAY_CARD, prefer_large_media: true },
      })
    ).toEqual({ ok: true });
  });

  it("rejects a text post with no pinned preview: a post always carries media", () => {
    for (const kind of ["story", "digest", "day_video"] as const) {
      expect(checkTelegramMedia(kind, "sendMessage", { text: "x" })).toEqual({
        ok: false,
        reason: "text:no_preview",
      });
      expect(
        checkTelegramMedia(kind, "sendMessage", {
          link_preview_options: { is_disabled: true },
        })
      ).toEqual({ ok: false, reason: "text:no_preview" });
    }
    expect(
      checkTelegramMedia("story", "sendMessage", {
        link_preview_options: PREVIEW,
      })
    ).toEqual({ ok: true });
  });

  it("rejects a media call with no media", () => {
    expect(checkTelegramMedia("story", "sendPhoto", {})).toEqual({
      ok: false,
      reason: "image:missing",
    });
    expect(
      checkTelegramMedia("story", "sendMediaGroup", { media: [] })
    ).toEqual({ ok: false, reason: "album:empty" });
    expect(checkTelegramMedia("story", "sendVideo", {})).toEqual({
      ok: false,
      reason: "video:missing",
    });
  });

  it("accepts only image types Telegram takes by URL", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      expect(
        checkTelegramMedia("story", "sendPhoto", {
          photo: `https://img.example/a.${ext}`,
        })
      ).toEqual({ ok: true });
    }
    for (const ext of ["gif", "svg", "avif", "bmp", "tiff", "heic", "ico"]) {
      expect(
        checkTelegramMedia("story", "sendPhoto", {
          photo: `https://img.example/a.${ext}?x=1`,
        })
      ).toEqual({ ok: false, reason: `image:unsupported_type:${ext}` });
    }
    // No extension: Telegram sniffs the bytes, so the URL is allowed.
    expect(
      checkTelegramMedia("story", "sendPhoto", {
        photo: "https://static.example/story-media/123/abc",
      })
    ).toEqual({ ok: true });
  });

  it("rejects URLs Telegram cannot fetch: not https, private hosts, file ids", () => {
    expect(
      checkTelegramMedia("story", "sendPhoto", {
        photo: "http://img.example/a.jpg",
      })
    ).toEqual({ ok: false, reason: "image:unsafe_url" });
    expect(
      checkTelegramMedia("story", "sendPhoto", {
        photo: "https://127.0.0.1/a.jpg",
      })
    ).toEqual({ ok: false, reason: "image:unsafe_url" });
    expect(
      checkTelegramMedia("story", "sendPhoto", { photo: "AgACAgIAAxkBAAI" })
    ).toEqual({ ok: false, reason: "image:unsafe_url" });
  });

  it("accepts the day video's YouTube thumbnail and its watch-link text fallback", () => {
    expect(
      checkTelegramMedia("day_video", "sendPhoto", {
        photo: "https://i.ytimg.com/vi/MhdyTy7SNOE/maxresdefault.jpg",
      })
    ).toEqual({ ok: true });
    expect(
      checkTelegramMedia("day_video", "sendMessage", {
        link_preview_options: {
          url: "https://youtu.be/MhdyTy7SNOE",
          prefer_large_media: true,
        },
      })
    ).toEqual({ ok: true });
  });

  it("checks nothing on calls that carry no media", () => {
    expect(
      checkTelegramMedia("digest", "editMessageReplyMarkup", { message_id: 1 })
    ).toEqual({ ok: true });
  });
});
