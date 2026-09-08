import { describe, expect, it } from "vitest";
import { sourceIconHost, sourceIconUrl } from "./source-icon";
import type { IngestSourceRow } from "./system-queries";

function row(partial: Partial<IngestSourceRow>): IngestSourceRow {
  return {
    id: "x",
    name: "X",
    type: "rss",
    enabled: true,
    itemCount: 0,
    config: {},
    ...partial,
  };
}

describe("sourceIconHost", () => {
  it("prefers homepage, then feed, then known type hosts", () => {
    expect(
      sourceIconHost(row({ config: { homepage: "https://openai.com" } }))
    ).toBe("openai.com");
    expect(
      sourceIconHost(
        row({ config: { feed: "https://huggingface.co/blog/feed.xml" } })
      )
    ).toBe("huggingface.co");
    expect(sourceIconHost(row({ id: "hn", type: "hn" }))).toBe(
      "news.ycombinator.com"
    );
  });
});

describe("sourceIconUrl", () => {
  it("builds a Google favicon URL", () => {
    expect(sourceIconUrl(row({ id: "lobsters", type: "lobsters" }))).toBe(
      "https://www.google.com/s2/favicons?domain=lobste.rs&sz=32"
    );
  });
});
