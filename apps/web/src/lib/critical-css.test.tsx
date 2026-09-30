/**
 * Issue #229: the first paint must not wait for the full stylesheet, and the
 * AI;DR rows must not change height when it arrives. These tests pin both,
 * plus the one way critical CSS goes wrong quietly: its copy of the design
 * tokens drifting from styles.css.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TldrBulletList } from "../components/TldrBulletList";
import { parseAidrLayout } from "./aidr-layout";
import {
  CRITICAL_CSS,
  inlineCriticalCss,
  withCriticalCss,
  withHomepageCriticalCss,
} from "./critical-css";
import type { TldrBullet } from "./types";

const HREF = "/assets/styles-AbC123.css";
const HEAD = `<head><meta charSet="utf-8"/><title>t</title><link rel="stylesheet" href="${HREF}" crossorigin=""/><link rel="icon" href="/favicon.svg"/></head>`;

describe("inlineCriticalCss", () => {
  const out = inlineCriticalCss(HEAD);

  it("inlines the critical CSS in the head", () => {
    expect(out).toContain(`<style data-critical-css>${CRITICAL_CSS}</style>`);
    expect(CRITICAL_CSS).toContain(".aidr-row");
    expect(CRITICAL_CSS).not.toContain("/*");
  });

  it("loads the full stylesheet without blocking render", () => {
    expect(out).not.toMatch(/<link[^>]*rel="stylesheet"[^>]*>(?!<\/noscript>)/);
    expect(out).toContain(
      `<link rel="preload" as="style" href="${HREF}" crossorigin="" onload="this.onload=null;this.rel='stylesheet'"/>`
    );
  });

  it("keeps the stylesheet reachable without JavaScript", () => {
    expect(out).toContain(
      `<noscript><link rel="stylesheet" href="${HREF}" crossorigin=""/></noscript>`
    );
  });

  it("puts the inline style before the preload so it wins the first paint", () => {
    expect(out.indexOf("<style data-critical-css>")).toBeLessThan(
      out.indexOf('rel="preload"')
    );
  });

  it("leaves a head with no stylesheet link, or a third-party one, alone", () => {
    const dev = "<head><title>t</title></head>";
    expect(inlineCriticalCss(dev)).toBe(dev);
    const cdn = `<head><link rel="stylesheet" href="https://cdn.example/x.css"/></head>`;
    expect(inlineCriticalCss(cdn)).toBe(cdn);
  });
});

async function drain(res: Response): Promise<string> {
  return await res.text();
}

function htmlResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": "9",
    },
  });
}

describe("withCriticalCss", () => {
  it("rewrites a head that is split across chunks and keeps the body intact", async () => {
    const body = "<body><ol><li>row</li></ol></body></html>";
    const res = withCriticalCss(
      htmlResponse([
        HEAD.slice(0, 40),
        HEAD.slice(40, 90),
        HEAD.slice(90) + body,
      ])
    );
    const text = await drain(res);
    expect(text).toContain("<style data-critical-css>");
    expect(text).toContain('rel="preload"');
    expect(text.endsWith(body)).toBe(true);
    expect(res.headers.get("Content-Length")).toBeNull();
  });

  it("does not split a multi-byte character across chunks", async () => {
    const bytes = new TextEncoder().encode(`${HEAD}<body>Tìm kiếm</body>`);
    const cut = bytes.indexOf(0xe1) + 1; // inside the 3-byte "ế"/"ì" sequence
    const res = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes.slice(0, cut));
          c.enqueue(bytes.slice(cut));
          c.close();
        },
      }),
      { headers: { "Content-Type": "text/html" } }
    );
    expect(await drain(withCriticalCss(res))).toContain("Tìm kiếm");
  });

  it("passes non-HTML responses through untouched", () => {
    const json = new Response("{}", {
      headers: { "Content-Type": "application/json" },
    });
    expect(withCriticalCss(json)).toBe(json);
  });

  it("only applies to the homepage", async () => {
    const other = await drain(
      withHomepageCriticalCss(
        new Request("https://aidr.today/about"),
        htmlResponse([HEAD])
      )
    );
    expect(other).not.toContain("data-critical-css");
    const home = await drain(
      withHomepageCriticalCss(
        new Request("https://aidr.today/?lang=vi"),
        htmlResponse([HEAD])
      )
    );
    expect(home).toContain("data-critical-css");
  });
});

describe("critical CSS tokens match styles.css", () => {
  const styles = readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8"
  );
  const block = (selector: RegExp, css: string): string =>
    css.match(selector)?.[0] ?? "";
  const light = block(/:root \{[\s\S]*?\n\}/, styles);
  const dark = block(/\.dark \{[\s\S]*?\n\}/, styles);
  const token = (css: string, name: string): string | undefined =>
    new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  const normalize = (v: string | undefined): string | undefined =>
    v
      ?.replace(/\s*,\s*/g, ",")
      .replace(/\s+/g, " ")
      .replace(/#fff\b/, "#ffffff");

  const criticalLight = block(/:root\{[^}]*\}/, CRITICAL_CSS);
  const criticalDark = block(/:root\.dark,\.dark\{[^}]*\}/, CRITICAL_CSS);
  const critToken = (css: string, name: string): string | undefined =>
    new RegExp(`--${name}:([^;}]+)`).exec(css)?.[1]?.trim();

  it.each(["background", "foreground", "card", "border", "muted-foreground"])(
    "--%s is identical in light and dark",
    (name) => {
      expect(normalize(critToken(criticalLight, name))).toBe(
        normalize(token(light, name))
      );
      expect(normalize(critToken(criticalDark, name))).toBe(
        normalize(token(dark, name))
      );
    }
  );

  it("uses the same body font stack", () => {
    expect(normalize(critToken(criticalLight, "content-font-sans"))).toBe(
      normalize(token(light, "content-font-sans"))
    );
  });
});

describe("AI;DR rows reserve their height (no re-wrap shift)", () => {
  const bullet = (text: string): TldrBullet => ({
    text,
    item_ids: ["071a284c0011223344556677"],
    image_url: null,
  });
  const render = (texts: string[]): string =>
    renderToStaticMarkup(
      <TldrBulletList
        shown={texts.map(bullet)}
        mid={texts.length}
        layout={parseAidrLayout(undefined)}
        numbered
        lang="vi"
      />
    );

  it("gives every row a fixed two-line height, not a minimum", () => {
    const html = render(["Ngắn", "Một dòng rất dài ".repeat(20)]);
    const rows = html.match(/class="aidr-row [^"]*"/g) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toContain("h-[2lh]");
      expect(row).not.toContain("min-h-[2lh]");
    }
  });

  it("gives the row the same height in the critical CSS as in Tailwind", () => {
    expect(CRITICAL_CSS).toMatch(/\.aidr-row\{[^}]*height:2lh/);
    expect(CRITICAL_CSS).toMatch(/\.aidr-row-copy\{[^}]*-webkit-line-clamp:2/);
  });

  it("reserves the thumbnail box with intrinsic dimensions", () => {
    const html = render(["Tiêu đề"]);
    expect(html).toMatch(/<img[^>]*width="48"[^>]*height="48"/);
  });
});
