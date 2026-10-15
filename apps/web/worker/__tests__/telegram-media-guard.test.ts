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

  it("rejects a text post that lets Telegram pick its preview", () => {
    // With no options Telegram previews the first link in the text, which on
    // a story is the aidr Read link, whose og:image is the share card.
    for (const kind of ["story", "digest", "day_video"] as const) {
      expect(checkTelegramMedia(kind, "sendMessage", { text: "x" })).toEqual({
        ok: false,
        reason: "text:no_preview",
      });
    }
    for (const kind of ["digest", "day_video"] as const) {
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

  describe("edits carry the same rules as sends", () => {
    it("rejects the card swapped in through editMessageMedia", () => {
      expect(
        checkTelegramMedia("story", "editMessageMedia", {
          media: { type: "photo", media: CARD },
        })
      ).toEqual({ ok: false, reason: "image:first_party_card" });
      expect(
        checkTelegramMedia("story", "editMessageMedia", {
          media: {
            type: "video",
            media: "https://cdn.example/clip.mp4",
            thumbnail: CARD,
          },
        })
      ).toEqual({ ok: false, reason: "image:first_party_card" });
      expect(
        checkTelegramMedia("story", "editMessageMedia", { message_id: 1 })
      ).toEqual({ ok: false, reason: "image:missing" });
    });

    it("lets editMessageMedia put the story's own image on a post", () => {
      expect(
        checkTelegramMedia("story", "editMessageMedia", {
          media: { type: "photo", media: PHOTO, caption: "x" },
        })
      ).toEqual({ ok: true });
    });

    it("checks the preview an editMessageText would show", () => {
      expect(
        checkTelegramMedia("story", "editMessageText", { text: "x" })
      ).toEqual({ ok: false, reason: "text:no_preview" });
      expect(
        checkTelegramMedia("story", "editMessageText", {
          link_preview_options: { url: CARD },
        })
      ).toEqual({ ok: false, reason: "image:first_party_card" });
      expect(
        checkTelegramMedia("story", "editMessageText", {
          link_preview_options: PREVIEW,
        })
      ).toEqual({ ok: true });
    });
  });

  describe("a story text post is never lost to its publisher URL", () => {
    it("pins an http publisher page: Telegram previews http pages", () => {
      expect(
        checkTelegramMedia("story", "sendMessage", {
          link_preview_options: {
            url: "http://richg42.blogspot.com/2026/10/post.html",
          },
        })
      ).toEqual({ ok: true });
    });

    it("still refuses a private host as the preview", () => {
      for (const url of ["http://127.0.0.1/a", "https://intranet.local/a"]) {
        expect(
          checkTelegramMedia("story", "sendMessage", {
            link_preview_options: { url },
          })
        ).toEqual({ ok: false, reason: "text:unsafe_url" });
      }
    });

    it("refuses a first-party page as a story preview: its og:image is the card", () => {
      expect(
        checkTelegramMedia("story", "sendMessage", {
          link_preview_options: {
            url: "https://aidr.today/llm/abcdef12-some-story?lang=vi",
          },
        })
      ).toEqual({ ok: false, reason: "text:first_party_preview" });
    });

    it("allows a story text post with its preview explicitly off", () => {
      expect(
        checkTelegramMedia("story", "sendMessage", {
          link_preview_options: { is_disabled: true },
        })
      ).toEqual({ ok: true });
    });
  });

  describe("the share card is recognised however it is spelled", () => {
    const cards = [
      "https://www.aidr.today/api/og/abcdef12.png",
      "https://aidr.today/api/og/abcdef12",
      "https://aidr.today/api/og/abcdef12.png/",
      "https://AIDR.today./api/og/abcdef12.png?lang=en",
      "https://aidr.today/api/og/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890.png?lang=vi",
    ];

    it("rejects every spelling as a story photo", () => {
      for (const photo of cards) {
        expect(checkTelegramMedia("story", "sendPhoto", { photo })).toEqual({
          ok: false,
          reason: "image:first_party_card",
        });
      }
    });

    it("rejects the http spelling as a story preview", () => {
      expect(
        checkTelegramMedia("story", "sendMessage", {
          link_preview_options: {
            url: "http://aidr.today/api/og/abcdef12.png",
          },
        })
      ).toEqual({ ok: false, reason: "image:first_party_card" });
    });

    it("leaves the digest's day card alone on either host", () => {
      for (const url of [
        DAY_CARD,
        "https://www.aidr.today/api/og/date/2026-10-15.png?lang=en",
      ]) {
        expect(
          checkTelegramMedia("digest", "sendMessage", {
            link_preview_options: { url },
          })
        ).toEqual({ ok: true });
      }
    });
  });

  it("reads the image type from a format query and past a trailing slash", () => {
    for (const photo of [
      "https://img.example/render?format=gif",
      "https://img.example/render?w=800&format=GIF",
      "https://img.example/a.gif/",
    ]) {
      expect(checkTelegramMedia("story", "sendPhoto", { photo })).toEqual({
        ok: false,
        reason: "image:unsupported_type:gif",
      });
    }
    expect(
      checkTelegramMedia("story", "sendPhoto", {
        photo: "https://img.example/render?format=jpg",
      })
    ).toEqual({ ok: true });
  });
});
