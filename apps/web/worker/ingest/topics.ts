import { captureAndLearnTopics } from "../topic-learning.js";
import { fallbackTags, type KnownTopics } from "../tag-fallback.js";
import { dedupeNormalized, normalizeTopics } from "../topics.js";
import { jsonMap, mapEntries } from "../workflow-run.js";
import { llmStep, safeStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP, type NewRow } from "./context.js";
import type { ItemScore } from "./score.js";

/**
 * Rewrites each item's raw score tags into canonical topic names
 * (rules-based first, LLM-mapped for unseen variants), persisting the
 * `topics` table's per-variant counts. Runs before merge-similar so a
 * cluster's topic union already has canonical values to dedupe against.
 */
export async function normalizeNewRowTopics(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  now: number
): Promise<Map<string, string[]>> {
  const { step, env, runId } = ctx;
  const canonical = jsonMap(
    await llmStep(
      step,
      env,
      runId,
      "normalize-topics",
      [] as [string, string[]][],
      async () => {
        if (newRows.length === 0) return [];
        try {
          const storiesById = new Map(
            newRows.map((row) => [
              row.id,
              {
                tags: scored.get(row.id)?.tags ?? [],
                title: row.item.title,
                sourceId: row.source.id,
              },
            ])
          );
          return mapEntries(await normalizeTopics(env, storiesById, now));
        } catch (error) {
          console.error("normalize-topics step failed:", error);
          return [];
        }
      },
      { config: LLM_STEP }
    )
  );
  // A failed or interrupted step leaves no entry; keep the scorer's own tags
  // (as backfill-score does) rather than storing the row untagged. A story
  // with none gets the deterministic fallback, so no path stores `[]` where
  // `fallbackTags` would name something.
  let known: KnownTopics | undefined;
  for (const row of newRows) {
    if (canonical.has(row.id)) continue;
    const scoredTags = dedupeNormalized(scored.get(row.id)?.tags ?? []);
    if (scoredTags.length > 0) {
      canonical.set(row.id, scoredTags);
      continue;
    }
    known ??= await loadKnownTopics(env);
    canonical.set(
      row.id,
      fallbackTags({ title: row.item.title, sourceId: row.source.id }, known)
    );
  }
  return canonical;
}

async function loadKnownTopics(
  env: IngestContext["env"]
): Promise<KnownTopics> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT name, canonical FROM topics"
    ).all<{ name: string; canonical: string }>();
    return new Map((results ?? []).map((r) => [r.name, r.canonical]));
  } catch (error) {
    console.error("fallback tags: reading topics failed:", error);
    return new Map();
  }
}

/** Capture per-day topic frequencies and promote emerging entity / model
 * tags into learned_keywords for title highlight + trending. */
export async function learnTopics(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  canonicalTagsByItem: Map<string, string[]>,
  now: number
): Promise<void> {
  const { step, env } = ctx;
  await safeStep(step, "learn-topics", undefined, async () => {
    if (canonicalTagsByItem.size === 0) return;
    try {
      const titlesByItem = new Map(
        newRows.map((row) => [row.id, row.item.title])
      );
      const { promoted } = await captureAndLearnTopics(
        env.DB,
        canonicalTagsByItem,
        now,
        titlesByItem
      );
      if (promoted.length > 0) {
        console.log(
          `learn-topics promoted ${promoted.length}: ${promoted.slice(0, 8).join(", ")}`
        );
      }
    } catch (error) {
      console.error("learn-topics step failed:", error);
    }
  });
}
