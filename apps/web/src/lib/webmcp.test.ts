import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_DISCOVERY_VERSION } from "./agent-discovery";
import { aiCatalogDocument } from "./ai-catalog";
import {
  boundSearchResult,
  PUBLIC_READ_RESULT_MAX_BYTES,
  type PublicReadSearchResult,
} from "./public-read-results";
import {
  PUBLIC_READ_ANNOTATIONS,
  PUBLIC_READ_TOOL_NAMES,
  PUBLIC_READ_TOOLS,
} from "./public-read-tools";
import { SITE_URL } from "./site";
import {
  formAnnotationAttributes,
  registerWebmcpTools,
  runWebMcpTool,
  WEBMCP_FORM_ANNOTATIONS,
  type WebMcpCapableDocument,
  webmcpContext,
  webmcpForm,
  webmcpToolRegistrations,
} from "./webmcp";

/**
 * The browser half of the shared read-tool contract.
 *
 * The load-bearing test here is `the catalog and the browser registration
 * are the same module`, asserted by IDENTITY (`WEBMCP_TOOLS[i] ===
 * PUBLIC_READ_TOOLS[i]`), not by comparing rendered JSON. Comparing output
 * would let a re-implementation that happens to produce the same bytes
 * pass; identity makes a second list structurally impossible.
 */

function stubDocument(withContext: boolean) {
  const registered: Array<{ name: string }> = [];
  const doc = withContext
    ? {
        modelContext: {
          registerTool(tool: { name: string }) {
            registered.push(tool);
            return tool;
          },
        },
      }
    : {};
  return { doc: doc as WebMcpCapableDocument, registered };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DIGEST = {
  tldr: {
    date: "2026-09-27",
    bullets_en: [
      { text: "A model shipped something faster.", item_ids: ["0031a3a8"] },
    ],
    bullets_vi: [
      { text: "Một mô hình vừa nhanh hơn.", item_ids: ["0031a3a8"] },
    ],
  },
  stories: [
    {
      id: "0031a3a8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      url: "https://example.com/a",
      title: "A model shipped something faster",
      title_vi: null,
      category: "Models",
      image_url: null,
      published_at: 1_700_000_000,
    },
  ],
  updatedAt: 1_700_000_000_000,
};

const FEED = {
  tldr: null,
  days: [
    {
      date: "2026-09-27",
      categoryCounts: { Models: 1 },
      items: [
        {
          id: "0031a3a8",
          url: "https://example.com/a",
          title: "A model shipped something faster",
          title_vi: null,
          summary: "Publisher summary.",
          summary_vi: null,
          category: "Models",
          published_at: 1_700_000_000,
          points: 1,
          comments: 0,
          rank_score: 5,
          source_id: "hn",
          tags: ["models"],
          sources: [],
          llm_tokens: 0,
          image_url: null,
        },
      ],
    },
  ],
  categories: [{ name: "Models", count: 1 }],
  trending: [{ tag: "models", count: 1 }],
  totalStories: 1,
  hasMore: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("module identity: one definition, four consumers", () => {
  it("the WebMCP registration is the contract module, not a copy", async () => {
    const { WEBMCP_TOOLS } = await import("./webmcp");
    expect(WEBMCP_TOOLS).toBe(PUBLIC_READ_TOOLS);
    for (let i = 0; i < PUBLIC_READ_TOOLS.length; i += 1) {
      expect(WEBMCP_TOOLS[i]).toBe(PUBLIC_READ_TOOLS[i]);
    }
  });

  it("the registered registrations carry the contract's own schema object", async () => {
    const { WEBMCP_TOOLS } = await import("./webmcp");
    const registrations = webmcpToolRegistrations();
    expect(registrations).toHaveLength(PUBLIC_READ_TOOLS.length);
    registrations.forEach((registration, index) => {
      const source = WEBMCP_TOOLS[index]!;
      expect(registration.name).toBe(source.name);
      expect(registration.description).toBe(source.description);
      // Same object, not an equal one.
      expect(registration.inputSchema).toBe(source.inputSchema);
      // Annotations are copied so a host mutating them cannot corrupt the
      // catalog, but every value is the contract's.
      expect(registration.annotations).not.toBe(source.annotations);
      expect(registration.annotations).toEqual(source.annotations);
    });
  });

  it("the catalog is derived from the same module", async () => {
    const { WEBMCP_TOOLS } = await import("./webmcp");
    const catalog = aiCatalogDocument() as {
      tools: Array<{ name: string; parameters: unknown; annotations: unknown }>;
    };
    expect(catalog.tools).toHaveLength(WEBMCP_TOOLS.length);
    catalog.tools.forEach((entry, index) => {
      const source = WEBMCP_TOOLS[index]!;
      expect(entry.name).toBe(source.name);
      expect(entry.parameters).toBe(source.inputSchema);
      expect(entry.annotations).toEqual(source.annotations);
    });
  });
});

describe("client-side-only registration", () => {
  it("is a no-op, not a throw, when modelContext is undefined", () => {
    const { doc } = stubDocument(false);
    expect(() => registerWebmcpTools(doc)).not.toThrow();
    expect(registerWebmcpTools(doc)).toBe(0);
  });

  it("is a no-op when modelContext exists but has no registerTool", () => {
    const doc = { modelContext: {} } as unknown as WebMcpCapableDocument;
    expect(registerWebmcpTools(doc)).toBe(0);
    expect(webmcpContext(doc)).toBeNull();
  });

  it("is a no-op with no document at all (the SSR path)", () => {
    // `typeof document === "undefined"` in node: the whole point is that
    // importing or calling this from a server module cannot throw.
    expect(typeof document).toBe("undefined");
    expect(() => registerWebmcpTools()).not.toThrow();
    expect(registerWebmcpTools()).toBe(0);
    expect(webmcpContext()).toBeNull();
  });

  it("registers all four tools with the read-only annotations", () => {
    const { doc, registered } = stubDocument(true);
    expect(registerWebmcpTools(doc)).toBe(4);
    expect(registered.map((tool) => tool.name)).toEqual([
      ...PUBLIC_READ_TOOL_NAMES,
    ]);
  });

  it("survives one tool being rejected by the bridge", () => {
    let calls = 0;
    const doc = {
      modelContext: {
        registerTool() {
          calls += 1;
          if (calls === 1) throw new Error("bridge rejected this schema");
          return null;
        },
      },
    } as unknown as WebMcpCapableDocument;
    expect(registerWebmcpTools(doc)).toBe(3);
  });

  it("never references the Cloudflare bridge script", () => {
    // /.webmcp/bridge.js is Cloudflare-injected. Vendoring or awaiting it
    // would put 14KB on our critical path and break without the zone
    // config. Asserted against the source so it cannot creep back in.
    const source = webmcpContext.toString();
    expect(source).not.toContain("bridge.js");
  });
});

describe("tool execution validates before it fetches", () => {
  it("rejects an out-of-enum lang with no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runWebMcpTool("latest_ai_news", { lang: "fr" });
    expect(result).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects out-of-range days, an unknown category, and a bad before", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const args of [
      { days: 0 },
      { days: 15 },
      { days: 2.5 },
      { category: "Nope" },
      { before: "2026-02-30" },
      { q: "a".repeat(201) },
    ]) {
      const result = await runWebMcpTool("search_news", args);
      expect(result).toMatchObject({ ok: false });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-hex story id with no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const id of ["0031a3a", "0031a3ag", "0031A3A8", "../../etc/passwd"]) {
      const result = await runWebMcpTool("get_story", { id });
      expect(result).toMatchObject({ ok: false });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects non-object arguments", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await runWebMcpTool("get_ai_digest", "en")).toMatchObject({
      ok: false,
    });
    expect(await runWebMcpTool("get_ai_digest", ["en"])).toMatchObject({
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("tool execution hits the public endpoints", () => {
  it("latest_ai_news reads /api/public with the explicit lang", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(DIGEST));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runWebMcpTool("latest_ai_news", { lang: "vi" });
    expect(result).toMatchObject({ ok: true });
    const [path, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(path).toBe("/api/public?lang=vi");
    expect(init.credentials).toBe("same-origin");
  });

  it("get_ai_digest projects the same bullets the MCP tool returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(DIGEST))
    );
    const result = await runWebMcpTool("get_ai_digest", { lang: "en" });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("unreachable");
    expect(
      (result.value as { bullets: Array<{ text: string }> }).bullets[0]
    ).toMatchObject({
      text: "A model shipped something faster.",
      permalink: "https://aidr.today/0031a3a8?lang=en",
    });
  });

  it("search_news builds the query with URLSearchParams, never interpolation", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(FEED));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runWebMcpTool("search_news", {
      q: "a&b=c#frag",
      days: 7,
      category: "Models",
      lang: "en",
    });
    expect(result).toMatchObject({ ok: true });
    const [path] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(path).toBe(
      "/api/feed?lang=en&q=a%26b%3Dc%23frag&days=7&category=Models"
    );
    // The hostile value stayed a value: it did not add a parameter.
    const url = new URL(path, SITE_URL);
    expect([...url.searchParams.keys()]).toEqual([
      "lang",
      "q",
      "days",
      "category",
    ]);
  });

  it("get_story reads the bounded Markdown endpoint", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response('---\nformat: "aidr-story-markdown/v1"\n---\n', {
          status: 200,
          headers: { "content-type": "text/markdown" },
        })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runWebMcpTool("get_story", {
      id: "0031a3a8",
      lang: "vi",
    });
    expect(result).toMatchObject({ ok: true });
    const [path, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(path).toBe("/api/story/0031a3a8.md?lang=vi");
    expect((init.headers as Record<string, string>).accept).toBe(
      "text/markdown"
    );
  });

  it("surfaces the endpoint's 409 ambiguity as an error, never a guess", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 409 }))
    );
    const result = await runWebMcpTool("get_story", { id: "0031a3a8" });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/ambiguous story id/);
  });

  it("refuses a payload that exceeds the public read bound", async () => {
    const oversized = "x".repeat(PUBLIC_READ_RESULT_MAX_BYTES + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(oversized))
    );
    const result = await runWebMcpTool("latest_ai_news", {});
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/exceeded the public read bound/);
  });

  it("bounds a hostile search payload at the shared layer, newest first", () => {
    // Deliberately a unit test of `boundSearchResult`, not of `execute`:
    // `fetchJson` refuses an over-bound RESPONSE outright (asserted above),
    // so a body this large never reaches the projection. The bounding step
    // guards the case where the endpoint is within the byte cap but its
    // projection is not.
    //
    // The 4,000-item shape is also a performance regression test: the
    // original pop-and-re-measure loop cost 4,000 serializations of a
    // ~16 MB string, which is a denial of service caused by the code that
    // exists to prevent one.
    const hostile: PublicReadSearchResult = {
      lang: "en",
      available_langs: ["en", "vi"],
      days: Array.from({ length: 4000 }, (_, day) => ({
        date: "2026-09-27",
        items: [
          {
            id: `${day}`.padStart(8, "0"),
            url: "https://example.com/x",
            title: `story ${day}`,
            title_vi: null,
            summary: "s".repeat(4000),
            summary_vi: null,
            category: "Models",
            tags: [],
            published_at: 1_700_000_000,
            rank_score: 1,
            permalink: `https://aidr.today/${`${day}`.padStart(8, "0")}?lang=en`,
          },
        ],
      })),
      categories: [{ name: "Models", count: 4000 }],
      trending: [{ tag: "models", count: 4000 }],
      totalStories: 4000,
      hasMore: false,
      truncated: false,
    };
    const started = Date.now();
    const bounded = boundSearchResult(hostile);
    const elapsed = Date.now() - started;
    expect(bounded.ok).toBe(true);
    if (!bounded.ok) throw new Error("unreachable");
    expect(bounded.value.truncated).toBe(true);
    expect(bounded.value.days.flatMap((day) => day.items).length).toBeLessThan(
      4000
    );
    expect(
      new TextEncoder().encode(JSON.stringify(bounded.value)).byteLength
    ).toBeLessThanOrEqual(PUBLIC_READ_RESULT_MAX_BYTES);
    // A PREFIX survives, not an arbitrary slice: `days` is newest-first
    // (that is the order `groupByDay` produces), so keeping the prefix
    // keeps the newest stories and drops the oldest tail.
    const kept = bounded.value.days
      .flatMap((day) => day.items)
      .map((i) => i.id);
    expect(kept[0]).toBe("00000000");
    expect(kept).toEqual(
      Array.from({ length: kept.length }, (_, index) =>
        `${index}`.padStart(8, "0")
      )
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it("does not leak internals when the endpoint errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );
    const result = await runWebMcpTool("latest_ai_news", {});
    expect(result).toEqual({ ok: false, error: "the read failed (HTTP 500)." });
  });
});

describe("ai-catalog.json", () => {
  it("describes the registered tools with schemas and annotations", () => {
    const catalog = aiCatalogDocument() as Record<string, unknown> & {
      tools: Array<Record<string, unknown>>;
      forms: Array<Record<string, unknown>>;
      transport: Record<string, unknown>;
      trust: { untrustedContent: boolean };
    };
    expect(catalog.version).toBe("1.0.0");
    expect(catalog.discoveryVersion).toBe(AGENT_DISCOVERY_VERSION);
    expect(catalog.url).toBe(SITE_URL);
    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      ...PUBLIC_READ_TOOL_NAMES,
    ]);
    for (const tool of catalog.tools) {
      expect(tool.annotations).toEqual(PUBLIC_READ_ANNOTATIONS);
      expect(tool.auth).toBe("none");
      expect(
        (tool.parameters as { additionalProperties: boolean })
          .additionalProperties
      ).toBe(false);
      expect(String(tool.restPath).startsWith(SITE_URL)).toBe(true);
    }
    expect(catalog.transport.type).toBe("webmcp");
    expect(catalog.trust.untrustedContent).toBe(true);
    expect(catalog.forms.length).toBeGreaterThanOrEqual(2);
  });

  it("is a valid JSON-serializable document", () => {
    const round = JSON.parse(JSON.stringify(aiCatalogDocument()));
    expect(round.tools).toHaveLength(4);
    // No undefined leaking into the wire format.
    expect(JSON.stringify(round)).not.toContain("undefined");
  });

  it("exposes the submit and subscribe forms and refuses the credential ones", () => {
    const catalog = aiCatalogDocument() as {
      forms: Array<{
        id: string;
        agentCallable: boolean;
        annotations: Record<string, boolean>;
      }>;
    };
    const byId = new Map(catalog.forms.map((form) => [form.id, form]));
    for (const id of ["submit-story", "subscribe-email"]) {
      const form = byId.get(id);
      expect(form).toBeTruthy();
      expect(form!.agentCallable).toBe(true);
      // A form that publishes or subscribes is consequential, not read-only.
      expect(form!.annotations.consequentialHint).toBe(true);
      expect(form!.annotations.readOnlyHint).toBe(false);
    }
    // The credential form is declared as NOT callable, with a reason, so
    // a reader sees the decision rather than a silent gap.
    const signIn = byId.get("sign-in");
    expect(signIn?.agentCallable).toBe(false);
    expect(JSON.stringify(signIn)).toMatch(/credential-harvesting/);
    expect(byId.get("story-suggest")?.agentCallable).toBe(false);
  });
});

describe("form annotations", () => {
  it("no form annotation ever declares a write-capable credential schema", () => {
    for (const form of WEBMCP_FORM_ANNOTATIONS) {
      const properties = Object.keys(
        (form.inputSchema as { properties?: object }).properties ?? {}
      ).map((key) => key.toLowerCase());
      for (const forbidden of ["password", "token", "secret", "otp", "code"]) {
        expect(properties).not.toContain(forbidden);
      }
      // Only the two agent-callable forms may have a real schema; the rest
      // are declarations of a decision, not an invitation.
      if (!form.agentCallable) {
        expect(properties).toEqual([]);
        expect(form.reason).toBeTruthy();
      }
    }
  });

  it("annotates submit and subscribe, and states why sign-in is not", () => {
    expect(webmcpForm("submit-story").agentCallable).toBe(true);
    expect(webmcpForm("subscribe-email").agentCallable).toBe(true);
    expect(webmcpForm("sign-in").agentCallable).toBe(false);
    expect(() => webmcpForm("nope")).toThrow();
  });

  it("emits inert data attributes, never behaviour", () => {
    const attributes = formAnnotationAttributes(webmcpForm("submit-story"));
    expect(attributes["data-webmcp-form"]).toBe("submit-story");
    expect(attributes["data-webmcp-tool"]).toBe("submit_story");
    expect(attributes["data-webmcp-agent-callable"]).toBe("true");
    expect(JSON.parse(attributes["data-webmcp-annotations"] as string)).toEqual(
      webmcpForm("submit-story").annotations
    );
    // No handler, no URL, no attribute a browser would act on.
    for (const key of Object.keys(attributes)) {
      expect(key.startsWith("data-")).toBe(true);
    }
  });
});
