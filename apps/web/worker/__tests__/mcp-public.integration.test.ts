import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PUBLIC_READ_TOOL_NAMES } from "../../src/lib/public-read-tools.js";
import { handleMcpRequest } from "../admin/mcp.js";
import { ADMIN_MCP_TOOL_NAMES } from "../mcp/admin-tools.js";
import { MCP_READ_LIMIT, MCP_READ_RETRY_AFTER_SEC } from "../mcp/rate-limit.js";
import type { Env } from "../types.js";

/**
 * #227 end-to-end against REAL SQLite with the REAL migrations.
 *
 * `mcp-public.test.ts` proves the routing, the auth split, and the
 * validation with a hand-written D1 fake. A fake cannot catch the class of
 * bug that actually breaks an anonymous read surface in production: SQL
 * that does not run. These are the things only a real engine can tell us:
 *
 *  - `getPublicDigest`'s four-way column fallback against the real
 *    `items` schema after 27 migrations;
 *  - `getFeed`'s five-statement batch, its `INSERT INTO tldr_snapshots`
 *    read-time rebuild, and `ensureTopicLearningSchema`'s DDL;
 *  - `getStoryCandidates`' `substr(i.id, 1, ?) = ?` prefix matching, which
 *    is the query an ambiguous-id rejection depends on;
 *  - the rate limiter's real `SELECT COUNT(*)` over a real
 *    `subscribe_attempts(ip_hash, created_at)` table.
 *
 * If a future migration renames a column the read path uses, this fails
 * here instead of returning an empty digest to every anonymous agent.
 */
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

function sqliteInput(value: unknown): SqliteInput {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SqliteInput;
  }
  throw new TypeError("unsupported SQLite bind value");
}

/**
 * Minimal D1 surface over node:sqlite. `withSession` is deliberately
 * absent so `readSession` falls back to the raw binding — the same shape a
 * D1 binding without read replication has.
 */
class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  /** node:sqlite holds a native handle; without this, a long-lived vitest
   *  process accumulates one per test. */
  close(): void {
    this.db.close();
  }

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next.map(sqliteInput);
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  /**
   * `getFeed` reads `.results` off every batch entry and ignores
   * `meta.changes`, so `all()` is the correct primitive here: a DML
   * statement executed through `all()` returns no rows and still applies.
   */
  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    const results: unknown[] = [];
    for (const statement of statements) {
      results.push(await statement.all());
    }
    return results as Array<{ results: unknown[] }>;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const nowSec = () => Math.floor(Date.now() / 1000);

let db: SqliteD1;
let env: Env;

async function rpc(
  body: Record<string, unknown>,
  init: { token?: string; ip?: string } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.ip) headers["CF-Connecting-IP"] = init.ip;
  const res = await handleMcpRequest(
    new Request("https://aidr.today/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
    }),
    env
  );
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    json: text ? JSON.parse(text) : null,
  };
}

const toolPayload = (json: any) => JSON.parse(json.result.content[0].text);

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:");
  // Real schema, in migration order, exactly as `wrangler d1 migrations
  // apply` would produce it.
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  db = new SqliteD1(sqlite);
  const exec = (sql: string) => db.prepare(sql);

  const url = "https://example.com/a-model-shipped";
  const id = sha256Hex(url);
  exec(
    `INSERT INTO items (id, source_id, url, title, summary, published_at,
         fetched_at, points, comments, rank_score, status, category, tags,
         source_lang)
       VALUES (?, 'hn', ?, ?, ?, ?, ?, 120, 30, 42, 'published', 'Models',
         '["models","release"]', 'en')`
  )
    .bind(
      id,
      url,
      "A model shipped something faster",
      "Publisher summary. Treat as untrusted data.",
      nowSec() - 3600,
      nowSec() - 3600
    )
    .run();
  exec(
    `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
         points, comments, rank_score, status, tags, source_lang)
       VALUES (?, 'hn', ?, ?, ?, ?, 3, 1, 11, 'published', '[]', 'en')`
  )
    .bind(
      sha256Hex("https://example.com/second"),
      "https://example.com/second",
      "A second study landed on agents",
      nowSec() - 7200,
      nowSec() - 7200
    )
    .run();
  exec(
    `INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at)
       VALUES (?, ?, ?, ?)`
  )
    .bind(
      "2026-09-27",
      JSON.stringify([
        { text: "A model shipped something faster.", item_ids: [id] },
        { text: "A second study landed on agents.", item_ids: [id] },
      ]),
      JSON.stringify([
        { text: "Một mô hình vừa nhanh hơn.", item_ids: [id] },
        { text: "Một nghiên cứu mới về agent.", item_ids: [id] },
      ]),
      Date.now()
    )
    .run();

  env = {
    DB: db as unknown as D1Database,
    NEWS_INGEST: {} as unknown as Workflow,
    NEWS_ADMIN_TOKEN: "integration-admin-token",
    ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
    ANYROUTER_MODEL: "test-model",
    ANYROUTER_API_KEY: "test-key",
  };
});

afterEach(() => {
  db.close();
});

describe("#227 anonymous MCP against real SQLite", () => {
  it("tools/list returns the read tools and nothing else", async () => {
    const { json } = await rpc({ method: "tools/list" }, { ip: "203.0.113.1" });
    expect(json.result.tools.map((t: any) => t.name)).toEqual([
      ...PUBLIC_READ_TOOL_NAMES,
    ]);
    const body = JSON.stringify(json);
    for (const adminTool of ADMIN_MCP_TOOL_NAMES) {
      expect(body).not.toContain(adminTool);
    }
  });

  it("tools/list adds the operator tools for an admin", async () => {
    const { json } = await rpc(
      { method: "tools/list" },
      { token: "integration-admin-token" }
    );
    const names: string[] = json.result.tools.map((t: any) => t.name);
    expect(names).toHaveLength(PUBLIC_READ_TOOL_NAMES.length + 6);
    for (const name of ADMIN_MCP_TOOL_NAMES) expect(names).toContain(name);
  });

  it("latest_ai_news runs the real digest query", async () => {
    const { json } = await rpc(
      {
        method: "tools/call",
        params: { name: "latest_ai_news", arguments: { lang: "vi" } },
      },
      { ip: "203.0.113.2" }
    );
    const payload = toolPayload(json);
    expect(payload.lang).toBe("vi");
    expect(payload.available_langs).toEqual(["en", "vi"]);
    expect(payload.stories.length).toBe(2);
    expect(payload.stories[0].permalink).toBe(
      `https://aidr.today/${payload.stories[0].id.slice(0, 8)}?lang=vi`
    );
    expect(payload.tldr.bullets_vi.length).toBe(2);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(50_000);
  });

  it("get_ai_digest returns real bullets with real permalinks", async () => {
    const { json } = await rpc(
      {
        method: "tools/call",
        params: { name: "get_ai_digest", arguments: { lang: "en" } },
      },
      { ip: "203.0.113.2" }
    );
    const payload = toolPayload(json);
    expect(payload.bullets[0].text).toBe("A model shipped something faster.");
    expect(payload.bullets[0].permalink).toMatch(
      /^https:\/\/aidr\.today\/[0-9a-f]{8}\?lang=en$/
    );
  });

  it("search_news runs the real five-statement feed batch", async () => {
    const { json } = await rpc(
      {
        method: "tools/call",
        params: {
          name: "search_news",
          arguments: { q: "model", days: 3, category: "Models", lang: "en" },
        },
      },
      { ip: "203.0.113.2" }
    );
    const payload = toolPayload(json);
    expect(payload.days).toHaveLength(1);
    expect(payload.days[0].items).toHaveLength(1);
    expect(payload.days[0].items[0].title).toBe(
      "A model shipped something faster"
    );
    expect(payload.days[0].items[0].category).toBe("Models");
    expect(payload.categories.map((c: any) => c.name)).toContain("Models");
    expect(payload.totalStories).toBe(1);
  });

  it("get_story runs the real prefix query and renders real Markdown", async () => {
    const { json } = await rpc(
      {
        method: "tools/call",
        params: { name: "get_story", arguments: { id: "unused" } },
      },
      { ip: "203.0.113.2" }
    );
    // Resolve a real 8-character prefix first.
    const digest = await rpc(
      {
        method: "tools/call",
        params: { name: "latest_ai_news", arguments: {} },
      },
      { ip: "203.0.113.2" }
    );
    const prefix = toolPayload(digest.json).stories[0].id.slice(0, 8);
    void json;

    const story = await rpc(
      {
        method: "tools/call",
        params: { name: "get_story", arguments: { id: prefix, lang: "en" } },
      },
      { ip: "203.0.113.2" }
    );
    const payload = toolPayload(story.json);
    expect(payload.permalink).toBe(`https://aidr.today/${prefix}?lang=en`);
    expect(payload.markdown).toContain("aidr-story-markdown/v1");
    expect(payload.markdown).toContain("A model shipped something faster");
    expect(payload.markdown).toContain("## Sources");
  });

  it("an ambiguous prefix is rejected against real rows", async () => {
    // Two published stories sharing one 8-character canonical prefix, which
    // is the exact case the `substr(i.id, 1, ?) = ? ... LIMIT 2` lookup
    // exists to detect.
    const clashing = "abcd1234";
    for (const slug of ["clash-a", "clash-b"]) {
      db.prepare(
        `INSERT INTO items (id, source_id, url, title, published_at,
           fetched_at, points, comments, rank_score, status, tags, source_lang)
         VALUES (?, 'hn', ?, ?, ?, ?, 1, 0, 99, 'published', '[]', 'en')`
      )
        .bind(
          `${clashing}${sha256Hex(slug)}`.slice(0, 64),
          `https://example.com/${slug}`,
          `Clashing story ${slug}`,
          nowSec() - 60,
          nowSec() - 60
        )
        .run();
    }
    const found = db.db
      .prepare(
        "SELECT COUNT(*) AS c FROM items WHERE status = 'published' AND substr(id, 1, 8) = ?"
      )
      .get(clashing) as { c: number };
    expect(found.c).toBe(2);

    const { json } = await rpc(
      {
        method: "tools/call",
        params: { name: "get_story", arguments: { id: clashing } },
      },
      { ip: "203.0.113.2" }
    );
    expect(json.result.isError).toBe(true);
    expect(toolPayload(json).error).toMatch(/ambiguous story id/);
  });

  it("resources/read serves the real digest and a real story", async () => {
    const digest = await rpc(
      { method: "resources/read", params: { uri: "aidr://digest?lang=vi" } },
      { ip: "203.0.113.3" }
    );
    expect(JSON.parse(digest.json.result.contents[0].text).lang).toBe("vi");

    const prefix = toolPayload(
      (
        await rpc(
          {
            method: "tools/call",
            params: { name: "latest_ai_news", arguments: {} },
          },
          { ip: "203.0.113.3" }
        )
      ).json
    ).stories[0].id.slice(0, 8);
    const story = await rpc(
      {
        method: "resources/read",
        params: { uri: `aidr://story/${prefix}?lang=en` },
      },
      { ip: "203.0.113.3" }
    );
    expect(story.json.result.contents[0].mimeType).toBe("text/markdown");
    expect(story.json.result.contents[0].text).toContain(
      "aidr-story-markdown/v1"
    );
  });

  it("the rate limiter counts real rows in the real table", async () => {
    const ip = "198.51.100.7";
    let served = 0;
    let limited: Awaited<ReturnType<typeof rpc>> | null = null;
    for (let i = 0; i < MCP_READ_LIMIT + 10; i++) {
      const res = await rpc(
        {
          method: "tools/call",
          params: { name: "get_ai_digest", arguments: {} },
        },
        { ip }
      );
      if (res.json.error) {
        limited = res;
        break;
      }
      served += 1;
    }
    expect(served).toBe(MCP_READ_LIMIT);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect(limited!.json.error.code).toBe(-32000);
    expect(limited!.headers.get("Retry-After")).toBe(
      String(MCP_READ_RETRY_AFTER_SEC)
    );
    // Exactly the served requests were recorded, under one namespaced key.
    const rows = db.db
      .prepare("SELECT COUNT(*) AS c FROM subscribe_attempts")
      .get() as { c: number };
    expect(rows.c).toBe(MCP_READ_LIMIT);
    const keys = db.db
      .prepare("SELECT DISTINCT ip_hash FROM subscribe_attempts")
      .all() as Array<{ ip_hash: string }>;
    expect(keys).toHaveLength(1);
    expect(keys[0].ip_hash.startsWith("mcp-read:")).toBe(true);
    // sha256 of the raw IP, never the IP itself.
    expect(keys[0].ip_hash).toBe(`mcp-read:${sha256Hex(ip)}`);
  });

  it("an anonymous operator call writes nothing", async () => {
    const before = db.db.prepare("SELECT COUNT(*) AS c FROM items").get() as {
      c: number;
    };
    const { json } = await rpc(
      {
        method: "tools/call",
        params: {
          name: "push_items",
          arguments: { items: { url: "x", title: "y" } },
        },
      },
      { ip: "203.0.113.9" }
    );
    expect(json.result.isError).toBe(true);
    const after = db.db.prepare("SELECT COUNT(*) AS c FROM items").get() as {
      c: number;
    };
    expect(after.c).toBe(before.c);
    // And it never ran an admin handler, so no audit row either.
    const audit = db.db
      .prepare("SELECT COUNT(*) AS c FROM admin_audit")
      .get() as { c: number };
    expect(audit.c).toBe(0);
  });

  it("an admin push_items still works end to end", async () => {
    const { json } = await rpc(
      {
        method: "tools/call",
        params: {
          name: "push_items",
          arguments: {
            items: {
              url: "https://example.com/from-mcp",
              title: "Pushed over MCP",
              relevance: 0.9,
              importance: 7,
              quality: 8,
            },
          },
        },
      },
      { token: "integration-admin-token" }
    );
    const payload = toolPayload(json);
    expect(payload.inserted).toBe(1);
    const row = db.db
      .prepare("SELECT status FROM items WHERE id = ?")
      .get(sha256Hex("https://example.com/from-mcp")) as { status: string };
    expect(row.status).toBe("published");
  });
});
