import { describe, expect, it } from "vitest";
import {
  clearLatestAidrReleaseCache,
  fetchLatestAidrRelease,
  handleAidrZipRequest,
  pickLatestAidrRelease,
  versionFromAidrTag,
} from "../extension-zip";

describe("versionFromAidrTag", () => {
  it("parses aidr-v tags", () => {
    expect(versionFromAidrTag("aidr-v0.1.4")).toBe("0.1.4");
    expect(versionFromAidrTag("aidr-v1.2.3")).toBe("1.2.3");
  });

  it("rejects other tags", () => {
    expect(versionFromAidrTag("web-v0.1.1")).toBeNull();
    expect(versionFromAidrTag("v0.1.4")).toBeNull();
    expect(versionFromAidrTag("aidr-0.1.4")).toBeNull();
  });
});

describe("pickLatestAidrRelease", () => {
  it("picks the highest aidr-v release that has aidr.zip", () => {
    const latest = pickLatestAidrRelease([
      {
        tag_name: "web-v0.2.0",
        assets: [
          {
            name: "aidr.zip",
            browser_download_url: "https://example.com/wrong",
          },
        ],
      },
      {
        tag_name: "aidr-v0.1.3",
        assets: [
          {
            name: "aidr.zip",
            browser_download_url: "https://example.com/0.1.3",
          },
        ],
      },
      {
        tag_name: "aidr-v0.1.4",
        assets: [
          {
            name: "aidr-cws.zip",
            browser_download_url: "https://example.com/cws",
          },
          {
            name: "aidr.zip",
            browser_download_url: "https://example.com/0.1.4",
          },
        ],
      },
      { tag_name: "aidr-v0.1.5", draft: true, assets: [] },
    ]);
    expect(latest).toEqual({
      version: "0.1.4",
      tag: "aidr-v0.1.4",
      zipUrl: "https://example.com/0.1.4",
    });
  });

  it("returns null when no aidr zip asset exists", () => {
    expect(
      pickLatestAidrRelease([
        {
          tag_name: "aidr-v0.1.4",
          assets: [{ name: "aidr-cws.zip", browser_download_url: "x" }],
        },
      ])
    ).toBeNull();
  });
});

describe("fetchLatestAidrRelease + handleAidrZipRequest", () => {
  it("redirects to the resolved zip URL", async () => {
    clearLatestAidrReleaseCache();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: "aidr-v0.1.4",
            assets: [
              {
                name: "aidr.zip",
                browser_download_url:
                  "https://github.com/duyet/aidr/releases/download/aidr-v0.1.4/aidr.zip",
              },
            ],
          },
        ]),
        { status: 200 }
      );
    const latest = await fetchLatestAidrRelease(fetchImpl);
    expect(latest?.version).toBe("0.1.4");
    const res = await handleAidrZipRequest(
      new Request("https://aidr.today/aidr.zip"),
      fetchImpl
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("aidr-v0.1.4/aidr.zip");
  });
});
