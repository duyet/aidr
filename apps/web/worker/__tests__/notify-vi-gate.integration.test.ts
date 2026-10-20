/**
 * The Vietnamese channel never posts a translation that the draft check or
 * QA rejects. Real SQLite, real migrations, the real dispatcher; only
 * `fetch` is stubbed. The bad lines are from the 2026-10 audit of
 * t.me/s/aihomnay, where 21 of 23 story posts had no QA rating.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchStoryNotifications } from "../notify/index.js";
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

// 10:00 in the audience timezone: inside the trending window.
const NOW = new Date("2026-10-01T03:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

interface Story {
  id: string;
  title: string;
  summary: string;
  titleVi: string;
  summaryVi: string;
  rank: number;
}

const CLEAN: Story = {
  id: "clean",
  title: "Anthropic opens a Tokyo office to sell Claude to Japanese banks",
  summary:
    "Anthropic said its new Tokyo office will sell Claude to Japanese banks and insurers, and hire 40 people by March.",
  titleVi:
    "Anthropic mở văn phòng Tokyo để bán Claude cho các ngân hàng Nhật Bản",
  summaryVi:
    "Anthropic cho biết văn phòng mới tại Tokyo sẽ bán Claude cho các ngân hàng và công ty bảo hiểm Nhật Bản, và tuyển 40 người trước tháng 3.",
  rank: 10,
};

/** One audited calque per case: the source term, the rendering that went
 *  out, and the Vietnamese the rule asks for. */
const CALQUES = [
  {
    term: "model family",
    bad: "gia đình mô hình",
    good: "dòng mô hình",
    story: {
      id: "family",
      title: "Google ships the Gemini 3 model family to developers",
      summary:
        "Google said the Gemini 3 model family is in its API today, in three sizes for coding, search and phones.",
      titleVi: "Google đưa gia đình mô hình Gemini 3 đến nhà phát triển",
      summaryVi:
        "Google cho biết gia đình mô hình Gemini 3 có trên API từ hôm nay, với ba kích cỡ cho lập trình, tìm kiếm và điện thoại.",
      rank: 11,
    },
  },
  {
    term: "artificial intelligence",
    bad: "trí tuệ nhân quả",
    good: "trí tuệ nhân tạo",
    story: {
      id: "causal",
      title: "EU sets artificial intelligence rules for hospitals",
      summary:
        "The EU said hospitals must log every artificial intelligence diagnosis from 2027, and patients may ask for a human review.",
      titleVi: "EU ra quy định về trí tuệ nhân quả cho bệnh viện",
      summaryVi:
        "EU cho biết từ năm 2027 các bệnh viện phải ghi lại mọi chẩn đoán bằng trí tuệ nhân quả, và bệnh nhân có thể yêu cầu người xem lại.",
      rank: 11,
    },
  },
  {
    term: "data center",
    bad: "trung tây dữ liệu",
    good: "trung tâm dữ liệu",
    story: {
      id: "west",
      title: "Microsoft plans a data center in Malaysia",
      summary:
        "Microsoft said it will build a data center near Kuala Lumpur, with power for 100,000 GPUs by the end of next year.",
      titleVi: "Microsoft lên kế hoạch xây trung tây dữ liệu ở Malaysia",
      summaryVi:
        "Microsoft cho biết sẽ xây một trung tây dữ liệu gần Kuala Lumpur, đủ điện cho 100.000 GPU vào cuối năm sau.",
      rank: 11,
    },
  },
] as const;

let sqlite: DatabaseSync;
let env: Env;
let sendBodies: Array<Record<string, unknown>>;

function addStory(story: Story) {
  sqlite
    .prepare(
      `INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at,
                          rank_score, llm_importance, status, source_lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 8, 'published', 'en')`
    )
    .run(
      story.id,
      `src-${story.id}`,
      `https://example.test/${story.id}`,
      story.title,
      story.summary,
      NOW_SEC - 3600,
      NOW_SEC - 3600,
      story.rank
    );
  sqlite
    .prepare(
      "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'vi', ?, ?)"
    )
    .run(story.id, story.titleVi, story.summaryVi);
}

function addAvoidRule(term: string, bad: string, good: string) {
  sqlite
    .prepare(
      `INSERT INTO translation_knowledge (id, kind, source_term, vi_term, bad_vi, status, created_at)
       VALUES (?, 'avoid', ?, ?, ?, 'active', 1)`
    )
    .run(`rule-${term}`, term, good, JSON.stringify([bad]));
}

function reviewDecision(
  story: Story,
  decision: string,
  candidate: { title: string; summary: string } = {
    title: story.titleVi,
    summary: story.summaryVi,
  }
) {
  sqlite
    .prepare(
      `INSERT INTO translation_review_state (
         state_id, item_id, lang, source_lang, target_lang, direction,
         source_hash, candidate_hash, source_revision, candidate_title,
         candidate_summary, criteria_fingerprint, prompt_fingerprint,
         policy_fingerprint, decision, attempt_id, attempt_count,
         manual_retry_count, terminal, created_at, updated_at
       ) VALUES (?, ?, 'vi', 'en', 'vi', 'en-vi', 'sh', 'ch', 0, ?, ?,
                 'c', 'p', 'p', ?, 'attempt-1', 1, 0, 1, 1, 1)`
    )
    .run(
      `state-${story.id}`,
      story.id,
      candidate.title,
      candidate.summary,
      decision
    );
}

/** Story ids each channel posted as trending. */
function trendingPosts(channel: string): string[] {
  return (
    sqlite
      .prepare(
        "SELECT item_id FROM notifications WHERE channel = ? AND item_id NOT LIKE 'digest:%' AND status = 'sent'"
      )
      .all(channel) as Array<{ item_id: string }>
  ).map((row) => row.item_id);
}

const viText = () =>
  sendBodies
    .filter((body) => body.chat_id === "@vi")
    .map((body) => String(body.caption ?? body.text ?? ""))
    .join("\n");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  // 200 weak stories keep the relative rank bar under every candidate.
  sqlite.exec(`
    WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 200)
    INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at, rank_score, llm_importance, status)
    SELECT 'filler' || n, 'hn', 'https://example.test/filler' || n, 'filler ' || n, 'x',
           ${NOW_SEC - 3600}, ${NOW_SEC - 3600}, 1, 1, 'published' FROM s`);
  sendBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sendBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 7 } }),
        { headers: { "content-type": "application/json" } }
      );
    })
  );
  env = {
    DB: new SqliteD1(sqlite) as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_VI_CHAT_ID: "@vi",
    TELEGRAM_EN_CHAT_ID: "@en",
  } as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sqlite.close();
});

describe("Vietnamese trending gate", () => {
  it.each(CALQUES)(
    'never posts "$bad" and posts the next story instead',
    async ({ term, bad, good, story }) => {
      addStory(story);
      addStory(CLEAN);
      addAvoidRule(term, bad, good);

      const report = await dispatchStoryNotifications(env);

      expect(trendingPosts("telegram")).toEqual([CLEAN.id]);
      expect(viText()).toContain(CLEAN.titleVi);
      expect(viText().toLowerCase()).not.toContain(bad);
      expect(report.reasons.telegram?.suppressed).toEqual({ "gate:draft": 1 });
      // The English channel is not judged by the Vietnamese gate.
      expect(trendingPosts("telegram-en")).toEqual([story.id]);
    }
  );

  it("retries a refused story on the next run once its translation is fixed", async () => {
    // Not the model-family case: the built-in calque check asks for the
    // English "model family", so a Vietnamese fix there is refused again.
    const [, { term, bad, good, story }] = CALQUES;
    addStory(story);
    addAvoidRule(term, bad, good);

    await dispatchStoryNotifications(env);
    expect(trendingPosts("telegram")).toEqual([]);
    // Refused before the claim: no row, so no attempt is spent.
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE channel = 'telegram'"
        )
        .get()
    ).toEqual({ n: 0 });

    sqlite
      .prepare(
        "UPDATE translations SET title = replace(title, ?, ?), summary = replace(summary, ?, ?) WHERE item_id = ?"
      )
      .run(bad, good, bad, good, story.id);
    await dispatchStoryNotifications(env);

    expect(trendingPosts("telegram")).toEqual([story.id]);
  });

  it("does not post a translation QA sent to human review", async () => {
    addStory({ ...CLEAN, rank: 11 });
    reviewDecision(CLEAN, "human_review");
    const other = { ...CLEAN, id: "other", rank: 10 };
    addStory(other);

    const report = await dispatchStoryNotifications(env);

    expect(trendingPosts("telegram")).toEqual(["other"]);
    expect(report.reasons.telegram?.suppressed).toEqual({ "gate:qa": 1 });
  });

  it("posts a translation fixed after QA rejected the earlier text", async () => {
    addStory(CLEAN);
    reviewDecision(CLEAN, "human_review", {
      title: CLEAN.titleVi,
      summary: "Bản dịch cũ đã được sửa sau lần xem xét.",
    });

    await dispatchStoryNotifications(env);

    expect(trendingPosts("telegram")).toEqual([CLEAN.id]);
  });

  it.each(["Kashmir Hill / New York Times :", "Matt Marshall / VentureBeat:"])(
    "drops the byline %s from the Vietnamese summary",
    async (byline) => {
      addStory({ ...CLEAN, summaryVi: `${byline} ${CLEAN.summaryVi}` });

      await dispatchStoryNotifications(env);

      expect(trendingPosts("telegram")).toEqual([CLEAN.id]);
      expect(viText()).toContain(CLEAN.summaryVi);
      expect(viText()).not.toContain(byline.split(" /")[0]);
    }
  );

  it("posts when the QA reviewer failed to run", async () => {
    addStory(CLEAN);
    reviewDecision(CLEAN, "review_failed");

    await dispatchStoryNotifications(env);

    expect(trendingPosts("telegram")).toEqual([CLEAN.id]);
  });

  it("records the caption of a trending post sent as text", async () => {
    addStory(CLEAN);

    await dispatchStoryNotifications(env);

    const sentText = sendBodies.find((body) => body.chat_id === "@vi")?.text;
    expect(
      sqlite
        .prepare(
          "SELECT message_id, kind, caption FROM notify_posts WHERE channel = 'telegram' AND item_id = ?"
        )
        .get(CLEAN.id)
    ).toEqual({ message_id: "7", kind: "text", caption: sentText });
  });

  it("withholds a teaser with no clean rewrite and posts the next story", async () => {
    // The model is unreachable here, so the teaser gets no rewrite.
    const teaser = {
      ...CLEAN,
      id: "teaser",
      rank: 11,
      summaryVi:
        "Các nhà phân tích cho rằng chi phí điện cho AI đang tăng nhanh tại nhiều bang, điều mà nhiều công ty Mỹ...",
    };
    addStory(teaser);
    addStory({ ...CLEAN, id: "next", rank: 10 });

    const report = await dispatchStoryNotifications(env);

    expect(trendingPosts("telegram")).toEqual(["next"]);
    expect(viText()).not.toContain("nhiều công ty Mỹ...");
    expect(report.reasons.telegram?.trending).toBe("sent");
    expect(
      sqlite
        .prepare(
          "SELECT status, attempts, last_error FROM notifications WHERE channel = 'telegram' AND item_id = 'teaser'"
        )
        .get()
    ).toEqual({
      status: "failed",
      attempts: 1,
      last_error:
        "withheld: the summary reads as source copy and has no clean rewrite",
    });
  });
});
