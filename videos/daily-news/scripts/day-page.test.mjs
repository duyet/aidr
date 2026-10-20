// node --test videos/daily-news/scripts/day-page.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayPageIds } from "./status.mjs";

const reply =
  (status, body = "") =>
  async () =>
    new Response(body, { status });

test("a day page with no YouTube lines has no ids", async () => {
  assert.deepEqual(
    await dayPageIds("2026-10-20", "en", reply(200, "# day\n")),
    {
      "16x9": undefined,
      "9x16": undefined,
    }
  );
});

test("a day page lists the ids of both cuts", async () => {
  const md =
    "- YouTube: https://www.youtube.com/watch?v=abcdefghijk\n- YouTube Shorts: https://www.youtube.com/shorts/ABCDEFGHIJK\n";
  assert.deepEqual(await dayPageIds("2026-10-20", "en", reply(200, md)), {
    "16x9": "abcdefghijk",
    "9x16": "ABCDEFGHIJK",
  });
});

test("404 means nothing is published yet", async () => {
  assert.deepEqual(await dayPageIds("2026-10-20", "en", reply(404)), {});
});

for (const status of [429, 500, 502, 503, 401]) {
  test(`${status} fails closed: unknown is not "nothing published"`, async () => {
    await assert.rejects(
      dayPageIds("2026-10-20", "en", reply(status)),
      new RegExp(String(status))
    );
  });
}

test("a network error propagates", async () => {
  await assert.rejects(
    dayPageIds("2026-10-20", "vi", async () => {
      throw new Error("ECONNRESET");
    }),
    /ECONNRESET/
  );
});
