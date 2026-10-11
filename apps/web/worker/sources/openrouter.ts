import { asArray, asRecord, asString, fetchSourceJson } from "./http.js";
import { clipFeedSummary } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

function perMillion(value: unknown): string | null {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return `$${Number((price * 1_000_000).toFixed(2))}`;
}

function modelSummary(model: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const description = asString(model.description).replace(/\s+/g, " ");
  if (description) parts.push(clipFeedSummary(description));
  const context = Number(model.context_length);
  if (Number.isFinite(context) && context > 0) {
    parts.push(`Context window: ${context.toLocaleString("en-US")} tokens.`);
  }
  const pricing = asRecord(model.pricing);
  const input = perMillion(pricing.prompt);
  const output = perMillion(pricing.completion);
  if (input && output) {
    parts.push(`Price per million tokens: ${input} input, ${output} output.`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Models that appeared on OpenRouter since the ingest window opened.
 *
 * An adapter receives only its config and the window start, and no adapter
 * keeps state between runs, so "first seen since the last run" is
 * `created >= window start`; a model still inside the 26h window on the next
 * run has the same URL, and ingest drops it as already stored. Variants of one
 * model (`:free`, `:batch`, `:thinking`, `:extended`) share `created` with
 * their base and are not separate stories, so ids with a `:` are skipped.
 */
export const openRouterAdapter: SourceAdapter = {
  type: "openrouter",

  async fetchItems(_config, sinceEpochSec) {
    const data = await fetchSourceJson(
      "https://openrouter.ai/api/v1/models",
      "openrouter models"
    );
    const items: FetchedItem[] = [];
    for (const entry of asArray(asRecord(data).data)) {
      const model = asRecord(entry);
      const id = asString(model.id);
      const name = asString(model.name);
      const created = Number(model.created);
      if (!id || !name || id.includes(":")) continue;
      if (!Number.isFinite(created) || created < sinceEpochSec) continue;
      const url = `https://openrouter.ai/${id}`;
      items.push({
        externalId: id,
        url,
        title: `${name} is now on OpenRouter`,
        summary: modelSummary(model),
        publishedAt: created * 1000,
        sources: [{ kind: "source", url, postedAt: created }],
      });
    }
    return items;
  },
};
