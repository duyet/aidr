import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketBriefAdapter,
  parseMarketBriefPayload,
} from "../sources/marketbrief.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(dirname, "../sources/__fixtures__/marketbrief-ai.json"),
    "utf-8"
  )
);

describe("parseMarketBriefPayload", () => {
  it("keeps live AI stories and drops superseded ones", () => {
    const items = parseMarketBriefPayload(fixture);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://marketbrief.now/ai/nous-portal-adds-chatgpt-image-25-abc",
      title: "Nous Portal Adds ChatGPT-Image-2.5",
      publishedAt: 1_700_000_000,
      comments: 12,
      points: 3,
      externalId: "story-live",
    });
  });
});

describe("marketBriefAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the AI hub __data.json and filters by sinceEpochSec", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      expect(String(input)).toBe("https://marketbrief.now/ai/__data.json");
      return new Response(JSON.stringify(fixture), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const recent = await marketBriefAdapter.fetchItems({}, 0);
    expect(recent).toHaveLength(1);
    const old = await marketBriefAdapter.fetchItems({}, 1_800_000_000);
    expect(old).toHaveLength(0);
  });
});
