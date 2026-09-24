import { describe, expect, it } from "vitest";
import { Route as PreviewRoute } from "./api/subscribe.preview";

type PreviewHandler = (args: {
  request: Request;
  context: unknown;
}) => Promise<Response>;

const preview = (
  PreviewRoute.options.server as unknown as {
    handlers: { GET: PreviewHandler };
  }
).handlers.GET;

async function renderPreview(
  url: string,
  headers?: HeadersInit
): Promise<Response> {
  return preview({
    request: new Request(`https://aidr.today${url}`, { headers }),
    context: {},
  });
}

describe("subscribe preview locale route", () => {
  it("renders explicit English and Vietnamese previews", async () => {
    const en = await renderPreview("/api/subscribe/preview?lang=en");
    expect(en.headers.get("Content-Language")).toBe("en");
    expect(await en.text()).toContain("first digest is still being prepared");
    expect(en.headers.get("Cache-Control")).toContain("public");

    const vi = await renderPreview("/api/subscribe/preview?lang=vi");
    expect(vi.headers.get("Content-Language")).toBe("vi");
    expect(await vi.text()).toContain("Bản tin đầu tiên đang được chuẩn bị");
  });

  it("rejects repeated values and keeps cookie-selected previews private", async () => {
    const repeated = await renderPreview(
      "/api/subscribe/preview?lang=en&lang=vi"
    );
    expect(repeated.status).toBe(400);
    expect(repeated.headers.get("Content-Language")).toBe("en, vi");
    expect(repeated.headers.get("Cache-Control")).toBe("private, no-store");

    const cookie = await renderPreview("/api/subscribe/preview", {
      cookie: "news_lang=en",
    });
    expect(cookie.headers.get("Content-Language")).toBe("en");
    expect(cookie.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects invalid values and redirects one legacy alias", async () => {
    const invalid = await renderPreview("/api/subscribe/preview?lang=fr");
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Content-Language")).toBe("en, vi");
    expect(invalid.headers.get("Cache-Control")).toBe("private, no-store");

    const legacy = await renderPreview("/api/subscribe/preview?locale=en");
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get("Location")).toBe(
      "https://aidr.today/api/subscribe/preview?lang=en"
    );
    expect(legacy.headers.get("Cache-Control")).toBe("private, no-store");
    expect(legacy.headers.get("Vary")).toContain("Cookie");
  });
});
