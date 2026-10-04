import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(dirname, "../..");
const wrangler = readFileSync(path.join(webRoot, "wrangler.toml"), "utf-8");
const algorithm = readFileSync(path.join(webRoot, "ALGORITHM.md"), "utf-8");
/** The ingest Workflow is a thin orchestrator (`worker/workflow.ts`) over
 * one module per step (`worker/ingest/*.ts`). Contract checks below read
 * them as one source, orchestrator first, so ordering checks still see the
 * run lifecycle before any step. */
function ingestWorkflowSource(): string {
  const ingestDir = path.join(webRoot, "worker/ingest");
  const modules = readdirSync(ingestDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => readFileSync(path.join(ingestDir, name), "utf-8"));
  return [
    readFileSync(path.join(webRoot, "worker/workflow.ts"), "utf-8"),
    ...modules,
  ].join("\n");
}
const ingestYml = readFileSync(
  path.join(webRoot, "../../.github/workflows/ingest.yml"),
  "utf-8"
);

describe("free-plan hourly ingest", () => {
  it("keeps the news-ingest Workflow binding without paid schedules", () => {
    expect(wrangler).toMatch(/name\s*=\s*"news-ingest"/);
    expect(wrangler).toMatch(/binding\s*=\s*"NEWS_INGEST"/);
    expect(wrangler).toMatch(/class_name\s*=\s*"NewsIngestWorkflow"/);
    expect(wrangler).not.toMatch(/^\s*schedules\s*=/m);
  });

  it("does not add Worker [triggers] crons (Free 5-cron cap)", () => {
    expect(wrangler).not.toMatch(/^[\t ]*\[triggers\]/m);
    expect(wrangler).not.toMatch(/^[\t ]*crons\s*=/m);
  });

  it("binds a SQLite Durable Object scheduler instead of a cron", () => {
    expect(wrangler).toMatch(/name\s*=\s*"NEWS_INGEST_SCHEDULER"/);
    expect(wrangler).toMatch(/class_name\s*=\s*"NewsIngestScheduler"/);
    expect(wrangler).toMatch(
      /new_sqlite_classes\s*=\s*\["NewsIngestScheduler"\]/
    );
  });

  it("keeps run_worker_first for homepage, favicons, public logos, sitemap, robots, llms, RSS, news sitemap, APIs, Clerk proxy, the server-function transport, and aidr.zip", () => {
    // Every icon surface is Worker-first too: crawlers request them directly,
    // and any that fell through would answer with the SPA HTML shell, which
    // reads to a search engine as a broken favicon.
    expect(wrangler).toContain(
      'run_worker_first = ["/", "/favicon.ico", "/logo-sm.png", "/logo.png", "/logo-icon.png", "/logo.svg", "/og.jpg", "/favicon.svg", "/favicon-120x120.png", "/apple-touch-icon.png", "/sitemap.xml", "/sitemaps/*", "/news.xml", "/feed.xml", "/rss.xml", "/feed.json", "/robots.txt", "/llms.txt", "/auth.md", "/about.md", "/subscribe.md", "/data.md", "/brand.md", "/changelog.md", "/privacy.md", "/terms.md", "/mcp.md", "/contribute.md", "/openapi.json", "/.well-known/*", "/api/*", "/__clerk/*", "/_serverFn", "/_serverFn/*", "/aidr.zip"]'
    );
    expect(wrangler).toMatch(/binding\s*=\s*"ASSETS"/);
  });

  it("does not attach news.duyet.net as a custom domain", () => {
    expect(wrangler).toMatch(/pattern\s*=\s*"aidr\.today"/);
    expect(wrangler).not.toMatch(/pattern\s*=\s*"news\.duyet\.net"/);
    expect(wrangler).toMatch(/Do not attach news\.duyet\.net here/);
  });

  it("schedules ingest via a Durable Object alarm plus GitHub Actions watchdog", () => {
    expect(ingestYml).toMatch(/cron:\s*"5 \* \* \* \*"/);
    expect(ingestYml).toMatch(/cron:\s*"20 \* \* \* \*"/);
    expect(ingestYml).toMatch(/cron:\s*"35 \* \* \* \*"/);
    expect(ingestYml).toMatch(/cron:\s*"50 \* \* \* \*"/);
    expect(ingestYml).toContain("https://aidr.today/api/admin/ingest");
    expect(ingestYml).toContain("secrets.NEWS_ADMIN_TOKEN");
    expect(algorithm).toMatch(/GitHub Actions/);
    expect(algorithm).toMatch(/Durable Object/);
    expect(algorithm).toMatch(/0\.12·\(min\(sourceCount, 8\) − 1\)/);
    expect(algorithm).toMatch(/Merge \(LLM \+ title similarity\)/);
    expect(algorithm).not.toMatch(/Hourly instances come from `schedules`/);
    expect(algorithm).not.toContain("apps/news");
  });
});

describe("live AnyRouter model chains", () => {
  function idsOf(varName: string): string[] {
    const match = wrangler.match(new RegExp(`${varName} = "([^"]+)"`));
    expect(match, `${varName} missing`).toBeTruthy();
    return match![1].split(",").map((s) => s.trim());
  }

  // Router aliases are the safety net on score and TL;DR: they go last so
  // one bad pick cannot burn a step's budget. Translate ends on Laguna.
  // Gemini 3 Flash is tried first, then Gemma, and anyrouter/auto is not
  // in that chain.
  it("ends score and tldr chains with the router safety nets", () => {
    for (const name of ["ANYROUTER_MODEL", "ANYROUTER_TLDR_MODEL"]) {
      const ids = idsOf(name);
      expect(ids.at(-1), name).toMatch(/^anyrouter\//);
      const firstAlias = ids.findIndex((id) => id.startsWith("anyrouter/"));
      expect(
        ids.slice(firstAlias).every((id) => id.startsWith("anyrouter/")),
        name
      ).toBe(true);
    }
  });

  const chains = [
    "ANYROUTER_MODEL",
    "ANYROUTER_TRANSLATE_MODEL",
    "ANYROUTER_TLDR_MODEL",
    "ANYROUTER_ENGLISH_TRANSLATE_MODEL",
    "ANYROUTER_REVIEW_MODEL",
  ];

  // Chains are picked by a streaming probe (production always streams with
  // json_object; a non-streaming probe put 42s hangs at the head, run
  // ddb11132). An id without a probe row in wrangler.toml was never
  // measured, and ids listed only as removed/BYOK-only have no row.
  it("backs every chain id with a streaming probe row", () => {
    for (const name of chains) {
      for (const id of idsOf(name)) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        expect(wrangler, `${name}: ${id}`).toMatch(
          new RegExp(`^#\\s+${escaped}\\s+\\S`, "m")
        );
      }
    }
  });

  it("never repeats an id inside a chain", () => {
    for (const name of chains) {
      const ids = idsOf(name);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("keeps the translation reviewer explicit and disjoint from generators", () => {
    const reviewer = idsOf("ANYROUTER_REVIEW_MODEL");
    const generators = new Set([
      ...idsOf("ANYROUTER_MODEL"),
      ...idsOf("ANYROUTER_TRANSLATE_MODEL"),
      ...idsOf("ANYROUTER_ENGLISH_TRANSLATE_MODEL"),
    ]);
    expect(reviewer.length).toBeGreaterThan(0);
    expect(reviewer).not.toContain("anyrouter/auto");
    for (const model of reviewer)
      expect(generators.has(model), model).toBe(false);
  });

  it("tries probed Gemini before Gemma, and Gemma before Laguna, on translate", () => {
    expect(idsOf("ANYROUTER_TRANSLATE_MODEL")).toEqual([
      "google/gemini-3-flash",
      "google/gemma-4-31b",
      "google/gemma-4-26b-a4b-it",
      "poolside/laguna-s-2.1",
    ]);
    expect(idsOf("ANYROUTER_ENGLISH_TRANSLATE_MODEL")).toEqual([
      "google/gemini-3-flash",
      "google/gemma-4-31b",
      "poolside/laguna-s-2.1",
    ]);
  });

  it("configures a separate explicit VI→EN generator", () => {
    const ids = idsOf("ANYROUTER_ENGLISH_TRANSLATE_MODEL");
    expect(ids.length).toBeGreaterThan(0);
    // Router aliases and presets are filtered out of this chain.
    for (const id of ids) {
      expect(id.startsWith("anyrouter/"), id).toBe(false);
      expect(id.startsWith("@"), id).toBe(false);
    }
  });

  it("scores and decides with canonical Jev, not on the chat chain", () => {
    expect(idsOf("ANYROUTER_JEV_MODEL")).toEqual(["typesafe/jev"]);
    for (const name of [
      "ANYROUTER_MODEL",
      "ANYROUTER_TRANSLATE_MODEL",
      "ANYROUTER_TLDR_MODEL",
    ]) {
      const ids = idsOf(name);
      expect(ids, name).not.toContain("typesafe/jev");
      expect(ids, name).not.toContain("typesafe/jev-latest");
    }
  });
});

describe("translation upsert", () => {
  const d1Bind = readFileSync(path.join(webRoot, "worker/d1-bind.ts"), "utf-8");

  it("writes title on conflict so backfill can replace an empty title_vi", () => {
    const upsert = d1Bind.match(
      /export const TRANSLATION_UPSERT_SQL = `([\s\S]*?)`;/
    )?.[1];
    expect(upsert).toBeDefined();
    expect(upsert).toContain("ON CONFLICT(item_id, lang) DO UPDATE SET");
    expect(upsert).toContain("title = excluded.title");
    expect(upsert).toContain("summary = excluded.summary");
  });
});

describe("translate batch size", () => {
  const llm = readFileSync(path.join(webRoot, "worker/llm.ts"), "utf-8");

  it("chunks translateItems by 3 so a 15-item JSON blob cannot eat the hang-cap", () => {
    expect(llm).toMatch(/TRANSLATE_BATCH_SIZE = 3/);
    expect(llm).toMatch(/chunk\(needLlm, TRANSLATE_BATCH_SIZE\)/);
    expect(algorithm).toMatch(/batches of 3/);
  });

  it("caps score/tldr/translate attempts so auto is not killed mid-route", () => {
    expect(llm).toMatch(/MODEL_SLICE_MAX_MS = 25_000/);
    expect(llm).toMatch(/SCORE_SLICE_MAX_MS = 70_000/);
    expect(llm).toMatch(/TRANSLATE_SLICE_MAX_MS = 60_000/);
    expect(llm).toMatch(/FALLBACK_FLOOR_MS = 20_000/);
    expect(llm).toMatch(/SCORE_BATCH_SIZE = 5/);
    expect(algorithm).toMatch(/batches of 5/);
  });
});

describe("backfill-translate checkpoints", () => {
  const workflow = ingestWorkflowSource();
  const orchestrator = readFileSync(
    path.join(webRoot, "worker/workflow.ts"),
    "utf-8"
  );

  it("persists each 3-item slice in its own Workflow step", () => {
    expect(workflow).toContain("backfill-translate-load");
    expect(workflow).toMatch(/backfill-translate-\$\{offset\}/);
    expect(workflow).toContain("TRANSLATE_BATCH_SIZE");
    expect(workflow).toContain("BACKFILL_TRANSLATE_STEP");
    expect(workflow).toContain("LLM_STEP");
    expect(workflow).toMatch(/retries:\s*\{\s*limit:\s*0/);
    expect(workflow).toContain("safeStep(");
    expect(workflow).toContain("schema missing; apply migration 0023");
    expect(workflow).toContain('"score"');
    expect(workflow).toContain('"translate"');
    expect(workflow).toContain('"tldr"');
    expect(workflow).toContain('"open-run"');
    expect(workflow).toContain('"close-run"');
    expect(workflow).toContain("persistWorkflowRun");
    expect(workflow).toContain("if (!row || !result.title) continue");
  });

  it("does not rethrow after setting runError so close-run can persist", () => {
    expect(workflow).toContain("ingest run failed:");
    expect(workflow).not.toMatch(/runError[\s\S]{0,80}throw error/);
    expect(workflow).toContain("persistWorkflowRun");
  });

  it("opens a workflow_runs row before fetch/LLM steps", () => {
    const openIdx = orchestrator.indexOf('"open-run"');
    const fetchIdx = orchestrator.indexOf("loadSources(ctx)");
    expect(openIdx).toBeGreaterThan(0);
    expect(openIdx).toBeLessThan(fetchIdx);
  });

  // Workflow replay keys memoized results by step name in call order, and
  // each step reads what earlier ones wrote (backfill-translate picks up the
  // summaries backfill-content filled; notify sends the edition tldr wrote).
  // The orchestrator is the one place that order lives.
  it("runs the pipeline steps in their dependency order", () => {
    const order = [
      "loadSources(",
      "fetchSources(",
      "dedupeNewRows(",
      "enrichNewRows(",
      "scoreNewRows(",
      "normalizeNewRowTopics(",
      "learnTopics(",
      "planMerges(",
      "translatePublishedRows(",
      "carrySourceStreaks(",
      "writeItems(",
      "backfillContent(",
      "backfillTranslations(",
      "backfillScores(",
      "qaTranslations(",
      "reviewSuggestions(",
      "reviewSubmissions(",
      "generateTldr(",
      "sendEmailDigest(",
      "notifyChannels(",
    ].map((call) => orchestrator.indexOf(`await ${call}`));
    expect(order.every((idx) => idx > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("persists workflow_runs before pruneLlmCalls and without safeStep", () => {
    const persistIdx = workflow.search(
      /persistOpenedWorkflowRun\(\s*this\.env\.DB,\s*runId,\s*startedAt,\s*"open-run"/
    );
    const pruneIdx = workflow.indexOf("await pruneLlmCalls(this.env)");
    expect(persistIdx).toBeGreaterThan(0);
    expect(persistIdx).toBeLessThan(pruneIdx);
    expect(workflow).not.toMatch(/safeStep\(\s*step,\s*"open-run"/);
  });
});

describe("LLM step telemetry identity (#189)", () => {
  const workflow = ingestWorkflowSource();

  it("routes every LLM-calling step through llmStep with this run's env + id", () => {
    for (const name of [
      "score",
      "normalize-topics",
      "merge-similar",
      "translate",
      "backfill-score",
      "qa-translations",
      "review-suggestions",
      "review-submissions",
      "tldr",
    ]) {
      expect(workflow).toMatch(
        new RegExp(
          `llmStep\\(\\s*step,\\s*env,\\s*runId,\\s*["'\`]${name}["'\`]`
        )
      );
    }
    expect(workflow).toMatch(
      /llmStep\(\s*step,\s*env,\s*runId,\s*`backfill-translate-\$\{offset\}`/
    );
    // A finished score batch is its own step, so a later interrupt cannot
    // drop it or record the whole step as zero items scored.
    expect(workflow).toMatch(
      /llmStep\(\s*step,\s*env,\s*runId,\s*`score-\$\{index\}`/
    );
  });

  it("keeps the top-of-run install as a default, not the only one", () => {
    expect(workflow).toContain(
      "setLlmCallLogger(createD1LlmCallLogger(this.env, runId))"
    );
    const stepModule = readFileSync(
      path.join(webRoot, "worker/workflow-step.ts"),
      "utf-8"
    );
    expect(stepModule).toContain("withRunLlmCallLogger");
    expect(stepModule).toContain("flushLlmCallWrites");
  });
});

describe("create-path workflow_runs persist", () => {
  const ingestSchedule = readFileSync(
    path.join(webRoot, "worker/ingest-schedule.ts"),
    "utf-8"
  );

  it("verifies D1 before NEWS_INGEST.create({ id })", () => {
    const startFn = ingestSchedule.slice(
      ingestSchedule.indexOf("async function startCreatedIngest")
    );
    const persistIdx = startFn.indexOf("persistCreatedIngestRunVerified");
    const createIdx = startFn.indexOf("NEWS_INGEST.create(");
    expect(persistIdx).toBeGreaterThan(0);
    expect(createIdx).toBeGreaterThan(persistIdx);
  });
});
