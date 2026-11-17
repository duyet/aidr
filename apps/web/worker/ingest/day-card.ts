/**
 * The `day-card` step: pre-renders the audience day's card PNGs into the
 * `OG_CACHE` R2 tier before email and notify go out, so Telegram, Facebook
 * and day-page image fetches read a stored object instead of rendering on
 * the request path. URLs are unchanged: the route still renders on a miss,
 * so a failure here leaves the on-demand path in place. Never throws and
 * never blocks the send steps.
 */
import {
  dayOgObjectKey,
  putDayCardObject,
  validateDayCardPng,
} from "../../src/lib/og-cache.js";
import type { Lang } from "../../src/lib/types.js";
import { loadDayCard } from "../notify/day-card.js";
import {
  DIGEST_LOCAL_HOUR,
  digestKey,
  notifiers,
  readDigestNotificationRows,
  shouldSendDigest,
  type NotificationRow,
} from "../notify/index.js";
import { digestCardUrl } from "../notify/telegram.js";
import { recordStep } from "../run-stats.js";
import { getLocalHourAndDate } from "../subscribe/send.js";
import { AUDIENCE_TIMEZONE } from "../time.js";
import type { Env } from "../types.js";
import { safeStep, safeErrorMessage } from "../workflow-step.js";
import type { IngestContext } from "./context.js";
import { DRY_RUN_SKIP_REASON } from "./mode.js";

export interface DayCardLangStats {
  rendered: number;
  skippedFresh: number;
  skippedEmpty: number;
  /** No digest send pending for this language, so the versioned card would
   *  never be fetched: left to the on-demand path. */
  skippedNoSend: number;
  /** The eligibility read failed; the versioned card stays on-demand. */
  readFailed: number;
  /** Base card expired but our stamp says the tile set is unchanged: left
   *  to the route's on-demand, per-colo refresh. */
  skippedUnchanged: number;
  failed: number;
}

export type DayCardStats = Record<Lang, DayCardLangStats>;

function emptyStats(): DayCardStats {
  return {
    en: {
      rendered: 0,
      skippedFresh: 0,
      skippedEmpty: 0,
      skippedNoSend: 0,
      readFailed: 0,
      skippedUnchanged: 0,
      failed: 0,
    },
    vi: {
      rendered: 0,
      skippedFresh: 0,
      skippedEmpty: 0,
      skippedNoSend: 0,
      readFailed: 0,
      skippedUnchanged: 0,
      failed: 0,
    },
  };
}

/** One line per language for the run's `day-card` step row. */
export function summarizeDayCardStats(stats: DayCardStats): string {
  return (["en", "vi"] as const)
    .map((lang) => {
      const s = stats[lang];
      return `${lang}: ${s.rendered} rendered, ${s.skippedFresh} fresh, ${s.skippedEmpty} empty, ${s.skippedNoSend} no-send, ${s.readFailed} read-failed, ${s.skippedUnchanged} unchanged, ${s.failed} failed`;
    })
    .join("; ");
}

export async function prerenderDayCards(
  ctx: IngestContext
): Promise<DayCardStats> {
  const { step, env, steps } = ctx;
  if (ctx.mode.dryRun) {
    recordStep(steps, "day-card", "skipped", DRY_RUN_SKIP_REASON);
    return emptyStats();
  }
  if (!env.OG_CACHE) {
    recordStep(steps, "day-card", "skipped", "no OG_CACHE binding");
    return emptyStats();
  }
  // Like freshness.ts: an engine interruption already records its own line,
  // and the fallback stats must not then look like a partial success.
  const from = steps.length;
  const result = await safeStep(
    step,
    "day-card",
    emptyStats(),
    async () => {
      const stats = emptyStats();
      const now = Date.now();
      // The audience calendar day the digest sends for (§12), not UTC.
      const { hour, date } = getLocalHourAndDate(now, AUDIENCE_TIMEZONE);
      // One batched read of the same rows notify's loop reads, so the
      // versioned card is drawn only while a digest send is still pending.
      // A failed read (e.g. the run's subrequest budget is spent) leaves the
      // versioned card to the route's on-demand render; the base card, the
      // day page's public og:image, is unaffected either way.
      // Before the send hour the decision is false for every channel, so
      // the batch would spend subrequest budget for nothing.
      let rows: Map<string, NotificationRow | null> | null = new Map();
      if (hour >= DIGEST_LOCAL_HOUR) {
        try {
          rows = await readDigestNotificationRows(
            env,
            notifiers.map((n) => n.id),
            digestKey(date)
          );
        } catch (error) {
          rows = null;
          console.warn(
            `day-card ${date}: digest eligibility read failed: ${safeErrorMessage(error)}; versioned cards stay on-demand`
          );
        }
      }
      for (const lang of ["en", "vi"] as const) {
        await prerenderLang(env, date, lang, now, hour, rows, stats[lang]);
      }
      return stats;
    },
    { steps }
  );
  const interrupted = steps
    .slice(from)
    .some((s) => s.name === "day-card" && s.action === "interrupted");
  if (!interrupted) recordStep(steps, "day-card", summarizeDayCardStats(result));
  return result;
}

async function prerenderLang(
  env: Env,
  date: string,
  lang: Lang,
  now: number,
  hour: number,
  rows: Map<string, NotificationRow | null> | null,
  stats: DayCardLangStats
): Promise<void> {
  const bucket = env.OG_CACHE;
  if (!bucket) return;
  // The same card read notify's `digestPage` does, so the `v` stamp matches
  // the URL the digest will send. A failed read leaves the base URL only,
  // like `digestPage`'s own fallback.
  let version: string | undefined;
  try {
    version = (await loadDayCard(env, date, lang))?.version;
  } catch (error) {
    stats.failed++;
    console.warn(
      `day-card ${date} ${lang}: card read failed: ${safeErrorMessage(error)}`
    );
  }
  // The base card is the day page's og:image: visitors and crawlers fetch it
  // whether or not notify sends, so it always refreshes on its own TTL.
  const keys = [dayOgObjectKey(new URL(digestCardUrl({ date, lang })))];
  // The versioned card is only Telegram's digest link preview
  // (notify/telegram.ts digestLinkPreview): Facebook's digest attaches the
  // day page (so it crawls the base og:image) and the webhook payload carries
  // no card URL. So the gate is exactly this language's Telegram row, via
  // notify's own pure decision on the same rows. An unconfigured Telegram
  // channel cannot send either, and its missing row would otherwise keep the
  // gate open forever; enabled() is not checked because a half-configured
  // Telegram throws in assertNotifyConfig before any send.
  if (version) {
    const telegram = notifiers.find((n) => n.lang === lang && n.id.startsWith("telegram"));
    if (rows === null) {
      stats.readFailed++;
    } else if (
      telegram &&
      shouldSendDigest(rows.get(telegram.id) ?? null, hour)
    ) {
      keys.push(dayOgObjectKey(new URL(digestCardUrl({ date, lang }, version))));
    } else {
      stats.skippedNoSend++;
    }
  }
  const stale: string[] = [];
  // Provenance survives a failed card read: without a current version the
  // put keeps the previous stamp instead of erasing it.
  let baseStamp: string | undefined;
  for (const key of keys) {
    const obj = await bucket.get(key).catch(() => null);
    if (key === keys[0]) baseStamp = obj?.customMetadata?.contentVersion;
    const expiresAt = Number(obj?.customMetadata?.expiresAt ?? 0);
    // Same freshness rule as `cachedOgResponse`: no expiry keeps forever.
    const fresh = Boolean(obj && (!expiresAt || now < expiresAt));
    if (key === keys[0] && obj && version) {
      // Base card, demand-aligned: our own previous render of the same tile
      // set needs no background refresh even once expired — the route
      // refreshes it on demand, per colo, for whoever actually fetches it.
      // A request-path put carries no stamp, so an expired unstamped object
      // still pre-renders: demand for it was proven by that very request.
      const stamped = obj.customMetadata?.contentVersion;
      if (stamped === version) {
        if (fresh) stats.skippedFresh++;
        else stats.skippedUnchanged++;
        continue;
      }
      // Our own render of a different tile set: warm the new content even
      // while the old object is still fresh.
      if (stamped !== undefined) {
        stale.push(key);
        continue;
      }
    }
    if (fresh) stats.skippedFresh++;
    else stale.push(key);
  }
  if (stale.length === 0) return;
  // One render per language: the base and versioned keys address the same
  // card, so drawing twice would double the WASM cost and could store two
  // different images (a photo fetch can fail on one call and not the next).
  // Lazy: the satori/resvg WASM graph loads only when a render is due, not
  // on every run that selects this step (node tests import the workflow
  // without a workerd runtime).
  const { renderDayCard } = await import("../../src/lib/day-og-render.js");
  const { DAY_OG_WIDTH, DAY_OG_HEIGHT } = await import("../../src/lib/day-og.js");
  let bytes: Uint8Array<ArrayBuffer>;
  let maxAgeSec: number;
  let headers: Response;
  try {
    const rendered = await renderDayCard(env, date, lang, now);
    if (!rendered.store) {
      stats.skippedEmpty += stale.length;
      return;
    }
    bytes = new Uint8Array(await rendered.response.arrayBuffer());
    maxAgeSec = rendered.maxAgeSec;
    headers = rendered.response;
  } catch (error) {
    stats.failed += stale.length;
    console.warn(
      `day-card ${date} ${lang} ${stale.join(" ")}: render failed: ${safeErrorMessage(error)}`
    );
    return;
  }
  if (!validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)) {
    // Only validated bytes are stored, so an existing object is never
    // replaced by a broken render.
    stats.failed += stale.length;
    console.warn(
      `day-card ${date} ${lang} ${stale.join(" ")}: invalid PNG render, not stored`
    );
    return;
  }
  // Last-writer-wins, like the request path's own put: a concurrent request
  // render inside this window can be overwritten by this valid snapshot.
  // Bounded by the hour TTL and self-healing on the next key change.
  for (const key of stale) {
    try {
      await putDayCardObject(
        bucket,
        key,
        new Response(bytes, headers),
        maxAgeSec,
        version ?? baseStamp
      );
      stats.rendered++;
    } catch (error) {
      stats.failed++;
      console.warn(`day-card ${date} ${lang} ${key}: ${safeErrorMessage(error)}`);
    }
  }
}
