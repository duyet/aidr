// node --test videos/daily-news/scripts/day-page.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayPageIds } from "./status.mjs";

const noSleep = async () => {};
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
      dayPageIds("2026-10-20", "en", reply(status), noSleep),
      new RegExp(String(status))
    );
  });
}

test("a network error propagates", async () => {
  await assert.rejects(
    dayPageIds(
      "2026-10-20",
      "vi",
      async () => {
        throw new Error("ECONNRESET");
      },
      noSleep
    ),
    /ECONNRESET/
  );
});

const sequence = (...steps) => {
  const calls = [];
  const fetchPage = async () => {
    calls.push(1);
    const step = steps[calls.length - 1];
    if (step instanceof Error) throw step;
    return step;
  };
  return { fetchPage, calls };
};

test("a transient failure is retried, backing off 2s then 6s, and a later 200 succeeds", async () => {
  const md = "- YouTube: https://www.youtube.com/watch?v=abcdefghijk\n";
  const { fetchPage, calls } = sequence(
    new Response("", { status: 503 }),
    new Error("ECONNRESET"),
    new Response(md, { status: 200 })
  );
  const waits = [];
  const ids = await dayPageIds("2026-10-20", "en", fetchPage, async (ms) => {
    waits.push(ms);
  });
  assert.equal(ids["16x9"], "abcdefghijk");
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [2000, 6000]);
});

test("a 429 is retried too", async () => {
  const { fetchPage, calls } = sequence(
    new Response("", { status: 429 }),
    new Response("# day\n", { status: 200 })
  );
  await dayPageIds("2026-10-20", "en", fetchPage, noSleep);
  assert.equal(calls.length, 2);
});

test("a 404 returns at once without retrying", async () => {
  const { fetchPage, calls } = sequence(new Response("", { status: 404 }));
  assert.deepEqual(
    await dayPageIds("2026-10-20", "en", fetchPage, noSleep),
    {}
  );
  assert.equal(calls.length, 1);
});

test("a 401 is not retried", async () => {
  const { fetchPage, calls } = sequence(new Response("", { status: 401 }));
  await assert.rejects(
    dayPageIds("2026-10-20", "en", fetchPage, noSleep),
    /401/
  );
  assert.equal(calls.length, 1);
});

test("three failures in a row still throw", async () => {
  const { fetchPage, calls } = sequence(
    new Response("", { status: 500 }),
    new Response("", { status: 502 }),
    new Response("", { status: 503 })
  );
  await assert.rejects(
    dayPageIds("2026-10-20", "en", fetchPage, noSleep),
    /503/
  );
  assert.equal(calls.length, 3);
});
