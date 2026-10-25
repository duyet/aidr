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
      'run_worker_first = ["/", "/favicon.ico", "/logo-sm.png", "/logo.png", "/logo-icon.png", "/logo.svg", "/og.jpg", "/favicon.svg", "/favicon-120x120.png", "/apple-touch-icon.png", "/sitemap.xml", "/sitemaps/*", "/news.xml", "/feed.xml", "/rss.xml", "/feed.json", "/robots.txt", "/llms.txt", "/auth.md", "/about.md", "/subscribe.md", "/data.md", "/brand.md", "/release.md", "/privacy.md", "/terms.md", "/mcp.md", "/contribute.md", "/openapi.json", "/.well-known/*", "/api/*", "/__clerk/*", "/_serverFn", "/_serverFn/*", "/aidr.zip"]'
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

  // Claude Sonnet is paid, so it runs only after every free id failed. It
  // stays off translate and summarize (a third id cuts Laguna's head slice
  // from 50s to 30s), TL;DR (luna's EN-only retry slice drops from 40s to
  // 20s), the VI→EN generator (capped at 2 ids, a third is dropped), and
  // review (must stay disjoint from the generators).
  const PAID_FALLBACK = "anthropic/claude-sonnet-5-5";

  it("keeps Claude Sonnet as the last score fallback and off every other chain", () => {
    expect(idsOf("ANYROUTER_MODEL").at(-1)).toBe(PAID_FALLBACK);
    for (const name of [
      "ANYROUTER_TRANSLATE_MODEL",
      "ANYROUTER_TLDR_MODEL",
      "ANYROUTER_ENGLISH_TRANSLATE_MODEL",
      "ANYROUTER_REVIEW_MODEL",
    ]) {
      expect(
        idsOf(name).some((id) => id.startsWith("anthropic/")),
        name
      ).toBe(false);
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

  // Production llm_calls, 7 days to 2026-10-14: space-bunny-alpha reviewed
  // 0 of 484 (98 404s in the last 24h alone). Every review attempt in a
  // run failed while it held the fallback slot (#655). gemma-4-31b served
  // 16 of 542 translate and summarize calls, none after 2026-10-12 03:16
  // UTC (#663). anyrouter/auto served 0 of 97 calls over 7 days to
  // 2026-10-16 (cluster 0/48, score 0/41) and 0 of 26 tldr calls before
  // that; its slot only shrank the next id's slice (#672).
  const KNOWN_DEAD = [
    "stealth/space-bunny-alpha",
    "google/gemma-4-31b",
    "anyrouter/auto",
  ];

  it("keeps known-dead model ids off every chain", () => {
    for (const name of chains) {
      for (const dead of KNOWN_DEAD)
        expect(idsOf(name), name).not.toContain(dead);
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

  // The per-run timeout breaker and the 429 skip map are keyed by model,
  // not task, and qa-translations runs before tldr. A reviewer that also
  // heads TL;DR lets review hangs push the digest onto its fallback (#663).
  it("keeps the translation reviewer off the TL;DR chain", () => {
    const tldr = new Set(idsOf("ANYROUTER_TLDR_MODEL"));
    for (const model of idsOf("ANYROUTER_REVIEW_MODEL"))
      expect(tldr.has(model), model).toBe(false);
  });

  // #655: 406 of 413 review calls failed on 2026-10-13, on the quota every
  // other task shares. Review stays off until a measured probe picks a
  // reviewer (#656); that change removes this check.
  it("keeps translation review paused until a reviewer is probed", () => {
    expect(wrangler).toMatch(/^TRANSLATION_REVIEW_ENABLED = "false"$/m);
  });

  // Prod llm_calls since 2026-10-14 00:00 UTC, 429s excluded (#663):
  // gemini-3-flash served 0 of 21 translate and summarize calls (404, 502).
  // Laguna served 19 of 22 and gemma-latest 22 of 44. Summarize runs on
  // this chain too, and Laguna served it 772 of 987 over 7 days. Gemini is
  // off the tail as well: a 502 is never skipped, so a third id cuts the
  // head's slice from 50s to 30s, under Laguna's 32.5s translate p95.
  // 2026-10-25 (#1056): gemma-latest translated 0 of 22. Nemotron 3.5 Bolt
  // E4B replaces it on EN→VI only. It served 7 of 12 eval batches, so it
  // stays behind Laguna. The VI→EN chain was not evaluated and is unchanged.
  it("orders the translate chains by measured success rate", () => {
    expect(idsOf("ANYROUTER_TRANSLATE_MODEL")).toEqual([
      "poolside/laguna-s-2.1",
      "nvidia/nemotron-3.5-bolt-e4b",
    ]);
    expect(idsOf("ANYROUTER_ENGLISH_TRANSLATE_MODEL")).toEqual([
      "poolside/laguna-s-2.1",
      "google/gemma-latest",
    ]);
  });

  // Over 7 days to 2026-10-14, gemini-3-flash served 1 of 6 TL;DR fallback
  // attempts after a luna hang, and none since. Laguna served 21 of 32
  // TL;DR attempts (p95 105s), which fits the 135s slice left after a 20s
  // luna first-token hang (#663).
  it("falls back from luna to Laguna on TL;DR", () => {
    expect(idsOf("ANYROUTER_TLDR_MODEL")).toEqual([
      "openai/gpt-5.6-luna",
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

  it("prunes subscribe attempts after pruneLlmCalls", () => {
    const pruneIdx = workflow.indexOf("await pruneLlmCalls(this.env)");
    const attemptsIdx = workflow.indexOf(
      "await pruneSubscribeAttempts(this.env.DB)"
    );
    expect(pruneIdx).toBeGreaterThan(0);
    expect(attemptsIdx).toBeGreaterThan(pruneIdx);
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
    // Each backfill-translate slice, the recheck batch too, goes through
    // translateSlice, the one llmStep call that names it.
    expect(workflow).toMatch(/llmStep\(\s*step,\s*env,\s*runId,\s*name,/);
    expect(workflow).toMatch(/run\(\s*`backfill-translate-\$\{offset\}`/);
    expect(workflow).toContain('run("backfill-translate-recheck"');
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
