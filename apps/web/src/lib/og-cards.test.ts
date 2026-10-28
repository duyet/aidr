import { describe, expect, it } from "vitest";
import type { DbReader } from "./db";
import {
  isCardPending,
  isCardServable,
  PHOTOLESS_RETRY_MS,
  parseCardAcks,
  pendingFromRows,
  renderedStoryCardUrls,
} from "./og-cards";
import { storyCardUrl } from "./seo";
import { storyOgHash } from "./story-og";
import type { FeedItem } from "./types";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "a".repeat(64),
    url: "https://publisher.example.com/story",
    title: "A useful AI story",
    title_vi: "Một câu chuyện AI hữu ích",
    summary: null,
    summary_vi: null,
    category: "Research",
    published_at: 1_790_000_000,
    points: 1,
    comments: 2,
    rank_score: 0,
    source_id: "test",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: "https://images.example.com/photo.png",
    ...overrides,
  };
}

function dbWith(rows: Record<string, unknown>[] | Error): DbReader {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => {
          if (rows instanceof Error) throw rows;
          return { results: rows };
        },
      }),
    }),
  } as unknown as DbReader;
}

describe("story card URL on the page", () => {
  // og.aidr.today serves R2 with a one-year immutable header and never asks
  // the Worker, so the page may only name it for a card that exists and is
  // drawn from the story as it is now.
  it("points at og.aidr.today when the current card is rendered", async () => {
    const story = item();
    const hash = await storyOgHash(story, "vi");
    const urls = await renderedStoryCardUrls(
      dbWith([{ lang: "vi", hash, photoless: 0, rendered_at: 1 }]),
      story
    );
    expect(urls).toEqual({
      vi: `https://og.aidr.today/og-story/${hash}/vi.png`,
    });
    expect(storyCardUrl({ ...story, og_card_urls: urls }, "vi")).toBe(urls.vi);
    // The English card is not rendered yet: Worker route.
    expect(storyCardUrl({ ...story, og_card_urls: urls }, "en")).toContain(
      `/api/og/${story.id}.png`
    );
  });

  it("falls back when the story changed after the render", async () => {
    // A late VI title or an admin edit: the stored card shows old text.
    const old = await storyOgHash(item({ title_vi: null }), "vi");
    const urls = await renderedStoryCardUrls(
      dbWith([{ lang: "vi", hash: old, photoless: 0, rendered_at: 1 }]),
      item()
    );
    expect(urls).toEqual({});
    expect(storyCardUrl({ ...item(), og_card_urls: urls }, "vi")).toContain(
      "/api/og/"
    );
  });

  it("falls back for a card drawn without its photo", async () => {
    // A retry may draw the photo under the same key; an immutable URL would
    // pin the photoless card in every crawler cache.
    const hash = await storyOgHash(item(), "en");
    const urls = await renderedStoryCardUrls(
      dbWith([{ lang: "en", hash, photoless: 1, rendered_at: 1 }]),
      item()
    );
    expect(urls).toEqual({});
  });

  it("falls back when no card exists or the table is missing", async () => {
    expect(await renderedStoryCardUrls(dbWith([]), item())).toEqual({});
    expect(
      await renderedStoryCardUrls(dbWith(new Error("no such table")), item())
    ).toEqual({});
    expect(storyCardUrl(item(), "en")).toContain(`/api/og/${item().id}.png`);
  });
});

describe("pending cards", () => {
  // The renderer hashes raw D1 rows; the page hashes the row getStory maps.
  // Both go through mapStoryRow, so an acked hash is the one the page asks.
  it("hashes a raw candidate row as the page hashes the story", async () => {
    const row = {
      id: "a".repeat(64),
      url: "https://publisher.example.com/story",
      title: "A useful AI story",
      title_vi: null,
      category: "Research",
      published_at: 1_790_000_000,
      image_url: "https://images.example.com/photo.png",
      media_manifest: null,
      en_hash: null,
      vi_hash: null,
    };
    const [pending] = await pendingFromRows([row], 0);
    const story = item({ title_vi: null });
    expect(pending.cards).toEqual([
      { lang: "en", hash: await storyOgHash(story, "en") },
      { lang: "vi", hash: await storyOgHash(story, "vi") },
    ]);
    const done = {
      ...row,
      en_hash: pending.cards[0].hash,
      en_photoless: 0,
      en_at: 1,
      vi_hash: pending.cards[1].hash,
      vi_photoless: 0,
      vi_at: 1,
    };
    expect(await pendingFromRows([done], 0)).toEqual([]);
  });

  const hash = "b".repeat(64);
  it("draws a card never rendered or rendered from older inputs", () => {
    expect(isCardPending(undefined, hash, 0)).toBe(true);
    expect(
      isCardPending(
        { hash: "c".repeat(64), photoless: false, renderedAt: 0 },
        hash,
        0
      )
    ).toBe(true);
    expect(
      isCardPending({ hash, photoless: false, renderedAt: 0 }, hash, 1e15)
    ).toBe(false);
  });

  it("retries a photoless card after a week, not before", () => {
    const rendered = { hash, photoless: true, renderedAt: 1000 };
    expect(isCardPending(rendered, hash, 1000 + PHOTOLESS_RETRY_MS - 1)).toBe(
      false
    );
    expect(isCardPending(rendered, hash, 1000 + PHOTOLESS_RETRY_MS)).toBe(true);
    expect(isCardServable(rendered, hash)).toBe(false);
  });

  it("accepts only well-formed acks", () => {
    const ok = { item_id: "a".repeat(64), lang: "en", hash, photoless: false };
    expect(parseCardAcks({ cards: [ok] })).toEqual([ok]);
    expect(parseCardAcks({ cards: [{ ...ok, lang: "fr" }] })).toBeNull();
    expect(parseCardAcks({ cards: [{ ...ok, hash: "x" }] })).toBeNull();
    expect(parseCardAcks({ cards: [{ ...ok, item_id: "../" }] })).toBeNull();
    expect(parseCardAcks({})).toBeNull();
  });
});
