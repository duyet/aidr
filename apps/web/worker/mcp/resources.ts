/**
 * MCP resources over the public read surface.
 *
 * The published server card advertised `capabilities.resources` and
 * `capabilities.prompts` when neither existed — a documented-but-false
 * claim is the exact failure mode #227 exists to remove. Resources are
 * cheap to make true: the digest and one story are already the two things
 * an agent wants, and they are already bounded by the public queries.
 *
 * `resources/list` is served without touching D1 (the two digest URIs are
 * static). `resources/read` reuses the same helpers as the tools, so a
 * resource and a tool can never disagree about a story or a bound.
 */

import type { DbReader } from "../../src/lib/db.js";
import { readSession } from "../../src/lib/db.js";
import { localizePublicDigest } from "../../src/lib/public-api.js";
import { getPublicDigest } from "../../src/lib/public-queries.js";
import {
  GET_AI_DIGEST,
  GET_STORY,
  LATEST_AI_NEWS,
  PUBLIC_READ_LANGS,
  PUBLIC_READ_STORY_ID_PATTERN,
  PUBLIC_READ_TOOL_NAMES,
  PUBLIC_READ_TRUST_NOTICE,
  type PublicReadLang,
  validateGetStory,
} from "../../src/lib/public-read-tools.js";
import { readStoryPayload } from "./public-tools.js";

/**
 * `aidr:` rather than `https://aidr.today/...` so a resource read can be
 * told apart from a REST fetch at a glance, and so a client that has
 * already located the canonical host does not have to re-resolve one.
 */
export const MCP_DIGEST_RESOURCE_PREFIX = "aidr://digest";
export const MCP_STORY_RESOURCE_PREFIX = "aidr://story/";
export const MCP_STORY_RESOURCE_TEMPLATE = "aidr://story/{id}";

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/** Static: `resources/list` must not cost a D1 round-trip. */
export const MCP_DIGEST_RESOURCES: readonly McpResourceDescriptor[] =
  PUBLIC_READ_LANGS.map((lang) => ({
    uri: `${MCP_DIGEST_RESOURCE_PREFIX}?lang=${lang}`,
    name: `aidr-digest-${lang}`,
    title: `aidr ranked AI news digest (${lang})`,
    description: [
      "The bounded public digest: up to 8 top-ranked published stories plus",
      `the ${lang} TL;DR snapshot. Same payload as the \`${LATEST_AI_NEWS}\` tool.`,
      PUBLIC_READ_TRUST_NOTICE,
    ].join(" "),
    mimeType: "application/json",
  }));

export const MCP_RESOURCE_TEMPLATES: readonly McpResourceDescriptor[] = [
  {
    uri: MCP_STORY_RESOURCE_TEMPLATE,
    name: "aidr-story",
    title: "One published aidr story as bounded Markdown",
    description: [
      "`{id}` is a",
      `${PUBLIC_READ_STORY_ID_PATTERN} prefix (8 characters is canonical).`,
      "An ambiguous prefix is rejected, never resolved to a closest story.",
      `Same payload as the \`${GET_STORY}\` tool and GET /api/story/{id}.md.`,
      PUBLIC_READ_TRUST_NOTICE,
    ].join(" "),
    mimeType: "text/markdown",
  },
];

export function mcpResources(): McpResourceDescriptor[] {
  return [...MCP_DIGEST_RESOURCES];
}

export function mcpResourceTemplates(): McpResourceDescriptor[] {
  return [...MCP_RESOURCE_TEMPLATES];
}

const DIGEST_RE = /^aidr:\/\/digest\/?$/;
const STORY_RE = /^aidr:\/\/story\/([^/?#]+)\/?$/;
const MAX_URI_LENGTH = 256;

export type McpResourceRequest =
  | { kind: "digest"; lang: PublicReadLang }
  | { kind: "story"; id: string; lang: PublicReadLang };

export function parseMcpResourceUri(
  uri: unknown
): { ok: true; value: McpResourceRequest } | { ok: false; error: string } {
  if (
    typeof uri !== "string" ||
    uri.length === 0 ||
    uri.length > MAX_URI_LENGTH
  ) {
    return {
      ok: false,
      error:
        "invalid resource uri; call resources/list for aidr://digest?lang=en|vi " +
        `and ${MCP_STORY_RESOURCE_TEMPLATE}`,
    };
  }
  // Split the query off before matching so the id segment can never carry
  // one, and so `?lang=` resolves identically for every resource.
  const queryIndex = uri.search(/[?#]/);
  const path = queryIndex === -1 ? uri : uri.slice(0, queryIndex);
  const rawLang = queryIndex === -1 ? "" : uri.slice(queryIndex);
  const lang: PublicReadLang = /[?&]lang=vi(&|$)/.test(rawLang) ? "vi" : "en";

  if (DIGEST_RE.test(path))
    return { ok: true, value: { kind: "digest", lang } };

  const story = STORY_RE.exec(path);
  if (story?.[1]) {
    // Reuse the tool validator so the id contract has exactly ONE
    // definition: a resource read can never accept an id the tool rejects.
    const validated = validateGetStory({ id: story[1], lang });
    if (!validated.ok) return { ok: false, error: validated.error };
    return {
      ok: true,
      value: { kind: "story", id: validated.value.id, lang },
    };
  }
  return {
    ok: false,
    error:
      "unknown resource uri; call resources/list. The same capabilities are " +
      `exposed as tools: ${PUBLIC_READ_TOOL_NAMES.join(", ")}.`,
  };
}

export interface McpResourceRead {
  contents: McpResourceContents[];
}

export type McpResourceReadResult =
  | { ok: true; value: McpResourceRead }
  | { ok: false; error: string };

export async function readMcpResource(
  db: D1Database,
  uri: unknown
): Promise<McpResourceReadResult> {
  const parsed = parseMcpResourceUri(uri);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const reader: DbReader = readSession(db);

  if (parsed.value.kind === "digest") {
    const digest = localizePublicDigest(
      await getPublicDigest(reader),
      parsed.value.lang
    );
    return {
      ok: true,
      value: {
        contents: [
          {
            uri: `${MCP_DIGEST_RESOURCE_PREFIX}?lang=${parsed.value.lang}`,
            mimeType: "application/json",
            text: JSON.stringify(digest),
          },
        ],
      },
    };
  }

  const story = await readStoryPayload(reader, {
    id: parsed.value.id,
    lang: parsed.value.lang,
  });
  if (!story.ok) return { ok: false, error: story.error };
  return {
    ok: true,
    value: {
      contents: [
        {
          uri: `${MCP_STORY_RESOURCE_PREFIX}${story.value.id}?lang=${parsed.value.lang}`,
          mimeType: "text/markdown",
          text: story.value.markdown,
        },
      ],
    },
  };
}

export { GET_AI_DIGEST, GET_STORY, PUBLIC_READ_STORY_ID_PATTERN };
