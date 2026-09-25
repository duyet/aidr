#!/usr/bin/env tsx
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Minimal workerd smoke test for the Clerk proxy's early-response body path.
 * It uses Miniflare's outbound fetcher so no real Clerk request is made.
 */
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const proxyModule = resolve(webRoot, "worker/clerk-proxy.ts");

const bundled = await build({
  stdin: {
    contents: `
      import { handleClerkProxy } from ${JSON.stringify(proxyModule)};
      export default {
        async fetch(request, env) {
          return handleClerkProxy(request, env);
        },
      };
    `,
    resolveDir: webRoot,
    sourcefile: "clerk-proxy-workerd-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
});
const script = bundled.outputFiles[0]?.text;
if (!script) throw new Error("workerd harness did not produce a Worker bundle");

const mf = new Miniflare({
  workers: [
    {
      config: {
        name: "clerk-proxy-workerd-smoke",
        type: "worker",
        compatibilityDate: "2026-09-24",
        manifest: {
          mainModule: "main.mjs",
          modules: {
            "main.mjs": { type: "esm", contents: script },
          },
        },
        env: {
          CLERK_SECRET_KEY: { type: "text", value: "server-secret" },
          CLERK_PROXY_URL: {
            type: "text",
            value: "https://aidr.today/__clerk",
          },
        },
      },
      dev: {
        outboundService: {
          type: "fetcher",
          handler: async () => new Response("early upstream response"),
        },
      },
    },
  ],
});

try {
  const normal = await mf.dispatchFetch(
    "https://aidr.today/__clerk/v1/client",
    { method: "POST", body: "payload" }
  );
  const oversized = await mf.dispatchFetch(
    "https://aidr.today/__clerk/v1/client",
    { method: "POST", body: new Uint8Array(1_048_577) }
  );
  const normalBody = await normal.text();
  const oversizedBody = await oversized.text();

  if (normal.status !== 200 || normalBody !== "early upstream response") {
    throw new Error("workerd early-response smoke failed for a bounded body");
  }
  if (oversized.status !== 413) {
    throw new Error("workerd did not reject the oversized body before fetch");
  }
  console.log(
    JSON.stringify({
      normal: normal.status,
      oversized: oversized.status,
      oversizedBody,
    })
  );
} finally {
  await mf.dispose();
}
