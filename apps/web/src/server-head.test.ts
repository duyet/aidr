/**
 * The URL privacy boot script has to run before any analytics script can
 * read the page URL. Cloudflare's edge inserts the Google tag gateway (an
 * async gtag.js loader) right after the literal `<head>` of whatever the
 * Worker returns, and React puts its stylesheets at the top of <head>. A
 * pending stylesheet delays inline scripts but not async ones, so the boot
 * script must come before both in the bytes the browser parses.
 */
import handler from "@tanstack/react-start/server-entry";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";
import { URL_PRIVACY_BOOT_SCRIPT } from "./lib/analytics/url-privacy";

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

/** React's SSR shape: hoisted metas and stylesheets first in <head>. */
const REACT_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><link rel="stylesheet" href="/assets/index-Abc123.css" data-precedence="default"/><title>Get AI;DR</title></head><body><main>hi</main><script type="module" async="" src="/assets/index-Def456.js"></script></body></html>`;

/** What the edge inserts after the literal <head> (seen on aidr.today). */
const GATEWAY = `<script async src="/hello/"></script><script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-22PGCY4GEG');</script>`;

function cloudflareEdge(html: string): string {
  return html.replace("<head>", `<head>${GATEWAY}`);
}

async function page(path: string): Promise<string> {
  const response = await server.fetch(
    new Request(`https://aidr.today${path}`, {
      headers: { Accept: "text/html" },
    }),
    {} as Env
  );
  expect(response.headers.get("content-type")).toContain("text/html");
  return cloudflareEdge(await response.text());
}

beforeEach(() => {
  vi.mocked(handler.fetch).mockReset();
  vi.mocked(handler.fetch).mockImplementation(
    async () =>
      new Response(REACT_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
  );
});

describe("the URL privacy boot script runs before any other script", () => {
  for (const path of [
    "/subscribe?settings=SECRET&lang=en",
    "/subscribe?lang=en",
    "/about",
  ]) {
    it(path, async () => {
      const html = await page(path);
      const boot = html.indexOf(`<script>${URL_PRIVACY_BOOT_SCRIPT}</script>`);
      expect(boot).toBeGreaterThan(-1);
      expect(html.split(URL_PRIVACY_BOOT_SCRIPT)).toHaveLength(2);
      for (const later of [
        'src="/hello/"',
        "gtag('config'",
        'rel="stylesheet"',
        '<script type="module"',
      ]) {
        expect(boot, later).toBeLessThan(html.indexOf(later));
      }
      // Ahead of the <head> tag, so ahead of anything inserted after it.
      expect(boot).toBeLessThan(html.indexOf("<head>"));
      expect(html).toContain("<body><main>hi</main>");
    });
  }
});
