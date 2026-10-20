import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { NewsIngestScheduler } from "../ingest-scheduler.js";
import type { D1Runner } from "../workflow-run.js";

/** One-table fake: INSERT upserts the row, UPDATE sets `error`, the
 * open-run SELECT returns the latest row. */
function fakeRunsDb() {
  let row: Record<string, unknown> | null = null;
  const db: D1Runner = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        run: async () => {
          if (sql.startsWith("INSERT")) {
            row = {
              id: args[0],
              started_at: args[1],
              finished_at: args[2],
              error: args[5],
            };
          } else if (sql.startsWith("UPDATE") && row) {
            row.error = args[0];
          }
          return { success: true, meta: { changes: 1 } };
        },
        first: async <T>() => row as T,
      }),
    }),
  };
  return { db, row: () => row };
}

describe("NewsIngestScheduler.startInstance", () => {
  it("leaves the run row open when storage fails after create() succeeded", async () => {
    const { db, row } = fakeRunsDb();
    const create = vi.fn().mockResolvedValue({});
    const storage = {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new Error("storage down")),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new NewsIngestScheduler(
      { storage } as never,
      { DB: db, NEWS_INGEST: { create } } as never
    );

    await expect(scheduler.tick()).rejects.toThrow(/storage down/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(row()?.error ?? null).toBeNull();

    // The live run still holds the gate: a second tick must not start one.
    const next = await scheduler.tick();
    expect(next).toMatchObject({ skipped: true });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
