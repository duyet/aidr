import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  githubReleasesAdapter,
  isMinorReleaseTag,
} from "../sources/githubreleases.js";
import { hfModelsAdapter, isReleaseRepo } from "../sources/hfmodels.js";
import { hfPapersAdapter } from "../sources/hfpapers.js";
import { openRouterAdapter } from "../sources/openrouter.js";
import { adapters } from "../sources/registry.js";

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sources",
  "__fixtures__"
);

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

function stubFetch(body: string, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => new Response(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("githubreleases", () => {
  it("keeps only x.y.0 tags, so patch, rc, draft and build-number tags never reach the scorer", () => {
    expect(
      ["v0.41.0", "0.162.0", "rust-v0.163.0", "v5.19.0", "v2.2.0"].map(
        isMinorReleaseTag
      )
    ).toEqual([true, true, true, true, true]);
    expect(
      [
        "v0.40.3",
        "v0.31.1rc0",
        "v0.42.0-rc0",
        "0.163.0-alpha.5",
        "proto-v0.5.0",
        "b11552",
        "v2.1.296",
      ].map(isMinorReleaseTag)
    ).toEqual([false, false, false, false, false, false, false]);
  });

  it("emits one titled item per minor release inside the window", async () => {
    const fetchMock = stubFetch(fixture("github-releases.json"));
    const items = await githubReleasesAdapter.fetchItems(
      { repo: "ollama/ollama", project: "Ollama" },
      sec("2026-10-09T00:00:00Z")
    );
    expect(items.map((item) => item.title)).toEqual([
      "Ollama v0.41.0",
      "Ollama rust-v0.163.0",
    ]);
    expect(items[0]).toMatchObject({
      url: "https://github.com/ollama/ollama/releases/tag/v0.41.0",
      externalId: "ollama/ollama@v0.41.0",
      summary: expect.stringContaining("New multimodal embeddings"),
    });
    expect(items[0].points).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.github.com/repos/ollama/ollama/releases?per_page=30"
    );
    expect(new Headers(init.headers).get("user-agent")).toBeTruthy();
  });

  it("drops a release published before the window opened", async () => {
    stubFetch(fixture("github-releases.json"));
    const wide = await githubReleasesAdapter.fetchItems(
      { repo: "ollama/ollama", project: "Ollama" },
      sec("2026-08-01T00:00:00Z")
    );
    expect(wide.map((item) => item.title)).toContain("Ollama v0.39.0");
    const narrow = await githubReleasesAdapter.fetchItems(
      { repo: "ollama/ollama", project: "Ollama" },
      sec("2026-10-09T00:00:00Z")
    );
    expect(narrow.map((item) => item.title)).not.toContain("Ollama v0.39.0");
  });

  it("is capped to one item by the registry's flood gate", async () => {
    stubFetch(fixture("github-releases.json"));
    const items = await adapters.githubreleases.fetchItems(
      { repo: "ollama/ollama", project: "Ollama", maxItems: 1 },
      sec("2026-10-09T00:00:00Z")
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Ollama v0.41.0");
  });

  it("throws fetch_failed on a rate-limit 403", async () => {
    stubFetch("rate limited", { status: 403 });
    await expect(
      githubReleasesAdapter.fetchItems({ repo: "ollama/ollama" }, 0)
    ).rejects.toMatchObject({
      name: "SourceFetchError",
      reason: "fetch_failed",
    });
  });

  it("rejects a repo that is not owner/name before any request", async () => {
    const fetchMock = stubFetch("[]");
    await expect(
      githubReleasesAdapter.fetchItems({ repo: "../etc" }, 0)
    ).rejects.toThrow("owner/name");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hfpapers", () => {
  it("caps by upvotes, not by date, and does not report upvotes as engagement", async () => {
    stubFetch(fixture("hf-daily-papers.json"));
    const items = await adapters.hfpapers.fetchItems(
      { maxItems: 2 },
      sec("2026-10-08T12:00:00Z")
    );
    const upvotes = JSON.parse(fixture("hf-daily-papers.json")).map(
      (entry: { paper: { id: string; upvotes: number } }) => entry.paper
    ) as { id: string; upvotes: number }[];
    const expected = upvotes
      .filter((paper) => paper.id !== "2610.00001")
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 2)
      .map((paper) => `https://huggingface.co/papers/${paper.id}`);
    expect(items.map((item) => item.url)).toEqual(expected);
    for (const item of items) {
      expect(item.points).toBeUndefined();
      expect(item.comments).toBeUndefined();
      expect(item.publishedAt).toBe(Date.parse("2026-10-09T00:00:00.000Z"));
    }
  });

  it("leaves out a paper listed before the window even with the most upvotes", async () => {
    stubFetch(fixture("hf-daily-papers.json"));
    const items = await hfPapersAdapter.fetchItems(
      {},
      sec("2026-10-08T12:00:00Z")
    );
    expect(items.map((item) => item.title)).not.toContain("An older paper");
    expect(items).toHaveLength(4);
  });
});

describe("hfmodels", () => {
  it("separates a release from its quantized, adapter, SAE and conversion repos", () => {
    const release = [
      ["Qwen/Qwen3.8-27B", []],
      ["Qwen/Qwen3.8-Flash-Next", []],
      ["Qwen/Qwen3-8B-Base", []],
      ["Qwen/Qwen3-8B", ["base_model:finetune:Qwen/Qwen3-8B-Base"]],
      ["mistralai/Voxtral-Mini-4B-Realtime-Arabic", []],
    ] as const;
    const derivative = [
      ["Qwen/Qwen3.8-27B-FP8", []],
      ["Qwen/Qwen3-ASR-0.6B-hf", []],
      ["Qwen/SAE-Res-Qwen3.5-27B-W80K-L0_50", []],
      ["Qwen/Qwen-Image-Bench", []],
      ["zai-org/GLM-5.3-BF16", []],
      ["deepseek-ai/eagle3_qwen3_8b_ttt7", []],
      ["someone/Model-GGUF", ["gguf"]],
      ["someone/Model", ["base_model:quantized:someone/Base"]],
      ["someone/Model", ["base_model:adapter:someone/Base"]],
      ["someone/Model", ["base_model:merge:someone/Base"]],
    ] as const;
    for (const [id, tags] of release) {
      expect(isReleaseRepo(id, tags), id).toBe(true);
    }
    for (const [id, tags] of derivative) {
      expect(isReleaseRepo(id, tags), id).toBe(false);
    }
  });

  it("turns new organization repos into titled items and skips the noise", async () => {
    const fetchMock = stubFetch(fixture("hf-models-qwen.json"));
    const items = await hfModelsAdapter.fetchItems(
      { author: "Qwen" },
      sec("2026-08-01T00:00:00Z")
    );
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      "https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=30"
    );
    const urls = items.map((item) => item.url);
    expect(urls).toContain("https://huggingface.co/Qwen/Qwen3.8-27B");
    expect(urls).not.toContain("https://huggingface.co/Qwen/Qwen3.8-27B-FP8");
    expect(urls.some((url) => /SAE-Res/.test(url))).toBe(false);
    const flash = items.find((item) => item.url.endsWith("Qwen3.8-Flash-Next"));
    expect(flash?.title).toBe(
      "Qwen3.8-Flash-Next released by Qwen on Hugging Face"
    );
  });

  it("leaves repos created before the window out", async () => {
    stubFetch(fixture("hf-models-qwen.json"));
    const items = await hfModelsAdapter.fetchItems(
      { author: "Qwen" },
      sec("2026-10-01T00:00:00Z")
    );
    expect(items.map((item) => item.title)).toEqual([
      "Qwen-Image-2.1-Turbo released by Qwen on Hugging Face",
    ]);
  });

  it("requires an organization name", async () => {
    await expect(hfModelsAdapter.fetchItems({}, 0)).rejects.toThrow("author");
  });
});

describe("openrouter", () => {
  it("emits only models created since the window opened, and not their :variants", async () => {
    stubFetch(fixture("openrouter-models.json"));
    const items = await openRouterAdapter.fetchItems(
      {},
      sec("2026-10-06T00:00:00Z")
    );
    expect(items.map((item) => item.url)).toEqual([
      "https://openrouter.ai/stepfun/step-5-preview",
      "https://openrouter.ai/anthropic/claude-haiku-5.5",
      "https://openrouter.ai/google/gemini-nano-banana-2.1",
      "https://openrouter.ai/mistralai/mistral-large-4-0",
    ]);
    expect(items[0].title).toBe("StepFun: Step 5 Preview is now on OpenRouter");
    expect(items[0].summary).toContain("Context window: 1,000,000 tokens.");
    expect(items[0].summary).toContain(
      "Price per million tokens: $1 input, $2.7 output."
    );
  });

  it("does not repeat a model once the window has moved past it", async () => {
    stubFetch(fixture("openrouter-models.json"));
    const items = await openRouterAdapter.fetchItems(
      {},
      sec("2026-10-08T00:00:00Z")
    );
    expect(items.map((item) => item.url)).toEqual([
      "https://openrouter.ai/stepfun/step-5-preview",
    ]);
  });

  it("throws parse_failed when the body is not JSON", async () => {
    stubFetch("<html>challenge</html>");
    await expect(openRouterAdapter.fetchItems({}, 0)).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });
});
