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

function streamed(bytes: Uint8Array, cuts: number[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      let from = 0;
      for (const cut of cuts) {
        c.enqueue(bytes.slice(from, cut));
        from = cut;
      }
      c.enqueue(bytes.slice(from));
      c.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/html" } });
}

describe("withSsrHead cuts the head at the raw `</head>` bytes", () => {
  const enc = new TextEncoder();
  const HEAD = "<html><head><title>t</title></head>";
  const BODY = new Uint8Array([0xff, ...enc.encode("<body>x</body></html>")]);

  // A search of the newest chunk alone misses a tag split between chunks
  // and ships the page without the boot script.
  it("rewrites the head when `</head>` is split at any byte", async () => {
    const page = `<!DOCTYPE html><html><head><title>Tin tức</title></head><body><p>Đọc</p></body></html>`;
    const bytes = enc.encode(page);
    const tag = enc.encode(page.slice(0, page.indexOf("</head>"))).byteLength;
    for (let at = tag; at <= tag + "</head>".length; at++) {
      const res = withSsrHead(
        new Request("https://aidr.today/01234567"),
        streamed(bytes, [tag - 3, at]),
        undefined
      );
      expect(await res.text(), `split at ${at - tag}`).toBe(
        withBootScriptFirst(page)
      );
    }
  });

  // 0xff is not UTF-8, so a decode and re-encode of the body turns it into
  // U+FFFD.
  it("forwards a non-UTF-8 byte after `</head>` raw", async () => {
    const head = "<!DOCTYPE html><html><head><title>t</title></head>";
    const bytes = new Uint8Array([
      ...enc.encode(`${head}<body>`),
      0xff,
      ...enc.encode("</body></html>"),
    ]);
    const res = withSsrHead(
      new Request("https://aidr.today/01234567"),
      streamed(bytes, [head.length - 2, head.length + 3]),
      undefined
    );
    const out = new Uint8Array(await res.arrayBuffer());
    const rewritten = enc.encode(withBootScriptFirst(head));
    expect(out.subarray(0, rewritten.byteLength)).toEqual(rewritten);
    expect(out.subarray(rewritten.byteLength)).toEqual(
      bytes.subarray(head.length)
    );
  });

  // Head bytes whose decoded text re-encodes to a different length: a BOM
  // (3 bytes, dropped by a default decoder) and a byte that is not UTF-8
  // (1 byte, re-encoded as the 3-byte U+FFFD). A cut measured by
  // re-encoding the head repeats, drops, or re-encodes body bytes; the
  // 0xff that opens the body catches the last.
  it.each([
    ["a BOM", [0xef, 0xbb, 0xbf], "\uFEFF"],
    ["a non-UTF-8 byte in the head", [0xff], "\uFFFD"],
  ])("never repeats or drops body bytes after %s", async (_, raw, text) => {
    const head = enc.encode(HEAD);
    const bytes = new Uint8Array([...raw, ...head, ...BODY]);
    const res = withSsrHead(
      new Request("https://aidr.today/01234567"),
      streamed(bytes, [raw.length + 4]),
      undefined
    );
    const out = new Uint8Array(await res.arrayBuffer());
    expect(out).toEqual(
      new Uint8Array([
        ...enc.encode(withBootScriptFirst(`${text}${HEAD}`)),
        ...BODY,
      ])
    );
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
