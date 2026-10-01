/**
 * The operator MCP tool registry — pure data; its only import is the
 * dependency-free step-name list.
 *
 * Lives in its own leaf module because two different graphs need the
 * names: `worker/admin/mcp.ts` (which dispatches to the handlers) and
 * `src/lib/agent-discovery.ts` (which publishes the server card). If the
 * card imported the handler module it would drag `worker/llm.js` and
 * `cloudflare:workers` into the discovery document's import graph.
 *
 * Every tool here writes pipeline state, mutates ingest configuration,
 * burns LLM budget, or exposes internal pipeline detail, so every one is
 * admin-auth-only. The public read tools are a separate registry in
 * `src/lib/public-read-tools.ts`; the two must never be merged into one
 * list that `tools/list` filters at runtime.
 */
import { PIPELINE_STEPS } from "../ingest/mode.js";

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    source_id: { type: "string" },
    published_at: {
      type: "number",
      description: "Epoch milliseconds. Defaults to now if omitted.",
    },
    points: { type: "number" },
    comments: { type: "number" },
    category: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    title_vi: { type: "string" },
    summary_vi: { type: "string" },
    relevance: { type: "number" },
    importance: { type: "number" },
    quality: { type: "number" },
    source_lang: { type: "string", enum: ["en", "vi"] },
  },
  required: ["url", "title"],
} as const;

export const ADMIN_MCP_TOOLS = [
  {
    name: "push_items",
    description:
      "Push one or more news items into the feed. Accepts a single item or an array of items.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          anyOf: [ITEM_SCHEMA, { type: "array", items: ITEM_SCHEMA }],
        },
      },
      required: ["items"],
    },
  },
  {
    name: "list_sources",
    description: "List all configured news sources.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "upsert_source",
    description:
      "Create or update a news source. type must be a registered adapter type or 'push'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string" },
        config: { type: "object" },
        enabled: { type: "boolean" },
      },
      required: ["id", "name", "type"],
    },
  },
  {
    name: "delete_source",
    description: "Delete a news source by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "trigger_ingest",
    description:
      "Trigger a new news ingestion workflow run. dryRun sends no email or Telegram and only previews the TL;DR; steps runs just those steps (a rerun).",
    inputSchema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Bypass the 25-minute 'ran recently' gate.",
        },
        dryRun: {
          type: "boolean",
          description:
            "No email, Telegram or owner alert; TL;DR is previewed, not written. Items are still written to D1.",
        },
        steps: {
          type: "array",
          items: { type: "string", enum: PIPELINE_STEPS },
          description: "Run only these steps; others are recorded as skipped.",
        },
      },
    },
  },
  {
    name: "get_status",
    description:
      "Get the last 10 workflow runs and item counts grouped by status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "preview_ranking",
    description:
      "Read-only: current top published items (last 24h) with their rank score inputs.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", minimum: 1, maximum: 100 } },
    },
  },
  {
    name: "preview_tldr",
    description:
      "Generate the TL;DR from current data and return the en/vi bullets. Does not write the live edition and sends nothing; LLM calls are logged.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

export type AdminMcpToolName = (typeof ADMIN_MCP_TOOLS)[number]["name"];

export const ADMIN_MCP_TOOL_NAMES: readonly AdminMcpToolName[] =
  ADMIN_MCP_TOOLS.map((tool) => tool.name);

const ADMIN_TOOL_NAMES = new Set<string>(ADMIN_MCP_TOOL_NAMES);

export function isAdminMcpToolName(name: string): name is AdminMcpToolName {
  return ADMIN_TOOL_NAMES.has(name);
}
