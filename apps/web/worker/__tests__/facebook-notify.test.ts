import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFacebookDigest,
  buildFacebookStory,
  facebookEnabled,
  facebookEnNotifier,
  facebookGraphVersion,
  facebookLink,
  facebookSiteOrigin,
} from "../notify/facebook.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import type { Env } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const digest: DailyDigest = {
  lang: "en",
  date: "2026-10-04",
  bullets: [
    { text: "A lab ships a small model", url: "https://example.test/abcd1234" },
    { text: "A second lab publishes the weights", url: null },
  ],
};

const story: StoryPayload = {
  id: "abcd1234deadbeef",
  url: "https://example.com/post",
  title: "A lab ships a small model",
  summary: "The weights are public. The benchmark is narrow.",
  image_url: "https://example.com/hotlink.jpg",
  category: "models",
  points: 10,
  comments: 2,
  rank_score: 8,
  llm_importance: 8,
  lang: "en",
};

function env(partial: Partial<Env> = {}): Env {
  return partial as Env;
}

describe("Facebook Page posts", () => {
  it("stays off until the token is set, and refuses a token with no Page", () => {
    expect(facebookEnabled(env())).toBe(false);
    expect(facebookEnabled(env({ FACEBOOK_PAGE_ID: "100" }))).toBe(false);
    expect(() =>
      facebookEnabled(env({ FACEBOOK_PAGE_ACCESS_TOKEN: "page-token" }))
    ).toThrow(/FACEBOOK_PAGE_ID is missing/);
    expect(
      facebookEnabled(
        env({
          FACEBOOK_PAGE_ID: "100",
          FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
        })
      )
    ).toBe(true);
    expect(facebookGraphVersion(env())).toBe("v26.0");
    expect(facebookGraphVersion(env({ FACEBOOK_GRAPH_VERSION: "v21.0" }))).toBe(
      "v21.0"
    );
    expect(() =>
      facebookGraphVersion(env({ FACEBOOK_GRAPH_VERSION: "latest" }))
    ).toThrow(/FACEBOOK_GRAPH_VERSION/);
    expect(facebookSiteOrigin(env())).toMatch(/^https:\/\//);
    expect(
      facebookSiteOrigin(env({ SITE_URL: "https://example.test/path" }))
    ).toBe("https://example.test");
  });

  it("posts the English day page as one link, without the publisher image", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "111_222" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await facebookEnNotifier.sendDigest(
      env({
        FACEBOOK_PAGE_ID: "100",
        FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
        SITE_URL: "https://example.test",
      }),
      digest
    );
    expect(result).toEqual({ ok: true, messageId: "111_222" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v26.0/100/feed");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer page-token");
    const body = JSON.parse(String(init.body)) as {
      message: string;
      link: string;
    };
    expect(body.link).toBe(
      facebookLink("https://example.test/date/2026-10-04", "en")
    );
    expect(body.link).toContain("utm_source=facebook");
    expect(body.message).toContain("AI news today — 2026-10-04");
    expect(body.message).toContain("• A lab ships a small model");
    expect(body.message).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(body)).not.toContain("page-token");
    expect(JSON.stringify(body)).not.toContain("hotlink");
  });

  it("attaches a trending story to its permalink on this install", () => {
    const post = buildFacebookStory(story);
    expect(post.link).toContain("utm_source=facebook");
    expect(post.link).toContain("abcd1234");
    expect(post.link).not.toContain("example.com");
    expect(post.message).toContain("A lab ships a small model");
    expect(post.message).toContain("The weights are public");
  });

  it("does not retry a policy block, and does retry a rate limit", async () => {
    const page = env({
      FACEBOOK_PAGE_ID: "123456",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "blocked page-token", code: 368 },
            }),
            { status: 400 }
          )
      )
    );
    const blocked = await facebookEnNotifier.sendStory(page, story);
    expect(blocked.ok).toBe(false);
    expect(blocked.ambiguous).toBe(true);
    expect(blocked.error).not.toContain("page-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "too many calls", code: 80001 },
            }),
            { status: 429 }
          )
      )
    );
    const limited = await facebookEnNotifier.sendDigest(page, digest);
    expect(limited.ok).toBe(false);
    expect(limited.ambiguous).toBeUndefined();
  });

  it("treats a dropped connection as already possibly posted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const result = await facebookEnNotifier.sendDigest(
      env({
        FACEBOOK_PAGE_ID: "123456",
        FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      }),
      digest
    );
    expect(result.ambiguous).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("refuses engagement bait before calling Facebook", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const bait = buildFacebookDigest({
      ...digest,
      bullets: [{ text: "Please like and share this launch", url: null }],
    });
    expect(bait.message).toMatch(/like and share/i);
    const result = await facebookEnNotifier.sendDigest(
      env({
        FACEBOOK_PAGE_ID: "123456",
        FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      }),
      {
        ...digest,
        bullets: [{ text: "Please like and share this launch", url: null }],
      }
    );
    expect(result).toMatchObject({
      ok: false,
      ambiguous: true,
      error: "refused: engagement bait",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
