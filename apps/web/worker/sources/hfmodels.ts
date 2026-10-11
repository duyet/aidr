import { asArray, asRecord, asString, fetchSourceJson } from "./http.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

const AUTHOR_RE = /^[\w.-]+$/;

/** Repo names that are a derivative of a release, not the release: quantized
 *  builds, adapters, sparse autoencoders, draft models, benchmark repos and
 *  `-hf` format conversions. `Base` and `Instruct` are deliberately absent. */
const DERIVATIVE_NAME =
  /(?:^|[-_.])(?:gguf|gptq|awq|bf16|fp16|fp8|fp4|nvfp4|mxfp4|int4|int8|4bit|8bit|bnb|mlx|exl2|onnx|quantized|lora|adapter|sae|eagle\d*|draft|tmp|test|bench|eval|hf)(?:$|[-_.])/i;

const DERIVATIVE_TAG_PREFIXES = [
  "base_model:quantized:",
  "base_model:adapter:",
  "base_model:merge:",
];

export function isReleaseRepo(id: string, tags: readonly string[]): boolean {
  const name = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  if (DERIVATIVE_NAME.test(name)) return false;
  return !tags.some(
    (tag) =>
      tag === "gguf" ||
      DERIVATIVE_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))
  );
}

/**
 * New model repos from one Hugging Face organization, newest first.
 *
 * Config: `author` (the organization, required). Derivative repos are
 * dropped by tag (`base_model:quantized:`, `adapter:`, `merge:`) and by name
 * (see `DERIVATIVE_NAME`). A `base_model:finetune:` tag is kept on purpose:
 * it is how an organization's own `-Instruct` build of its `-Base` model is
 * tagged. There is no `feed` or `homepage` key, so huggingface.co links keep
 * their existing owner (`hf-blog`).
 */
export const hfModelsAdapter: SourceAdapter = {
  type: "hfmodels",

  async fetchItems(config, sinceEpochSec) {
    const author = asString(config.author);
    if (!AUTHOR_RE.test(author)) {
      throw new Error("hfmodels: config.author must be an organization name");
    }
    const data = await fetchSourceJson(
      `https://huggingface.co/api/models?author=${encodeURIComponent(author)}&sort=createdAt&direction=-1&limit=30`,
      "hf models"
    );
    const sinceMs = sinceEpochSec * 1000;
    const items: FetchedItem[] = [];
    for (const entry of asArray(data)) {
      const model = asRecord(entry);
      const id = asString(model.id);
      const tags = asArray(model.tags).filter(
        (tag): tag is string => typeof tag === "string"
      );
      const publishedAt = Date.parse(asString(model.createdAt));
      if (!id || model.private === true) continue;
      if (!Number.isFinite(publishedAt) || publishedAt < sinceMs) continue;
      if (!isReleaseRepo(id, tags)) continue;
      const pipeline = asString(model.pipeline_tag);
      const library = asString(model.library_name);
      const url = `https://huggingface.co/${id}`;
      const modelName = id.slice(id.indexOf("/") + 1);
      items.push({
        externalId: id,
        url,
        title: `${modelName} released by ${author} on Hugging Face`,
        summary: `${author} published ${id}${pipeline ? ` (${pipeline})` : ""} on Hugging Face${library ? `, library: ${library}` : ""}.`,
        publishedAt,
        sources: [
          { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
        ],
      });
    }
    return items;
  },
};
