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
import { renderEditionEmail, renderWeeklyEmail } from "../subscribe/send.js";
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

function insertDayVideo(
  date: string,
  video: { en?: string; vi?: string; titleEn?: string; titleVi?: string }
) {
  sqlite
    .prepare(
      `INSERT INTO day_videos (date, youtube_id, title, youtube_id_vi, title_vi, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      date,
      video.en ?? null,
      video.titleEn ?? null,
      video.vi ?? null,
      video.titleVi ?? null
    );
}

function dailyMail(lang: "en" | "vi") {
  return renderEditionEmail(
    env,
    { date: DATE, lang, bullets },
    "token",
    8,
    "design"
  );
}

const WEEK = {
  meta: {
    week: "2026-W41",
    issue: 2,
    start_date: "2026-10-05",
    end_date: "2026-10-11",
    intro: null,
  },
  fallback: false,
  bullets,
};

const TODAY_ID = "TodayVid_01";
const YESTERDAY_ID = "YesterVid01";

/** Day videos are uploaded in the afternoon, after the 08:00 send, so the
 *  morning mail reaches back one day or it would almost never show one. */
describe("renderEditionEmail day video", () => {
  it("shows yesterday's video, labelled with its date, when today has none", async () => {
    insertDayVideo("2026-10-09", { en: YESTERDAY_ID, titleEn: "Friday brief" });
    const { html, text } = await dailyMail("en");
    expect(html).toContain("Yesterday's video brief");
    expect(html).toContain("Friday, October 9, 2026");
    expect(html).toContain("Friday brief");
    expect(html).toContain(
      `<img src="https://i.ytimg.com/vi/${YESTERDAY_ID}/mqdefault.jpg"`
    );
    expect(html).toContain(
      `https://youtu.be/${YESTERDAY_ID}?utm_source=email&amp;utm_medium=digest&amp;utm_campaign=digest-2026-10-10&amp;utm_content=video`
    );
    expect(html).not.toContain("Today's video brief");
    expect(text).toContain(
      `Yesterday's video brief (Friday, October 9, 2026): https://youtu.be/${YESTERDAY_ID}?`
    );
  });

  it("prefers today's video over yesterday's", async () => {
    insertDayVideo("2026-10-09", { en: YESTERDAY_ID });
    insertDayVideo(DATE, { en: TODAY_ID });
    const { html } = await dailyMail("en");
    expect(html).toContain("Today's video brief");
    expect(html).toContain(`youtu.be/${TODAY_ID}`);
    expect(html).not.toContain(YESTERDAY_ID);
    expect(html).not.toContain("Yesterday's video brief");
  });

  it("falls back per language: a row for today without a vi video uses yesterday's vi video", async () => {
    insertDayVideo(DATE, { en: TODAY_ID });
    insertDayVideo("2026-10-09", {
      vi: YESTERDAY_ID,
      titleVi: "Bản tin thứ Sáu",
    });
    const { html } = await dailyMail("vi");
    expect(html).toContain("Video tóm tắt hôm qua");
    expect(html).toContain("Thứ Sáu, 9 tháng 10, 2026");
    expect(html).toContain(`youtu.be/${YESTERDAY_ID}`);
    expect(html).not.toContain(TODAY_ID);
  });

  it("renders nothing when neither today nor yesterday has a video", async () => {
    insertDayVideo("2026-10-08", { en: "TwoDaysAgo1" });
    const { html, text } = await dailyMail("en");
    expect(html).not.toContain("i.ytimg.com");
    expect(html).not.toContain("youtu.be");
    expect(html).not.toContain("Yesterday's video brief");
    expect(html).not.toContain("Today's video brief");
    expect(html).not.toContain("plus");
    expect(text).not.toContain("youtu.be");
  });
});

describe("renderWeeklyEmail week videos", () => {
  it("links each video of the week in its language, in date order", async () => {
    insertDayVideo("2026-10-03", { en: "BeforeWeek1" });
    insertDayVideo("2026-10-06", {
      en: "WeekVideo06",
      titleEn: "Tuesday brief",
    });
    insertDayVideo("2026-10-09", { en: "WeekVideo09", vi: "WeekVideoVi" });
    const en = await renderWeeklyEmail(env, WEEK, "en", "token", "design");
    expect(en.html).toContain("This week's video briefs");
    expect(en.html).toContain("Tuesday brief");
    expect(en.html).toContain("utm_content=video-2026-10-06");
    expect(en.html.indexOf("WeekVideo06")).toBeLessThan(
      en.html.indexOf("WeekVideo09")
    );
    expect(en.html).not.toContain("BeforeWeek1");
    expect(en.html).not.toContain("WeekVideoVi");
    expect(en.text).toContain("youtu.be/WeekVideo06");

    const vi = await renderWeeklyEmail(env, WEEK, "vi", "token", "design");
    expect(vi.html).toContain("Video tóm tắt trong tuần");
    expect(vi.html).toContain("youtu.be/WeekVideoVi");
    expect(vi.html).not.toContain("WeekVideo06");
  });

  it("renders no video section for a week without videos", async () => {
    const { html } = await renderWeeklyEmail(
      env,
      WEEK,
      "en",
      "token",
      "design"
    );
    expect(html).not.toContain("This week's video briefs");
    expect(html).not.toContain("youtu.be");
  });
});
