/**
 * WebMCP (`document.modelContext`) transport for the four public read
 * tools.
 *
 * The whole point of #226 is that an agent sees ONE surface. The
 * definitions here are not written — they are the SAME objects
 * `POST /api/mcp` serves and `/.well-known/ai-catalog.json` publishes,
 * imported from `src/lib/public-read-tools.ts`. If the MCP transport and
 * the browser transport ever disagree about a name, a schema, an
 * annotation, or a bound, one of the two is importing something else and
 * the catalog identity test in `webmcp.test.ts` fails.
 *
 * Differences from the MCP transport, and why they are not drift:
 *
 *  - MCP runs in the Worker and reads D1. WebMCP runs in the browser and
 *    reads the SAME public endpoints over same-origin `fetch`. There is no
 *    D1 binding in a browser, and opening a second data path there would
 *    mean an agent's answer depends on which surface it found.
 *  - The anonymous MCP rate limit does not apply: these are same-origin
 *    requests from a page the reader already loaded, and they hit the
 *    existing edge-cached public API.
 *
 * Two hard rules:
 *
 *  1. CLIENT-SIDE ONLY. Registration is a no-op — not a throw — when
 *     `document.modelContext` is undefined, so nothing WebMCP-related is
 *     ever in the SSR path, the HTML, or the LCP path.
 *  2. `/.webmcp/bridge.js` is Cloudflare-injected. Never vendored, never
 *     bundled, never awaited.
 */

import { MAIL_FORMATS } from "./mail-format";
import type { PublicDigest } from "./public-queries";
import {
  boundSearchResult,
  exceedsReadResultBound,
  projectDigestBullets,
  projectSearchResult,
} from "./public-read-results";
import {
  coerceToolArguments,
  GET_AI_DIGEST,
  GET_STORY,
  LATEST_AI_NEWS,
  PUBLIC_READ_TOOLS,
  type PublicReadToolName,
  SEARCH_NEWS,
  type Validated,
  validateGetAiDigest,
  validateGetStory,
  validateLatestAiNews,
  validateSearchNews,
} from "./public-read-tools";
import { STORY_MARKDOWN_MAX_RESPONSE_BYTES } from "./story-markdown";
import type { FeedResponse } from "./types";

/** The same four tools, by the same object, in the same order. */
export const WEBMCP_TOOLS = PUBLIC_READ_TOOLS;

const VALIDATORS = {
  [LATEST_AI_NEWS]: validateLatestAiNews,
  [SEARCH_NEWS]: validateSearchNews,
  [GET_STORY]: validateGetStory,
  [GET_AI_DIGEST]: validateGetAiDigest,
} as const satisfies Record<
  PublicReadToolName,
  (args: Record<string, unknown>) => Validated<unknown>
>;

/**
 * The imperative WebMCP surface as it exists today. Declared locally
 * rather than pulled from a global type so a Cloudflare schema change is a
 * one-file edit instead of a build break, and so `document.modelContext`
 * can be feature-detected without casting through `any` at the call site.
 */
export interface WebMcpToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  execute: (args: unknown) => Promise<unknown>;
}

export interface WebMcpModelContext {
  registerTool(tool: WebMcpToolRegistration): unknown;
  provideContext?(context: unknown): unknown;
}

export interface WebMcpCapableDocument {
  modelContext?: WebMcpModelContext;
}

/**
 * Resolve the model context, or null. `typeof document` guards the SSR
 * path; the optional-chain guards a browser without the Cloudflare
 * bridge. Neither throws.
 */
export function webmcpContext(
  doc?: WebMcpCapableDocument | null
): WebMcpModelContext | null {
  // An explicit document wins. Only fall back to the ambient one when none
  // was passed, and only then does the `typeof document` guard apply —
  // which is the SSR path, and the one that must never throw.
  const candidate =
    doc ??
    (typeof document === "undefined"
      ? null
      : (document as unknown as WebMcpCapableDocument));
  const context = candidate?.modelContext;
  return context && typeof context.registerTool === "function" ? context : null;
}

/* ------------------------------------------------------------------ *
 * Execution
 *
 * Validation runs FIRST and identically to the MCP transport, so a
 * hostile argument costs one bounded pass and never a network request —
 * the browser-side twin of "rejected arguments touch no D1".
 * ------------------------------------------------------------------ */

type ToolOutcome = { ok: true; value: unknown } | { ok: false; error: string };

async function fetchJson(path: string): Promise<ToolOutcome> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: "the request could not be completed." };
  }
  if (!response.ok) {
    return { ok: false, error: `the read failed (HTTP ${response.status}).` };
  }
  const text = await response.text();
  if (exceedsReadResultBound(text)) {
    // The public endpoints already bound themselves; exceeding it means
    // something upstream changed. Refusing beats handing a model an
    // unbounded blob.
    return {
      ok: false,
      error: "the response exceeded the public read bound and was refused.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "the response was not valid JSON." };
  }
}

async function fetchText(path: string): Promise<ToolOutcome> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { accept: "text/markdown" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: "the request could not be completed." };
  }
  if (response.status === 409) {
    // The endpoint's ambiguity arm. Never resolve to a "closest" story.
    return {
      ok: false,
      error:
        "ambiguous story id: that prefix matches more than one published " +
        "story. Use a longer prefix.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `the read failed (HTTP ${response.status}).`,
    };
  }
  const text = await response.text();
  if (
    new TextEncoder().encode(text).byteLength >
    STORY_MARKDOWN_MAX_RESPONSE_BYTES
  ) {
    return {
      ok: false,
      error: "the story representation exceeded the Markdown read bound.",
    };
  }
  return { ok: true, value: text };
}

function withLang(path: string, lang: "en" | "vi"): string {
  return `${path}?lang=${lang}`;
}

export async function runWebMcpTool(
  name: PublicReadToolName,
  rawArgs: unknown
): Promise<ToolOutcome> {
  const args = coerceToolArguments(rawArgs);
  if (!args.ok) return { ok: false, error: args.error };
  const validated = VALIDATORS[name](args.value);
  if (!validated.ok) return { ok: false, error: validated.error };

  switch (name) {
    case LATEST_AI_NEWS: {
      const { lang } = validated.value as { lang: "en" | "vi" };
      return fetchJson(withLang("/api/public", lang));
    }
    case GET_AI_DIGEST: {
      const { lang } = validated.value as { lang: "en" | "vi" };
      const digest = await fetchJson(withLang("/api/public", lang));
      if (!digest.ok) return digest;
      return {
        ok: true,
        value: projectDigestBullets(digest.value as PublicDigest, lang),
      };
    }
    case SEARCH_NEWS: {
      const args = validated.value as {
        lang: "en" | "vi";
        q?: string;
        days?: number;
        category?: string;
        before?: string;
      };
      // Built with URLSearchParams, never string interpolation: a hostile
      // `q` becomes a query value, not a query.
      const query = new URLSearchParams({ lang: args.lang });
      if (args.q !== undefined) query.set("q", args.q);
      if (args.days !== undefined) query.set("days", String(args.days));
      if (args.category !== undefined) query.set("category", args.category);
      if (args.before !== undefined) query.set("before", args.before);
      const feed = await fetchJson(`/api/feed?${query.toString()}`);
      if (!feed.ok) return feed;
      // The same projection + bound the MCP transport applies.
      return boundSearchResult(
        projectSearchResult(feed.value as FeedResponse, args.lang)
      );
    }
    case GET_STORY: {
      const { id, lang } = validated.value as {
        id: string;
        lang: "en" | "vi";
      };
      const markdown = await fetchText(
        withLang(`/api/story/${encodeURIComponent(id)}.md`, lang)
      );
      if (!markdown.ok) return markdown;
      return { ok: true, value: { id, lang, markdown: markdown.value } };
    }
  }
}

/**
 * WebMCP `execute` conventionally resolves a content array, but Chrome
 * also accepts a plain value. Returning the plain value keeps the
 * registration portable and keeps the payload byte-identical to the MCP
 * tool's JSON, so an agent comparing the two transports sees the same
 * data.
 */
function makeExecute(name: PublicReadToolName) {
  return async (args: unknown) => {
    const result = await runWebMcpTool(name, args);
    if (result.ok) return result.value;
    throw new Error(result.error);
  };
}

/** Built lazily and cached so a re-render does not re-create closures. */
let registrations: WebMcpToolRegistration[] | null = null;

export function webmcpToolRegistrations(): WebMcpToolRegistration[] {
  registrations ??= WEBMCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { ...tool.annotations },
    execute: makeExecute(tool.name),
  }));
  return registrations;
}

/**
 * Register the read tools. Returns how many were registered: 0 on a
 * browser without WebMCP, 4 on a WebMCP-capable one. It NEVER throws —
 * an unsupported platform must not break the page.
 */
export function registerWebmcpTools(
  doc?: WebMcpCapableDocument | null
): number {
  const context = webmcpContext(doc);
  if (!context) return 0;
  let registered = 0;
  for (const tool of webmcpToolRegistrations()) {
    try {
      context.registerTool(tool);
      registered += 1;
    } catch {
      // One rejected registration (e.g. a schema this build of the bridge
      // dislikes) must not take the other three down with it.
    }
  }
  return registered;
}

/* ------------------------------------------------------------------ *
 * Form annotations
 * ------------------------------------------------------------------ */

export interface WebMcpFormAnnotation {
  /** Stable form id, mirrored into the DOM as `data-webmcp-form`. */
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  /** Whether an agent may fill and submit it. */
  agentCallable: boolean;
  reason?: string;
}

/**
 * The forms on the real site, audited.
 *
 * An agent-callable form is one where filling it in is the whole point and
 * submitting it is the intended outcome. Two qualify.
 *
 * `/sign-in` and `/sign-up` (Clerk) are deliberately NOT exposed: a tool
 * whose `inputSchema` is `{ password: string }` is a credential-harvesting
 * primitive advertised to every agent on the page, and there is no way for
 * a host model to distinguish "fill the sign-in form" from "exfiltrate the
 * user's password". Clerk owns those forms entirely and they are not in
 * this codebase, so there is nothing to annotate here anyway.
 *
 * The header `SearchBox` is also not exposed: it is a client-side filter
 * over an already-loaded feed, so a registered `search_news` tool covers it
 * with real semantics instead of a form-filling approximation.
 *
 * The story `suggest` form is agent-relevant in principle but its payload
 * is a signed-in Clerk session, and the same credential boundary as
 * `/sign-in` applies. It is listed as not callable, with the reason, so a
 * reader of ai-catalog.json sees the decision rather than a silent gap.
 */
export const WEBMCP_FORM_ANNOTATIONS: readonly WebMcpFormAnnotation[] = [
  {
    id: "submit-story",
    name: "submit_story",
    description:
      "Submit an AI/tech story to aidr for AI review. Requires the signed-in user's Clerk session; an agent without one cannot complete it.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The article's canonical URL." },
        title: { type: "string", minLength: 5 },
        note: {
          type: "string",
          description: "Why it matters. Free text from the submitter.",
        },
      },
      required: ["url", "title"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      // Publishing a story to a public feed that 10k people read is a real
      // consequence even though nothing is deleted, and the content is
      // third-party. Both flags matter: the host should confirm with a
      // human, and must treat `url`/`title`/`note` as untrusted input.
      consequentialHint: true,
      untrustedContentHint: true,
      openWorldHint: true,
    },
    agentCallable: true,
  },
  {
    id: "subscribe-email",
    name: "subscribe_email",
    description:
      "Subscribe an email address to the daily AI;DR digest (3, 5, or 10 stories). Sends no message from the browser; the confirmation flow is the site's.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        lang: { type: "string", enum: ["en", "vi"] },
        digest_size: { type: "integer", enum: [3, 5, 10], default: 5 },
        mail_format: {
          type: "string",
          enum: [...MAIL_FORMATS],
          default: "design",
        },
      },
      required: ["email"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      // A subscription is a recurring commitment made on the user's
      // behalf and the user will receive mail, so it is consequential and
      // deserves a confirmation prompt.
      consequentialHint: true,
      untrustedContentHint: false,
      openWorldHint: false,
    },
    agentCallable: true,
  },
  {
    id: "sign-in",
    name: "sign_in",
    description:
      "Clerk sign-in. NOT registered as an agent-callable tool: exposing a password field to an agent is a credential-harvesting primitive.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, consequentialHint: true },
    agentCallable: false,
    reason:
      "Credential form. An agent-callable schema over a password field is a credential-harvesting primitive, so it is never registered.",
  },
  {
    id: "story-suggest",
    name: "suggest_story_edit",
    description:
      "Suggest a title or summary correction on a story. Requires the signed-in Clerk session, so it shares the sign-in credential boundary.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, consequentialHint: true },
    agentCallable: false,
    reason:
      "Requires a Clerk session token. Not registered as a tool; the same submit path is reachable with a Bearer token per auth.md.",
  },
];

/**
 * Look up an annotation by form id. Throws rather than returning
 * `undefined` so a renamed form id fails at render time instead of
 * silently dropping the annotation from the DOM and from ai-catalog.json
 * in different ways.
 */
export function webmcpForm(id: string): WebMcpFormAnnotation {
  const form = WEBMCP_FORM_ANNOTATIONS.find((entry) => entry.id === id);
  if (!form) throw new Error(`no WebMCP form annotation named "${id}"`);
  return form;
}

/** Applied to a form element as data attributes, never as behaviour. */
export function formAnnotationAttributes(
  form: WebMcpFormAnnotation
): Record<string, string> {
  return {
    "data-webmcp-form": form.id,
    "data-webmcp-tool": form.name,
    "data-webmcp-agent-callable": String(form.agentCallable),
    "data-webmcp-annotations": JSON.stringify(form.annotations),
  };
}
