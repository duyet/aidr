import { describe, expect, it } from "vitest";
import { EXTENSION_VERSION } from "../../src/lib/extension-release";
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
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("falls back to shipped EXTENSION_VERSION when GitHub has no aidr.zip", async () => {
    clearLatestAidrReleaseCache();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify([]), { status: 200 });
    const res = await handleAidrZipRequest(
      new Request("https://aidr.today/aidr.zip"),
      fetchImpl
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      `https://github.com/duyet/aidr/releases/download/aidr-v${EXTENSION_VERSION}/aidr.zip`
    );
  });

  it("does not cache a failed GitHub fetch", async () => {
    clearLatestAidrReleaseCache();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return new Response("nope", { status: 403 });
      return new Response(
        JSON.stringify([
          {
            tag_name: "aidr-v0.1.7",
            assets: [
              {
                name: "aidr.zip",
                browser_download_url: "https://example.com/0.1.7",
              },
            ],
          },
        ]),
        { status: 200 }
      );
    };
    expect(await fetchLatestAidrRelease(fetchImpl)).toBeNull();
    expect(await fetchLatestAidrRelease(fetchImpl)).toEqual({
      version: "0.1.7",
      tag: "aidr-v0.1.7",
      zipUrl: "https://example.com/0.1.7",
    });
    expect(calls).toBe(2);
  });
});
