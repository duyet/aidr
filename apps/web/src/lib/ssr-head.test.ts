import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInlinedSheets } from "./inline-stylesheet";
import { withBootScriptFirst, withSsrHead } from "./ssr-head";

const HREF = "/assets/index-Abc123.css";
const CSS = ".a{color:red}@font-face{font-family:X;font-display:optional}";
const LINK = `<link rel="stylesheet" href="${HREF}" data-precedence="default"/>`;
const PAGE = `<!DOCTYPE html><html><head><meta charSet="utf-8"/>${LINK}<title>t</title></head><body><main>hi</main></body></html>`;

function assets(body: string, type = "text/css", status = 200) {
  return {
    fetch: vi.fn(
      async () =>
        new Response(body, { status, headers: { "Content-Type": type } })
    ),
  };
}

function html(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function render(path: string, a: ReturnType<typeof assets>) {
  const res = withSsrHead(
    new Request(`https://aidr.today${path}`),
    html(PAGE),
    a
  );
  return res.text();
}

afterEach(() => clearInlinedSheets());

describe("withSsrHead inlines the homepage stylesheet", () => {
  it("inlines the built sheet on the homepage so first paint needs no CSS request", async () => {
    const out = await render("/?lang=vi", assets(CSS));
    expect(out).toContain(`<style>${CSS}</style>`);
    // The style comes before the rest of the head and the body is intact.
    expect(out.indexOf("<style>")).toBeLessThan(out.indexOf("<title>"));
    expect(out).toContain("<body><main>hi</main></body>");
  });

  it("keeps React's link but switched off, so hydration does not re-add the sheet and swap fonts", async () => {
    const out = await render("/", assets(CSS));
    expect(out).toContain(
      `<link rel="stylesheet" href="${HREF}" data-precedence="default" media="not all"/>`
    );
    expect(out).not.toContain(LINK);
  });

  it("leaves other routes on the cacheable blocking link", async () => {
    const a = assets(CSS);
    const out = await render("/about", a);
    expect(out).toBe(withBootScriptFirst(PAGE));
    expect(a.fetch).not.toHaveBeenCalled();
  });

  it("leaves the link alone when the sheet cannot be read", async () => {
    expect(await render("/", assets("nope", "text/css", 404))).toBe(
      withBootScriptFirst(PAGE)
    );
    // SPA fallback: index.html for a missing asset must never be inlined.
    expect(await render("/", assets("<html></html>", "text/html"))).toBe(
      withBootScriptFirst(PAGE)
    );
  });

  it("fetches a hashed sheet once per isolate", async () => {
    const a = assets(CSS);
    await Promise.all([render("/", a), render("/", a)]);
    await render("/", a);
    expect(a.fetch).toHaveBeenCalledTimes(1);
  });

  it("passes non-HTML responses through", () => {
    const json = new Response("{}", {
      headers: { "Content-Type": "application/json" },
    });
    const res = withSsrHead(
      new Request("https://aidr.today/"),
      json,
      assets(CSS)
    );
    expect(res).toBe(json);
  });

  it("handles a head split across chunks", async () => {
    const enc = new TextEncoder();
    const cut = PAGE.indexOf("stylesheet");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(PAGE.slice(0, cut)));
        c.enqueue(enc.encode(PAGE.slice(cut)));
        c.close();
      },
    });
    const res = withSsrHead(
      new Request("https://aidr.today/"),
      new Response(body, { headers: { "Content-Type": "text/html" } }),
      assets(CSS)
    );
    expect(await res.text()).toContain(`<style>${CSS}</style>`);
  });

  // Bytes after </head> are forwarded as they arrive. A decode/re-encode
  // of a chunk that ends mid-character would ship U+FFFD; a head cut at
  // a character index rather than a byte offset would drop or repeat
  // bytes around a multibyte title.
  it("forwards body bytes untouched when chunks split multibyte characters", async () => {
    const enc = new TextEncoder();
    const page = `<!DOCTYPE html><html><head><title>Tin tức</title></head><body><p>Đọc tiếp — ngày mới</p></body></html>`;
    const bytes = enc.encode(page);
    const headEnd = page.indexOf("</head>") + "</head>".length;
    const headBytes = enc.encode(page.slice(0, headEnd)).byteLength;
    const tuBytes = enc.encode(page.slice(0, page.indexOf("ức"))).byteLength;
    const docBytes = enc.encode(page.slice(0, page.indexOf("ọc"))).byteLength;
    const cuts = [tuBytes + 1, headBytes + 3, docBytes + 1, docBytes + 2];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        let from = 0;
        for (const cut of cuts) {
          c.enqueue(bytes.subarray(from, cut));
          from = cut;
        }
        c.enqueue(bytes.subarray(from));
        c.close();
      },
    });
    const res = withSsrHead(
      new Request("https://aidr.today/01234567"),
      new Response(body, { headers: { "Content-Type": "text/html" } }),
      undefined
    );
    expect(await res.text()).toBe(withBootScriptFirst(page));
  });
});

describe("withSsrHead leaves API responses alone", () => {
  it("passes /api/* HTML through byte for byte, with no boot script", async () => {
    // 0xff is not valid UTF-8: a decode/encode pass would turn it into U+FFFD.
    const enc = new TextEncoder();
    const bytes = new Uint8Array([
      ...enc.encode("<html><head></head><body>"),
      0xff,
      ...enc.encode("</body></html>"),
    ]);
    const res = withSsrHead(
      new Request("https://aidr.today/api/subscribe/preview?lang=en"),
      new Response(bytes, { headers: { "Content-Type": "text/html" } }),
      assets(CSS)
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });
});
