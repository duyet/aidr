import {
  asArray,
  asRecord,
  asString,
  configuredMaxItems,
  fetchSourceJson,
} from "./http.js";
import { clipFeedSummary } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

/**
 * Hugging Face Daily Papers (`/api/daily_papers`).
 *
 * Upvotes only order the cap: the best-upvoted papers of the window are kept
 * and nothing is emitted as `points`, so `rank_score` does not count them as
 * reader engagement. The date is `submittedOnDailyAt` (midnight UTC of the
 * day the paper was listed), not the arXiv `publishedAt`, which is often
 * older than the since-window by the time a paper is listed. The list does
 * not change on weekends. Config: `maxItems`.
 */
export const hfPapersAdapter: SourceAdapter = {
  type: "hfpapers",

  async fetchItems(config, sinceEpochSec) {
    const data = await fetchSourceJson(
      "https://huggingface.co/api/daily_papers",
      "hf daily papers"
    );
    const sinceMs = sinceEpochSec * 1000;
    const ranked: { item: FetchedItem; upvotes: number }[] = [];
    for (const entry of asArray(data)) {
      const daily = asRecord(entry);
      const paper = asRecord(daily.paper);
      const id = asString(paper.id);
      const title = asString(paper.title) || asString(daily.title);
      if (!id || !title) continue;
      const publishedAt = Date.parse(
        asString(paper.submittedOnDailyAt) ||
          asString(daily.publishedAt) ||
          asString(paper.publishedAt)
      );
      if (!Number.isFinite(publishedAt) || publishedAt < sinceMs) continue;
      const url = `https://huggingface.co/papers/${encodeURIComponent(id)}`;
      const abstract = asString(paper.summary) || asString(daily.summary);
      ranked.push({
        upvotes: typeof paper.upvotes === "number" ? paper.upvotes : 0,
        item: {
          externalId: id,
          url,
          title,
          summary: abstract
            ? clipFeedSummary(abstract.replace(/\s+/g, " "))
            : undefined,
          publishedAt,
          sources: [
            { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
          ],
        },
      });
    }
    return ranked
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, configuredMaxItems(config))
      .map((row) => row.item);
  },
};
