import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** The `yt_state` table from its migration, behind the slice of D1 that
 *  `worker/yt-state.ts` uses. Real SQL, so expiry and the atomic nonce burn
 *  are the database's. `data` reads values the way a Map would. */
export function ytStore(initial: Record<string, string> = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(
    readFileSync(
      new URL("../../migrations/0079_yt_state.sql", import.meta.url),
      "utf8"
    )
  );
  const insert = raw.prepare("INSERT INTO yt_state (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(initial)) insert.run(key, value);

  type Param = string | number | null;
  type Statement = {
    bind: (...next: Param[]) => Statement;
    run: () => Promise<{ meta: { changes: number } }>;
    first: <T>() => Promise<T | null>;
  };
  const prepare = (sql: string): Statement => {
    let params: Param[] = [];
    const statement: Statement = {
      bind(...next) {
        params = next;
        return statement;
      },
      async run() {
        return {
          meta: { changes: Number(raw.prepare(sql).run(...params).changes) },
        };
      },
      async first<T>() {
        return (raw.prepare(sql).get(...params) ?? null) as T | null;
      },
    };
    return statement;
  };
  const db = {
    prepare,
    batch: async (statements: Statement[]) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;

  const row = (key: string) =>
    raw
      .prepare("SELECT value, expires_at FROM yt_state WHERE key = ?")
      .get(key) as { value: string; expires_at: number | null } | undefined;
  const data = {
    get: (key: string) => row(key)?.value,
    has: (key: string) => row(key) !== undefined,
    expiresAt: (key: string) => row(key)?.expires_at,
    values: () =>
      (
        raw.prepare("SELECT value FROM yt_state").all() as { value: string }[]
      ).map((r) => r.value),
  };
  return { db, data, raw };
}
