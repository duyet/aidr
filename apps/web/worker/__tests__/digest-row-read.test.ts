import { describe, expect, it, vi } from "vitest";
import {
  DIGEST_ROW_SQL,
  readDigestNotificationRow,
  readDigestNotificationRows,
} from "../notify/index.js";
import type { Env } from "../types.js";

/** The day-card step and the notify loop must decide from one row shape and
 *  one query; these tests fail if the shared read drifts or writes. */
function mockDb(rows: Record<string, unknown>) {
  const prepare = vi.fn((sql: string) => {
    const stmt = {
      sql,
      args: [] as unknown[],
      first: async () => rows[String(stmt.args[0])] ?? null,
      bind: (...args: unknown[]) => {
        stmt.args = args;
        return stmt;
      },
    };
    return stmt;
  });
  const batch = vi.fn(async (stmts: { args: unknown[] }[]) =>
    stmts.map((stmt) => {
      const row = rows[String(stmt.args[0])];
      return { results: row ? [row] : [] };
    })
  );
  const run = vi.fn();
  return {
    env: { DB: { prepare, batch, run } } as unknown as Pick<Env, "DB">,
    prepare,
    batch,
    run,
  };
}

const ROW = { status: "sent", attempts: 1, posted_at: 1 };

describe("shared digest notification read", () => {
  it("single and batched reads use the same query and return the same rows", async () => {
    const one = mockDb({ telegram: ROW });
    const many = mockDb({ telegram: ROW });
    const single = await readDigestNotificationRow(
      one.env,
      "telegram",
      "digest:2026-10-15"
    );
    const batched = await readDigestNotificationRows(
      many.env,
      ["telegram", "telegram-en"],
      "digest:2026-10-15"
    );
    expect(single).toEqual(ROW);
    expect(batched.get("telegram")).toEqual(ROW);
    expect(batched.get("telegram-en")).toBeNull();
    expect(one.prepare.mock.calls[0][0]).toBe(DIGEST_ROW_SQL);
    expect(many.prepare.mock.calls[0][0]).toBe(DIGEST_ROW_SQL);
    expect(one.run).not.toHaveBeenCalled();
    expect(many.run).not.toHaveBeenCalled();
  });

  it("binds channel and key in that order on every statement", async () => {
    const { env, prepare } = mockDb({});
    await readDigestNotificationRows(
      env,
      ["telegram", "facebook-en"],
      "digest:2026-10-15"
    );
    expect(prepare.mock.calls).toHaveLength(2);
    const stmts = prepare.mock.results.map((r) => r.value);
    expect(stmts[0].args).toEqual(["telegram", "digest:2026-10-15"]);
    expect(stmts[1].args).toEqual(["facebook-en", "digest:2026-10-15"]);
  });

  it("a failed batch throws so the caller can choose its fallback", async () => {
    const { env } = mockDb({});
    (
      env.DB as unknown as { batch: ReturnType<typeof vi.fn> }
    ).batch.mockRejectedValue(new Error("budget spent"));
    await expect(
      readDigestNotificationRows(env, ["telegram"], "digest:2026-10-15")
    ).rejects.toThrow("budget spent");
  });
});
