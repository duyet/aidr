import { afterEach, describe, expect, it, vi } from "vitest";
import { findSourceSpec } from "../sources/catalog.js";
import {
  parseRssItems,
  resetRssHostQueues,
  rssAdapter,
} from "../sources/rss.js";

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[GPT ships]]></title>
  <link>https://openai.com/index/gpt-ships</link>
  <description><![CDATA[<p>A model.</p>]]></description>
  <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
</item>
<item>
  <title>Skip me</title>
  <link>/relative</link>
  <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

describe("parseRssItems", () => {
  it("reads CDATA titles, strips HTML summaries, and skips relative links", () => {
    const items = parseRssItems(SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://openai.com/index/gpt-ships",
      title: "GPT ships",
      summary: "A model.",
    });
  });

  it("collects bounded RSS media candidates and a video poster", () => {
    const xml = `<item>
      <title>Video story</title>
      <link>https://example.com/video</link>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <media:thumbnail url="https://example.com/poster.jpg" />
      <media:content url="https://example.com/story.mp4" type="video/mp4" />
    </item>`;
    const [item] = parseRssItems(xml);
    expect(item.media).toEqual([
      { type: "image", url: "https://example.com/poster.jpg" },
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
      },
    ]);
    expect(item.imageUrl).toBe("https://example.com/poster.jpg");
    expect(item.mediaManifest?.assets).toEqual([
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
      },
    ]);
  });

  it("keeps a video-only RSS item typed and derives its poster fallback", () => {
    const [item] = parseRssItems(`<item>
      <title>Video only</title>
      <link>https://example.com/video-only</link>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <media:content url="https://example.com/only.mp4" type="video/mp4" />
      <media:thumbnail url="https://example.com/only-poster.jpg" />
    </item>`);
    expect(item.mediaManifest?.assets).toEqual([
      {
        type: "video",
        url: "https://example.com/only.mp4",
        poster_url: "https://example.com/only-poster.jpg",
      },
    ]);
    expect(item.imageUrl).toBe("https://example.com/only-poster.jpg");
  });

  it("reads Atom entries with link href and updated dates", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>LLM prompting tips</title>
  <link href="https://simonwillison.net/2026/Sep/18/tips/"/>
  <id>https://simonwillison.net/2026/Sep/18/tips/</id>
  <updated>2026-09-18T14:36:41+00:00</updated>
  <summary>Notes on prompting.</summary>
</entry>
<entry>
  <title>Skip me</title>
  <link href="/relative/path"/>
  <updated>2026-09-18T14:00:00+00:00</updated>
</entry>
</feed>`;
    const items = parseRssItems(atom);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://simonwillison.net/2026/Sep/18/tips/",
      title: "LLM prompting tips",
      summary: "Notes on prompting.",
    });
  });

  it("clips a long description on a sentence inside 1200 characters", () => {
    const sentence = "The lab released a new open model today.";
    const body = `${sentence}${" Extra detail keeps going without a stop".repeat(40)}`;
    expect(body.length).toBeGreaterThan(1200);
    expect(body.slice(0, 1200).endsWith(".")).toBe(false);

    const [item] = parseRssItems(`<item>
      <title>Long</title>
      <link>https://example.com/long</link>
      <description>${body}</description>
    </item>`);

    expect(item.summary).toBe(sentence);
    expect(item.summary?.length).toBeLessThanOrEqual(1200);
  });

  it("ends a mid-sentence cut with an ellipsis so backfill can see it", () => {
    const body = "word ".repeat(300).trim();
    expect(body.length).toBeGreaterThan(1200);
    expect(body.includes(".")).toBe(false);

    const [item] = parseRssItems(`<item>
      <title>Cut</title>
      <link>https://example.com/cut</link>
      <description>${body}</description>
    </item>`);

    // A raw slice(0, 1200) ends mid-sentence with no ellipsis, so
    // summaryLooksCutOff is false and LIKE '%…' never selects the row.
    // The mark has to fit inside the same 1200 characters.
    expect(item.summary?.endsWith("…")).toBe(true);
    expect(item.summary).not.toBe(body.slice(0, 1200));
    expect(item.summary?.length).toBeLessThanOrEqual(1200);
    const kept = item.summary?.slice(0, -1) ?? "";
    expect(body.startsWith(kept)).toBe(true);
  });

  it("keeps a spaceless cut inside 1200 characters and marks it", () => {
    const body = "x".repeat(1500);
    const [item] = parseRssItems(`<item>
      <title>Blob</title>
      <link>https://example.com/blob</link>
      <description>${body}</description>
    </item>`);

    // slice(0, 1200) + "…" is 1201 characters and still mid-token.
    expect(item.summary?.endsWith("…")).toBe(true);
    expect(item.summary?.length).toBeLessThanOrEqual(1200);
    expect(item.summary).not.toBe(`${body.slice(0, 1200)}…`);
    expect(body.startsWith(item.summary?.slice(0, -1) ?? "")).toBe(true);
  });

  it("decodes numeric references and &nbsp; in RSS text", () => {
    const [item] = parseRssItems(`<item>
      <title>AT&amp;T&#8217;s model &#x26; more</title>
      <link>https://example.com/entities</link>
      <description>hello&nbsp;world</description>
    </item>`);

    // &#8217; is U+2019. &#x26; and &amp; each become "&" once.
    expect(item.title).toBe("AT&T\u2019s model & more");
    // A missed &nbsp; decode would leave the letters "nbsp".
    expect(item.summary).toBe("hello world");
  });
});

describe("rssAdapter", () => {
  it("filters items older than sinceEpochSec", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () => new Response(SAMPLE, { status: 200 }))
    );
    const recent = await rssAdapter.fetchItems(
      { feed: "https://openai.com/news/rss.xml" },
      Math.floor(Date.parse("2026-09-06T00:00:00Z") / 1000)
    );
    expect(recent).toHaveLength(1);
    const old = await rssAdapter.fetchItems(
      { feed: "https://openai.com/news/rss.xml" },
      Math.floor(Date.parse("2026-09-08T00:00:00Z") / 1000)
    );
    expect(old).toHaveLength(0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRssHostQueues();
});

/** A real VnExpress-shaped item: Vietnamese title, RFC-822 pubDate with an
 *  explicit +0700 offset (the reason this source was chosen over the other
 *  verified VI feed, whose pubDate carries no timezone at all). */
const VI_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<item>
  <title>Bill Gates: 'AI đủ mạnh để gây ra những sự kiện khiến một tỷ người chết'</title>
  <link>https://vnexpress.net/bill-gates-ai-du-manh-5125234.html</link>
  <description>Bill Gates cảnh báo về rủi ro từ AI.</description>
  <pubDate>Sun, 27 Sep 2026 08:00:00 +0700</pubDate>
</item>
</channel></rss>`;

describe("rssAdapter source language", () => {
  it("emits sourceLang: vi for a row that declares it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(VI_SAMPLE, { status: 200 }))
    );
    const config = findSourceSpec("vnexpress-tech")?.config ?? {};
    expect((config as { sourceLang?: unknown }).sourceLang).toBe("vi");
    const [item] = await rssAdapter.fetchItems(
      config,
      Math.floor(Date.parse("2026-09-26T00:00:00Z") / 1000)
    );
    // This single field is what puts the item on the real VI→EN translation-QA
    // path. Before this change no adapter ever set it, so the whole branch was
    // dead code reachable only by an operator pushing an item by hand.
    expect(item.sourceLang).toBe("vi");
    expect(item.title).toMatch(/[ăâđêôơư]/i);
    // The +0700 offset must be honoured, or every VI item lands ~7h in the
    // future and sorts above genuinely-fresh stories.
    expect(item.publishedAt).toBe(Date.parse("2026-09-27T01:00:00Z"));
  });

  it("leaves sourceLang unset for an English row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(SAMPLE, { status: 200 }))
    );
    const [item] = await rssAdapter.fetchItems(
      { feed: "https://openai.com/news/rss.xml" },
      Math.floor(Date.parse("2026-09-06T00:00:00Z") / 1000)
    );
    expect(item.sourceLang).toBeUndefined();
  });

  it("ignores an unrecognised sourceLang rather than guessing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(VI_SAMPLE, { status: 200 }))
    );
    for (const sourceLang of ["en", "fr", "VI", "", true, 1]) {
      const [item] = await rssAdapter.fetchItems(
        { feed: "https://example.com/feed", sourceLang },
        Math.floor(Date.parse("2026-09-26T00:00:00Z") / 1000)
      );
      // Direction must be explicit metadata only. A typo cannot silently push
      // an item onto the VI→EN QA path.
      expect(item.sourceLang).toBeUndefined();
    }
  });
});

describe("rssAdapter per-host pacing", () => {
  it("spaces two fetches to the same host but never delays the first", async () => {
    const started: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        started.push(Date.now());
        return new Response(SAMPLE, { status: 200 });
      })
    );
    vi.useFakeTimers();
    try {
      // Two arXiv rows are fetched in parallel by the workflow's source
      // groups; arXiv answers that with a bare 406, so the adapter serialises
      // same-host requests when a row asks for it.
      const config = {
        feed: "https://export.arxiv.org/api/query?search_query=cat%3Acs.AI",
        minRequestIntervalMs: 3500,
      };
      const p1 = rssAdapter.fetchItems(config, 0);
      const p2 = rssAdapter.fetchItems(config, 0);
      // The first request must not be parked for 3.5s: an isolate that has
      // never touched the host pays nothing, and only the SECOND one waits.
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.all([p1, p2]);

      expect(started).toHaveLength(2);
      expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(3500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not serialise or delay different hosts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(SAMPLE, { status: 200 }))
    );
    const [a, b] = await Promise.all([
      rssAdapter.fetchItems(
        { feed: "https://a.example/feed", minRequestIntervalMs: 30_000 },
        0
      ),
      rssAdapter.fetchItems(
        { feed: "https://b.example/feed", minRequestIntervalMs: 30_000 },
        0
      ),
    ]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("keeps working after a fetch to the same host fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response("nope", { status: 500 });
        return new Response(SAMPLE, { status: 200 });
      })
    );
    const config = {
      feed: "https://a.example/feed",
      minRequestIntervalMs: 1,
    };
    await expect(rssAdapter.fetchItems(config, 0)).rejects.toThrow();
    // A rejected predecessor must not permanently stall that host.
    await expect(rssAdapter.fetchItems(config, 0)).resolves.toHaveLength(1);
  });
});
