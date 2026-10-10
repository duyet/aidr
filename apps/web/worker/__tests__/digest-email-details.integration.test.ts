/**
 * The digest mail joins each bullet to its item against the real schema.
 * A query naming a column the migrations never created (items.title_vi)
 * passed the mocked tests and failed every send in production, so this runs
 * the real migrations and renderEditionEmail end to end.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderEditionEmail } from "../subscribe/send.js";
import type { Env } from "../types.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
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
}

const DATE = "2026-10-10";
let sqlite: DatabaseSync;
let env: Pick<Env, "DB" | "MAIL_POSTAL_ADDRESS">;

/** Inserts an item, filling every NOT NULL column without a default. */
function insertItem(values: Record<string, string>) {
  const columns = sqlite.prepare("PRAGMA table_info(items)").all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
    pk: number;
  }>;
  const row: Record<string, string | number> = { ...values };
  for (const c of columns) {
    if (c.name in row || !c.notnull || c.dflt_value !== null) continue;
    row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : `x-${c.name}`;
  }
  const names = Object.keys(row);
  sqlite
    .prepare(
      `INSERT INTO items (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
    )
    .run(...Object.values(row));
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  insertItem({
    id: "item-1",
    url: "https://techcrunch.com/a",
    title: "Anthropic model sent police a false tip",
    category: "Agents",
    status: "published",
  });
  sqlite
    .prepare(
      "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, ?, ?, ?)"
    )
    .run(
      "item-1",
      "vi",
      "Mô hình của Anthropic gửi tin báo giả cho cảnh sát",
      "Tóm tắt."
    );
  env = { DB: new SqliteD1(sqlite) as unknown as D1Database };
});

afterEach(() => {
  sqlite.close();
});

const bullets = [
  {
    text: "First sentence of the story. Second sentence with the detail.",
    item_ids: ["item-1"],
  },
];

describe("renderEditionEmail against the real schema", () => {
  it("uses the Vietnamese title from translations for the vi mail", async () => {
    const { html } = await renderEditionEmail(
      env,
      { date: DATE, lang: "vi", bullets },
      "token",
      8,
      "design"
    );
    expect(html).toContain(
      "Mô hình của Anthropic gửi tin báo giả cho cảnh sát"
    );
    expect(html).not.toContain("Anthropic model sent police a false tip");
  });

  it("uses the English title for the en mail", async () => {
    const { html } = await renderEditionEmail(
      env,
      { date: DATE, lang: "en", bullets },
      "token",
      8,
      "design"
    );
    expect(html).toContain("Anthropic model sent police a false tip");
  });

  it("still renders when the item lookup fails", async () => {
    const failing = {
      prepare(sql: string) {
        if (sql.includes("FROM items")) throw new Error("D1_ERROR: boom");
        return (env.DB as unknown as SqliteD1).prepare(sql);
      },
    };
    const { html } = await renderEditionEmail(
      { DB: failing as unknown as D1Database },
      { date: DATE, lang: "en", bullets },
      "token",
      8,
      "design"
    );
    expect(html).toContain("First sentence of the story.");
  });
});
