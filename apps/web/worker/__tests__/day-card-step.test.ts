import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pngFromPixels } from "../../src/lib/__fixtures__/raster.js";
import { DAY_OG_HEIGHT, DAY_OG_WIDTH } from "../../src/lib/day-og.js";
import { dayOgObjectKey } from "../../src/lib/og-cache.js";
import type { Lang } from "../../src/lib/types.js";
import { loadDayCard } from "../notify/day-card.js";
import { digestCardUrl } from "../notify/telegram.js";
import type { RunStepInfo } from "../run-stats.js";
import type { Env } from "../types.js";

/**
 * The `day-card` step pre-renders the day card into R2 ahead of the digest
 * sends. These tests fail if it writes on a dry run, stores an unvalidated
 * render, overwrites a fresh object, throws into the Workflow (which would
 * skip email/notify and the close-run row), or drifts from the URL notify
 * constructs for the same edition.
 */

vi.mock("../../src/lib/day-og-render.js", () => ({
  renderDayCard: vi.fn(),
}));

let currentArchive: unknown = null;
vi.mock("../../src/lib/feed-queries.js", () => ({
  getDayArchive: vi.fn(async () => currentArchive),
}));

// Spy on the card read so one test can fail it without losing the real
// implementation (and the v-stamp parity assertions) for the others.
vi.mock("../notify/day-card.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../notify/day-card.js")>();
  return { ...orig, loadDayCard: vi.fn(orig.loadDayCard) };
});

const { renderDayCard } = await import("../../src/lib/day-og-render.js");
const { prerenderDayCards, summarizeDayCardStats } = await import(
  "../ingest/day-card.js"
);
const { dayCardVersion } = await import("../notify/day-card.js");
const { DRY_RUN_SKIP_REASON, PIPELINE_STEPS, skipUnselectedStep } =
  await import("../ingest/mode.js");

import type { IngestContext } from "../ingest/context.js";
import type { IngestMode } from "../ingest/mode.js";

/** 10:00 on 2026-10-15 in the audience zone (UTC+7). */
const NOW = new Date("2026-10-15T03:00:00Z");
const DATE = "2026-10-15";

const ITEMS = [
  {
    id: "a1b2c3d4e5f60718",
    title: "OpenAI ships a new model",
    title_vi: "OpenAI ra mắt mô hình mới",
    summary: "A summary.",
    summary_vi: "Một tóm tắt.",
    image_url: null,
    tags: ["ai"],
    category: "ai",
  },
  {
    id: "b2c3d4e5f6071829",
    title: "Google updates Gemini",
    title_vi: "Google cập nhật Gemini",
    summary: "Another summary.",
    summary_vi: "Một tóm tắt khác.",
    image_url: null,
    tags: ["ai"],
    category: "ai",
  },
];

function archive(items: unknown[]) {
  return {
    date: DATE,
    day: { date: DATE, items },
    tldr: null,
    videos: { en: null, vi: null },
    prev: null,
    next: null,
  };
}

/** A whole card-sized PNG, built at runtime like the render fixtures. */
const cardPng = () =>
  pngFromPixels(DAY_OG_WIDTH, DAY_OG_HEIGHT, (x, y) => [
    (x * 7 + y * 13) & 0xff,
    (x + y * 3) & 0xff,
    (x * y) & 0xff,
  ]);

const CACHE_CONTROL = "public, max-age=600, s-maxage=3600";

function cardResponse(
  lang: Lang,
  bytes: Uint8Array<ArrayBuffer> = cardPng()
): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": CACHE_CONTROL,
      "Content-Language": lang,
    },
  });
}

function memoryBucket() {
  const objects = new Map<
    string,
    { bytes: ArrayBuffer; customMetadata: Record<string, string> }
  >();
  const get = vi.fn(async (key: string) => {
    const obj = objects.get(key);
    return obj ? { customMetadata: obj.customMetadata } : null;
  });
  const put = vi.fn(
    async (
      key: string,
      bytes: ArrayBuffer,
      opts: { customMetadata: Record<string, string> }
    ) => {
      objects.set(key, { bytes, customMetadata: opts.customMetadata });
    }
  );
  return {
    bucket: { get, put } as unknown as R2Bucket,
    objects,
    get,
    put,
  };
}

function makeCtx(
  mode: IngestMode,
  bucket: R2Bucket,
  digest: { rows?: Record<string, unknown>; fail?: boolean } = {}
): IngestContext {
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({ sql, args }),
  }));
  const batch = vi.fn(async (stmts: { args: unknown[] }[]) => {
    if (digest.fail) throw new Error("subrequest budget spent");
    return stmts.map((stmt) => {
      const row = digest.rows?.[String(stmt.args[0])];
      return { results: row ? [row] : [] };
    });
  });
  const run = vi.fn();
  const env = {
    DB: { prepare, batch, run } as unknown as D1Database,
    OG_CACHE: bucket,
  } as unknown as Env;
  return {
    // Runs step.do callbacks inline, like a first (non-replay) execution.
    step: {
      do: async (_name: string, a: unknown, b?: unknown) =>
        (typeof a === "function" ? a : (b as () => unknown))(),
    } as unknown as WorkflowStep,
    env,
    runId: "run-1",
    steps: [],
    mode,
  };
}

const LIVE: IngestMode = { dryRun: false, steps: null };

const baseKey = (lang: Lang) =>
  dayOgObjectKey(new URL(digestCardUrl({ date: DATE, lang })));
const versionKey = (lang: Lang, ids: string[]) =>
  dayOgObjectKey(
    new URL(digestCardUrl({ date: DATE, lang }, dayCardVersion(ids)))
  );

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  currentArchive = archive(ITEMS);
  vi.mocked(renderDayCard).mockImplementation(async (_env, _date, lang) => ({
    response: cardResponse(lang),
    store: true,
    maxAgeSec: 3600,
  }));
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

describe("pipeline order and selection", () => {
  it("is a selectable pipeline step that runs after weekly and before email and notify", () => {
    const at = (step: string) =>
      PIPELINE_STEPS.indexOf(step as (typeof PIPELINE_STEPS)[number]);
    expect(at("day-card")).toBeGreaterThan(at("weekly"));
    expect(at("day-card")).toBeLessThan(at("email"));
    expect(at("day-card")).toBeLessThan(at("notify"));
  });

  it("records not selected when the run leaves it out", () => {
    const { bucket } = memoryBucket();
    const ctx = makeCtx({ dryRun: false, steps: ["email"] }, bucket);
    expect(skipUnselectedStep(ctx, "day-card")).toBe(true);
    expect(ctx.steps).toEqual([
      { name: "day-card", action: "skipped", reason: "not selected" },
    ]);
  });
});

describe("prerenderDayCards", () => {
  it("skips entirely on a dry run: no renders, no R2 writes", async () => {
    const { bucket, put } = memoryBucket();
    const ctx = makeCtx({ dryRun: true, steps: null }, bucket);
    const stats = await prerenderDayCards(ctx);
    expect(renderDayCard).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(stats.en.rendered + stats.vi.rendered).toBe(0);
    expect(ctx.steps).toEqual([
      { name: "day-card", action: "skipped", reason: DRY_RUN_SKIP_REASON },
    ]);
  });

  it("stores a validated render under the base and v-stamped keys for both languages", async () => {
    const { bucket, put, objects } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket);
    const stats = await prerenderDayCards(ctx);
    const ids = ITEMS.map((item) => item.id);
    const expected = [
      baseKey("en"),
      versionKey("en", ids),
      baseKey("vi"),
      versionKey("vi", ids),
    ];
    expect(put).toHaveBeenCalledTimes(4);
    expect([...objects.keys()].sort()).toEqual([...expected].sort());
    expect(stats.en).toEqual({
      rendered: 2,
      skippedFresh: 0,
      skippedEmpty: 0,
      skippedNoSend: 0,
      readFailed: 0,
      skippedUnchanged: 0,
      failed: 0,
    });
    expect(stats.vi).toEqual(stats.en);
    // The v stamp is exactly the one notify's card read produces.
    for (const lang of ["en", "vi"] as const) {
      const card = await loadDayCard(ctx.env, DATE, lang);
      expect(card?.version).toBe(dayCardVersion(ids));
      expect(objects.has(versionKey(lang, ids))).toBe(true);
    }
    // Metadata matches the request path's put (parity is asserted in
    // og-cache.test.ts); the TTL is the recent-day hour.
    const meta = objects.get(baseKey("en"))?.customMetadata;
    expect(meta?.expiresAt).toBe(String(NOW.getTime() + 3600 * 1000));
    expect(meta?.cacheControl).toBe(CACHE_CONTROL);
  });

  it("gives a new edition a new v-stamped key and keeps the base key", async () => {
    const ids = ITEMS.map((item) => item.id);
    const first = memoryBucket();
    await prerenderDayCards(makeCtx(LIVE, first.bucket));
    const nextItems = ITEMS.map((item, i) => ({
      ...item,
      id: `c${i}d4e5f60718293a`,
    }));
    currentArchive = archive(nextItems);
    const second = memoryBucket();
    await prerenderDayCards(makeCtx(LIVE, second.bucket));
    const nextIds = nextItems.map((item) => item.id);
    expect(versionKey("en", nextIds)).not.toBe(versionKey("en", ids));
    expect(second.objects.has(versionKey("en", nextIds))).toBe(true);
    expect(second.objects.has(versionKey("en", ids))).toBe(false);
    expect(second.objects.has(baseKey("en"))).toBe(true);
    expect(first.objects.has(baseKey("en"))).toBe(true);
  });

  it("is idempotent: a second invocation with fresh objects renders and puts nothing", async () => {
    const { bucket, put } = memoryBucket();
    await prerenderDayCards(makeCtx(LIVE, bucket));
    // One render per language, put under both stale keys.
    expect(renderDayCard).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(4);
    const ctx = makeCtx(LIVE, bucket);
    const stats = await prerenderDayCards(ctx);
    // No new renders on the second invocation: the count stays at 2.
    expect(renderDayCard).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(4);
    expect(stats.en).toEqual({
      rendered: 0,
      skippedFresh: 2,
      skippedEmpty: 0,
      skippedNoSend: 0,
      readFailed: 0,
      skippedUnchanged: 0,
      failed: 0,
    });
    expect(stats.vi).toEqual(stats.en);
  });

  it("skips a stored object with no expiry, like the request path", async () => {
    const { bucket, objects, put } = memoryBucket();
    objects.set(baseKey("en"), {
      bytes: new ArrayBuffer(8),
      customMetadata: { cacheControl: CACHE_CONTROL },
    });
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.skippedFresh).toBe(1);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it("re-renders an expired object", async () => {
    const { bucket, objects, put } = memoryBucket();
    objects.set(baseKey("en"), {
      bytes: new ArrayBuffer(8),
      customMetadata: { expiresAt: String(NOW.getTime() - 1000) },
    });
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.rendered).toBe(2);
    expect(put).toHaveBeenCalledTimes(4);
  });

  it("retries after a failed put: re-renders and writes the same deterministic keys", async () => {
    const { bucket, put } = memoryBucket();
    put.mockRejectedValue(new Error("r2 unavailable"));
    const first = makeCtx(LIVE, bucket);
    const failed = await prerenderDayCards(first);
    expect(failed.en.failed).toBe(2);
    expect(failed.vi.failed).toBe(2);
    expect(warn).toHaveBeenCalled();
    // R2 answers again; the objects are absent, so the step re-renders.
    put.mockResolvedValue(undefined);
    const keysBefore = put.mock.calls.map((call) => call[0]);
    const second = makeCtx(LIVE, bucket);
    const retried = await prerenderDayCards(second);
    expect(retried.en.rendered).toBe(2);
    expect(retried.vi.rendered).toBe(2);
    // One render per language per run, put under both stale keys.
    expect(renderDayCard).toHaveBeenCalledTimes(4);
    const keysAfter = put.mock.calls.slice(4).map((call) => call[0]);
    expect(keysAfter.sort()).toEqual(keysBefore.sort());
  });

  it("warns and stores nothing for a language whose render is invalid, and leaves notify's URL construction untouched", async () => {
    const { bucket, put, objects } = memoryBucket();
    vi.mocked(renderDayCard).mockImplementation(async (_env, _date, lang) =>
      lang === "en"
        ? {
            response: cardResponse(lang, new Uint8Array(20_000).fill(7)),
            store: true,
            maxAgeSec: 3600,
          }
        : { response: cardResponse(lang), store: true, maxAgeSec: 3600 }
    );
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.failed).toBe(2);
    expect(stats.vi.rendered).toBe(2);
    // No put for either English key; the Vietnamese keys are stored.
    expect(objects.has(baseKey("en"))).toBe(false);
    expect(
      objects.has(
        versionKey(
          "en",
          ITEMS.map((i) => i.id)
        )
      )
    ).toBe(false);
    expect(objects.has(baseKey("vi"))).toBe(true);
    expect(put).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${DATE} en ${baseKey("en")}`)
    );
    // The digest still names the same URL it always did; only the storage
    // behind it changed, and a miss renders on demand in the route.
    const version = dayCardVersion(ITEMS.map((i) => i.id));
    expect(digestCardUrl({ date: DATE, lang: "en" }, version)).toBe(
      `https://aidr.today/api/og/date/${DATE}.png?lang=en&v=${version}`
    );
  });

  it("warns and continues when a render throws, and never throws itself", async () => {
    const { bucket, objects } = memoryBucket();
    vi.mocked(renderDayCard).mockImplementation(async (_env, _date, lang) => {
      if (lang === "en") throw new Error("satori failed");
      return { response: cardResponse(lang), store: true, maxAgeSec: 3600 };
    });
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.failed).toBe(2);
    expect(stats.vi.rendered).toBe(2);
    expect(objects.has(baseKey("en"))).toBe(false);
    expect(objects.has(baseKey("vi"))).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${DATE} en ${baseKey("en")}`)
    );
  });

  it("does not store an unsettled empty day's card", async () => {
    const { bucket, put } = memoryBucket();
    vi.mocked(renderDayCard).mockImplementation(async (_env, _date, lang) => ({
      response: cardResponse(lang),
      store: false,
      maxAgeSec: 3600,
    }));
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(put).not.toHaveBeenCalled();
    expect(stats.en.skippedEmpty).toBe(2);
    expect(stats.vi.skippedEmpty).toBe(2);
  });

  it("treats a failed R2 read as a miss and still renders", async () => {
    const { bucket, get, put } = memoryBucket();
    get.mockRejectedValue(new Error("r2 read failed"));
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.rendered).toBe(2);
    expect(stats.vi.rendered).toBe(2);
    expect(put).toHaveBeenCalledTimes(4);
  });

  it("records per-language counts on the run's day-card step line", async () => {
    const { bucket } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket);
    const stats = await prerenderDayCards(ctx);
    const line = ctx.steps.find((s: RunStepInfo) => s.name === "day-card");
    expect(line?.action).toBe(summarizeDayCardStats(stats));
    expect(line?.action).toContain("en: 2 rendered");
    expect(line?.action).toContain("vi: 2 rendered");
  });
});

describe("digest eligibility gate", () => {
  const SENT = { status: "sent", attempts: 1, posted_at: NOW.getTime() };
  const ids = ITEMS.map((item) => item.id);
  const db = (ctx: IngestContext) =>
    ctx.env.DB as unknown as {
      prepare: ReturnType<typeof vi.fn>;
      batch: ReturnType<typeof vi.fn>;
      run: ReturnType<typeof vi.fn>;
    };

  it("skips the versioned card when no digest send is pending, but still refreshes the base card", async () => {
    const { bucket, put, objects } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket, {
      rows: {
        telegram: SENT,
        "telegram-en": SENT,
        "facebook-en": SENT,
        webhook: SENT,
      },
    });
    const stats = await prerenderDayCards(ctx);
    // Base keys render for both languages; versioned keys are never drawn.
    expect(put).toHaveBeenCalledTimes(2);
    expect([...objects.keys()].sort()).toEqual(
      [baseKey("en"), baseKey("vi")].sort()
    );
    expect(objects.has(versionKey("en", ids))).toBe(false);
    expect(objects.has(versionKey("vi", ids))).toBe(false);
    expect(stats.en.skippedNoSend).toBe(1);
    expect(stats.vi.skippedNoSend).toBe(1);
    expect(stats.en.rendered).toBe(1);
    expect(stats.vi.rendered).toBe(1);
  });

  it("keeps the versioned card while a failed digest row is under the retry cap", async () => {
    const { bucket, objects } = memoryBucket();
    const stats = await prerenderDayCards(
      makeCtx(LIVE, bucket, {
        rows: {
          telegram: { status: "failed", attempts: 1 },
          "telegram-en": SENT,
          "facebook-en": SENT,
        },
      })
    );
    // VI still has a pending send; EN does not.
    expect(objects.has(versionKey("vi", ids))).toBe(true);
    expect(objects.has(versionKey("en", ids))).toBe(false);
    expect(stats.vi.skippedNoSend).toBe(0);
    expect(stats.en.skippedNoSend).toBe(1);
  });

  it("skips the versioned card before the local send hour, base card unaffected", async () => {
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z")); // 07:00 audience time
    const { bucket, objects } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket);
    const stats = await prerenderDayCards(ctx);
    expect(objects.has(baseKey("en"))).toBe(true);
    expect(objects.has(versionKey("en", ids))).toBe(false);
    expect(stats.en.skippedNoSend).toBe(1);
    // The decision is false for every channel before the hour: no batch.
    expect(db(ctx).batch).not.toHaveBeenCalled();
  });

  it("a Facebook retry pending does not open the gate once Telegram sent", async () => {
    const { bucket, objects } = memoryBucket();
    const stats = await prerenderDayCards(
      makeCtx(LIVE, bucket, {
        rows: {
          "telegram-en": SENT,
          "facebook-en": { status: "failed", attempts: 1 },
        },
      })
    );
    // Facebook crawls the base key, never the versioned one.
    expect(objects.has(versionKey("en", ids))).toBe(false);
    expect(stats.en.skippedNoSend).toBe(1);
    // VI's Telegram row is absent: a send is still pending there.
    expect(objects.has(versionKey("vi", ids))).toBe(true);
  });

  it("an absent webhook row does not keep the VI gate open", async () => {
    const { bucket, objects } = memoryBucket();
    const stats = await prerenderDayCards(
      makeCtx(LIVE, bucket, { rows: { telegram: SENT } })
    );
    expect(objects.has(versionKey("vi", ids))).toBe(false);
    expect(stats.vi.skippedNoSend).toBe(1);
    expect(objects.has(versionKey("en", ids))).toBe(true);
  });

  it("a failed card read keeps the base stamp and counts failed", async () => {
    const { bucket, objects, put } = memoryBucket();
    for (const lang of ["en", "vi"] as const) {
      objects.set(baseKey(lang), {
        bytes: new ArrayBuffer(8),
        customMetadata: {
          expiresAt: String(NOW.getTime() - 1000),
          contentVersion: "old0",
        },
      });
    }
    vi.mocked(loadDayCard).mockRejectedValueOnce(new Error("card read down"));
    vi.mocked(loadDayCard).mockRejectedValueOnce(new Error("card read down"));
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.failed).toBe(1);
    expect(stats.vi.failed).toBe(1);
    expect(stats.en.rendered).toBe(1);
    expect(put).toHaveBeenCalledTimes(2);
    // Provenance survives: the next expiry still sees an unchanged stamp.
    expect(objects.get(baseKey("en"))?.customMetadata.contentVersion).toBe(
      "old0"
    );
    expect(objects.has(versionKey("en", ids))).toBe(false);
  });

  it("a failed eligibility read leaves the versioned card on-demand and never throws", async () => {
    const { bucket, put, objects } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket, { fail: true });
    const stats = await prerenderDayCards(ctx);
    expect(put).toHaveBeenCalledTimes(2);
    expect([...objects.keys()].sort()).toEqual(
      [baseKey("en"), baseKey("vi")].sort()
    );
    expect(stats.en.readFailed).toBe(1);
    expect(stats.vi.readFailed).toBe(1);
    expect(stats.en.failed).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("eligibility read failed")
    );
  });

  it("reads eligibility once per run, read-only, and never writes notifications", async () => {
    const { bucket } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket);
    await prerenderDayCards(ctx);
    const { prepare, batch, run } = db(ctx);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(4); // four notifier channels
    for (const call of prepare.mock.calls) {
      expect(String(call[0]).startsWith("SELECT")).toBe(true);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("an expired base card with our unchanged stamp is left to the route", async () => {
    const { bucket, objects, put } = memoryBucket();
    const stamp = dayCardVersion(ITEMS.map((i) => i.id));
    for (const lang of ["en", "vi"] as const) {
      objects.set(baseKey(lang), {
        bytes: new ArrayBuffer(8),
        customMetadata: {
          expiresAt: String(NOW.getTime() - 1000),
          contentVersion: stamp,
        },
      });
    }
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    // No background base refresh without a content change; the versioned
    // keys are absent, so they still render (a digest send is pending).
    expect(stats.en.skippedUnchanged).toBe(1);
    expect(stats.vi.skippedUnchanged).toBe(1);
    expect(stats.en.rendered).toBe(1);
    expect(put).toHaveBeenCalledTimes(2);
    expect(objects.has(baseKey("en"))).toBe(true);
  });

  it("an expired base card with a different stamp re-renders", async () => {
    const { bucket, objects, put } = memoryBucket();
    for (const lang of ["en", "vi"] as const) {
      objects.set(baseKey(lang), {
        bytes: new ArrayBuffer(8),
        customMetadata: {
          expiresAt: String(NOW.getTime() - 1000),
          contentVersion: "old0",
        },
      });
    }
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.skippedUnchanged).toBe(0);
    expect(stats.en.rendered).toBe(2);
    expect(put).toHaveBeenCalledTimes(4);
  });

  it("a fresh base card with a different stamp warms the new content", async () => {
    const { bucket, objects, put } = memoryBucket();
    for (const lang of ["en", "vi"] as const) {
      objects.set(baseKey(lang), {
        bytes: new ArrayBuffer(8),
        customMetadata: {
          expiresAt: String(NOW.getTime() + 3600_000),
          contentVersion: "old0",
        },
      });
    }
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.rendered).toBe(2);
    expect(put).toHaveBeenCalledTimes(4);
    const meta = objects.get(baseKey("en"))?.customMetadata;
    expect(meta?.contentVersion).toBe(dayCardVersion(ITEMS.map((i) => i.id)));
  });

  it("a fresh unstamped base card (request-path put) is respected", async () => {
    const { bucket, objects, put } = memoryBucket();
    for (const lang of ["en", "vi"] as const) {
      objects.set(baseKey(lang), {
        bytes: new ArrayBuffer(8),
        customMetadata: { expiresAt: String(NOW.getTime() + 3600_000) },
      });
    }
    const stats = await prerenderDayCards(makeCtx(LIVE, bucket));
    expect(stats.en.skippedFresh).toBe(1);
    expect(stats.en.rendered).toBe(1);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("an engine interruption records its own line, not a success-looking summary", async () => {
    const { bucket } = memoryBucket();
    const ctx = makeCtx(LIVE, bucket);
    ctx.step = {
      do: async () => {
        throw new Error("Durable Object reset because its code was updated");
      },
    } as unknown as WorkflowStep;
    const stats = await prerenderDayCards(ctx);
    const lines = ctx.steps.filter((s: RunStepInfo) => s.name === "day-card");
    expect(lines).toHaveLength(1);
    expect(lines[0].action).toBe("interrupted");
    expect(stats.en.rendered).toBe(0);
    expect(stats.vi.rendered).toBe(0);
  });

  it("an ambiguous digest row never re-renders the versioned card", async () => {
    const { bucket, objects } = memoryBucket();
    const stats = await prerenderDayCards(
      makeCtx(LIVE, bucket, {
        rows: {
          telegram: { status: "ambiguous", attempts: 1 },
          "telegram-en": { status: "ambiguous", attempts: 1 },
          "facebook-en": { status: "ambiguous", attempts: 1 },
          webhook: { status: "ambiguous", attempts: 1 },
        },
      })
    );
    expect(objects.has(versionKey("vi", ids))).toBe(false);
    expect(objects.has(versionKey("en", ids))).toBe(false);
    expect(stats.en.skippedNoSend).toBe(1);
    expect(stats.vi.skippedNoSend).toBe(1);
  });
});
