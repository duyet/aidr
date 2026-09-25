import { describe, expect, it } from "vitest";
import { Route as FeedRoute } from "./api/feed";
import { Route as PublicRoute } from "./api/public";
import { Route as StoryRoute } from "./api/story.$id";

type Handler = (args: {
  request: Request;
  context: unknown;
  params?: Record<string, string>;
}) => Promise<Response>;

function handler(route: unknown): Handler {
  return (route as { options: { server: { handlers: { GET: Handler } } } })
    .options.server.handlers.GET;
}

async function call(
  route: unknown,
  url: string,
  params: Record<string, string> = {}
): Promise<Response> {
  return handler(route)({
    request: new Request(`https://aidr.today${url}`),
    context: {},
    params,
  });
}

describe("public API locale contract", () => {
  it("normalizes legacy aliases and rejects malformed locale values", async () => {
    const legacy = await call(PublicRoute, "/api/public?locale=en");
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get("Location")).toBe(
      "https://aidr.today/api/public?lang=en"
    );
    expect(legacy.headers.get("Cache-Control")).toBe("private, no-store");

    const invalidCases = [
      [PublicRoute, "/api/public?lang=fr"],
      [FeedRoute, "/api/feed?lang=fr"],
      [StoryRoute, "/api/story/abcdef12?lang=fr"],
    ] as const;
    for (const [route, url] of invalidCases) {
      const invalid = await call(route, url);
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get("Content-Language")).toBe("en, vi");
      expect(invalid.headers.get("Vary")).toContain("Cookie");
    }
  });

  it("keeps bilingual API errors private even without a D1 binding", async () => {
    const publicResponse = await call(PublicRoute, "/api/public?lang=en");
    expect(publicResponse.status).toBe(503);
    expect(publicResponse.headers.get("Content-Language")).toBe("en, vi");
    expect(publicResponse.headers.get("Cache-Control")).toBe(
      "private, no-store"
    );

    const feedResponse = await call(FeedRoute, "/api/feed?lang=vi");
    expect(feedResponse.status).toBe(500);
    expect(feedResponse.headers.get("Content-Language")).toBe("en, vi");
    expect(feedResponse.headers.get("Vary")).toContain("Accept-Language");
  });

  it("routes story locale normalization before the database lookup", async () => {
    const response = await call(StoryRoute, "/api/story/abcdef12?locale=en", {
      id: "abcdef12",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://aidr.today/api/story/abcdef12?lang=en"
    );
  });
});
