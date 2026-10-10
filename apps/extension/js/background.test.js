import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ensurePrefetchAlarm,
  PREFETCH_ALARM,
  PREFETCH_PERIOD_MIN,
  prefetchForSettings,
} from "./background.js";
import { resetPreviewStores } from "./preview-shim.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPreviewStores();
});

test("prefetch alarm never fires faster than the 30-minute publish cadence", () => {
  // Each fire can pull ~570 KB; a shorter period only burns user bandwidth.
  const created = [];
  ensurePrefetchAlarm({ create: (name, info) => created.push({ name, info }) });
  assert.equal(created.length, 1);
  assert.equal(created[0].name, PREFETCH_ALARM);
  assert.ok(created[0].info.periodInMinutes >= 30);
  assert.equal(created[0].info.periodInMinutes, PREFETCH_PERIOD_MIN);
});

test("prefetchForSettings warms the cache once, then stays quiet", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ tldr: null, stories: [{ id: "a", url: "https://a" }] }),
    };
  };
  assert.equal(await prefetchForSettings(), true);
  const first = calls;
  assert.ok(first > 0);
  assert.equal(await prefetchForSettings(), false);
  assert.equal(calls, first);
});

test("prefetchForSettings swallows offline errors", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  assert.equal(await prefetchForSettings(), false);
});
