import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseFeedDate, parseUtcOffset } from "../sources/feed-date.js";
import { parseRssItems, rssAdapter } from "../sources/rss.js";

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sources",
  "__fixtures__"
);

const VN = parseUtcOffset("+07:00");

describe("parseUtcOffset", () => {
  it("reads a fixed offset and rejects anything else", () => {
    expect(parseUtcOffset("+07:00")).toBe(420);
    expect(parseUtcOffset("+0700")).toBe(420);
    expect(parseUtcOffset("-03:30")).toBe(-210);
    expect(parseUtcOffset("Asia/Ho_Chi_Minh")).toBeNull();
    expect(parseUtcOffset("+25:00")).toBeNull();
    expect(parseUtcOffset(7)).toBeNull();
  });
});

describe("parseFeedDate with a per-source offset", () => {
  it("reads a zone-less M/D/YYYY h:mm:ss PM date as that offset's wall clock", () => {
    // 10/8 is October 8th (month first); 2:06 PM at +07:00 is 07:06 UTC.
    expect(parseFeedDate("10/8/2026 2:06:00 PM", VN)).toBe(
      Date.UTC(2026, 9, 8, 7, 6, 0)
    );
    expect(parseFeedDate("10/8/2026 12:30:00 AM", VN)).toBe(
      Date.UTC(2026, 9, 7, 17, 30, 0)
    );
    expect(parseFeedDate("10/8/2026 12:30:00 PM", VN)).toBe(
      Date.UTC(2026, 9, 8, 5, 30, 0)
    );
  });

  it("gives the same answer whatever timezone the host runs in", () => {
    const host = process.env.TZ;
    try {
      const results = ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"].map(
        (tz) => {
          process.env.TZ = tz;
          return parseFeedDate("10/8/2026 2:06:00 PM", VN);
        }
      );
      expect(new Set(results).size).toBe(1);
    } finally {
      if (host === undefined) delete process.env.TZ;
      else process.env.TZ = host;
    }
  });

  it("reads zone-less ISO and RFC-822 dates the same way", () => {
    const expected = Date.UTC(2026, 9, 8, 7, 6, 0);
    expect(parseFeedDate("2026-10-08T14:06:00", VN)).toBe(expected);
    expect(parseFeedDate("2026-10-08 14:06:00", VN)).toBe(expected);
    expect(parseFeedDate("Thu, 08 Oct 2026 14:06:00", VN)).toBe(expected);
  });

  it("never shifts a date that already carries a zone", () => {
    const expected = Date.UTC(2026, 9, 10, 10, 32, 0);
    expect(parseFeedDate("Sat, 10 Oct 2026 17:32:00 +07", VN)).toBe(expected);
    expect(parseFeedDate("Sat, 10 Oct 2026 17:32:00 +0700", VN)).toBe(expected);
    expect(parseFeedDate("2026-10-10T17:32:00+07:00", VN)).toBe(expected);
    expect(parseFeedDate("2026-10-10T10:32:00Z", VN)).toBe(expected);
    expect(parseFeedDate("Sat, 10 Oct 2026 10:32:00 GMT", VN)).toBe(expected);
  });

  it("is NaN for a zone-less shape it does not know, not a host-timezone guess", () => {
    expect(parseFeedDate("yesterday at noon", VN)).toBeNaN();
  });

  it("is plain Date.parse without an offset", () => {
    expect(parseFeedDate("Mon, 07 Sep 2026 00:00:00 GMT")).toBe(
      Date.UTC(2026, 8, 7)
    );
  });
});

describe("rss date handling for the GenK AI and Ai2 rows", () => {
  const genk = readFileSync(resolve(FIXTURES, "genk-ai.xml"), "utf8");

  it("parses GenK's +07 dates to the right instant", () => {
    const items = parseRssItems(genk, { utcOffsetMinutes: VN });
    expect(items.map((item) => item.publishedAt)).toEqual([
      Date.UTC(2026, 9, 10, 10, 32),
      Date.UTC(2026, 9, 10, 1, 39),
      Date.UTC(2026, 9, 9, 8, 13),
    ]);
  });

  it("applies the configured offset when the feed drops the zone", async () => {
    const zoneless = genk.replace(
      /<pubDate>[^<]*<\/pubDate>/,
      "<pubDate>10/8/2026 2:06:00 PM</pubDate>"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(zoneless, {
            status: 200,
            headers: { "content-type": "text/xml" },
          })
      )
    );
    try {
      const since = Math.floor(Date.UTC(2026, 9, 8, 0, 0) / 1000);
      const items = await rssAdapter.fetchItems(
        {
          feed: "https://genk.vn/rss/ai.rss",
          sourceLang: "vi",
          timezone: "+07:00",
        },
        since
      );
      const first = items.find(
        (item) => item.publishedAt === Date.UTC(2026, 9, 8, 7, 6)
      );
      expect(first, "2:06 PM at +07:00 is 07:06 UTC").toBeDefined();
      expect(items.every((item) => item.sourceLang === "vi")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads Ai2's ISO dates with an offset", () => {
    const ai2 = readFileSync(resolve(FIXTURES, "ai2-rss.xml"), "utf8");
    const items = parseRssItems(ai2);
    expect(items).toHaveLength(2);
    expect(items[0].publishedAt).toBe(Date.UTC(2026, 9, 9, 8, 0));
    expect(items[0].summary).toContain("GPU");
  });
});
