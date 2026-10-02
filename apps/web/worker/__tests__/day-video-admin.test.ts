import { describe, expect, it } from "vitest";
import { deleteDayVideo, setDayVideo } from "../admin/handlers.js";
import type { Env } from "../types.js";

type Row = {
  youtube_id: string | null;
  short_id: string | null;
  title: string | null;
  added_by: string | null;
};

/** Just enough D1 for the day_videos upsert / delete / audit statements. */
function makeEnv() {
  const rows = new Map<string, Row>();
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...b: unknown[]) {
          binds = b;
          return stmt;
        },
        async first() {
          if (sql.includes("FROM day_videos")) {
            return rows.get(binds[0] as string) ?? null;
          }
          return null;
        },
        async run() {
          if (sql.startsWith("INSERT INTO day_videos")) {
            const [date, youtube_id, short_id, title, added_by] = binds as [
              string,
              string | null,
              string | null,
              string | null,
              string | null,
            ];
            rows.set(date, { youtube_id, short_id, title, added_by });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE FROM day_videos")) {
            const had = rows.delete(binds[0] as string);
            return { meta: { changes: had ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { env: { DB: db } as unknown as Env, rows };
}

describe("setDayVideo", () => {
  it("stores a desktop video and a mobile Short from pasted URLs", async () => {
    const { env, rows } = makeEnv();
    const result = await setDayVideo(
      env,
      "2026-10-02",
      {
        video: "https://youtu.be/B3vKYiV7rOw",
        short: "https://youtube.com/shorts/fStNAQhJo3M",
      },
      "admin-token"
    );
    expect(result).toMatchObject({
      ok: true,
      video: { youtube_id: "B3vKYiV7rOw", short_id: "fStNAQhJo3M" },
    });
    expect(rows.get("2026-10-02")?.added_by).toBe("admin-token");
  });

  it("sets and clears each field independently", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    await setDayVideo(env, "2026-10-02", { short: "fStNAQhJo3M" }, null);
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: "B3vKYiV7rOw",
      short_id: "fStNAQhJo3M",
    });
    await setDayVideo(env, "2026-10-02", { video: null }, null);
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: null,
      short_id: "fStNAQhJo3M",
    });
    // Clearing the last remaining id would leave an empty row: refuse.
    const refused = await setDayVideo(env, "2026-10-02", { short: "" }, null);
    expect(refused).toMatchObject({ status: 400 });
    expect(rows.get("2026-10-02")?.short_id).toBe("fStNAQhJo3M");
  });

  it("rejects bad ids and dates before touching D1", async () => {
    const { env, rows } = makeEnv();
    for (const [date, input] of [
      ["2026-10-02", { video: "https://evil.example/watch?v=B3vKYiV7rOw" }],
      ["2026-10-02", { short: "not-an-id" }],
      ["2026-02-30", { video: "B3vKYiV7rOw" }],
      ["../x", { video: "B3vKYiV7rOw" }],
      ["2026-10-02", {}],
    ] as const) {
      expect(await setDayVideo(env, date, input, null)).toMatchObject({
        status: 400,
      });
    }
    expect(rows.size).toBe(0);
  });
});

describe("deleteDayVideo", () => {
  it("removes the row and reports whether one existed", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    expect(await deleteDayVideo(env, "2026-10-02")).toEqual({
      ok: true,
      date: "2026-10-02",
      deleted: true,
    });
    expect(rows.size).toBe(0);
    expect(await deleteDayVideo(env, "2026-10-02")).toMatchObject({
      deleted: false,
    });
    expect(await deleteDayVideo(env, "nope")).toMatchObject({ status: 400 });
  });
});
