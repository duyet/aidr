/**
 * The model same-story check for dangling restores (#797) on real SQLite
 * with every migration, the real check endpoint and planner, and a mocked
 * model behind `fetch`. No test reaches a real model.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDanglingUnmerge, unmergeItems } from "../admin/handlers.js";
import { existingAlias } from "../cluster-alias.js";
import { backsExisting } from "../cluster-gate.js";
import { resetUnavailableModels } from "../llm.js";
import type { Env } from "../types.js";
import {
  CHECK_BACKOFF_MS,
  type CheckRunResult,
  driveCheck,
} from "../unmerge/check.js";
import type { PairOutcome } from "../unmerge/plan.js";

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

  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.all());
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const NOW = new Date("2026-10-14T03:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const T0 = NOW_SEC - 20 * 86_400;
const DAY = 86_400;

const id = (n: number) => n.toString(16).padStart(64, "0");
const DSEC = id(0xa1);
const MERCURY = id(0xb1);
const NVIDIA = id(0xc1);
/** Live stories. DSEC_LIVE is DSEC's story, reworded, five days earlier:
 * outside the title rules' 96h, inside the check's seven days. */
const DSEC_LIVE = id(0xe1);
const MERCURY_LIVE = id(0xe2);

const TITLES = {
  [DSEC]: "DeepSeek’s DSec Unit Supports 380,000 Concurrent Sandboxes for AI",
  [MERCURY]:
    "Mercury Launches AI Books Tool for 300,000 Users to Challenge QuickBooks",
  [NVIDIA]: "Nvidia Rubin NVL72 Delivers 67x Throughput Per Cost in Test",
  [DSEC_LIVE]:
    "DeepSeek Elastic Compute (DSec): Sandbox Infrastructure for Agentic Training at Scale",
  [MERCURY_LIVE]: "Mercury Bank Adds Treasury Accounts for Startups",
};

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  return db;
}

function insertItem(
  target: DatabaseSync,
  row: {
    id: string;
    sourceId: string;
    url: string;
    title: string;
    publishedAt: number;
    status: "merged" | "published";
    duplicateOf?: string;
  }
) {
  target
    .prepare(
      `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
         status, duplicate_of, llm_relevance, llm_importance, llm_quality,
         rank_score, source_lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.9, 0.7, 0.7, 1, 'en')`
    )
    .run(
      row.id,
      row.sourceId,
      row.url,
      row.title,
      row.publishedAt,
      T0 + 600,
      row.status,
      row.duplicateOf ?? null
    );
}

function writeFixture(target: DatabaseSync) {
  insertItem(target, {
    id: DSEC,
    sourceId: "huggingnews",
    url: "https://huggingnews.com/ai/deepseeks-dsec-unit-supports-380000-concurrent-sandboxes-for-ai-1d1131cc",
    title: TITLES[DSEC],
    publishedAt: T0,
    status: "merged",
    duplicateOf: "abc123",
  });
  insertItem(target, {
    id: MERCURY,
    sourceId: "marketbrief",
    url: "https://marketbrief.now/ai/mercury-launches-ai-books-tool-for-300000-users-4553ecef",
    title: TITLES[MERCURY],
    publishedAt: T0 + 3600,
    status: "merged",
    duplicateOf: "abc123",
  });
  insertItem(target, {
    id: DSEC_LIVE,
    sourceId: "lobsters",
    url: "https://arxiv.org/abs/2610.00001",
    title: TITLES[DSEC_LIVE],
    publishedAt: T0 - 5 * DAY,
    status: "published",
  });
  insertItem(target, {
    id: MERCURY_LIVE,
    sourceId: "techcrunch-ai",
    url: "https://techcrunch.com/2026/09/26/mercury-treasury",
    title: TITLES[MERCURY_LIVE],
    publishedAt: T0 + 2 * DAY,
    status: "published",
  });
}

/** NVIDIA, and more live rows that share its evidence than one call holds. */
function writeOverflow(target: DatabaseSync, liveRows: number) {
  insertItem(target, {
    id: NVIDIA,
    sourceId: "marketbrief",
    url: "https://marketbrief.now/ai/nvidia-rubin-nvl72-delivers-67x-6d92c7d7",
    title: TITLES[NVIDIA],
    publishedAt: T0 + 7200,
    status: "merged",
    duplicateOf: "abc123",
  });
  for (let n = 0; n < liveRows; n++) {
    insertItem(target, {
      id: id(0x10000 + n),
      sourceId: "techcrunch-ai",
      url: `https://techcrunch.com/nvidia-supplier-note-${n}`,
      title: `Nvidia Supplier Note ${n}`,
      publishedAt: T0 - 3 * DAY + n * 60,
      status: "published",
    });
  }
}

interface PromptSides {
  newItems: { i: number; title: string }[];
  existing: { id: string; title: string }[];
}

/** The two JSON lists of a cluster prompt. */
function sidesOf(prompt: string): PromptSides {
  const newItems = /New items \(i, title, url, source\):\n(.*)\n/.exec(
    prompt
  )?.[1];
  const existing = /Existing items [^\n]*\(id, title\):\n(.*)\n/.exec(
    prompt
  )?.[1];
  return {
    newItems: JSON.parse(newItems ?? "[]"),
    existing: JSON.parse(existing ?? "[]"),
  };
}

const sse = (content: string) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );

type Answer = (sides: PromptSides, model: string) => Response;

/** A model behind `fetch` that answers each prompt with `answer`. */
function model(answer: Answer) {
  const prompts: PromptSides[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { content: string }[];
    };
    const sides = sidesOf(body.messages[0].content);
    prompts.push(sides);
    return answer(sides, body.model);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, prompts };
}

/** Links each new item whose title starts with a key to the existing rows
 * whose titles start with that key's value. */
function links(pairs: Record<string, string>): Answer {
  return ({ newItems, existing }) => {
    const clusters = Object.entries(pairs).flatMap(([from, to]) => {
      const member = newItems.find((item) => item.title.startsWith(from));
      const targets = existing.filter((row) => row.title.startsWith(to));
      return member && targets.length > 0
        ? [{ new: [member.i], existing: targets.map((row) => row.id) }]
        : [];
    });
    return sse(JSON.stringify({ clusters }));
  };
}

let db: DatabaseSync;
let env: Env;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db = migratedDb();
  writeFixture(db);
  env = {
    DB: new SqliteD1(db) as unknown as D1Database,
    ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
    ANYROUTER_MODEL: "test/cluster",
    ANYROUTER_API_KEY: "test-key",
  } as unknown as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUnavailableModels();
  db.close();
});

async function check(
  body: { decisions?: unknown; maxCalls?: number } = {}
): Promise<CheckRunResult> {
  const result = await checkDanglingUnmerge(env, {
    confirmLlm: true,
    ...body,
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}

async function outcomes(decisions?: unknown) {
  const result = await unmergeItems(env, { dangling: true, decisions });
  if ("error" in result) throw new Error(result.error);
  return new Map<string, PairOutcome>(
    result.plan.canonicals.flatMap((c) =>
      c.pairs.map(({ pair, outcome }) => [pair.mergedId, outcome] as const)
    )
  );
}

const stored = () =>
  db
    .prepare(
      "SELECT story, verdict, matches, dropped, sent, model FROM unmerge_checks ORDER BY story"
    )
    .all() as {
    story: string;
    verdict: string;
    matches: string;
    dropped: string;
    sent: string;
    model: string | null;
  }[];

const itemRows = () =>
  db.prepare("SELECT * FROM items ORDER BY id").all() as unknown[];

describe("unmerge model check (#797)", () => {
  it("the fixture shares evidence only within each story", () => {
    const headline = (rowId: string) => ({
      title: TITLES[rowId],
      sourceId: "x",
      url: "",
    });
    expect(backsExisting([headline(DSEC)], headline(DSEC_LIVE))).toBe(true);
    expect(backsExisting([headline(MERCURY)], headline(MERCURY_LIVE))).toBe(
      true
    );
    expect(backsExisting([headline(DSEC)], headline(MERCURY_LIVE))).toBe(false);
  });

  it("holds every story that would publish until a verdict clears it, and the apply writes none of them", async () => {
    const plan = await outcomes();
    expect(plan.get(DSEC)).toMatchObject({
      action: "skip",
      reason: "needs-model-check",
    });
    expect(plan.get(MERCURY)).toMatchObject({
      action: "skip",
      reason: "needs-model-check",
    });
    const before = itemRows();
    const applied = await unmergeItems(env, { dangling: true, dryRun: false });
    if ("error" in applied) throw new Error(applied.error);
    expect(itemRows()).toEqual(before);
  });

  it("refuses to call the model without confirmLlm", async () => {
    const { fetchMock } = model(links({}));
    expect(await checkDanglingUnmerge(env, {})).toMatchObject({
      status: 400,
    });
    expect(await checkDanglingUnmerge(env, { confirmLlm: "yes" })).toEqual(
      expect.objectContaining({ status: 400 })
    );
    expect(
      await checkDanglingUnmerge(env, { confirmLlm: true, maxCalls: 11 })
    ).toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored()).toEqual([]);
  });

  it("stores a gated model match and holds that story for a human, never re-pointing it", async () => {
    const { fetchMock, prompts } = model(
      links({ "DeepSeek’s DSec": "DeepSeek Elastic" })
    );
    const result = await check();
    expect(result).toMatchObject({
      calls: 1,
      stored: { noEvidence: 0, clear: 1, match: 1 },
      pending: 2,
      stoppedBy: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // One call shows both candidates and only the live rows they back.
    expect(prompts[0].newItems.map((item) => item.title)).toEqual([
      TITLES[DSEC],
      TITLES[MERCURY],
    ]);
    // The prompt names them by alias; the stored verdict by id.
    expect(prompts[0].existing.map((row) => row.id)).toEqual([
      existingAlias(0),
      existingAlias(1),
    ]);
    expect(prompts[0].existing.map((row) => row.title).sort()).toEqual(
      [TITLES[DSEC_LIVE], TITLES[MERCURY_LIVE]].sort()
    );

    const rows = stored();
    const dsec = rows.find((row) => row.story === DSEC);
    expect(dsec).toMatchObject({ verdict: "match", model: "test/cluster" });
    expect(JSON.parse(String(dsec?.matches))).toEqual([
      expect.objectContaining({ id: DSEC_LIVE, title: TITLES[DSEC_LIVE] }),
    ]);
    expect(JSON.parse(String(dsec?.sent))).toEqual([DSEC_LIVE]);
    expect(rows.find((row) => row.story === MERCURY)?.verdict).toBe("clear");

    const plan = await outcomes();
    expect(plan.get(DSEC)).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [expect.objectContaining({ id: DSEC_LIVE })],
    });
    expect(plan.get(MERCURY)).toMatchObject({
      action: "restore",
      status: "published",
    });

    const before = shapeOf(DSEC);
    const applied = await unmergeItems(env, { dangling: true, dryRun: false });
    if ("error" in applied) throw new Error(applied.error);
    expect(shapeOf(DSEC)).toEqual(before);
    expect(shapeOf(DSEC)).toMatchObject({
      status: "merged",
      duplicate_of: "abc123",
    });
    expect(shapeOf(MERCURY).status).toBe("published");
  });

  it("restores a story the model links to nothing", async () => {
    model(links({}));
    expect((await check()).stored).toEqual({
      noEvidence: 0,
      clear: 2,
      match: 0,
    });
    const plan = await outcomes();
    expect(plan.get(DSEC)).toMatchObject({
      action: "restore",
      status: "published",
    });
    expect(plan.get(MERCURY)).toMatchObject({
      action: "restore",
      status: "published",
    });
  });

  it("keeps a model link the gate rejects out of the verdict", async () => {
    // MERCURY_LIVE is in the call because it backs MERCURY; DSEC shares
    // nothing with it.
    model(links({ "DeepSeek’s DSec": "Mercury Bank" }));
    await check();
    const dsec = stored().find((row) => row.story === DSEC);
    expect(dsec?.verdict).toBe("clear");
    expect(JSON.parse(String(dsec?.dropped))).toEqual([
      { id: MERCURY_LIVE, title: TITLES[MERCURY_LIVE], reason: "gate" },
    ]);
    expect((await outcomes()).get(DSEC)).toMatchObject({ action: "restore" });
  });

  it("records a slipped or unsent alias as a near miss and still clears the story", async () => {
    // The model meant DSEC_LIVE and lowercased its alias, then named a
    // third live row the call never sent.
    model(({ newItems, existing }) => {
      const member = newItems.find((item) => item.title === TITLES[DSEC]);
      const alias = existing.find((row) => row.title === TITLES[DSEC_LIVE]);
      return sse(
        JSON.stringify({
          clusters: [
            { new: [member?.i], existing: [alias?.id.toLowerCase()] },
            { new: [member?.i], existing: [existingAlias(existing.length)] },
          ],
        })
      );
    });
    const result = await check();
    expect(result.stored).toEqual({ noEvidence: 0, clear: 2, match: 0 });
    expect(result.refs).toMatchObject({
      calls: 1,
      existingAnswered: 2,
      existingKept: 0,
      existingNearMiss: 2,
      emptied: 2,
    });
    const dsec = stored().find((row) => row.story === DSEC);
    expect(JSON.parse(String(dsec?.matches))).toEqual([]);
    // The stored link names the live row the model reached for, never its text.
    expect(JSON.parse(String(dsec?.dropped))).toEqual([
      { id: DSEC_LIVE, title: TITLES[DSEC_LIVE], reason: "near-miss" },
    ]);
    expect((await outcomes()).get(DSEC)).toMatchObject({ action: "restore" });
  });

  it("a second check with nothing new calls no model", async () => {
    const { fetchMock } = model(links({}));
    await check();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const again = await check();
    expect(again).toMatchObject({
      calls: 0,
      pending: 0,
      stored: { noEvidence: 0, clear: 0, match: 0 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores without a call a story no live row shares evidence with", async () => {
    db.prepare("DELETE FROM items WHERE id = ?").run(MERCURY_LIVE);
    const { fetchMock, prompts } = model(links({}));
    expect(await check()).toMatchObject({
      calls: 1,
      stored: { noEvidence: 1, clear: 1, match: 0 },
    });
    expect(prompts[0].newItems.map((item) => item.title)).toEqual([
      TITLES[DSEC],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored().find((row) => row.story === MERCURY)).toMatchObject({
      verdict: "clear",
      model: null,
      sent: "[]",
    });
  });

  it("stops at the call cap, then resumes where it stopped", async () => {
    writeOverflow(db, 350);
    const { fetchMock, prompts } = model(links({}));
    const first = await check({ maxCalls: 1 });
    expect(first).toMatchObject({
      calls: 1,
      pending: 3,
      pendingCalls: 3,
      stoppedBy: "call-cap",
      stored: { clear: 2, match: 0 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored().map((row) => row.story)).not.toContain(NVIDIA);

    const second = await check({ maxCalls: 2 });
    expect(second).toMatchObject({
      calls: 2,
      pending: 1,
      stoppedBy: null,
      stored: { clear: 1 },
    });
    // NVIDIA backs 350 live rows: one call of 300 and one of 50.
    expect(prompts.slice(1).map((p) => p.existing.length)).toEqual([300, 50]);
    expect(prompts.slice(1).map((p) => p.newItems.length)).toEqual([1, 1]);
    expect((await check()).calls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stores the second call's row for a link answered in the second call", async () => {
    // Each call names its own rows from the first alias: Note 320 sits at
    // the same position in the 50-row call as Note 20 in the 300-row call.
    writeOverflow(db, 350);
    const { prompts } = model(
      links({ "Nvidia Rubin": "Nvidia Supplier Note 320" })
    );
    await check();

    const calls = prompts.filter((p) =>
      p.newItems.some((item) => item.title === TITLES[NVIDIA])
    );
    expect(calls.map((p) => p.existing.length)).toEqual([300, 50]);
    const position = calls[1].existing.findIndex(
      (row) => row.title === "Nvidia Supplier Note 320"
    );
    expect(calls[0].existing[position].title).toBe("Nvidia Supplier Note 20");

    const nvidia = stored().find((row) => row.story === NVIDIA);
    expect(nvidia?.verdict).toBe("match");
    expect(
      JSON.parse(String(nvidia?.matches)).map((m: { id: string }) => m.id)
    ).toEqual([id(0x10000 + 320)]);
  });

  it("stops on a 429 and stores nothing the model did not answer", async () => {
    const { fetchMock } = model(
      () => new Response("rate limited", { status: 429 })
    );
    const result = await check();
    expect(result).toMatchObject({
      calls: 1,
      stoppedBy: "rate-limited",
      stored: { noEvidence: 0, clear: 0, match: 0 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual([]);
    expect((await outcomes()).get(DSEC)).toMatchObject({
      reason: "needs-model-check",
    });
  });

  it("stores what another model served after a 429, then stops the request", async () => {
    env = { ...env, ANYROUTER_MODEL: "test/a,test/b" } as Env;
    writeOverflow(db, 10);
    model((sides, served) =>
      served === "test/a"
        ? new Response("rate limited", { status: 429 })
        : links({})(sides, served)
    );
    const result = await check({ maxCalls: 3 });
    expect(result).toMatchObject({ calls: 1, stoppedBy: "rate-limited" });
    expect(result.stored.clear).toBeGreaterThan(0);
    expect(stored().every((row) => row.model === "test/b")).toBe(true);
  });

  it("stops when the chain is exhausted and stores nothing", async () => {
    model(() => new Response("upstream down", { status: 502 }));
    const result = await check();
    expect(result).toMatchObject({ calls: 1, stoppedBy: "chain-exhausted" });
    expect(result.failure).toMatch(/502|chain exhausted|request failed/i);
    expect(stored()).toEqual([]);
  });

  it("never reads an answer with no clusters array as clear", async () => {
    model(() => sse("{}"));
    const result = await check();
    expect(result).toMatchObject({ calls: 1, stoppedBy: "bad-output" });
    expect(stored()).toEqual([]);
  });

  it("logs every attempt to llm_calls under the check's operation id", async () => {
    model(links({}));
    const result = await check();
    expect(result.operationId).toMatch(/^unmerge-check-/);
    expect(db.prepare("SELECT task, run_id, ok FROM llm_calls").all()).toEqual([
      { task: "unmerge-dup-check", run_id: result.operationId, ok: 1 },
    ]);
  });

  it("a distinctFrom naming the matched story publishes it", async () => {
    model(links({ "DeepSeek’s DSec": "DeepSeek Elastic" }));
    await check();
    const decisions = [{ mergedId: DSEC, distinctFrom: [DSEC_LIVE] }];
    expect((await outcomes(decisions)).get(DSEC)).toMatchObject({
      action: "restore",
      status: "published",
    });
  });
});

describe("driving the check from the CLI (#797, #656)", () => {
  /** The CLI's loop over the real endpoint; sleeping moves the clock. */
  function drive(budget = 10) {
    const slept: number[] = [];
    const run = driveCheck({
      budget,
      perRequest: 3,
      request: (maxCalls) => check({ maxCalls }),
      sleep: async (ms) => {
        slept.push(ms);
        vi.setSystemTime(Date.now() + ms);
      },
      report: () => {},
    });
    return { run, slept };
  }

  it("backs off after a 429 and resumes until no story waits", async () => {
    let calls = 0;
    const { fetchMock } = model((sides, served) =>
      ++calls === 1
        ? new Response("rate limited", { status: 429 })
        : links({})(sides, served)
    );
    const { run, slept } = drive();
    expect(await run).toMatchObject({
      finished: true,
      stoppedBy: null,
      calls: 2,
      stored: { clear: 2 },
    });
    expect(slept).toEqual([CHECK_BACKOFF_MS]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after three 429 stops in a row, waiting longer each time", async () => {
    const { fetchMock } = model(
      () => new Response("rate limited", { status: 429 })
    );
    const { run, slept } = drive();
    expect(await run).toMatchObject({
      finished: false,
      stoppedBy: "rate-limited",
      calls: 3,
      stored: { clear: 0, match: 0 },
    });
    expect(slept).toEqual([CHECK_BACKOFF_MS, 2 * CHECK_BACKOFF_MS]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stored()).toEqual([]);
  });

  it("stops at once when the chain is exhausted", async () => {
    model(() => new Response("upstream down", { status: 502 }));
    const { run, slept } = drive();
    expect(await run).toMatchObject({
      finished: false,
      stoppedBy: "chain-exhausted",
      requests: 1,
    });
    expect(slept).toEqual([]);
  });

  it("never spends more than its call budget", async () => {
    writeOverflow(db, 350);
    const { fetchMock } = model(links({}));
    const { run } = drive(2);
    expect(await run).toMatchObject({ finished: false, calls: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function shapeOf(rowId: string) {
  return db
    .prepare("SELECT status, duplicate_of FROM items WHERE id = ?")
    .get(rowId) as { status: string; duplicate_of: string | null };
}
