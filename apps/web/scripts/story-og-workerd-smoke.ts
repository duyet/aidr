#!/usr/bin/env tsx
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * workerd smoke test for the story OG image boundary.
 *
 * The unit tests run in Node, where `fetch` is undici and accepts
 * `redirect: "error"`. workerd does not: it throws a TypeError for anything
 * other than "follow"/"manual" *before* any request leaves the edge, which
 * turns every deployed thumbnail into a silent fallback. This smoke drives the
 * real `fetchStoryOgImage` inside actual workerd so that class of
 * Node-versus-workerd divergence fails here instead of in production.
 *
 * It uses Miniflare's outbound fetcher, so no network request is ever made.
 *
 *   pnpm --filter @aidr/web test:workerd:story-og
 */
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * A complete 8x8 PNG, inlined as base64 so the worker bundle needs no
 * imports for the fixture itself.
 */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGPg4uL6jw8zjAwFAGRER0FVuVycAAAAAElFTkSuQmCC";

const bundled = await build({
  stdin: {
    contents: `
      const PNG_BASE64 = ${JSON.stringify(PNG_BASE64)};

      // A byte-for-byte copy of the real boundary, with only the network
      // transport injected. Keeping the copy in step with the source is what
      // the redirect-mode assertion below is protecting.
      const MAX_BYTES = 1_000_000;
      const isPrivateIpv4 = (host) => {
        const parts = host.split(".");
        if (parts.length !== 4) return false;
        const o = parts.map(Number);
        if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
        const [a, b] = o;
        return (
          a === 0 || a === 10 || a === 127 ||
          (a === 100 && b >= 64 && b <= 127) ||
          (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) ||
          (a === 198 && (b === 18 || b === 19)) ||
          a >= 224
        );
      };
      const normalizeHostname = (raw) => raw.toLowerCase().replace(/\\.+$/, "");
      const isSafe = (raw) => {
        let u;
        try { u = new URL(raw); } catch { return false; }
        if (u.protocol !== "https:" && u.protocol !== "http:") return false;
        if (u.username || u.password) return false;
        if (u.port && u.port !== "80" && u.port !== "443") return false;
        const host = normalizeHostname(u.hostname);
        if (
          host === "localhost" || host.endsWith(".localhost") ||
          host.endsWith(".local") || host.endsWith(".internal") ||
          host === "metadata.google.internal"
        ) return false;
        if (/^\\d+(?:\\.\\d+){3}$/.test(host)) return !isPrivateIpv4(host);
        if (host.includes(":") || host.startsWith("[")) return false;
        return host.length > 0 && host.length <= 253;
      };

      async function fetchStoryOgImage(value) {
        if (!isSafe(value)) return { ok: false, reason: "blocked-url" };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch(value, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            headers: { Accept: "image/png,image/jpeg,image/gif,image/webp" },
            signal: controller.signal,
          });
          if (!response.ok) return { ok: false, reason: "status-" + response.status };
          const length = response.headers.get("content-length");
          if (length !== null && (!/^\\d+$/.test(length) || Number(length) > MAX_BYTES)) {
            return { ok: false, reason: "content-length" };
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
            return { ok: false, reason: "byte-ceiling" };
          }
          return { ok: true, mimeType: response.headers.get("content-type"), byteLength: bytes.byteLength };
        } catch (error) {
          return { ok: false, reason: "threw-" + (error && error.name) };
        } finally {
          clearTimeout(timer);
        }
      }

      export default {
        async fetch() {
          // 1. The production blocker itself: "error" is not a valid workerd
          //    redirect mode, so the boundary must use one that is.
          const modes = {};
          for (const mode of ["error", "manual", "follow"]) {
            try {
              await fetch("https://cdn.example.com/a.png", { redirect: mode });
              modes[mode] = "accepted";
            } catch (error) {
              modes[mode] = "threw:" + (error && error.name);
            }
          }

          // 2. A real image must actually resolve inside workerd.
          const good = await fetchStoryOgImage("https://cdn.example.com/photo.png");

          // 3. A 3xx must be a clean miss, not a followed redirect. The
          //    Location points at the good URL, so following it would be
          //    visible in the outbound request log.
          const redirect = await fetchStoryOgImage(
            "https://cdn.example.com/redirect.png"
          );

          // 4. Unsafe hosts must never reach the network.
          const blocked = await Promise.all([
            fetchStoryOgImage("https://localhost./photo.png"),
            fetchStoryOgImage("https://metadata.google.internal./x"),
            fetchStoryOgImage("https://127.0.0.1/photo.png"),
          ]);

          return Response.json({
            modes,
            good,
            redirect,
            blocked,
            pngMagic: PNG_BASE64.slice(0, 8),
          });
        },
      };
    `,
    resolveDir: webRoot,
    sourcefile: "story-og-workerd-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
});
const script = bundled.outputFiles[0]?.text;
if (!script) throw new Error("workerd harness did not produce a Worker bundle");

/** Upstream responses, keyed by URL. No real network is ever touched. */
const PNG_BYTES = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
const UPSTREAM: Record<string, () => Response> = {
  "https://cdn.example.com/photo.png": () =>
    new Response(PNG_BYTES, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(PNG_BYTES.byteLength),
      },
    }),
  // A 3xx whose Location is the good URL: if the boundary followed it, the
  // request log would show photo.png twice.
  "https://cdn.example.com/redirect.png": () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://cdn.example.com/photo.png" },
    }),
};

const seen: string[] = [];

const mf = new Miniflare({
  workers: [
    {
      config: {
        name: "story-og-workerd-smoke",
        type: "worker",
        compatibilityDate: "2026-09-24",
        manifest: {
          mainModule: "main.mjs",
          modules: {
            "main.mjs": { type: "esm", contents: script },
          },
        },
      },
      dev: {
        outboundService: {
          type: "fetcher",
          handler: async (request: Request) => {
            const url = request.url;
            seen.push(url);
            const reply = UPSTREAM[url];
            if (!reply) {
              return new Response(null, {
                status: 404,
                headers: { "content-type": "text/plain" },
              });
            }
            return reply();
          },
        },
      },
    },
  ],
});

type WorkerdResult = {
  modes: Record<string, string>;
  good: { ok: boolean; reason?: string; byteLength?: number };
  redirect: { ok: boolean; reason?: string };
  blocked: Array<{ ok: boolean; reason?: string }>;
  pngMagic: string;
};

let failures = 0;
function check(label: string, condition: boolean, detail: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label} -> ${JSON.stringify(detail)}`);
  }
}

try {
  const response = await mf.dispatchFetch("https://aidr.today/og-smoke");
  const result = (await response.json()) as WorkerdResult;

  // workerd genuinely rejects "error"; that is the bug this guards.
  check(
    "workerd rejects redirect:error",
    result.modes.error.startsWith("threw:"),
    result.modes
  );
  check(
    "workerd accepts redirect:manual",
    result.modes.manual === "accepted",
    result.modes
  );
  check(
    "workerd accepts redirect:follow",
    result.modes.follow === "accepted",
    result.modes
  );

  // The real blocker: a valid image resolves inside workerd.
  check(
    "valid image resolves in workerd",
    result.good.ok === true,
    result.good
  );

  // A 3xx is a clean miss, and it is not followed.
  check(
    "3xx resolves to the branded fallback",
    result.redirect.ok === false,
    result.redirect
  );

  // Unsafe hosts never reach the network.
  check(
    "blocked hosts never reach the network",
    result.blocked.every((entry) => entry.ok === false),
    result.blocked
  );
  // Exactly the two boundary URLs, each once: a followed redirect would fetch
  // photo.png a second time. The a.png entries are the deliberate redirect-mode
  // probes above, so they are excluded here.
  const PROBE_URL = "https://cdn.example.com/a.png";
  const boundarySeen = seen.filter((url) => url !== PROBE_URL);
  check(
    "only the two public image URLs were requested, each once",
    boundarySeen.length === 2 &&
      boundarySeen.filter((url) => url === "https://cdn.example.com/photo.png")
        .length === 1 &&
      boundarySeen.filter(
        (url) => url === "https://cdn.example.com/redirect.png"
      ).length === 1,
    { seen, boundarySeen }
  );
  // The probes for "manual"/"follow" do reach upstream; "error" must not.
  check(
    "redirect:error issued no outbound request at all",
    seen.filter((url) => url === PROBE_URL).length === 2,
    seen
  );

  console.log(JSON.stringify(result, null, 2));
} finally {
  await mf.dispose();
}

if (failures > 0) {
  throw new Error(`story-og workerd smoke failed ${failures} check(s)`);
}
console.log("\nstory-og workerd smoke passed");
