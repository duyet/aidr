/**
 * The English summary readers see is LLM-written (`items.summary_en`), while
 * `items.summary` stays the raw upstream text that dedupe, scoring and
 * translation read. These tests run the shipped SQL against real SQLite with
 * the 0023 revision trigger and the 0055 columns, because the whole design
 * rests on one invariant: a rewrite is shown only for the source revision it
 * was written from.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildMissingEnSummaryQuery,
  EN_SUMMARY_UPDATE_SQL,
  enSummaryIssues,
  enSummaryPrompt,
  enSummarySql,
  sanitizeEnSummaryResults,
} from "../en-summary.js";
import { PIPELINE_STEPS } from "../ingest/mode.js";

const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);
const migration0023 = readFileSync(
  path.join(migrations, "0023_translation_reviews.sql"),
  "utf8"
);
const migration0055 = readFileSync(
  path.join(migrations, "0055_items_summary_en.sql"),
  "utf8"
);

/** The shipped revision trigger, plus stub tables its body touches. */
function revisionTrigger(): string {
  const start = migration0023.indexOf(
    "CREATE TRIGGER IF NOT EXISTS trg_items_source_revision"
  );
  const end = migration0023.indexOf("END;", start) + "END;".length;
  return migration0023.slice(start, end);
}

function db(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, title TEXT, summary TEXT, status TEXT,
      source_lang TEXT NOT NULL DEFAULT 'en', published_at INTEGER,
      source_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE translations (
      item_id TEXT, lang TEXT, title TEXT, summary TEXT,
      qa_rating REAL, qa_at INTEGER, qa_source_hash TEXT,
      qa_candidate_hash TEXT, qa_source_revision INTEGER, qa_direction TEXT,
      qa_reviewer_model TEXT, qa_criteria_version TEXT
    );
    CREATE TABLE translation_review_state (
      item_id TEXT, decision TEXT, terminal INTEGER, next_retry_at INTEGER,
      lease_token TEXT, lease_until INTEGER, updated_at INTEGER
    );
  `);
  sqlite.exec(revisionTrigger());
  sqlite.exec(migration0055);
  return sqlite;
}

function insert(
  sqlite: DatabaseSync,
  row: {
    id: string;
    summary: string | null;
    status?: string;
    sourceLang?: string;
    publishedAt?: number;
  }
): void {
  sqlite
    .prepare(
      "INSERT INTO items (id, title, summary, status, source_lang, published_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      row.id,
      `Title ${row.id}`,
      row.summary,
      row.status ?? "published",
      row.sourceLang ?? "en",
      row.publishedAt ?? 1
    );
}

function displayed(sqlite: DatabaseSync, id: string): string | null {
  const row = sqlite
    .prepare(`SELECT ${enSummarySql("i")} AS summary FROM items i WHERE id = ?`)
    .get(id) as { summary: string | null };
  return row.summary;
}

function writeEn(sqlite: DatabaseSync, id: string, text: string): number {
  const { source_revision } = sqlite
    .prepare("SELECT source_revision FROM items WHERE id = ?")
    .get(id) as { source_revision: number };
  const result = sqlite
    .prepare(EN_SUMMARY_UPDATE_SQL)
    .run(text, source_revision, id, source_revision);
  return Number(result.changes);
}

describe("English summary display", () => {
  it("shows the raw summary until an LLM summary exists, then the LLM one", () => {
    const sqlite = db();
    insert(sqlite, { id: "a", summary: "Raw teaser [&#8230;]" });
    expect(displayed(sqlite, "a")).toBe("Raw teaser [&#8230;]");
    writeEn(sqlite, "a", "Clean English summary.");
    expect(displayed(sqlite, "a")).toBe("Clean English summary.");
  });

  it("never overwrites the raw upstream summary that dedupe and scoring read", () => {
    const sqlite = db();
    insert(sqlite, { id: "a", summary: "Raw text" });
    writeEn(sqlite, "a", "Clean English summary.");
    const row = sqlite
      .prepare("SELECT summary, source_revision FROM items WHERE id = 'a'")
      .get() as { summary: string; source_revision: number };
    expect(row.summary).toBe("Raw text");
    // Writing summary_en is not a source change: it must not bump the
    // revision, or the rewrite would invalidate itself.
    expect(row.source_revision).toBe(0);
  });

  it("falls back to the new raw text when the source changes after the rewrite", () => {
    // A re-ingest or backfill-content replacing a teaser changes the facts;
    // showing the old rewrite would contradict the Vietnamese one.
    const sqlite = db();
    insert(sqlite, { id: "a", summary: "Old teaser…" });
    writeEn(sqlite, "a", "Old summary.");
    sqlite
      .prepare("UPDATE items SET summary = ? WHERE id = 'a'")
      .run("Full new text.");
    expect(displayed(sqlite, "a")).toBe("Full new text.");
  });

  it("refuses a rewrite computed from a revision that changed mid-call", () => {
    const sqlite = db();
    insert(sqlite, { id: "a", summary: "v0" });
    sqlite.prepare("UPDATE items SET summary = 'v1' WHERE id = 'a'").run();
    const stale = sqlite
      .prepare(EN_SUMMARY_UPDATE_SQL)
      .run("From v0.", 0, "a", 0);
    expect(Number(stale.changes)).toBe(0);
    expect(displayed(sqlite, "a")).toBe("v1");
  });
});

describe("backfill-en-summary candidates", () => {
  it("picks English-source published rows lacking a current rewrite, newest first", () => {
    const sqlite = db();
    insert(sqlite, { id: "old", summary: "Old.", publishedAt: 1 });
    insert(sqlite, { id: "new", summary: "New [&#8230;]", publishedAt: 3 });
    insert(sqlite, { id: "done", summary: "Done.", publishedAt: 2 });
    writeEn(sqlite, "done", "Done summary.");
    insert(sqlite, { id: "stale", summary: "Stale.", publishedAt: 2 });
    writeEn(sqlite, "stale", "Stale summary.");
    sqlite
      .prepare("UPDATE items SET summary = 'Changed.' WHERE id = 'stale'")
      .run();
    // Vietnamese-source rows get English from the VI→EN translation path.
    insert(sqlite, {
      id: "vi",
      summary: "Tin.",
      sourceLang: "vi",
      publishedAt: 4,
    });
    // Nothing to summarize.
    insert(sqlite, { id: "empty", summary: "  ", publishedAt: 5 });
    // Merged rows resolve to their canonical's permalink and are never shown.
    insert(sqlite, {
      id: "merged",
      summary: "Dup.",
      status: "merged",
      publishedAt: 6,
    });

    const ids = (
      sqlite.prepare(buildMissingEnSummaryQuery(10)).all() as { id: string }[]
    ).map((r) => r.id);
    expect(ids).toEqual(["new", "stale", "old"]);
  });

  it("is a selectable pipeline step that runs before tldr, email and notify", () => {
    const at = (step: string) =>
      PIPELINE_STEPS.indexOf(step as (typeof PIPELINE_STEPS)[number]);
    expect(at("backfill-en-summary")).toBeGreaterThan(at("backfill-content"));
    expect(at("backfill-en-summary")).toBeLessThan(at("tldr"));
    expect(at("backfill-en-summary")).toBeLessThan(at("notify"));
  });
});

describe("enSummaryIssues", () => {
  const source = "OpenAI raised $40B at a $300B valuation in March 2026.";

  it("accepts a clean factual summary", () => {
    expect(
      enSummaryIssues(source, "OpenAI raised $40B at a $300B valuation.")
    ).toEqual([]);
  });

  it.each([
    ["OpenAI raised money […]"],
    ["OpenAI raised money. Read more."],
    ["OpenAI raised money. Continue reading."],
    ["OpenAI raised money…"],
    ["OpenAI raised money. See https://example.com."],
    ["OpenAI raised money. 120 comments."],
  ])("rejects teaser or page chrome: %s", (text) => {
    expect(enSummaryIssues(source, text)).not.toEqual([]);
  });

  it("rejects a number the source does not contain", () => {
    expect(enSummaryIssues(source, "OpenAI raised $50B.")).toContain(
      "number not in source: 50"
    );
  });

  it("rejects an unfinished sentence", () => {
    expect(enSummaryIssues(source, "OpenAI raised $40B at")).toContain(
      "unfinished sentence"
    );
  });
});

describe("sanitizeEnSummaryResults", () => {
  const batch = [
    { i: 0, title: "A", summary: "Alpha shipped 3 models." },
    { i: 1, title: "B", summary: "Beta raised funds." },
  ];

  it("keeps requested, guard-passing rows once and drops the rest", () => {
    const out = sanitizeEnSummaryResults(
      {
        results: [
          { i: 0, summary: "Alpha shipped 3 models." },
          { i: 0, summary: "Duplicate." },
          { i: 1, summary: "Beta raised funds. Read more" },
          { i: 7, summary: "Invented index." },
        ],
      },
      batch
    );
    expect(out).toEqual([{ i: 0, summary: "Alpha shipped 3 models." }]);
  });
});

describe("enSummaryPrompt", () => {
  it("states the rules that the raw upstream text breaks", () => {
    const prompt = enSummaryPrompt([{ i: 0, title: "T", summary: "S" }]);
    for (const rule of ["[…]", "Read more", "counters", "hype", "exactly"]) {
      expect(prompt).toContain(rule);
    }
  });
});

describe("sanitizeEnSummaryResults output shapes", () => {
  const batch = [{ i: 0, title: "A", summary: "Alpha shipped." }];
  // Models on the translate chain rename the key or drop `i`; each of these
  // was an invalid_response that wasted a hop.
  it.each([
    [[{ i: 0, summary: "Alpha shipped." }]],
    [{ summaries: [{ i: 0, summary: "Alpha shipped." }] }],
    [{ items: [{ summary: "Alpha shipped." }] }],
  ])("parses %j", (raw) => {
    expect(sanitizeEnSummaryResults(raw, batch)).toEqual([
      { i: 0, summary: "Alpha shipped." },
    ]);
  });
});
