/**
 * Trending must not repeat what the channel already showed, and must not
 * post copy that is source chrome or a stub. Real SQLite, real migrations,
 * the real dispatcher; only `fetch` is stubbed. The cases are the
 * 2026-10-08..11 audit of t.me/s/aidr_today and t.me/s/aihomnay.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchStoryNotifications,
  forceSendDigest,
} from "../notify/index.js";
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
const TODAY = "2026-10-01";
const YESTERDAY = "2026-09-30";
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const SUMMARY =
  "The report says the companies are in early talks, with a deal that could be reached within weeks if regulators do not object.";

let sqlite: DatabaseSync;
let env: Env;
let sendBodies: string[];

interface ItemSpec {
  id: string;
  title: string;
  source?: string;
  summary?: string | null;
  rank?: number;
  importance?: number;
  status?: string;
  duplicateOf?: string | null;
  sourceLang?: "en" | "vi";
}

function addItem(spec: ItemSpec) {
  sqlite
    .prepare(
      `INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at,
                          rank_score, llm_importance, status, duplicate_of, source_lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      spec.id,
      spec.source ?? "hn",
      `https://example.test/${spec.id}`,
      spec.title,
      spec.summary === undefined ? SUMMARY : spec.summary,
      NOW_SEC - 3600,
      NOW_SEC - 3600,
      spec.rank ?? 10,
      spec.importance ?? 8,
      spec.status ?? "published",
      spec.duplicateOf ?? null,
      spec.sourceLang ?? "en"
    );
}

/** The channel already showed `itemId` in its digest for `date`. */
function digestShowed(date: string, ...itemIds: string[]) {
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO notifications (channel, item_id, target, status, attempts, posted_at) VALUES ('telegram-en', ?, '@en', 'sent', 1, ?)"
    )
    .run(`digest:${date}`, NOW.getTime() - 2 * 3600_000);
  for (const id of itemIds) {
    sqlite
      .prepare(
        "INSERT INTO notify_digest_items (channel, date, item_id) VALUES ('telegram-en', ?, ?)"
      )
      .run(date, id);
  }
}

function trendingRows(): string[] {
  return (
    sqlite
      .prepare(
        "SELECT item_id FROM notifications WHERE channel = 'telegram-en' AND item_id NOT LIKE 'digest:%' AND status = 'sent' ORDER BY posted_at"
      )
      .all() as Array<{ item_id: string }>
  ).map((row) => row.item_id);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  // 200 weak stories keep the relative rank bar at the lowest candidate, so
  // every candidate below clears it.
  sqlite.exec(`
    WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 200)
    INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at, rank_score, llm_importance, status)
    SELECT 'filler' || n, 'hn', 'https://example.test/filler' || n, 'filler ' || n, 'x',
           ${NOW_SEC - 3600}, ${NOW_SEC - 3600}, 1, 1, 'published' FROM s`);
  sendBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sendBodies.push(String(init?.body ?? ""));
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

describe("trending after a digest that already showed the story", () => {
  // msg 96 (digest), 98 and 99 (trending): one deal, three posts.
  const digestItem = {
    id: "nv-digest",
    title: "Nvidia in talks to acquire US 'open' model startup Reflection AI",
    rank: 10.5,
  };
  const otherOutlet = {
    id: "nv-marketbrief",
    source: "marketbrief",
    title: "Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust",
    rank: 10.4,
  };
  const thirdOutlet = {
    id: "nv-techmeme",
    source: "techmeme",
    title:
      "Nvidia is reportedly in early talks to buy Reflection AI, an open model startup, to sidestep antitrust review",
    rank: 10.3,
  };

  beforeEach(() => {
    addItem(digestItem);
    addItem(otherOutlet);
    addItem(thirdOutlet);
    digestShowed(TODAY, digestItem.id);
  });

  it("posts nothing for the Nvidia-Reflection triple", async () => {
    const report = await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual([]);
    expect(report.sent["telegram-en"]).toBe(0);
    expect(report.reasons["telegram-en"]?.trending).toBe("none_unposted");
    expect(report.reasons["telegram-en"]?.suppressed).toEqual({
      "dedup:canonical": 1,
      "dedup:event": 2,
    });
  });

  it("still posts a different Nvidia story that shares the entity", async () => {
    addItem({
      id: "nv-humain",
      source: "theverge",
      title: "Nvidia signs AI chip deal with Saudi Arabia's Humain",
      rank: 10.2,
    });
    addItem({
      id: "nv-rubin",
      source: "wired",
      title: "Nvidia unveils Rubin Ultra with twice the memory bandwidth",
      rank: 10.1,
    });

    const report = await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual(["nv-humain"]);
    expect(report.reasons["telegram-en"]?.trending).toBe("sent");
    expect(report.reasons["telegram-en"]?.suppressed).toEqual({
      "dedup:canonical": 1,
      "dedup:event": 2,
    });
    expect(sendBodies.join("\n")).toContain("Humain");
  });

  it("also dedups against the previous day's digest", async () => {
    sqlite.exec(`DELETE FROM notify_digest_items`);
    sqlite.exec(`DELETE FROM notifications`);
    digestShowed(YESTERDAY, digestItem.id);

    await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual([]);
  });

  it("does not trust a digest that was never sent", async () => {
    sqlite.exec(`DELETE FROM notifications`);

    await dispatchStoryNotifications(env);

    expect(trendingRows()).toHaveLength(1);
  });
});

describe("OpenAI Navier-Stokes (10-10: digest 87, trending 94)", () => {
  it("skips the same proof story from another outlet", async () => {
    addItem({
      id: "ns-digest",
      source: "the-decoder",
      title:
        "OpenAI mistranslated mathematics into code for its Navier-Stokes proof",
      rank: 5,
      importance: 5,
    });
    addItem({
      id: "ns-hn",
      source: "hn",
      title:
        "Researchers say OpenAI's Navier-Stokes proof mistranslated mathematics into code",
      rank: 10,
    });
    digestShowed(YESTERDAY, "ns-digest");

    const report = await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual([]);
    expect(report.reasons["telegram-en"]?.suppressed).toEqual({
      "dedup:event": 1,
    });
  });
});

describe("a story merged into the one already posted", () => {
  it("is skipped by canonical id even when its title shares nothing", async () => {
    addItem({
      id: "root",
      title: "Mistral ships Large 4 under Apache license",
    });
    // The posted story was later merged under the root candidate.
    addItem({
      id: "posted-member",
      title: "French lab releases a new flagship model for free",
      status: "merged",
      duplicateOf: "root",
    });
    sqlite
      .prepare(
        "INSERT INTO notifications (channel, item_id, target, status, attempts, posted_at) VALUES ('telegram-en', 'posted-member', '@en', 'sent', 1, ?)"
      )
      .run(NOW.getTime() - 5 * 3600_000);

    const report = await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual(["posted-member"]);
    expect(report.reasons["telegram-en"]?.suppressed).toEqual({
      "dedup:canonical": 1,
    });
  });
});

describe("postability gate in the candidate loop", () => {
  it("rejects chrome, stub, title-only and short copy and posts the next candidate", async () => {
    addItem({
      id: "chrome",
      title: "Microsoft Launches Decision-1 Model to Beat LLM Latency",
      summary: `← Back to live feed · 1 stories across 1 day ${SUMMARY}`,
      rank: 10.9,
    });
    addItem({
      id: "stub",
      source: "techmeme",
      title: "TypeSafe AI raised about $870M led by a16z at a $7.5B valuation",
      summary: "From Bloomberg. View the full context on Techmeme.",
      rank: 10.8,
    });
    addItem({
      id: "title-only",
      source: "lobsters",
      title: "Reflection AI is in talks with a large chip vendor",
      summary: null,
      rank: 10.7,
    });
    addItem({
      id: "short",
      source: "reddit",
      title: "Odyssey publishes a research preview of a world model",
      summary: "Odyssey-3 is out.",
      rank: 10.6,
    });
    addItem({
      id: "good",
      source: "theverge",
      title: "Odyssey-3 is a new generative world model you can try for free",
      rank: 10.1,
    });

    const report = await dispatchStoryNotifications(env);

    expect(trendingRows()).toEqual(["good"]);
    expect(report.reasons["telegram-en"]?.suppressed).toEqual({
      "gate:chrome": 2,
      "gate:missing": 1,
      "gate:short": 1,
    });
    const sent = sendBodies.join("\n");
    expect(sent).toContain("Odyssey-3");
    expect(sent).not.toContain("Back to live feed");
    expect(sent).not.toContain("View the full context");
  });
});

describe("digest bookkeeping", () => {
  it("records every story the snapshot cites, not only each bullet's first", async () => {
    addItem({ id: "d1", title: "Digest story one", rank: 2, importance: 5 });
    addItem({ id: "d2", title: "Digest story two", rank: 2, importance: 5 });
    addItem({ id: "d3", title: "Digest story three", rank: 2, importance: 5 });
    const bullets = JSON.stringify([
      { text: "Story one", item_ids: ["d1", "d2"] },
      { text: "Story three", item_ids: ["d3"] },
    ]);
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(TODAY, bullets, bullets, NOW.getTime());

    await dispatchStoryNotifications(env);

    const rows = sqlite
      .prepare(
        "SELECT channel, item_id FROM notify_digest_items WHERE date = ? ORDER BY channel, item_id"
      )
      .all(TODAY);
    expect(rows).toEqual([
      { channel: "telegram", item_id: "d1" },
      { channel: "telegram", item_id: "d2" },
      { channel: "telegram", item_id: "d3" },
      { channel: "telegram-en", item_id: "d1" },
      { channel: "telegram-en", item_id: "d2" },
      { channel: "telegram-en", item_id: "d3" },
    ]);
  });

  // #673: a bullet that is only an outlet credit strips to "". It must not
  // take a numbered slot, so the next bullet moves up into the message.
  it("drops a bullet left empty by the attribution strip and fills its slot", async () => {
    const stories = ["a1", "credit", "a3", "a4", "a5", "a6", "a7"];
    for (const id of stories) {
      addItem({ id, title: `Digest story ${id}`, rank: 2, importance: 5 });
    }
    const bullets = JSON.stringify(
      stories.map((id) => ({
        text:
          id === "credit"
            ? "From Bloomberg. View the full context on Techmeme."
            : `Story ${id} shipped today.`,
        item_ids: [id],
      }))
    );
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(TODAY, bullets, bullets, NOW.getTime());

    await dispatchStoryNotifications(env);

    const digest = sendBodies.find((body) => body.includes("Story a1"));
    expect(digest).toBeDefined();
    const text = JSON.parse(digest as string).text as string;
    expect(text).not.toContain("Bloomberg");
    expect(text).toContain("Story a7 shipped today.");
    const rows = sqlite
      .prepare(
        "SELECT item_id FROM notify_digest_items WHERE channel = 'telegram-en' AND date = ? ORDER BY item_id"
      )
      .all(TODAY) as Array<{ item_id: string }>;
    expect(rows.map((row) => row.item_id)).toEqual([
      "a1",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
    ]);
  });

  // The snapshot exists, so "no_snapshot" would send ops looking for a TL;DR
  // run that did happen.
  it("tells a digest the strip emptied apart from a missing snapshot", async () => {
    addItem({ id: "credit", title: "Credit only", rank: 2, importance: 5 });
    const credit = JSON.stringify([
      { text: "From Bloomberg.", item_ids: ["credit"] },
    ]);

    const missing = await dispatchStoryNotifications(env);
    expect(missing.reasons["telegram-en"]?.digest).toBe("no_snapshot");

    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(TODAY, credit, credit, NOW.getTime());
    const empty = await dispatchStoryNotifications(env);
    expect(empty.reasons["telegram-en"]?.digest).toBe("empty_after_strip");
    expect(empty.reasons.telegram?.digest).toBe("empty_after_strip");
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM notifications WHERE item_id = ?")
        .get(`digest:${TODAY}`)
    ).toEqual({ n: 0 });
    expect(await forceSendDigest(env)).toEqual({
      sent: 0,
      reason: `every TL;DR bullet for ${TODAY} is only an outlet credit on telegram, telegram-en`,
    });
  });

  // Vietnamese has no bullets yet, so only the English channel was emptied by
  // the strip. The reason must not blame the Vietnamese channel's bullets.
  it("names only the channels whose bullets the strip emptied", async () => {
    addItem({ id: "credit", title: "Credit only", rank: 2, importance: 5 });
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, NULL, ?)"
      )
      .run(
        TODAY,
        JSON.stringify([{ text: "From Bloomberg.", item_ids: ["credit"] }]),
        NOW.getTime()
      );
    expect(await forceSendDigest(env)).toEqual({
      sent: 0,
      reason: `every TL;DR bullet for ${TODAY} is only an outlet credit on telegram-en`,
    });
  });
});

// #786: the Vietnamese channel posts English and Vietnamese stories side by
// side. A Vietnamese story is compared through its vi→en translation, which
// neither the channel's candidate query nor the posted history selected.
describe("a Vietnamese story against an English one on the Vietnamese channel", () => {
  const youtuberEn = {
    id: "muse-address",
    source: "theverge",
    title: "Meta’s Muse AI sent a YouTuber’s address to a stranger",
  };
  const youtuberVi = {
    id: "youtuber-vi",
    source: "vnexpress-tech",
    sourceLang: "vi" as const,
    title: "YouTuber tố trợ lý AI của Meta dẫn người lạ đến nhà",
  };
  const youtuberViEnglish =
    "YouTuber says Meta's AI assistant leaked his home address to a stranger";

  function translate(itemId: string, lang: "en" | "vi", title: string) {
    sqlite
      .prepare(
        "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, ?, ?, ?)"
      )
      .run(itemId, lang, title, SUMMARY);
  }

  function postedOnTelegram(itemId: string) {
    sqlite
      .prepare(
        "INSERT INTO notifications (channel, item_id, target, status, attempts, posted_at) VALUES ('telegram', ?, '@vi', 'sent', 1, ?)"
      )
      .run(itemId, NOW.getTime() - 5 * 3600_000);
  }

  function telegramRows(): string[] {
    return (
      sqlite
        .prepare(
          "SELECT item_id FROM notifications WHERE channel = 'telegram' AND item_id NOT LIKE 'digest:%' AND status = 'sent' ORDER BY posted_at"
        )
        .all() as Array<{ item_id: string }>
    ).map((row) => row.item_id);
  }

  it("holds the Vietnamese report of a posted English story and posts a different one", async () => {
    addItem({ ...youtuberEn, rank: 5, importance: 5 });
    postedOnTelegram(youtuberEn.id);
    addItem({ ...youtuberVi, rank: 10.5 });
    translate(youtuberVi.id, "en", youtuberViEnglish);
    addItem({
      id: "muse-vi",
      source: "vnexpress-tech",
      sourceLang: "vi",
      title: "Cách Meta biến Muse thành 'hiện tượng AI'",
      rank: 10,
    });
    translate("muse-vi", "en", "How Meta Turned Muse Into an 'AI Phenomenon'");

    const report = await dispatchStoryNotifications(env);

    expect(telegramRows()).toEqual([youtuberEn.id, "muse-vi"]);
    expect(report.reasons.telegram?.suppressed).toEqual({ "dedup:event": 1 });
  });

  it("holds the English report of a posted Vietnamese story", async () => {
    addItem({ ...youtuberVi, rank: 5, importance: 5 });
    translate(youtuberVi.id, "en", youtuberViEnglish);
    postedOnTelegram(youtuberVi.id);
    addItem({ ...youtuberEn, rank: 10 });
    translate(
      youtuberEn.id,
      "vi",
      "Muse AI của Meta gửi địa chỉ của một YouTuber cho người lạ"
    );

    const report = await dispatchStoryNotifications(env);

    expect(telegramRows()).toEqual([youtuberVi.id]);
    expect(report.reasons.telegram?.suppressed).toEqual({ "dedup:event": 1 });
  });
});
