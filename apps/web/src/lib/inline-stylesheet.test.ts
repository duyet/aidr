import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearInlinedSheets,
  withHomepageInlineStylesheets,
} from "./inline-stylesheet";

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
  const res = withHomepageInlineStylesheets(
    new Request(`https://aidr.today${path}`),
    html(PAGE),
    a
  );
  return res.text();
}

afterEach(() => clearInlinedSheets());

describe("withHomepageInlineStylesheets", () => {
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
    expect(out).toBe(PAGE);
    expect(a.fetch).not.toHaveBeenCalled();
  });

  it("leaves the link alone when the sheet cannot be read", async () => {
    expect(await render("/", assets("nope", "text/css", 404))).toBe(PAGE);
    // SPA fallback: index.html for a missing asset must never be inlined.
    expect(await render("/", assets("<html></html>", "text/html"))).toBe(PAGE);
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
    const res = withHomepageInlineStylesheets(
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
    const res = withHomepageInlineStylesheets(
      new Request("https://aidr.today/"),
      new Response(body, { headers: { "Content-Type": "text/html" } }),
      assets(CSS)
    );
    expect(await res.text()).toContain(`<style>${CSS}</style>`);
  });
});
