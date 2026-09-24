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

  it("uses the first repeated value and cookie fallback", async () => {
    const repeated = await renderPreview(
      "/api/subscribe/preview?lang=en&lang=vi"
    );
    expect(repeated.headers.get("Content-Language")).toBe("en");

    const cookie = await renderPreview("/api/subscribe/preview", {
      cookie: "news_lang=en",
    });
    expect(cookie.headers.get("Content-Language")).toBe("en");
    expect(cookie.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("falls back to Vietnamese for unsupported and legacy values", async () => {
    const invalid = await renderPreview("/api/subscribe/preview?lang=fr");
    expect(invalid.headers.get("Content-Language")).toBe("vi");
    expect(invalid.headers.get("Cache-Control")).toBe("private, no-store");

    const legacy = await renderPreview("/api/subscribe/preview?locale=en");
    expect(legacy.headers.get("Content-Language")).toBe("en");
    expect(legacy.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
