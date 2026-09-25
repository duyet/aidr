import handler from "@tanstack/react-start/server-entry";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({
  NewsIngestWorkflow: class {},
}));

const { default: server } = await import("./server");

function fetchLocale(request: Request): Promise<Response> {
  const result = server.fetch(request, {} as Env);
  if (result instanceof Promise) return result;
  return Promise.resolve(result as Response);
}

describe("Worker locale redirects", () => {
  it("normalizes legacy locale before a legacy story path with temporary redirects", async () => {
    const first = await fetchLocale(
      new Request(
        "https://aidr.today/ai/abcdef1234567890?locale=en&utm_source=telegram"
      )
    );
    expect(first.status).toBe(307);
    expect(first.headers.get("Location")).toBe(
      "https://aidr.today/ai/abcdef1234567890?utm_source=telegram&lang=en"
    );
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(first.headers.get("Vary")).toContain("Cookie");
    expect(first.headers.get("Content-Language")).toBe("en");

    const second = await fetchLocale(
      new Request(first.headers.get("Location") ?? "", { redirect: "manual" })
    );
    expect(second.status).toBe(307);
    expect(second.headers.get("Location")).toBe(
      "https://aidr.today/abcdef12?utm_source=telegram&lang=en"
    );
    expect(second.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects repeated, conflicting, and invalid locale values", async () => {
    for (const search of [
      "?lang=en&lang=vi",
      "?lang=en&locale=vi",
      "?lang=fr",
      "?locale=fr",
    ]) {
      const response = await fetchLocale(
        new Request(`https://aidr.today/mcp${search}`)
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vary")).toContain("Accept-Language");
      expect(response.headers.get("Content-Language")).toContain("vi");
    }
    const legacyInvalid = await fetchLocale(
      new Request("https://aidr.today/ai/abcdef1234567890?lang=fr")
    );
    expect(legacyInvalid.status).toBe(400);
    expect(legacyInvalid.headers.get("Cache-Control")).toBe(
      "private, no-store"
    );
  });

  it("uses a temporary header-selected redirect for a bare legacy story", async () => {
    const response = await fetchLocale(
      new Request("https://aidr.today/ai/abcdef1234567890", {
        headers: { cookie: "news_lang=en" },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("strips locale variants from a language-neutral page", async () => {
    const response = await fetchLocale(
      new Request("https://aidr.today/about?lang=vi&tab=about")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://aidr.today/about?tab=about"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Language")).toBe("en");
  });

  it("applies the API locale gate before route middleware", async () => {
    const alias = await fetchLocale(
      new Request("https://aidr.today/api/public?locale=en")
    );
    expect(alias.status).toBe(307);
    expect(alias.headers.get("Location")).toBe(
      "https://aidr.today/api/public?lang=en"
    );
    expect(alias.headers.get("Cache-Control")).toBe("private, no-store");

    const invalid = await fetchLocale(
      new Request("https://aidr.today/api/feed?lang=fr")
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Content-Language")).toBe("en, vi");
    expect(invalid.headers.get("Vary")).toContain("Cookie");
  });

  it("applies the final SSR locale policy to rendered route responses", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    const explicit = await fetchLocale(
      new Request("https://aidr.today/mcp?lang=en")
    );
    expect(explicit.status).toBe(200);
    expect(explicit.headers.get("Content-Language")).toBe("en");
    expect(explicit.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(explicit.headers.get("X-Robots-Tag")).toBe("index, follow");

    const privateRoute = await fetchLocale(
      new Request("https://aidr.today/subscribe?lang=en&settings=secret")
    );
    expect(privateRoute.headers.get("Cache-Control")).toBe("private, no-store");
    expect(privateRoute.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(privateRoute.headers.get("Vary")).toContain("Cookie");
  });
});
