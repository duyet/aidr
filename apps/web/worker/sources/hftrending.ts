import { isReleaseRepo } from "./hfmodels.js";
import {
  asArray,
  asRecord,
  asString,
  configuredMaxItems,
  fetchSourceJson,
} from "./http.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

/** A model trends a few days after upload, so the 26h since-window would
 *  miss almost every one; a model that trends months after upload is not
 *  news. */
export const TRENDING_MAX_AGE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Release repos on the Hugging Face trending list, from any organization.
 *
 * The org feeds (`hfmodels`) only see the organizations they name; this sees
 * the ones nobody named. Kept: public, `isReleaseRepo`, created within
 * `TRENDING_MAX_AGE_DAYS`. `trendingScore` only orders the cap, and likes and
 * downloads are summary facts: none is emitted as `points`, so `rank_score`
 * does not count them as reader engagement. The date is `createdAt`, the
 * honest upload date, even when it is older than the since-window.
 * Config: `maxItems`.
 */
export const hfTrendingAdapter: SourceAdapter = {
  type: "hftrending",

  async fetchItems(config) {
    const data = await fetchSourceJson(
      "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=30",
      "hf trending models"
    );
    const minCreatedMs = Date.now() - TRENDING_MAX_AGE_DAYS * DAY_MS;
    const ranked: { item: FetchedItem; trendingScore: number }[] = [];
    for (const entry of asArray(data)) {
      const model = asRecord(entry);
      const id = asString(model.id);
      const tags = asArray(model.tags).filter(
        (tag): tag is string => typeof tag === "string"
      );
      const publishedAt = Date.parse(asString(model.createdAt));
      if (!id.includes("/") || model.private === true) continue;
      if (!Number.isFinite(publishedAt) || publishedAt < minCreatedMs) continue;
      if (!isReleaseRepo(id, tags)) continue;
      const org = id.slice(0, id.indexOf("/"));
      const modelName = id.slice(id.indexOf("/") + 1);
      const pipeline = asString(model.pipeline_tag);
      const library = asString(model.library_name);
      const facts = [
        pipeline ? `task: ${pipeline}` : "",
        library ? `library: ${library}` : "",
        typeof model.likes === "number" ? `${model.likes} likes` : "",
        typeof model.downloads === "number"
          ? `${model.downloads} downloads`
          : "",
      ].filter(Boolean);
      const url = `https://huggingface.co/${id}`;
      ranked.push({
        trendingScore:
          typeof model.trendingScore === "number" ? model.trendingScore : 0,
        item: {
          externalId: id,
          url,
          title: `${modelName} by ${org} is trending on Hugging Face`,
          summary: `${org} published ${id} on Hugging Face${facts.length ? ` (${facts.join(", ")})` : ""}.`,
          publishedAt,
          sources: [
            { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
          ],
        },
      });
    }
    return ranked
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, configuredMaxItems(config))
      .map((row) => row.item);
  },
};
