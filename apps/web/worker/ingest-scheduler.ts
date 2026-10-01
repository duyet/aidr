import { DurableObject } from "cloudflare:workers";
import { maybeSyncGa4Insights } from "./ga4/insights.js";
import {
  armAlarmAt,
  blockedByOpenRun,
  type IngestTickOpts,
  type IngestTickResult,
  nextAlarmAt,
  persistCreatedIngestRun,
  shouldSkipIngest,
} from "./ingest-schedule.js";
import type { Env } from "./types.js";
import { type D1Runner, NOT_DRY_RUN_SQL } from "./workflow-run.js";

const LAST_STARTED_KEY = "last_started_at";

/**
 * Singleton Durable Object that fires ingest every 30 minutes without a Worker cron
 * trigger (Free accounts are capped at 5 crons). GitHub Actions remains a
 * watchdog; both paths call `tick()` so overlapping POSTs coalesce.
 *
 * HTTP `POST /api/admin/ingest` uses `canStart` + Worker D1 persist +
 * Worker `NEWS_INGEST.create({ id })` + `markStarted`. Alarm `tick()`
 * still creates from this isolate (best-effort persist).
 */
export class NewsIngestScheduler extends DurableObject<Env> {
  async alarm(): Promise<void> {
    await this.tick();
    // Audience sync rides the 30-minute alarm behind its own 24h gate: this
    // account cannot spend Worker cron slots, and GA4 does not resolve finer
    // than a day anyway. Best-effort and swallowed — an audience snapshot is
    // never a reason to fail the ingest alarm.
    try {
      await maybeSyncGa4Insights(this.env);
    } catch (error) {
      console.error("ga4 audience sync tick failed:", error);
    }
  }

  async markStarted(_id: string): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.put(LAST_STARTED_KEY, now);
    await this.ctx.storage.setAlarm(nextAlarmAt(now));
  }

  async canStart(opts: IngestTickOpts = {}): Promise<IngestTickResult> {
    const now = Date.now();
    const lastStartedAt = await this.ctx.storage.get<number>(LAST_STARTED_KEY);
    if (opts.scheduled === false) {
      // Dry / partial runs never move the 30-minute alarm; only make sure
      // one is armed.
      await this.ensureArmed();
    } else {
      await this.ctx.storage.setAlarm(nextAlarmAt(now));
    }

    if (shouldSkipIngest(lastStartedAt, now, opts)) {
      return {
        id: null,
        skipped: true,
        reason: "ran recently",
      };
    }
    if (!opts.force && (await previousRunStillOpen(this.env.DB, now))) {
      return {
        id: null,
        skipped: true,
        reason: "previous run still open",
      };
    }
    return { id: null, skipped: false };
  }

  async startInstance(id: string): Promise<IngestTickResult> {
    const now = Date.now();
    try {
      await this.env.NEWS_INGEST.create({ id });
      await this.ctx.storage.put(LAST_STARTED_KEY, now);
      await this.ctx.storage.setAlarm(nextAlarmAt(now));
      return { id, skipped: false };
    } catch (error) {
      console.error("ingest scheduler create failed:", error);
      return {
        id,
        skipped: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async tick(opts: IngestTickOpts = {}): Promise<IngestTickResult> {
    const gate = await this.canStart(opts);
    if (gate.skipped) return gate;

    const id = crypto.randomUUID();
    const result: IngestTickResult = { id, skipped: false };
    await persistCreatedIngestRun(this.env.DB, result);
    return this.startInstance(id);
  }

  async ensureArmed(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(armAlarmAt(Date.now()));
    }
  }
}

/** Latest non-dry run still has finished_at = started_at. A read failure
 * does not block the start; the 25-minute window still applies. */
async function previousRunStillOpen(
  db: D1Runner | undefined,
  nowMs: number
): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db
      .prepare(
        `SELECT started_at, finished_at FROM workflow_runs
         WHERE ${NOT_DRY_RUN_SQL}
         ORDER BY CASE WHEN started_at > 1000000000000 THEN started_at / 1000 ELSE started_at END DESC, id DESC
         LIMIT 1`
      )
      .first<{ started_at: number | null; finished_at: number | null }>();
    if (!row) return false;
    return blockedByOpenRun(row.started_at, row.finished_at, nowMs);
  } catch (error) {
    console.error("open-run check failed:", error);
    return false;
  }
}
