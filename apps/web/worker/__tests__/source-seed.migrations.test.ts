import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HN_POPULAR_SOURCE } from "../sources/catalog.js";
import {
  ensureVendorBlogSources,
  resetVendorBlogSeedCache,
} from "../sources/seed.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    return {
      all: async () => ({ results: statement.all() as unknown[] }),
      run: async () => {
        const result = statement.run();
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

/** The `hn` config production held on 2026-10-16: migration 0017's query,
 *  written back over 0043 by a schema setup that has since been removed (#871). */
const HN_0017_CONFIG =
  '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek OR Qwen OR Mistral OR Llama OR Grok OR Cursor OR Copilot OR Nvidia OR HuggingFace OR ollama OR vLLM OR MCP OR agentic OR OpenRouter"}';

let sqlite: DatabaseSync;
let db: D1Database;

const hnConfig = () =>
  (
    sqlite.prepare("SELECT config FROM sources WHERE id = 'hn'").get() as {
      config: string;
    }
  ).config;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  db = new SqliteD1(sqlite) as unknown as D1Database;
  resetVendorBlogSeedCache();
});

afterEach(() => {
  sqlite.close();
});

describe("ensureVendorBlogSources over the real migrations", () => {
  it("restores the catalog HN config over a reverted 0017 row (#871, #881 floor)", async () => {
    sqlite
      .prepare("UPDATE sources SET config = ? WHERE id = 'hn'")
      .run(HN_0017_CONFIG);

    await ensureVendorBlogSources(db);

    expect(hnConfig()).toBe(JSON.stringify(HN_POPULAR_SOURCE.config));
    expect(JSON.parse(hnConfig()).popularMinPoints).toBe(20);
  });
});
