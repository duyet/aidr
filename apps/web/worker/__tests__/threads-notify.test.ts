import { afterEach, describe, expect, it, vi } from "vitest";
import { notifiers } from "../notify/index.js";
import {
  buildThreadsDaily,
  threadsEnabled,
  threadsEnNotifier,
} from "../notify/threads.js";
import type { DailyDigest } from "../notify/types.js";
import type { Env } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const digest: DailyDigest = {
  lang: "en",
  date: "2026-10-04",
  bullets: [
    {
      text: "A lab ships a small model",
      url: "https://example.com/publisher-image.jpg",
    },
    { text: "A second lab publishes the weights", url: null },
  ],
};

function env(partial: Partial<Env> = {}): Env {
  return partial as Env;
}

describe("Threads daily edition", () => {
  it("stays off with empty env and builds text plus this site's day card", () => {
    expect(threadsEnabled(env())).toBe(false);
    expect(
      threadsEnabled(env({ THREADS_USER_ID: "", THREADS_ACCESS_TOKEN: "" }))
    ).toBe(false);
    expect(
      threadsEnabled(
        env({ THREADS_USER_ID: "   ", THREADS_ACCESS_TOKEN: "  " })
      )
    ).toBe(false);
    expect(threadsEnabled(env({ THREADS_USER_ID: "1234567890" }))).toBe(false);
    expect(() =>
      threadsEnabled(env({ THREADS_ACCESS_TOKEN: "threads-token" }))
    ).toThrow(/THREADS_USER_ID is missing/);

    const post = buildThreadsDaily(digest);
    expect(post.date).toBe("2026-10-04");
    expect(post.text).toContain("AI news today — 2026-10-04");
    expect(post.text).toContain("• A lab ships a small model");
    expect(post.text).not.toMatch(/https?:\/\//);
    expect(post.imageUrl).toBe(
      "https://aidr.today/api/og/date/2026-10-04.png?lang=en"
    );
    expect(new URL(post.imageUrl).hostname).toBe("aidr.today");
    expect(post.imageUrl).not.toContain("example.com");
    expect(notifiers.map((notifier) => notifier.id)).not.toContain(
      "threads-en"
    );
  });

  it("does not call Threads, even when the env is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await threadsEnNotifier.sendDigest(
      env({
        THREADS_USER_ID: "1234567890",
        THREADS_ACCESS_TOKEN: "threads-token",
      }),
      digest
    );
    expect(result).toEqual({
      ok: false,
      error: "threads poster is not wired",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(threadsEnNotifier.id).toBe("threads-en");
  });
});
