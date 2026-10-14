/**
 * The cluster gate reads each published story's translation from D1 (#745):
 * `planMerges` must join the other-language `translations` row, the English
 * one for a Vietnamese source and the Vietnamese one for an English source.
 * The title pass reads each published story's URL.
 */

import type { WorkflowStep } from "cloudflare:workers";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { planMerges } from "../ingest/merge.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
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

const NOW = Date.UTC(2026, 9, 7, 19, 0, 0);
const NOW_SEC = NOW / 1000;

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  return db;
}

function publish(
  db: DatabaseSync,
  story: { id: string; sourceId: string; url: string; title: string },
  sourceLang: "en" | "vi",
  translations: Record<string, string>
) {
  db.prepare(
    `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
                        status, source_lang)
     VALUES (?, ?, ?, ?, ?, ?, 'published', ?)`
  ).run(
    story.id,
    story.sourceId,
    story.url,
    story.title,
    NOW_SEC - 6 * 3600,
    NOW_SEC - 6 * 3600,
    sourceLang
  );
  for (const [lang, title] of Object.entries(translations)) {
    db.prepare(
      `INSERT INTO translations (item_id, lang, title, source_lang, target_lang)
       VALUES (?, ?, ?, ?, ?)`
    ).run(story.id, lang, title, sourceLang, lang);
  }
}

function ctx(db: DatabaseSync): IngestContext {
  const step = {
    do: async (_name: string, ...rest: unknown[]) =>
      (rest.at(-1) as () => Promise<unknown>)(),
  } as unknown as WorkflowStep;
  const env = {
    DB: new SqliteD1(db) as unknown as D1Database,
    ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
    ANYROUTER_MODEL: "test/cluster",
    ANYROUTER_API_KEY: "test-key",
  } as unknown as Env;
  return { step, env, runId: "r1", steps: [], mode: LIVE_FULL_RUN };
}

function fresh(id: string, sourceId: string, url: string, title: string) {
  return {
    id,
    source: { id: sourceId, type: "rss", config: "{}", enabled: 1 },
    item: { url, title, publishedAt: NOW_SEC - 1800 },
  } satisfies NewRow;
}

function modelAnswers(clusters: unknown) {
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const body = frame({
    choices: [{ delta: { content: JSON.stringify({ clusters }) } }],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(`${body}data: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
    )
  );
}

describe("planMerges cluster gate across languages (#745)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("judges a link against the story's other-language translation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = migratedDb();
    // Shares no word with the English items below: only its English
    // translation does ("super").
    publish(
      db,
      {
        id: "president",
        sourceId: "vnexpress-tech",
        url: "https://vnexpress.net/tong-thong-my-doi-ten-ai-thanh-sieu-tri-tue-5126433.html",
        title: "Tổng thống Mỹ đổi tên AI thành 'siêu trí tuệ'",
      },
      "vi",
      {
        vi: "Tổng thống Mỹ đổi tên AI thành 'siêu trí tuệ'",
        en: "US President renames AI to 'super intelligence'",
      }
    );
    // Shares no word with the Vietnamese item below: only its Vietnamese
    // translation does ("toán học", mathematician).
    publish(
      db,
      {
        id: "math",
        sourceId: "the-decoder",
        url: "https://the-decoder.com/mathematicians-react-with-shock-as-ai-floods-their-field/",
        title: "Mathematicians react with shock as AI floods their field",
      },
      "en",
      { vi: "Các nhà toán học phản ứng sốc khi AI tràn ngập lĩnh vực của họ" }
    );
    modelAnswers([
      { new: [0], existing: ["president"] },
      { new: [1], existing: ["math"] },
      { new: [2], existing: ["president"] },
    ]);

    const { plan, clusterGate } = await planMerges(
      ctx(db),
      [
        fresh(
          "order",
          "huggingnews",
          "https://huggingnews.com/us-politics/update-trumps-super-intelligence-order-triggers-slovenia-domain-wave-52f5154d",
          "Trump's Super Intelligence Order Triggers Slovenia Domain Wave"
        ),
        fresh(
          "math-vi",
          "vnexpress-tech",
          "https://vnexpress.net/nha-toan-hoc-phan-ung-gay-gat-voi-lan-song-chung-minh-bang-ai",
          "Nhà toán học phản ứng gay gắt với làn sóng chứng minh bằng AI"
        ),
        fresh(
          "grok",
          "huggingnews",
          "https://huggingnews.com/ai/grok-47-launches-in-general-apps-after-limited-release-eb1f6886",
          "Grok 4.7 Launches in General Apps After Limited Release"
        ),
      ],
      new Map(),
      new Map(),
      NOW
    );

    expect(plan.merged.get("order")?.duplicateOf).toBe("president");
    expect(plan.merged.get("math-vi")?.duplicateOf).toBe("math");
    expect(plan.merged.has("grok")).toBe(false);
    expect(clusterGate).toEqual({
      "test/cluster": { proposed: 3, rejected: 1 },
    });
  });
});

describe("planMerges title pass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("folds an edited vnexpress headline into its published article", async () => {
    const db = migratedDb();
    publish(
      db,
      {
        id: "7afadede",
        sourceId: "vnexpress-tech",
        url: "https://vnexpress.net/thu-tuong-phai-do-dem-dong-gop-cua-cong-nghe-vao-tang-truong-5125902.html",
        title: "Thủ tướng: Phải đo đếm đóng góp của công nghệ vào tăng trưởng",
      },
      "vi",
      {}
    );
    modelAnswers([]);

    const { plan } = await planMerges(
      ctx(db),
      [
        fresh(
          "586b7f43",
          "vnexpress-tech",
          "https://vnexpress.net/thu-tuong-nhiem-vu-khoa-hoc-cong-nghe-phai-tra-loi-4-cau-hoi-5125902.html",
          "Thủ tướng: Nhiệm vụ khoa học công nghệ phải trả lời 4 câu hỏi"
        ),
      ],
      new Map(),
      new Map(),
      NOW
    );

    expect(plan.merged.get("586b7f43")?.duplicateOf).toBe("7afadede");
  });
});
