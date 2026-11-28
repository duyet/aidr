import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchDigest } from "./api.js";
import { CLIENT_HEADER, clientHeaders } from "./client-header.js";
import { fetchExtensionMeta } from "./update.js";
import "./preview-shim.js";
import { resetPreviewStores } from "./preview-shim.js";

const originalFetch = globalThis.fetch;
const runtime = globalThis.chrome.runtime;

afterEach(() => {
  globalThis.fetch = originalFetch;
  runtime.getManifest = undefined;
  resetPreviewStores();
});

function withManifest(version) {
  runtime.getManifest = () => ({ version });
}

test("names the extension and its manifest version", () => {
  withManifest("0.1.27");
  assert.deepEqual(clientHeaders(), { [CLIENT_HEADER]: "extension/0.1.27" });
});

test("sends nothing in a web preview, where a custom header would force a CORS preflight", () => {
  assert.equal(runtime.getManifest, undefined);
  assert.deepEqual(clientHeaders(), {});
});

test("sends nothing for a manifest version it cannot vouch for", () => {
  for (const version of [
    undefined,
    "",
    "v1.0.0",
    "1.0.0-beta",
    "1",
    "1.2.3.4.5",
  ]) {
    withManifest(version);
    assert.deepEqual(clientHeaders(), {}, String(version));
  }
  runtime.getManifest = () => {
    throw new Error("Extension context invalidated.");
  };
  assert.deepEqual(clientHeaders(), {});
});

test("digest and update-check fetches carry the identity", async () => {
  withManifest("0.1.27");
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ path: new URL(String(url)).pathname, headers: init.headers });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ stories: [], updatedAt: 1 }),
    };
  };
  await fetchDigest("https://aidr.today", { campaign: "test" });
  await fetchExtensionMeta("https://aidr.today");
  assert.deepEqual(
    seen.map((s) => s.path),
    ["/api/public", "/api/feed", "/api/extension"]
  );
  for (const { headers } of seen) {
    assert.deepEqual(headers, { "X-AIDR-Client": "extension/0.1.27" });
  }
});
