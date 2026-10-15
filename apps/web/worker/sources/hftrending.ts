import { INGEST_ALARM_INTERVAL_MS } from "../ingest-schedule.js";
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
 * The `maxItems` window of `ranked` for the run at `nowMs`. The cap applies
 * before ingest drops already-stored URLs, so always taking the head would
 * re-send the same top repos every run and never reach the rest. The window
 * starts at `(slot * maxItems) mod n`, one slot per ingest interval, and
 * wraps, so every candidate is sent within `ceil(n / maxItems)` runs; a
 * repeat is dropped by ingest as already stored.
 */
function rotatingWindow<T>(
  ranked: readonly T[],
  maxItems: number,
  nowMs: number
): T[] {
  if (ranked.length <= maxItems) return [...ranked];
  const slot = Math.floor(nowMs / INGEST_ALARM_INTERVAL_MS);
  const start = (slot * maxItems) % ranked.length;
  return Array.from(
    { length: maxItems },
    (_, i) => ranked[(start + i) % ranked.length]
  );
}

/**
 * Release repos on the Hugging Face trending list, from any organization.
 *
 * The org feeds (`hfmodels`) only see the organizations they name; this sees
 * the ones nobody named. Kept: public, `isReleaseRepo`, created within
 * `TRENDING_MAX_AGE_DAYS`, ranked by `trendingScore` (then id, so the order
 * is the same on every run) and sent `maxItems` at a time through
 * `rotatingWindow`. `trendingScore` only orders the list, and likes and
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
    const nowMs = Date.now();
    const minCreatedMs = nowMs - TRENDING_MAX_AGE_DAYS * DAY_MS;
    const ranked: { id: string; item: FetchedItem; trendingScore: number }[] =
      [];
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
        id,
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
    ranked.sort(
      (a, b) =>
        b.trendingScore - a.trendingScore ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    return rotatingWindow(
      ranked.map((row) => row.item),
      configuredMaxItems(config),
      nowMs
    );
  },
};
