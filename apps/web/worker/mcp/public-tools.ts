/**
 * D1-backed execution for the four public read tools.
 *
 * This is the ONLY place an anonymous MCP call reaches the database, and
 * it reaches it through the existing public read helpers
 * (`getPublicDigest`, `getFeed`, `getStoryCandidates` + `renderStoryMarkdown`).
 * There is deliberately no second query path: a parallel data path for
 * agents is how a "read-only" surface quietly becomes its own
 * availability problem, and how an agent's answer stops matching the REST
 * API.
 *
 * Ordering is load-bearing. `worker/admin/mcp.ts` validates the tool name
 * and the arguments through `./public-read-tools.js` BEFORE calling
 * anything here, so a rejected argument never reaches this file and
 * therefore never reaches D1.
 */

import type { DbReader } from "../../src/lib/db.js";
import { getFeed } from "../../src/lib/feed-queries.js";
import { localizePublicDigest } from "../../src/lib/public-api.js";
import { getPublicDigest } from "../../src/lib/public-queries.js";
import {
  boundSearchResult,
  exceedsReadResultBound,
  projectDigestBullets,
  projectSearchResult,
} from "../../src/lib/public-read-results.js";
import type {
  GetAiDigestArgs,
  GetStoryArgs,
  LatestNewsArgs,
  PublicReadToolName,
  SearchNewsArgs,
} from "../../src/lib/public-read-tools.js";
import {
  renderStoryMarkdown,
  STORY_MARKDOWN_FORMAT,
  STORY_MARKDOWN_MAX_RESPONSE_BYTES,
  storyMarkdownCanonicalUrl,
} from "../../src/lib/story-markdown.js";
import { getStoryCandidates } from "../../src/lib/story-queries.js";
import type { FeedItem } from "../../src/lib/types.js";

export type PublicReadResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * The digest payload. Byte-for-byte the same object `GET /api/public`
 * returns, produced by the same two functions, so an agent comparing the
 * MCP tool with the REST endpoint can only differ on `updatedAt` (a
 * `Date.now()` stamp that legitimately changes between two calls).
 */
async function runLatestAiNews(
  reader: DbReader,
  args: LatestNewsArgs
): Promise<PublicReadResult> {
  const digest = localizePublicDigest(await getPublicDigest(reader), args.lang);
  return { ok: true, value: digest };
}

async function runSearchNews(
  reader: DbReader,
  args: SearchNewsArgs
): Promise<PublicReadResult> {
  const feed = await getFeed(reader, {
    ...(args.q === undefined ? {} : { q: args.q }),
    ...(args.days === undefined ? {} : { days: args.days }),
    ...(args.category === undefined ? {} : { category: args.category }),
    ...(args.before === undefined ? {} : { before: args.before }),
  });
  return boundSearchResult(projectSearchResult(feed, args.lang));
}

async function runGetAiDigest(
  reader: DbReader,
  args: GetAiDigestArgs
): Promise<PublicReadResult> {
  const digest = await getPublicDigest(reader);
  return { ok: true, value: projectDigestBullets(digest, args.lang) };
}

/**
 * `aidr://story/{id}` and the `get_story` tool share this, so a resource
 * read and a tool call can never disagree about which story a prefix
 * resolves to, or about the Markdown byte ceiling.
 */
export async function readStoryPayload(
  reader: DbReader,
  args: GetStoryArgs
): Promise<
  | { ok: true; value: { id: string; markdown: string; permalink: string } }
  | { ok: false; error: string }
> {
  // Two candidates is all the Markdown contract needs to detect a prefix
  // collision — the same bounded lookup `/api/story/{id}.md` performs.
  const candidates = await getStoryCandidates(reader, args.id, 2);
  if (candidates.length > 1) {
    return {
      ok: false,
      error:
        "ambiguous story id: that prefix matches more than one published " +
        "story. Use a longer prefix. aidr never picks a 'closest' story.",
    };
  }
  const item: FeedItem | undefined = candidates[0];
  if (!item) {
    return { ok: false, error: "no published story matched that id." };
  }
  if (args.id.length > 8) {
    // A longer prefix is only safe when its own 8-character canonical
    // target is unique and identical, exactly as the 308 canonicalization
    // in `/api/story/{id}.md` requires.
    const canonical = await getStoryCandidates(reader, args.id.slice(0, 8), 2);
    if (canonical.length > 1 || canonical[0]?.id !== item.id) {
      return {
        ok: false,
        error:
          "ambiguous story id: that prefix cannot be canonicalized to one " +
          "unique 8-character story. Use the 8-character prefix itself.",
      };
    }
  }
  return { ok: true, value: buildStoryPayload(item, args.lang) };
}

function buildStoryPayload(item: FeedItem, lang: GetStoryArgs["lang"]) {
  return {
    id: item.id,
    markdown: renderStoryMarkdown(item, lang),
    permalink: storyMarkdownCanonicalUrl(item, lang),
    format: STORY_MARKDOWN_FORMAT,
  };
}

async function runGetStory(
  reader: DbReader,
  args: GetStoryArgs
): Promise<PublicReadResult> {
  const story = await readStoryPayload(reader, args);
  if (!story.ok) return story;
  // The 413 arm of `/api/story/{id}.md`. A hostile stored row can render
  // past the Markdown ceiling; refusing is the same answer the REST
  // contract gives, and truncation is never an option for a body an agent
  // may quote verbatim.
  if (story.value.markdown.length === 0) {
    return { ok: false, error: "story has no renderable Markdown." };
  }
  if (exceedsReadResultBound(story.value.markdown)) {
    return {
      ok: false,
      error:
        "story representation is larger than the public read bound and was " +
        "refused rather than truncated.",
    };
  }
  return { ok: true, value: story.value };
}

/**
 * `name` and the arguments are already validated by the caller; the
 * `switch` is exhaustive over `PublicReadToolName` so adding a tool to
 * the contract without an executor is a type error, not a silent 404.
 */
export async function runPublicReadTool(
  reader: DbReader,
  name: PublicReadToolName,
  args: unknown
): Promise<PublicReadResult> {
  switch (name) {
    case "latest_ai_news":
      return runLatestAiNews(reader, args as LatestNewsArgs);
    case "search_news":
      return runSearchNews(reader, args as SearchNewsArgs);
    case "get_story":
      return runGetStory(reader, args as GetStoryArgs);
    case "get_ai_digest":
      return runGetAiDigest(reader, args as GetAiDigestArgs);
  }
}

export { STORY_MARKDOWN_FORMAT, STORY_MARKDOWN_MAX_RESPONSE_BYTES };
