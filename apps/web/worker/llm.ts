import { AsyncLocalStorage } from "node:async_hooks";
import {
  collectBulletItemIds,
  extractBracketItemIds,
  stripBracketItemIds,
} from "../src/lib/tldr-bullets";
import { chunk } from "./chunk.js";
import { mapWithConcurrency } from "./concurrency.js";
import { IMPORTANCE_BANDS } from "./importance-rubric.js";
import { LLM_STEP } from "./ingest/context.js";
import {
  type JevScoreItem,
  type JevScoreReviewOutcome,
  jevPanelRelevance,
  reviewScoredItemsWithJevPanel,
} from "./jev-panel/score-review.js";
import {
  callSystemOne,
  decisionModelId,
  isSystemOneConfigured,
  jevModelId,
  jevScoreQuestions,
  scoreJudgmentFromJev,
  servedByJev,
} from "./systemone.js";
import { sanitizeError } from "./telemetry-safe.js";
import {
  acceptsRepair,
  tldrBulletIssues,
  translationDraftIssues,
} from "./translation-draft-check.js";
import {
  type KnowledgeRule,
  loadActiveRules,
  viSystemPrompt,
} from "./translation-knowledge.js";
import {
  KEEP_ENGLISH_PROSE,
  keepVerbatimList,
  stripSourceBoilerplate,
} from "./translation-terms.js";
import type { Env } from "./types.js";

/** 15-item score JSON routinely misses a 25s hang-cap (0 tokens, 100%
 *  fail). 5 titles still fill a batch and finish inside SCORE_SLICE_MAX. */
export const SCORE_BATCH_SIZE = 5;
/** Score batches run this many at a time. */
export const SCORE_CONCURRENCY = 3;
/** 15-item translate JSON + VI_STYLE routinely times out native Gemma 4
 *  at the 90s attempt cap; 3 titles still fill a homepage row and finish. */
export const TRANSLATE_BATCH_SIZE = 3;
// Generous ceiling: some anyrouter-routed models (e.g. reasoning models
// like stepfun-ai/step-3.7-flash) spend a large chunk of the token budget
// on hidden `message.reasoning` before ever emitting `message.content`. A
// low max_tokens starves the actual answer entirely.
const MAX_TOKENS = 8192;
const MAX_STREAM_CONTENT_CHARS = 100_000;
/** The general news categories. Jev picks one of these in a single choice
 * question, so this list stays within TypeSafe's ten-option limit. */
export const CORE_CATEGORIES = [
  "Models",
  "Regulation",
  "Products",
  "Agents",
  "Research",
  "Industry",
  "Infra",
  "Releases",
  "Chips",
  "Funding",
] as const;

/** Categories for the AI and data engineers who build with this news. Jev
 * asks for these in a second choice question that overrides the core pick. */
export const BUILDER_CATEGORIES = [
  "Tools",
  "Frameworks",
  "Data",
  "Open Source",
] as const;

export const CATEGORIES = [...CORE_CATEGORIES, ...BUILDER_CATEGORIES] as const;

/** How to break ties between the launch-shaped categories. */
export const CATEGORY_RULE =
  "Tie-breaks: a model of any license is Models. Anything sold to or used by developers (a coding assistant, its plan, features, or add-ons) is Tools, not Products; a library or SDK they build on is Frameworks; Products is for end-user apps. A company open-sourcing code, a toolkit, or a project is Open Source. Releases only when none of these fit.";

/** One line per category, shared by the chat rubric and Jev's choice
 * criteria so both scorers draw the same lines. */
export const CATEGORY_DEFINITIONS: Record<(typeof CATEGORIES)[number], string> =
  {
    Models:
      "a new or updated model, open or closed weights (LLM, image, video, speech, embedding), its benchmarks, pricing, or access",
    Regulation: "laws, policy, government action, and AI safety rules",
    Products:
      "a consumer or business AI app or feature for end users, not developers",
    Agents:
      "agent products, agent behavior, multi-agent systems, and agent incidents",
    Research: "papers, studies, and research findings",
    Industry:
      "company news: acquisitions, partnerships, people, earnings, lawsuits, and market moves",
    Infra:
      "cloud, data centers, inference serving, compute capacity, and outages",
    Releases:
      "a launch that fits no more specific category; prefer Models, Products, Tools, or Frameworks first",
    Chips: "AI chips, GPUs, accelerators, and the semiconductor supply chain",
    Funding: "funding rounds, valuations, IPOs, and investment deals",
    Tools:
      "developer tools: coding assistants, IDEs, CLIs, developer APIs, and agent harnesses such as Codex, Cursor, or Claude Code",
    Frameworks:
      "agent frameworks, SDKs, and libraries developers build with, such as LangGraph, CrewAI, Mastra, Pydantic AI, DSPy, LlamaIndex, Agents SDK, and MCP servers",
    Data: "data engineering for AI: vector databases, embeddings pipelines, ETL, warehouses and lakehouses, datasets, and retrieval (RAG) stacks",
    "Open Source":
      "an open-source code release, toolkit, or project where being open is the news; an open-weights model is still Models",
  };

/** Vietnamese house style. Literal translation reads badly to Vietnamese tech
 * readers, who expect fluent Vietnamese prose with the English jargon left
 * alone rather than calqued. */
const VI_STYLE = `HARD RULES — obey every line before you write:
1. Proofread every Vietnamese word before you answer. If a Vietnamese word is misspelled or two words are smashed together, fix that word in place. Do not translate a kept English term (harness, sandbox, prompt, open-weight, swarm) and do not rewrite the sentence. Never invent or smash spellings. Bad: "hệ điệuih thaoại". Good: "hệ điều hành".
2. Do not translate idioms word by word. "Apparently" is "Có vẻ" or "Dường như", never "Được biết đâu có".
3. Do not coin a Vietnamese product name you are unsure of. Keep the English product name. Bad: "Mái trợ sinh AI" for the name AI Midwife. Good: "AI Midwife".
4. Grammar: "công ty đầu tiên do nữ giới lãnh đạo", never "công ty đầu tiên trên do nữ giới".
5. No parenthetical English gloss. Bad: "RAG (Retrieval-Augmented Generation)". Good: "RAG".
6. Titles are sentence case: capitalize only the first word and proper names. Bad: "Nscale Huy Động 3,36 Tỷ USD". Good: "Nscale huy động 3,36 tỷ USD".

You are a Vietnamese tech journalist writing AI/tech news for Vietnamese readers.

Write natural, fluent Vietnamese, never a word-by-word translation. Restructure each sentence to follow Vietnamese word order and rhythm, but keep every fact it states: rephrasing changes the wording, never the content.

Keep in English: product and model names (GPT, Claude, Qwen), company names, benchmark names, and the industry jargon Vietnamese readers already use in English — ${KEEP_ENGLISH_PROSE}. Mixed English/Vietnamese prose is expected. Do translate terms with a settled Vietnamese equivalent, e.g. open-source becomes mã nguồn mở.

NEVER add a parenthetical English gloss after a Vietnamese word, like "bầy (swarm)" or "đa tác nhân (multi-agent)". Pick one: the English term on its own, or a natural Vietnamese word on its own — never both stapled together.

NEVER translate word-by-word (calque). Read the whole sentence, then restate the same fact the way a Vietnamese journalist would say it out loud — not the way each individual word maps across languages. Prefer active, concrete verbs over stiff noun-phrase calques (e.g. "cho thấy" / "phát hiện" / "ghi nhận", not "đã ghi nhận những lỗi phối hợp"). Split a long English sentence into two Vietnamese ones, or merge two short ones into one, whichever reads more naturally — don't preserve English sentence boundaries or punctuation just because the source used them. Avoid bureaucratic filler ("đã ghi nhận những", "tiến hành thực hiện") in favor of plain, direct phrasing.

Prefer everyday Vietnamese over stiff Sino-Vietnamese formalese when both exist and mean the same thing: "dùng" over "sử dụng" where it reads naturally, "hãng" or "công ty" over "tập đoàn" for an ordinary company, "mở" over "tiến hành mở". Formal Sino-Vietnamese isn't wrong, but reach for it only when the everyday word would sound too casual for the fact being reported.

Numbers and units follow Vietnamese press style: "2,5 tỷ USD" not "2.5 billion USD", "300 triệu người dùng" not "300 million users" — translate the unit word, keep the digits, use Vietnamese decimal comma. Magnitudes map exactly: B / bn / billion = tỷ, M / mn / million = triệu, T / trillion = nghìn tỷ. "$20B" is "20 tỷ USD", never "20 triệu USD". A model size such as "7B" or "235B" stays as written.

Keep sentence subjects light: drop a pronoun or restated noun where Vietnamese naturally omits it across clauses (don't repeat "công ty này" every clause when context already carries it).

Headlines: punchy and information-dense like Vietnamese tech press, but never clickbait — no teaser phrasing that withholds the actual news ("điều bất ngờ", "không thể tin nổi"). Use sentence case: capitalize only the first word and proper names, even when the English headline is in Title Case ("Nscale huy động 3,36 tỷ USD trước khi niêm yết trên NYSE", not "Nscale Huy Động 3,36 Tỷ USD Trước Khi Niêm Yết Trên NYSE").

Example 1 — bad (parenthetical gloss + calque + robotic rhythm):
"Các thử nghiệm trên bầy (swarm) Claude agent đã ghi nhận những lỗi phối hợp, hành vi thông đồng ngầm và phá hoại lẫn nhau."
Example 1 — good (English term kept plain, active verbs, natural flow):
"Thử nghiệm với swarm nhiều Claude agent cho thấy chúng phối hợp lỗi, ngầm bắt tay nhau và thậm chí phá hoại lẫn nhau."

Example 2 — bad (calqued noun phrase, bureaucratic filler):
"Công ty đã thực hiện việc ra mắt một mô hình mới với hiệu suất được cải thiện."
Example 2 — good (concrete verb, filler removed, every fact kept):
"Công ty ra mắt mô hình mới, hiệu suất được cải thiện."

Example 3 — bad (over-formal Sino-Vietnamese where everyday words fit fine):
"Tập đoàn đã tiến hành sử dụng nguồn vốn đầu tư để thực hiện việc mở rộng quy mô hoạt động."
Example 3 — good (everyday words, same meaning):
"Hãng dùng vốn đầu tư để mở rộng quy mô hoạt động."

Example 4 — bad (stiff passive voice, calqued from English "was trained on"):
"Mô hình đã được huấn luyện bởi công ty trên một tập dữ liệu gồm 10 nghìn tỷ token."
Example 4 — good (active voice, natural Vietnamese press number style):
"Công ty huấn luyện mô hình trên bộ dữ liệu 10 nghìn tỷ token."

Example 5 — bad (one long stiff sentence, English clause order preserved):
"Startup này, được thành lập vào năm 2023 bởi một nhóm cựu kỹ sư của OpenAI và đã huy động được 500 triệu USD, hiện đang mở rộng sang thị trường châu Á sau khi ra mắt sản phẩm mới."
Example 5 — good (split into two, subject carried lightly):
"Startup này do một nhóm cựu kỹ sư OpenAI thành lập năm 2023, đã huy động 500 triệu USD. Sau khi ra mắt sản phẩm mới, công ty đang mở rộng sang thị trường châu Á."

Never calque these (bad → good):
- "open-weight models" → "mô hình mở trọng lượng" ✗ → "mô hình open-weight" ✓
- "decision models" → "mô hình quyết định" ✗ → "decision model" ✓
- "AI agents" → "đại lý AI" / "đặc vụ AI" ✗ → "AI agent" ✓
- "evaluation harness" → "dây chuyền đánh giá" ✗ → "harness đánh giá" ✓
- "US hyperscalers" → "các cường thị trường Mỹ" ✗ → "các hyperscaler Mỹ" ✓
- "training loss" → "mất mát huấn luyện" ✗ → "loss khi huấn luyện" ✓
- "a mismatch between the two versions" → "sự bất đối xứng giữa hai phiên bản" ✗ → "hai phiên bản không khớp nhau" ✓
- "the departure" (a person leaving) → "sự chuyển đi này" ✗ → "việc rời đi này" ✓
- "enterprise growth" (the business-customer segment) → "tăng trưởng doanh nghiệp" ✗ → "tăng trưởng mảng doanh nghiệp" ✓
- A named conjecture, theorem, or paper title you cannot render with certainty stays in English: "Unique Games Conjecture" → "phó bản đồ Độc nhất về cho phép" ✗ → "Unique Games Conjecture" ✓

Write only Vietnamese plus the English terms the rules above keep. Never a word from a third language, and never an English word that has a plain Vietnamese equivalent (bad → good):
- "subscriptions" → "abonnement" ✗ → "gói thuê bao" ✓
- "senators" → "các senators" ✗ → "các thượng nghị sĩ" ✓
- "AI-powered chip design tools" → "công cụ thiết kế chip AI-powered" ✗ → "công cụ thiết kế chip dùng AI" ✓

Proofread every Vietnamese word: no misspelled or invented words ("thỏa thúc", "công tắt", "địch chính trị" for "địa chính trị", "gây trái"), no word written twice ("thỏa thỏa thuận", "285 triệu triệu USD"), and no English words left half-translated.

Titles: concise headline style, viết hoa chữ cái đầu câu như báo chí Việt Nam, never ALL CAPS.
Summaries: complete, natural sentences.`;

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Prompt / completion / cache split from anyrouter usage metadata. */
export interface LlmUsageBreakdown {
  tokens: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  /** USD AnyRouter charged (`usage.cost`); null when not reported. */
  costUsd: number | null;
}

interface AnyrouterCompletion extends LlmUsageBreakdown {
  content: string;
}

interface AnyrouterCallResult extends AnyrouterCompletion {
  /** Actual model that served the completion (after fallback selection). */
  model: string;
}

/** Labels a call by which pipeline stage issued it, for the `llm_calls`
 * observability log. "other" covers callers outside this file (dedupe's
 * clustering, translation QA) that don't pass an explicit label. */
export type LlmTask =
  | "score"
  | "translate"
  | "tldr"
  | "cluster"
  | "review"
  | "mail"
  | "other";

/** One row of the `llm_calls` observability log: one entry per model
 * attempted inside callAnyrouter's fallback loop, including failed
 * attempts before a fallback succeeded. */
export interface LlmCallLogEntry {
  ts: number;
  /** Authoritative workflow/operation identity; never inferred by readers. */
  runId?: string | null;
  task: LlmTask;
  model: string;
  ok: boolean;
  tokens: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  durationMs: number;
  error: string | null;
  promptChars: number;
  /** Legacy response-body field. Runtime redaction suppresses it for every
   * task before any logger receives the entry. */
  responseSnippet: string | null;
  sensitive?: boolean;
  /** Requested id → resolved model(s), e.g. ["@preset/aidr", "x/y"]. */
  route?: string[] | null;
  /** Upstream provider that served the attempt, when reported. */
  provider?: string | null;
  /** Shared by every attempt of one callAnyrouter/callSystemOne
   *  invocation, so a fallback chain reads as one call. */
  callId?: string | null;
  /** USD AnyRouter reported for the attempt; null without usage. */
  costUsd?: number | null;
  /** AnyRouter request id, kept for failure reports. */
  requestId?: string | null;
}

/** Short id grouping one invocation's attempts in `llm_calls.call_id`. */
export function newLlmCallId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export type LlmCallLogger = (entry: LlmCallLogEntry) => void | Promise<void>;

let llmCallLogger: LlmCallLogger | null = null;
const llmCallContext = new AsyncLocalStorage<string | null>();

/** Keeps concurrent workflow/admin operations attached to their own run id. */
export function withLlmCallContext<T>(runId: string, callback: () => T): T {
  return llmCallContext.run(runId, callback);
}

/** The run id the current async context is attached to, or null outside one.
 *  Read by the JEV panel review so its idempotency key is bound to the run and
 *  decision identity rather than to a fresh per-call random value. */
export function currentLlmCallRunId(): string | null {
  return llmCallContext.getStore() ?? null;
}

/** Installs (or clears, via `null`) the sink for `llm_calls` log entries.
 * Call sites never await this logger and never let it affect behavior —
 * see `logLlmCall` below. */
export function setLlmCallLogger(fn: LlmCallLogger | null): void {
  llmCallLogger = fn;
}

/** Labels sanitizeProviderError emits. callAnyrouter sanitizes once and
 *  redactLlmCallEntry sanitizes again, so a label must map to itself (a
 *  re-sanitized "anyrouter request timed out" used to become "anyrouter
 *  provider error"). */
const SANITIZED_LABEL =
  /^(?:anyrouter request failed: \d{3}|jev request failed: \d{3}|anyrouter request timed out|anyrouter budget exhausted|anyrouter chain exhausted|anyrouter invalid response|anyrouter model not configured|anyrouter provider error)$/;

function sanitizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (SANITIZED_LABEL.test(message)) return message;
  const anyrouterStatus = message.match(
    /anyrouter request failed:\s*(\d{3})/i
  )?.[1];
  if (anyrouterStatus) return `anyrouter request failed: ${anyrouterStatus}`;
  const jevStatus = message.match(
    /jev(?: systemone)? request failed:\s*(\d{3})/i
  )?.[1];
  if (jevStatus) return `jev request failed: ${jevStatus}`;
  if (/timed out after \d+ms/i.test(message))
    return "anyrouter request timed out";
  if (/leftover budget too small/i.test(message))
    return "anyrouter budget exhausted";
  if (/chain exhausted/i.test(message)) return "anyrouter chain exhausted";
  const safe = sanitizeError(message);
  if (safe?.code === "invalid_response") return "anyrouter invalid response";
  if (safe?.code === "not_configured") return "anyrouter model not configured";
  return "anyrouter provider error";
}

export function redactLlmCallEntry(entry: LlmCallLogEntry): LlmCallLogEntry {
  // LLM output is untrusted content for every pipeline task, not only the
  // translation reviewer. Keep only bounded classifications/counters in
  // telemetry; the database column remains for schema compatibility.
  return {
    ...entry,
    error: entry.error ? sanitizeProviderError(entry.error) : null,
    responseSnippet: null,
    sensitive: undefined,
  };
}

/** Fire-and-forget: a throwing or rejecting logger must never fail or
 * change the outcome of callAnyrouter/scoreItems/translateItems/generateTldr.
 * Exported so non-chat callers (e.g. the SystemOne decision client) can log
 * to the same `llm_calls` observability table. */
export function logLlmCall(entry: LlmCallLogEntry): void {
  if (!llmCallLogger) return;
  const contextualEntry = llmCallContext.getStore()
    ? { ...entry, runId: llmCallContext.getStore() ?? entry.runId }
    : entry;
  try {
    const result = llmCallLogger(redactLlmCallEntry(contextualEntry));
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch((error) => {
        console.error(
          "llm call logger rejected:",
          sanitizeProviderError(error)
        );
      });
    }
  } catch (error) {
    console.error("llm call logger threw:", sanitizeProviderError(error));
  }
}

const REQUEST_TIMEOUT_MS = 120_000;

/** Anyrouter reports usage in camelCase on the streaming metadata event and in
 * snake_case on non-streaming responses. Cache hits appear as cachedTokens
 * (anyrouter_metadata) or prompt_tokens_details.cached_tokens. */
interface Usage {
  total_tokens?: number;
  totalTokens?: number;
  prompt_tokens?: number;
  promptTokens?: number;
  inputTokens?: number;
  completion_tokens?: number;
  completionTokens?: number;
  outputTokens?: number;
  cached_tokens?: number;
  cachedTokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  cost?: unknown;
}

interface StreamEvent {
  object?: string;
  /** Upstream model id on content chunks (e.g. "x/y:free"). */
  model?: string;
  /** Upstream provider name on content chunks (e.g. "AtlasCloud"). */
  provider?: string;
  choices?: { delta?: { content?: string; reasoning?: string } }[];
  usage?: Usage;
  // The trailing metadata frame has been seen nesting usage under either key.
  metadata?: { usage?: Usage };
  /** `model` is the catalog model a preset/router resolved to. */
  anyrouter_metadata?: { usage?: Usage; model?: string; requestId?: string };
}

/** What actually served an attempt: the requested id, then each id a
 *  preset/router resolved to, plus the upstream provider. Filled while the
 *  stream is read, so a failed attempt keeps whatever was seen. */
export interface LlmRouteTrace {
  resolved: string | null;
  upstream: string | null;
  provider: string | null;
  /** AnyRouter request id (`X-Request-ID`, else stream metadata). */
  requestId?: string | null;
}

const REQUEST_ID_RE = /^req_[A-Za-z0-9]{1,64}$/;

function safeRequestId(value: unknown): string | null {
  return typeof value === "string" && REQUEST_ID_RE.test(value) ? value : null;
}

const ROUTE_HOP_RE = /^[A-Za-z0-9@][A-Za-z0-9._:/@-]{0,119}$/;

function routeHop(value: unknown): string | null {
  return typeof value === "string" && ROUTE_HOP_RE.test(value) ? value : null;
}

/** Requested id first, then each distinct resolved hop. Single-hop routes
 *  (a concrete model that served itself) stay a one-element list. */
export function buildRoute(requested: string, trace: LlmRouteTrace): string[] {
  const route = [requested];
  for (const hop of [trace.resolved, trace.upstream]) {
    if (hop && hop !== route[route.length - 1]) route.push(hop);
  }
  return route;
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function parseUsage(usage: Usage): LlmUsageBreakdown {
  const promptTokens = pickNumber(
    usage.prompt_tokens,
    usage.promptTokens,
    usage.inputTokens
  );
  const completionTokens = pickNumber(
    usage.completion_tokens,
    usage.completionTokens,
    usage.outputTokens
  );
  const cachedTokens = pickNumber(
    usage.cached_tokens,
    usage.cachedTokens,
    usage.prompt_tokens_details?.cached_tokens
  );
  const total = pickNumber(usage.total_tokens, usage.totalTokens);
  const tokens = total ?? (promptTokens ?? 0) + (completionTokens ?? 0);
  const costUsd =
    typeof usage.cost === "number" &&
    Number.isFinite(usage.cost) &&
    usage.cost >= 0
      ? usage.cost
      : null;
  return { tokens, promptTokens, completionTokens, cachedTokens, costUsd };
}

function emptyUsage(): LlmUsageBreakdown {
  return {
    tokens: 0,
    promptTokens: null,
    completionTokens: null,
    cachedTokens: null,
    costUsd: null,
  };
}

/** Long prompts used to come back as `{"object":"chat.completion.queued",
 * "id":"req_…","choices":[],"queue_position":N}` instead of a completion, and
 * anyrouter exposes no endpoint that resolves such a request id. Streaming
 * bypasses the queue entirely, so this is only a defensive check. */
function isQueued(data: { object?: string }): boolean {
  return typeof data.object === "string" && data.object.endsWith(".queued");
}

async function readBoundedErrorBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length > 4_096) {
        await reader.cancel().catch(() => {});
        return body.slice(0, 4_096);
      }
    }
    body += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return body;
}

/** `ANYROUTER_MODEL` and its per-task overrides hold either one model id or a
 * comma-separated fallback chain. */
function parseModels(spec: string | undefined): string[] {
  return (spec ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/**
 * Streams a chat completion from one model. `stream: true` is not an
 * optimization here — it is the only request shape anyrouter answers inline
 * for large prompts.
 */
async function streamCompletion(
  env: Env,
  model: string,
  messages: ChatMessage[],
  opts: {
    json?: boolean;
    timeoutMs: number;
    signal?: AbortSignal;
    maxTokens?: number;
    strictOutput?: boolean;
    maxOutputChars?: number;
    /** Called on every content/reasoning delta. */
    onToken?: () => void;
    /** Filled with the resolved route as events arrive. */
    trace?: LlmRouteTrace;
  }
): Promise<AnyrouterCompletion> {
  const baseUrl = env.ANYROUTER_BASE_URL || "https://anyrouter.dev/api/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ANYROUTER_API_KEY}`,
      // Anyrouter reads both for dashboard app attribution.
      "HTTP-Referer": "https://aidr.today",
      "X-Title": "AI;DR",
      "X-AnyRouter-Title": "AI;DR",
      "X-AnyRouter-Source": "web-app",
      "X-AnyRouter-Categories": "writing-assistant",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: opts.maxTokens ?? MAX_TOKENS,
      stream: true,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs),
  });

  // Read before the status check so a failed attempt keeps its id too.
  if (opts.trace) {
    opts.trace.requestId = safeRequestId(res.headers.get("x-request-id"));
  }
  if (!res.ok) {
    const body = await readBoundedErrorBody(res);
    const requested = opts.maxTokens ?? MAX_TOKENS;
    const afford = /can only afford (\d+)/i.exec(body);
    const affordable = afford ? Number(afford[1]) : 0;
    if (res.status === 402 && affordable > 0 && affordable < requested) {
      return streamCompletion(env, model, messages, {
        ...opts,
        maxTokens: affordable,
      });
    }
    throw new Error(`anyrouter request failed: ${res.status} ${body}`);
  }
  if (!res.body) throw new Error("anyrouter response missing content");

  let content = "";
  let reasoning = "";
  let usageBreakdown = emptyUsage();
  let sawEvent = false;
  let queued = false;
  let rawBody = "";
  let buffer = "";
  let done = false;

  // Server-sent events arrive as `data: {…}` lines terminated by `data: [DONE]`,
  // and a single chunk can split a line in half, so lines are cut out of a
  // rolling buffer rather than per chunk.
  const consumeLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    let event: StreamEvent;
    try {
      event = JSON.parse(payload) as StreamEvent;
    } catch {
      return; // keep-alives and other noise
    }
    sawEvent = true;
    if (isQueued(event)) queued = true;
    if (opts.trace) {
      const resolved = routeHop(event.anyrouter_metadata?.model);
      if (resolved) opts.trace.resolved = resolved;
      const upstream = routeHop(event.model);
      if (upstream && !event.anyrouter_metadata) opts.trace.upstream = upstream;
      const provider = routeHop(event.provider);
      if (provider) opts.trace.provider = provider;
      opts.trace.requestId ??= safeRequestId(
        event.anyrouter_metadata?.requestId
      );
    }
    const delta = event.choices?.[0]?.delta;
    const outputLimit = opts.maxOutputChars ?? MAX_STREAM_CONTENT_CHARS;
    if (delta?.content || delta?.reasoning) opts.onToken?.();
    if (delta?.content) {
      if (content.length + delta.content.length > outputLimit) {
        throw new Error("anyrouter response exceeded output bound");
      }
      content += delta.content;
    }
    if (delta?.reasoning) {
      if (reasoning.length + delta.reasoning.length > outputLimit) {
        throw new Error("anyrouter response exceeded output bound");
      }
      reasoning += delta.reasoning;
    }
    const usage =
      event.usage ?? event.anyrouter_metadata?.usage ?? event.metadata?.usage;
    if (usage) {
      // A later usage event without `cost` must not erase an earlier one.
      const parsed = parseUsage(usage);
      usageBreakdown = {
        ...parsed,
        costUsd: parsed.costUsd ?? usageBreakdown.costUsd,
      };
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (!done) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      const text = decoder.decode(value, { stream: true });
      const outputLimit = opts.maxOutputChars ?? MAX_STREAM_CONTENT_CHARS;
      // The bound is on model output (content/reasoning, checked per delta),
      // not on SSE framing: each event carries ~250 chars of JSON envelope,
      // so a 5K-token TL;DR streams >1MB raw. rawBody is only needed to
      // sniff a non-SSE queue receipt, so stop keeping it once events flow.
      if (!sawEvent) {
        if (rawBody.length + text.length > outputLimit) {
          throw new Error("anyrouter response exceeded output bound");
        }
        rawBody += text;
      }
      if (buffer.length + text.length > outputLimit) {
        throw new Error("anyrouter response exceeded output bound");
      }
      buffer += text;
      let newline = buffer.indexOf("\n");
      while (newline !== -1 && !done) {
        consumeLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    if (!done) consumeLine(buffer.trim());
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (content.trim()) return { content, ...usageBreakdown };

  // Reasoning-model fallback: content came back empty, but the model may
  // have produced the JSON answer inside its `reasoning` field (e.g. right
  // before running out of budget, or because it never separated the two).
  if (reasoning && !opts.strictOutput) {
    const extracted = extractLastJsonObject(reasoning);
    if (extracted) return { content: extracted, ...usageBreakdown };
  }

  // A body with no events at all is not a stream — most likely a queue receipt
  // delivered as plain JSON rather than as an event.
  if (!sawEvent && rawBody.trim()) {
    try {
      queued = isQueued(JSON.parse(rawBody) as { object?: string });
    } catch {
      // not JSON either; fall through to the generic error
    }
  }
  if (queued) throw new Error("anyrouter queued a streaming request");

  throw new Error("anyrouter response missing content");
}

/** Hang-cap for translate (3-item JSON). Score/TL;DR use a longer slice. */
export const MODEL_SLICE_MAX_MS = 25_000;
/** 15-item score / 16-bullet TL;DR JSON cannot finish in 25s; every
 *  model then logs 0 tokens and the chain looks 100% dead. */
export const SCORE_SLICE_MAX_MS = 70_000;
/** The ~26K-char bilingual TL;DR takes Laguna S 2.1 102-119s to finish
 *  (probe 2026-10-01), so a 90s cap killed it every time. Stays inside the
 *  first attempt's window (TLDR_TIMEOUT_MS - TLDR_RETRY_RESERVE_MS). */
export const TLDR_SLICE_MAX_MS = 135_000;
/** Translate used the 25s leftover cap; anyrouter/auto often needs longer
 *  to finish a 3-item JSON batch when it is the only hop. */
export const TRANSLATE_SLICE_MAX_MS = 60_000;
/** gemini-3-flash often answers in 4–7s, but on 2026-10-04 16 of 98
 *  translate calls died at the 20s first-token cap with zero tokens.
 *  The attempt slice is still the hang cap; this only stops the early abort. */
export const TRANSLATE_FIRST_TOKEN_MS = 35_000;
const FALLBACK_FLOOR_MS = 20_000;

/**
 * Per-attempt budget: keep an even slice for up to two fallbacks, give the
 * rest (capped) to the current id. Fast failures therefore leave later
 * models far more than `budget / n`; a hang still cannot eat the deadline.
 */
export function modelAttemptTimeoutMs(
  remainingMs: number,
  remainingModels: number,
  maxSliceMs = MODEL_SLICE_MAX_MS
): number {
  if (remainingMs <= 0 || remainingModels <= 0) return 0;
  const even = remainingMs / remainingModels;
  const fallbacksToKeep = Math.min(remainingModels - 1, 2);
  const reserved = fallbacksToKeep * Math.min(FALLBACK_FLOOR_MS, even);
  return Math.max(1, Math.min(maxSliceMs, remainingMs - reserved));
}

/** A model that has not streamed a single token by now is treated as hung,
 *  so the rest of the chain keeps a real slice. Streaming models that work
 *  on AnyRouter reach a first token in 10-20s (probe 2026-10-01). */
export const FIRST_TOKEN_MAX_MS = 20_000;

/**
 * AbortSignal.timeout on fetch is not enough: a stalled SSE body read can
 * ignore the signal. Racing a timer guarantees the chain advances. Abort
 * the in-flight fetch so a hung stream does not leak subrequests into
 * the next attempt.
 *
 * `start` gets an `onToken` callback; when `firstTokenMs` is set and no
 * token arrives in time, the attempt fails early with a timeout.
 *
 * Once a timer fires, the attempt always fails with the timeout error.
 * abort() rejects the fetch synchronously, so without this the AbortError
 * would win the race and be logged as a provider error (run ddb11132).
 */
export function raceTimeout<T>(
  start: (onToken: () => void) => Promise<T>,
  ms: number,
  label: string,
  abort?: AbortController,
  firstTokenMs?: number
): Promise<T> {
  let timedOut: Error | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: (error: Error) => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const fire = (error: Error) => {
    if (timedOut) return;
    timedOut = error;
    rejectTimeout(error);
    abort?.abort();
  };
  timer = setTimeout(
    () => fire(new Error(`${label} timed out after ${Math.round(ms)}ms`)),
    ms
  );
  if (firstTokenMs !== undefined && firstTokenMs < ms) {
    firstTokenTimer = setTimeout(
      () =>
        fire(
          new Error(
            `${label} timed out after ${Math.round(firstTokenMs)}ms waiting for a first token`
          )
        ),
      firstTokenMs
    );
  }
  const onToken = () => {
    if (firstTokenTimer !== undefined) clearTimeout(firstTokenTimer);
    firstTokenTimer = undefined;
  };
  const attempt = start(onToken).catch((error: unknown) => {
    throw timedOut ?? error;
  });
  return Promise.race([attempt, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    if (firstTokenTimer !== undefined) clearTimeout(firstTokenTimer);
  });
}

/** A 404 from AnyRouter (model_not_found, or model_unavailable for a
 *  BYOK-only id) does not change within a run, so the id is skipped by
 *  later calls in this isolate instead of each batch paying for it again.
 *  A 429 (billing_concurrency_limited hit @preset/aidr 27x in one run)
 *  skips it briefly. 5xx and timeouts never trip it. */
const SKIP_MODEL_TTL_MS: Record<number, number> = {
  404: 15 * 60_000,
  429: 2 * 60_000,
};
const unavailableModels = new Map<string, number>();

function isUnavailable(model: string): boolean {
  const until = unavailableModels.get(model);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  unavailableModels.delete(model);
  return false;
}

/** Test hook: forget every skipped id. */
export function resetUnavailableModels(): void {
  unavailableModels.clear();
}

/**
 * Tries each model in the configured chain until one returns usable content.
 * Transport errors, non-200s, timeouts and empty/unusable completions all
 * advance to the next model; the last failure is rethrown if none succeed.
 */
async function callAnyrouter(
  env: Env,
  messages: ChatMessage[],
  opts: {
    json?: boolean;
    modelSpec?: string;
    task?: LlmTask;
    timeoutMs?: number;
    maxTokens?: number;
    maxSliceMs?: number;
    /** Fail an attempt that streams no token by then. Default FIRST_TOKEN_MAX_MS. */
    firstTokenMs?: number;
    /** A 200 with content that fails this check is a model failure so
     *  the next id in the chain can run (e.g. empty sanitize). */
    accept?: (content: string) => boolean;
    /** Suppress response snippets for prompts that can contain article data. */
    sensitive?: boolean;
    strictOutput?: boolean;
    maxOutputChars?: number;
  } = {}
): Promise<AnyrouterCallResult> {
  const task = opts.task ?? "other";
  const configured = parseModels(opts.modelSpec || env.ANYROUTER_MODEL);
  if (configured.length === 0)
    throw new Error("anyrouter model is not configured");
  // Skipped ids take no budget slice. If every id is skipped, try them all
  // again rather than fail without a request.
  const callId = newLlmCallId();
  const live = configured.filter((model) => !isUnavailable(model));
  const models = live.length > 0 ? live : configured;

  // One budget for the whole chain, so a long chain cannot outlive the
  // workflow step that a single call was sized to fit inside. Each attempt
  // is sized by modelAttemptTimeoutMs: leftover budget after a fast fail
  // goes to the next id (not locked to budget/n), and a hang is capped so
  // two fallbacks still run. raceTimeout aborts the fetch so a stalled
  // SSE body cannot leak subrequests into the next attempt.
  const budget = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = Date.now() + budget;
  const failures: string[] = [];
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const timeoutMs = modelAttemptTimeoutMs(
      deadline - Date.now(),
      models.length - i,
      opts.maxSliceMs ?? MODEL_SLICE_MAX_MS
    );
    if (timeoutMs <= 0) {
      failures.push(`${model}: leftover budget too small`);
      continue;
    }
    const attemptStartedAt = Date.now();
    const abort = new AbortController();
    const trace: LlmRouteTrace = {
      resolved: null,
      upstream: null,
      provider: null,
    };
    try {
      const result = await raceTimeout(
        (onToken) =>
          streamCompletion(env, model, messages, {
            json: opts.json,
            timeoutMs,
            signal: abort.signal,
            maxTokens: opts.maxTokens,
            strictOutput: opts.strictOutput,
            maxOutputChars: opts.maxOutputChars,
            onToken,
            trace,
          }),
        timeoutMs,
        `anyrouter model ${model}`,
        abort,
        opts.firstTokenMs ?? FIRST_TOKEN_MAX_MS
      );
      if (opts.accept && !opts.accept(result.content)) {
        logLlmCall({
          ts: attemptStartedAt,
          task,
          model,
          ok: false,
          tokens: result.tokens,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cachedTokens: result.cachedTokens,
          durationMs: Date.now() - attemptStartedAt,
          error: "anyrouter response failed accept check",
          promptChars,
          responseSnippet: opts.sensitive
            ? null
            : result.content.slice(0, 2000),
          sensitive: opts.sensitive,
          route: buildRoute(model, trace),
          provider: trace.provider,
          callId,
          costUsd: result.costUsd,
          requestId: trace.requestId ?? null,
        });
        failures.push(`${model}: anyrouter response failed accept check`);
        continue;
      }
      console.log(`anyrouter completion served by ${model}`);
      logLlmCall({
        ts: attemptStartedAt,
        task,
        model,
        ok: true,
        tokens: result.tokens,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cachedTokens: result.cachedTokens,
        durationMs: Date.now() - attemptStartedAt,
        error: null,
        promptChars,
        responseSnippet: opts.sensitive ? null : result.content.slice(0, 2000),
        sensitive: opts.sensitive,
        route: buildRoute(model, trace),
        provider: trace.provider,
        callId,
        costUsd: result.costUsd,
        requestId: trace.requestId ?? null,
      });
      return { ...result, model };
    } catch (error) {
      const status =
        error instanceof Error
          ? /^anyrouter request failed: (\d{3})\b/.exec(error.message)?.[1]
          : undefined;
      const skipMs = status ? SKIP_MODEL_TTL_MS[Number(status)] : undefined;
      if (skipMs) unavailableModels.set(model, Date.now() + skipMs);
      const msg = sanitizeProviderError(error);
      failures.push(`${model}: ${msg}`);
      console.error(`anyrouter model ${model} failed: ${msg}`);
      logLlmCall({
        ts: attemptStartedAt,
        task,
        model,
        ok: false,
        tokens: 0,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        durationMs: Date.now() - attemptStartedAt,
        error: msg,
        promptChars,
        responseSnippet: null,
        sensitive: opts.sensitive,
        route: buildRoute(model, trace),
        provider: trace.provider,
        callId,
        costUsd: null,
        requestId: trace.requestId ?? null,
      });
    }
  }

  throw new Error(
    "anyrouter chain exhausted: " +
      (failures.join(" | ") || "no models attempted")
  );
}

/** JSON chat completion for callers outside scoring/translate/tldr. */
export async function completeJson(
  env: Env,
  messages: ChatMessage[],
  opts: {
    task?: LlmTask;
    timeoutMs?: number;
    maxTokens?: number;
    /** Per-model cap for long prompts (default MODEL_SLICE_MAX_MS). */
    maxSliceMs?: number;
  } = {}
): Promise<string> {
  const result = await callAnyrouter(env, messages, {
    json: true,
    task: opts.task ?? "other",
    timeoutMs: opts.timeoutMs,
    maxTokens: opts.maxTokens,
    maxSliceMs: opts.maxSliceMs,
  });
  return result.content;
}

/**
 * Scans backward from the last `}` to find its matching `{` by brace-depth
 * counting, returning the last complete top-level JSON object in `text`.
 * Used to salvage a JSON answer that a reasoning model tacked onto the end
 * of its `message.reasoning` instead of `message.content`.
 */
function extractLastJsonObject(text: string): string | null {
  const end = text.lastIndexOf("}");
  if (end === -1) return null;
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      depth--;
      if (depth === 0) return text.slice(i, end + 1);
    }
  }
  return null;
}

/**
 * Strips ```json fences and parses. If there's no fence, some models still
 * wrap the JSON in prose ("Here's the result: {...}") despite json mode;
 * fall back to extracting the outermost {...} or [...] block. Throws if
 * nothing parseable is found.
 */
function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  } else {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const repaired = dropStrayClosers(text);
    if (repaired === text) throw error;
    return JSON.parse(repaired) as T;
  }
}

/**
 * Laguna S 2.1 (serves translate and TL;DR) often emits one stray
 * closer: a trailing `]` after the root object, or a `}` that ends the root
 * before `,"bullets_vi":[...]` (probe 2026-10-01). A plain parse then drops
 * the batch, or keeps only bullets_en and the VI digest falls back to
 * titles. Only closers that cannot belong (wrong type, nothing open, or
 * closing the root while a `,` follows) are removed; strings are skipped.
 */
function dropStrayClosers(text: string): string {
  const stack: string[] = [];
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      const closesRoot = stack.length === 1;
      const next = text.slice(i + 1).trimStart()[0];
      if (stack.at(-1) !== ch || (closesRoot && next === ",")) continue;
      stack.pop();
    }
    out += ch;
  }
  return out;
}

export interface ScoreInput {
  i: number;
  title: string;
  summary?: string;
  source: string;
  /** The persisted `items.id` this score will decide on. Callers that pass it
   *  opt the row into the JEV panel; without it the panel has no decision
   *  identity to key idempotency to and skips the item. */
  id?: string;
}

/** Scoring rubric sent to the model. Quality must prefer named, source-backed writing over thin duplicates. */
export function scoreBatchPrompt(batch: ScoreInput[]): string {
  return `You are scoring AI/tech news items for relevance, importance, and source-backed quality.
For each item, return relevance (0-1, is this genuinely AI/tech news), importance (1-10), quality (0-10), category (exactly one from the list below), and tags — 3 to 6 topic labels per item.
In scope, even when the name is new and not in the tag list: a model release, a new kind of model (language, world, video, speech, open weights, mixture-of-experts), and a new AI lab. An unfamiliar name is not a reason to lower relevance.

Categories (pick the most specific one that fits):
${CATEGORIES.map((name) => `- ${name}: ${CATEGORY_DEFINITIONS[name]}.`).join("\n")}
${CATEGORY_RULE}

Importance rubric (use the whole scale; most items are not 7+):
${IMPORTANCE_BANDS.map((band) => `- ${band.range}: ${band.meaning}.`).join("\n")}

Quality rubric (this is what ranking multiplies — be strict):
- 8–10: primary reporting or original research with a named publisher/host, concrete facts, not a rewrite of another headline.
- 5–7: competent secondary coverage that still cites a real source.
- 1–4: thin duplicate, unnamed blog, SEO recap, or press-release fluff with no independent sourcing. Prefer the source-backed item when two headlines cover the same event.
- Penalize items whose \`source\` is a discussion aggregator with no article body; they can still be relevant but quality stays modest unless the linked piece is primary.

Topic label rules (this feeds a dynamic topic taxonomy, so consistency matters):
- lowercase-kebab-case only, e.g. "open-source", "multi-agent" — never spaces, underscores, or camelCase.
- Mix specific entities (anthropic, openai, nvidia, qwen) with themes (multi-agent, open-source, fine-tuning, regulation).
- Always use the same canonical spelling for the same concept: singular not plural ("llm" not "llms"), one standard hyphenation not synonyms ("open-source" not "opensource" or "oss"), no near-duplicates. If a topic could be phrased multiple ways, pick the most common/obvious industry term.
- Prefer these canonical tags whenever they apply (reuse EXACTLY as written, don't invent variants):
  entities: openai, anthropic, google, meta, xai, x, microsoft, amazon, nvidia, huggingface, deepseek, mistral, alibaba, apple, perplexity, together, fireworks, stability, claude, fable, opus, sonnet, haiku, gpt, gemini, grok, kimi, llama, qwen, gemma, phi, glm, olmo, codex, claude-code, cursor, composer, copilot, windsurf, openrouter, ollama, vllm, cloudflare, workers-ai, langchain, langgraph, crewai, autogen, mastra, pydantic-ai, llamaindex, dspy, agents-sdk, databricks, snowflake, elon-musk, sam-altman
  themes: llm, agent, multi-agent, agentic, harness, inference, open-source, fine-tuning, benchmark, reasoning, safety, regulation, funding, chips, gpu, infra, robotics, coding, rag, mcp, multimodal, diffusion, vision-language, framework, devtools, data-engineering, vector-database, embedding, mlops, eval
  benchmarks: swe-bench, swe-bench-pro, livecodebench, arc-agi, arc-agi-2, mmlu, aider-polyglot
  Only invent a new tag when nothing above (or an equally obvious industry term) fits — new model/product names are encouraged when they recur.
- 3-6 tags per item — enough to be genuinely browsable/filterable, not a single catch-all tag.

Items:
${JSON.stringify(batch.map(({ i, title, summary, source }) => ({ i, title, summary, source })))}

Respond with strict JSON only: {"results":[{"i":0,"relevance":0.9,"importance":7,"quality":8,"category":"Models","tags":["anthropic","claude","multi-agent","open-source"]}]}`;
}

export interface ScoreResult {
  i: number;
  relevance: number;
  importance: number;
  quality: number;
  category: string;
  tags: string[];
  /** This batch's total token usage, attributed evenly across the batch's
   * requested items (not just the ones the model actually returned). */
  tokens: number;
  /** Present only when the JEV panel is enabled and ran. Absent on the default
   * path, so the row shape is unchanged while the panel is off. Carries the
   * reason for whatever the panel did or did not do. */
  jevReview?: JevScoreReviewOutcome;
}

const CATEGORY_BY_LOWER = new Map<string, string>(
  CATEGORIES.map((c) => [c.toLowerCase(), c])
);

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Canonicalize one model-emitted tag to lowercase-kebab-case; null when the
 * result is empty or unreasonably long (small models occasionally emit whole
 * sentences as a "tag"). */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw
    .toLowerCase()
    .trim()
    .replace(/[_\s/]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag && tag.length <= 40 ? tag : null;
}

/**
 * Validate one score batch against what was actually asked. Small models on
 * the fallback chain get every part of this wrong in practice: numbers as
 * strings, scores out of range, categories in the wrong case or off-enum,
 * tags with spaces/underscores, hallucinated or duplicate `i`. Coerce and
 * clamp what's salvageable; drop entries whose identity (`i`) or scores are
 * unusable — a dropped entry behaves exactly like an item the model skipped.
 */
export function sanitizeScoreResults(
  raw: unknown,
  batch: ScoreInput[],
  tokensPerItem: number
): ScoreResult[] {
  if (!Array.isArray(raw)) return [];
  const validIndexes = new Set(batch.map((b) => b.i));
  const seen = new Set<number>();
  const out: ScoreResult[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const i = Number(e.i);
    if (!Number.isInteger(i) || !validIndexes.has(i) || seen.has(i)) continue;
    const relevance = Number(e.relevance);
    const importance = Number(e.importance);
    const quality = Number(e.quality);
    if (
      Number.isNaN(relevance) ||
      Number.isNaN(importance) ||
      Number.isNaN(quality)
    )
      continue;
    seen.add(i);
    const category =
      typeof e.category === "string"
        ? (CATEGORY_BY_LOWER.get(e.category.trim().toLowerCase()) ?? "")
        : "";
    const tags = Array.isArray(e.tags)
      ? [
          ...new Set(
            e.tags
              .map(normalizeTag)
              .filter((t): t is string => t !== null)
              .slice(0, 6)
          ),
        ]
      : [];
    out.push({
      i,
      relevance: clamp(relevance, 0, 1),
      importance: clamp(importance, 0, 10),
      quality: clamp(quality, 0, 10),
      category,
      tags,
      tokens: tokensPerItem,
    });
  }
  return out;
}

/** Decision router hop cap. Router-to-Jev answers took ~9s in probes. */
export const SCORE_DECISION_TIMEOUT_MS = 15_000;
/** Jev hop cap. Passed explicitly so it cannot drift from `callSystemOne`'s
 * default and from the score-step budget below. */
export const SCORE_JEV_TIMEOUT_MS = 30_000;
/** Left after the last call so the step can return. A budget equal to
 * `LLM_STEP` is killed on the way out and the return is lost. */
const SCORE_STEP_SLACK_MS = 1_000;

/** Workflow `timeout` strings are `"<n> minutes"` (also seconds or hours). */
function workflowTimeoutMs(timeout: string): number {
  const amount = Number.parseInt(timeout, 10);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (/\bseconds?\b/i.test(timeout)) return amount * 1_000;
  if (/\bhours?\b/i.test(timeout)) return amount * 3_600_000;
  return amount * 60_000;
}

/** Chat-chain budget for one score batch. Two batches — decision, then Jev,
 * then this — stay strictly inside `LLM_STEP`. Do not raise that step. */
export function scoreChatTimeoutMs(
  stepTimeoutMs = workflowTimeoutMs(LLM_STEP.timeout)
): number {
  const hops = SCORE_DECISION_TIMEOUT_MS + SCORE_JEV_TIMEOUT_MS;
  const perBatch = Math.floor((stepTimeoutMs - SCORE_STEP_SLACK_MS) / 2) - hops;
  return Math.max(1, perBatch);
}

export const SCORE_CHAT_TIMEOUT_MS = scoreChatTimeoutMs();

/** Chat-completions rubric. Backup for items no System One hop judged. */
async function scoreBatchWithChat(
  env: Env,
  batch: ScoreInput[]
): Promise<ScoreResult[]> {
  const prompt = scoreBatchPrompt(batch);
  try {
    const { content: raw, tokens } = await callAnyrouter(
      env,
      [{ role: "user", content: prompt }],
      {
        json: true,
        task: "score",
        // Omitting this uses the 120s request default. Two batches of
        // decision + Jev + that default are ~330s and outlive LLM_STEP.
        timeoutMs: SCORE_CHAT_TIMEOUT_MS,
        maxSliceMs: SCORE_SLICE_MAX_MS,
      }
    );
    const parsed = parseJson<{ results?: unknown } | unknown[]>(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.results;
    return sanitizeScoreResults(rows, batch, Math.ceil(tokens / batch.length));
  } catch (error) {
    console.error("scoreItems batch failed:", error);
    return [];
  }
}

/** One System One call per item on `model`. A miss (transport, bad
 * answers) returns null so that item moves to the next hop. Tokens are that
 * call's input tokens — System One output is free and uncounted. */
async function scoreOneWithSystemOne(
  env: Env,
  item: ScoreInput,
  questions: ReturnType<typeof jevScoreQuestions>,
  model: string
): Promise<ScoreResult | null> {
  try {
    const jev = await callSystemOne(
      env,
      {
        i: item.i,
        title: item.title,
        summary: item.summary ?? "",
        source: item.source,
      },
      questions,
      "score",
      model,
      model === jevModelId(env)
        ? SCORE_JEV_TIMEOUT_MS
        : SCORE_DECISION_TIMEOUT_MS
    );
    if (!jev) return null;
    // A router hop can land on a non-Jev decider (GLiNER answers score
    // questions with a bare index, e.g. importance 1 for a frontier launch).
    // Only Jev's score scale is calibrated; anything else moves on.
    if (model !== jevModelId(env) && !servedByJev(jev)) {
      console.warn(
        `scoreItems ${model} answered by ${jev.upstreamModel || "unknown"} (${jev.upstreamProvider || "unknown"}); skipped`
      );
      return null;
    }
    const judgment = scoreJudgmentFromJev(
      jev.answers,
      CORE_CATEGORIES,
      BUILDER_CATEGORIES
    );
    if (!judgment) return null;
    const [row] = sanitizeScoreResults(
      [{ i: item.i, ...judgment }],
      [item],
      jev.inputTokens
    );
    return row ?? null;
  } catch (error) {
    console.error(`scoreItems ${model} item failed:`, error);
    return null;
  }
}

export async function scoreItems(
  env: Env,
  items: ScoreInput[]
): Promise<ScoreResult[]> {
  const batches = chunk(items, SCORE_BATCH_SIZE);
  // Token spend unchanged on the chat path; wall-clock divided (~3×).
  const questions = isSystemOneConfigured(env)
    ? jevScoreQuestions(
        CORE_CATEGORIES,
        BUILDER_CATEGORIES,
        CATEGORY_DEFINITIONS,
        CATEGORY_RULE
      )
    : null;
  // System One hops in order: the decision router, then Jev. Each item a
  // hop misses moves to the next; whatever is left goes to the chat rubric.
  const decision = decisionModelId(env);
  const systemOneModels = questions
    ? [...(decision ? [decision] : []), jevModelId(env)]
    : [];
  const batchResults = await mapWithConcurrency(
    batches,
    SCORE_CONCURRENCY,
    async (batch) => {
      // A throw here used to reject the whole wave, so a batch that had
      // already finished was dropped with the one that failed.
      const rows: ScoreResult[] = [];
      try {
        let missing = batch;
        for (const model of systemOneModels) {
          if (!questions || missing.length === 0) break;
          const hopRows = (
            await Promise.all(
              missing.map((item) =>
                scoreOneWithSystemOne(env, item, questions, model)
              )
            )
          ).filter((row): row is ScoreResult => row !== null);
          rows.push(...hopRows);
          const covered = new Set(hopRows.map((row) => row.i));
          missing = missing.filter((item) => !covered.has(item.i));
        }
        if (missing.length === 0) return rows;
        const chatRows = await scoreBatchWithChat(env, missing);
        return [...rows, ...chatRows];
      } catch (error) {
        console.error("scoreItems batch failed:", error);
        return rows;
      }
    }
  );

  const rows = batchResults.flat();
  try {
    return await applyJevScoreReview(env, items, rows);
  } catch (error) {
    console.error("scoreItems review failed:", error);
    return rows;
  }
}

/**
 * Second-opinion pass over already-scored rows, off unless
 * `JEV_PANEL_ENABLED` is set. Kept out of `scoreItems` so the primary path
 * reads exactly as it did before the panel existed, and so the panel can never
 * be reached by accident.
 */
async function applyJevScoreReview(
  env: Env,
  items: ScoreInput[],
  rows: ScoreResult[]
): Promise<ScoreResult[]> {
  if ((env.JEV_PANEL_ENABLED ?? "").trim() === "") return rows;

  const byIndex = new Map<number, ScoreInput>(
    items.map((item) => [item.i, item])
  );
  const eligible = rows.filter((row) => byIndex.get(row.i)?.id !== undefined);
  if (eligible.length === 0) return rows;

  const panelItems: JevScoreItem[] = [];
  const relevanceById = new Map<string, number>();
  for (const row of eligible) {
    const item = byIndex.get(row.i);
    if (!item?.id) continue;
    panelItems.push({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
    });
    relevanceById.set(item.id, row.relevance);
  }
  if (panelItems.length === 0) return rows;

  const { outcomes, configReason, configEnabled, failMode } =
    await reviewScoredItemsWithJevPanel(env, {
      items: panelItems,
      relevanceById,
      categoryOptions: CATEGORIES,
    });
  if (!configEnabled) return rows;

  const demoted = [...outcomes.values()].filter(
    (outcome) =>
      outcome.kind === "demoted" ||
      outcome.kind === "opposed" ||
      outcome.kind === "degraded_closed"
  ).length;
  console.log(
    `jev panel enabled (fail mode ${failMode}): ${outcomes.size} reviewed, ` +
      `${demoted} demoted` +
      (configReason ? `, config: ${configReason}` : "")
  );

  const appliedById = new Map(outcomes);
  return rows.map((row) => {
    const item = byIndex.get(row.i);
    if (!item?.id) return row;
    const outcome = appliedById.get(item.id);
    if (!outcome) return row;
    return {
      ...row,
      relevance: jevPanelRelevance(row.relevance, outcome),
      category: outcome.category ?? row.category,
      jevReview: outcome,
    };
  });
}

export interface TranslateInput {
  i: number;
  title: string;
  summary?: string;
  /** Explicit source metadata; absent means English for legacy callers. */
  sourceLang?: "en" | "vi";
}

export interface TranslateResult {
  i: number;
  title: string;
  summary: string;
  /** This batch's total token usage, attributed evenly across the batch's
   * requested items (not just the ones the model actually returned). */
  tokens: number;
}

/** Same defense as sanitizeScoreResults, for translations: keep only entries
 * whose `i` was actually requested (once), with non-empty string title —
 * small models sometimes echo the input array, invent indexes, or return
 * nulls for fields they failed to translate. */
export function sanitizeTranslateResults(
  raw: unknown,
  batch: TranslateInput[],
  tokensPerItem: number
): TranslateResult[] {
  if (!Array.isArray(raw)) return [];
  const validIndexes = new Set(batch.map((b) => b.i));
  const seen = new Set<number>();
  const out: TranslateResult[] = [];
  const take = (i: number, e: Record<string, unknown>) => {
    if (!Number.isInteger(i) || !validIndexes.has(i) || seen.has(i)) return;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    if (!title) return;
    seen.add(i);
    const summary = typeof e.summary === "string" ? e.summary.trim() : "";
    out.push({ i, title, summary, tokens: tokensPerItem });
  };
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    take(Number(e.i ?? e.index), e);
  }
  // Gemini sometimes returns one object per story and omits `i`. Trust the
  // order only when it lines up with the batch, so a short or long array
  // cannot be assigned to the wrong story.
  if (out.length === 0 && raw.length === batch.length) {
    raw.forEach((entry, position) => {
      if (!entry || typeof entry !== "object") return;
      const item = batch[position];
      if (!item) return;
      take(item.i, entry as Record<string, unknown>);
    });
  }
  return out;
}

/** Whole translateItems call. Several 3-item batches share this so a
 *  15-item backfill cannot stack 5 × 300s. */
export const TRANSLATE_TIMEOUT_MS = 240_000;
/** 25s hang-cap + two 20s floors so leftover actually reaches fallbacks. */
const TRANSLATE_BATCH_TIMEOUT_MS = 70_000;
const TRANSLATE_MAX_TOKENS = 4096;
/** Keep a whole story body in the translate prompt. A hard 800-char cut
 * landed mid-sentence in the Vietnamese column. */
const TRANSLATE_SUMMARY_MAX_CHARS = 2000;

function parseTranslateRows(raw: string): unknown {
  const parsed = parseJson<Record<string, unknown> | unknown[]>(raw);
  if (Array.isArray(parsed)) return parsed;
  for (const key of ["results", "translations", "items"] as const) {
    const value = parsed[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

/** Test hook. Gemini has returned `translations` instead of `results`. */
export function _parseTranslateRowsForTests(raw: string): unknown {
  return parseTranslateRows(raw);
}

function clipSummary(summary: string | undefined): string | undefined {
  if (!summary) return summary;
  const trimmed = summary.trim();
  if (trimmed.length <= TRANSLATE_SUMMARY_MAX_CHARS) return trimmed;
  const slice = trimmed.slice(0, TRANSLATE_SUMMARY_MAX_CHARS);
  const boundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("。"));
  if (boundary > 400) return slice.slice(0, boundary + 1).trim();
  const space = slice.lastIndexOf(" ");
  return (space > 400 ? slice.slice(0, space) : slice).trim();
}

/** The text the generator actually sees, so the draft check measures the
 * translation against the same (stripped, clipped) source. */
export function sentSource(
  item: TranslateInput,
  titlesOnly: boolean
): { title: string; summary: string | undefined } {
  const summary =
    titlesOnly || item.summary === undefined
      ? undefined
      : clipSummary(stripSourceBoilerplate(item.summary));
  return { title: item.title, summary };
}

/** Lines the translate user message states before the length rule. The house
 *  style already carries the long version; this is the short card a small
 *  model follows. Locked by test. Not appended inside viSystemPrompt. */
export const RULES_OVERVIEW = `Keep every fact: names, numbers, dates, who did what, and hedges such as "may" or "reportedly". Add nothing.
Translate every summary sentence. Merging two clauses is allowed only when every fact remains. Cutting a sentence is a failed translation.
Write a Vietnamese headline in sentence case: the first word and proper names only. Returning the English title unchanged is a failed translation, unless that title is already Vietnamese.
No English gloss in parentheses. Write "RAG", not "RAG (Retrieval-Augmented Generation)". A year, a percent, or a bare label such as "(SEC)" or "(YC S22)" may stay.
A vague word is not a number. "Countless" is not "hàng triệu". Do not swap who did what: if A accuses B, do not write B's thing of A.`;

function translatePrompt(
  batch: TranslateInput[],
  titlesOnly: boolean,
  fixes?: ReadonlyMap<number, string[]>
): string {
  const items = batch.map((item) => {
    const { i } = item;
    const { title, summary: body } = sentSource(item, titlesOnly);
    // The QA guard demands these back verbatim (translation-terms.ts).
    const keep = keepVerbatimList({ title, summary: body ?? "" });
    const fields = titlesOnly ? { i, title } : { i, title, summary: body };
    const fix = fixes?.get(i);
    return {
      ...fields,
      ...(keep.length > 0 ? { keep } : {}),
      ...(fix && fix.length > 0 ? { fix } : {}),
    };
  });
  return `Translate these AI/tech news items into Vietnamese.

${RULES_OVERVIEW}

A complete Vietnamese summary is about as long as the English one, at least 80% of its length. Copy every term in an item's "keep" list into the Vietnamese exactly as written, in English. An item with a "fix" list was translated before and broke those rules; translate it again and fix every one.

Bad: "Clef ra mắt mô hình quyết định mở trọng lượng". Good: "Clef ra mắt decision model open-weight".
Bad: "Các đại lý AI của OpenAI đã xâm nhập". Good: "Các AI agent của OpenAI đã xâm nhập".
Bad: "các hệ thống RAG (Retrieval-Augmented Generation)". Good: "các hệ thống RAG".
Bad: "Nscale Huy Động 3,36 Tỷ USD Trước Khi Niêm Yết Trên NYSE". Good: "Nscale huy động 3,36 tỷ USD trước khi niêm yết trên NYSE".
Bad: "Các quỹ trái phiếu rộng đã hấp thụ khoản nợ AI sau khi các ngân hàng rút lui." Good: "Người vay AI đã bán khoảng 55 tỷ USD trái phiếu high-yield trong năm nay. Các quỹ trái phiếu rộng hấp thụ khoản nợ đó sau khi ngân hàng rút lui."
Bad: "Nvidia và SoftBank giao nốt 20 triệu USD". Good: "Nvidia và SoftBank giao nốt 20 tỷ USD".

Items:
${JSON.stringify(items)}

Respond with strict JSON only: {"results":[{"i":0,"title":"...","summary":"..."}]}`;
}

function logTranslateBatchFailed(
  reason: string,
  batch: TranslateInput[],
  titlesOnly: boolean
): void {
  console.error(
    JSON.stringify({
      event: "translateItems.batch_failed",
      reason,
      batchSize: batch.length,
      indexes: batch.map((item) => item.i),
      titlesOnly,
    })
  );
}

export async function translateBatch(
  env: Env,
  batch: TranslateInput[],
  timeoutMs: number,
  titlesOnly: boolean,
  fixes?: ReadonlyMap<number, string[]>
): Promise<TranslateResult[]> {
  const system = await viSystemPrompt(
    env,
    VI_STYLE,
    batch.map((item) => `${item.title}\n${item.summary ?? ""}`).join("\n")
  );
  const { content: raw, tokens } = await callAnyrouter(
    env,
    [
      { role: "system", content: system },
      { role: "user", content: translatePrompt(batch, titlesOnly, fixes) },
    ],
    {
      json: true,
      modelSpec: env.ANYROUTER_TRANSLATE_MODEL,
      task: "translate",
      sensitive: true,
      timeoutMs,
      maxSliceMs: TRANSLATE_SLICE_MAX_MS,
      firstTokenMs: TRANSLATE_FIRST_TOKEN_MS,
      maxTokens: TRANSLATE_MAX_TOKENS,
      accept: (content) => {
        try {
          return (
            sanitizeTranslateResults(parseTranslateRows(content), batch, 0)
              .length > 0
          );
        } catch {
          return false;
        }
      },
    }
  );
  return sanitizeTranslateResults(
    parseTranslateRows(raw),
    batch,
    Math.ceil(tokens / batch.length)
  );
}

/** Under this much budget a repair call would only starve later batches. */
const TRANSLATE_REPAIR_MIN_MS = 25_000;

/** One repair pass over the drafts the deterministic check flags
 * (translation-draft-check.ts). A repaired row replaces its draft only when
 * it has fewer issues, so a worse retry never overwrites a usable draft. */
async function repairDrafts(
  env: Env,
  batch: TranslateInput[],
  rows: TranslateResult[],
  titlesOnly: boolean,
  rules: KnowledgeRule[],
  timeoutMs: number
): Promise<TranslateResult[]> {
  const byIndex = new Map(batch.map((item) => [item.i, item]));
  const issuesOf = (row: TranslateResult): string[] => {
    const item = byIndex.get(row.i);
    if (!item) return [];
    const sent = sentSource(item, titlesOnly);
    return translationDraftIssues(
      { title: sent.title, summary: sent.summary ?? "" },
      row,
      rules,
      sent.summary === undefined
    );
  };
  const fixes = new Map<number, string[]>();
  for (const row of rows) {
    const issues = issuesOf(row);
    if (issues.length > 0) fixes.set(row.i, issues);
  }
  if (fixes.size === 0 || timeoutMs < TRANSLATE_REPAIR_MIN_MS) return rows;
  const flagged = batch.filter((item) => fixes.has(item.i));
  console.log(
    JSON.stringify({
      event: "translateItems.draft_repair",
      indexes: [...fixes.keys()],
      issues: [...fixes.values()].flat().slice(0, 10),
    })
  );
  let repaired: TranslateResult[];
  try {
    repaired = await translateBatch(env, flagged, timeoutMs, titlesOnly, fixes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logTranslateBatchFailed(`draft repair: ${reason}`, flagged, titlesOnly);
    return rows;
  }
  const drafts = new Map(rows.map((row) => [row.i, row]));
  const better = new Map(
    repaired
      .filter((row) => {
        const draft = drafts.get(row.i);
        return (
          draft !== undefined &&
          acceptsRepair(
            [draft.title, draft.summary],
            [row.title, row.summary],
            fixes.get(row.i)?.length ?? 0,
            issuesOf(row).length
          )
        );
      })
      .map((row) => [row.i, row])
  );
  return rows.map((row) => {
    const fixed = better.get(row.i);
    return fixed ? { ...fixed, tokens: row.tokens + fixed.tokens } : row;
  });
}

export async function translateItems(
  env: Env,
  items: TranslateInput[]
): Promise<TranslateResult[]> {
  const results: TranslateResult[] = [];
  const deadline = Date.now() + TRANSLATE_TIMEOUT_MS;
  const needLlm: TranslateInput[] = [];
  // Loaded once for every batch's draft check; never throws.
  const rules = loadActiveRules(env);

  for (const item of items) {
    if (item.sourceLang === "vi") {
      results.push({
        i: item.i,
        title: item.title.trim(),
        summary: item.summary?.trim() ?? "",
        tokens: 0,
      });
    } else {
      needLlm.push(item);
    }
  }

  const runBatch = async (
    batch: TranslateInput[],
    titlesOnly: boolean
  ): Promise<TranslateResult[]> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      logTranslateBatchFailed(
        "translate deadline exhausted",
        batch,
        titlesOnly
      );
      return [];
    }
    try {
      const rows = await translateBatch(
        env,
        batch,
        Math.min(TRANSLATE_BATCH_TIMEOUT_MS, remaining),
        titlesOnly
      );
      return await repairDrafts(
        env,
        batch,
        rows,
        titlesOnly,
        await rules,
        Math.min(TRANSLATE_BATCH_TIMEOUT_MS, deadline - Date.now())
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logTranslateBatchFailed(reason, batch, titlesOnly);
      return [];
    }
  };

  const processBatch = async (
    batch: TranslateInput[]
  ): Promise<TranslateResult[]> => {
    if (deadline - Date.now() <= 0) {
      logTranslateBatchFailed("translate deadline exhausted", batch, false);
      return [];
    }

    const batchResults: TranslateResult[] = [];
    let got = await runBatch(batch, false);
    const hasSummary = batch.some((item) => Boolean(item.summary));
    if (got.length < batch.length && hasSummary) {
      const have = new Set(got.map((row) => row.i));
      const leftover = batch.filter((item) => !have.has(item.i));
      if (leftover.length > 0) {
        got = [...got, ...(await runBatch(leftover, true))];
      }
    }
    batchResults.push(...got);

    const batchTranslated = new Set(got.map((row) => row.i));
    const stillMissing = batch.filter((item) => !batchTranslated.has(item.i));
    for (const item of stillMissing) {
      if (deadline - Date.now() <= 0) break;
      const one = await runBatch([item], true);
      batchResults.push(...one);
    }
    return batchResults;
  };

  // Token spend unchanged; wall-clock divided (~3× at TRANSLATE_CONCURRENCY).
  const TRANSLATE_CONCURRENCY = 3;
  const batches = chunk(needLlm, TRANSLATE_BATCH_SIZE);
  const parallelResults = await mapWithConcurrency(
    batches,
    TRANSLATE_CONCURRENCY,
    processBatch
  );
  for (const batchOut of parallelResults) {
    results.push(...batchOut);
  }

  return results;
}

export interface TldrItem {
  id: string;
  title: string;
  summary?: string;
  title_vi?: string;
}

export interface TldrBullet {
  text: string;
  item_ids: string[];
  /** One emoji the model picked for the story's topic (Telegram bullet mark). */
  emoji?: string;
}

/** A single emoji (with optional variation selector / ZWJ sequence), else
 *  undefined, so a model that returns text or several icons is ignored. */
export function sanitizeBulletEmoji(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > 16) return undefined;
  const graphemes = [
    ...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(v),
  ];
  if (graphemes.length !== 1) return undefined;
  return /\p{Extended_Pictographic}/u.test(v) ? v : undefined;
}

export interface TldrResult {
  bullets_en: TldrBullet[];
  bullets_vi: TldrBullet[];
  /** Total tokens burned across all attempts. Not attributed to any item;
   * logged for visibility, not currently persisted anywhere. */
  tokens: number;
  /** Last failure, when both attempts produced no usable bullets. */
  error?: string;
}

const EMPTY_TLDR: TldrResult = { bullets_en: [], bullets_vi: [], tokens: 0 };

/** Bilingual 16+16 JSON is a large generation; give the chain more than
 * the default 120s so a reasoning model that spends its first slice on
 * hidden tokens still has time to emit content (or hand off). */
/** One deadline shared by both generateTldr attempts. The `tldr` Workflow
 * step times out at 4 minutes (`TLDR_STEP`). Two 240s attempts could run for
 * 8, so the step threw before the retry or the title fallback ran and the
 * run wrote no snapshot; the 10s left over covers the D1 reads and write. */
/** 230s: the first attempt (230-60 = 170s) must give the first hop of a
 *  two-model TL;DR chain Laguna's full 102-119s, after modelAttemptTimeoutMs
 *  reserves a slice for the fallback. Still inside the 4-minute step. */
export const TLDR_TIMEOUT_MS = 230_000;
/** Held back from the bilingual attempt so the EN-only retry still runs. */
export const TLDR_RETRY_RESERVE_MS = 60_000;

/** Chain budget for one TL;DR attempt, given what is left of the shared
 *  deadline. 0 means the budget is spent. */
export function tldrAttemptTimeoutMs(
  remainingMs: number,
  attemptsLeft: number
): number {
  if (remainingMs <= 0 || attemptsLeft <= 0) return 0;
  if (attemptsLeft === 1) return remainingMs;
  return Math.max(1, remainingMs - TLDR_RETRY_RESERVE_MS);
}

/** Accepts the preferred `item_ids: string[]` shape as well as the legacy
 * single `item_id` (or `id`) string, normalizing everything to an array. */
function normalizeBullets(input: unknown): TldrBullet[] {
  if (!Array.isArray(input)) return [];
  const out: TldrBullet[] = [];
  for (const entry of input) {
    if (typeof entry === "string" && entry.trim()) {
      const text = entry.trim();
      out.push({
        text: stripBracketItemIds(text),
        item_ids: extractBracketItemIds(text),
      });
      continue;
    }
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const text = typeof e.text === "string" ? e.text : undefined;
      if (!text) continue;
      const emoji = sanitizeBulletEmoji(e.emoji);
      out.push({
        text: stripBracketItemIds(text),
        item_ids: collectBulletItemIds(e, text),
        ...(emoji ? { emoji } : {}),
      });
    }
  }
  return out;
}

/** Accepts the documented `{bullets_en, bullets_vi}` shape as well as a
 * `{bullets: {en, vi}}` alternate the model sometimes returns, and tolerates
 * bullets that are plain strings or missing `item_id`. Token usage is
 * tracked separately in generateTldr, not part of this shape parsing. */
function normalizeTldrResult(parsed: unknown): Omit<TldrResult, "tokens"> {
  if (!parsed || typeof parsed !== "object") {
    return { bullets_en: [], bullets_vi: [] };
  }
  const p = parsed as Record<string, unknown>;
  const nested =
    p.bullets && typeof p.bullets === "object"
      ? (p.bullets as Record<string, unknown>)
      : null;

  return {
    bullets_en: normalizeBullets(p.bullets_en ?? nested?.en ?? p.en),
    bullets_vi: normalizeBullets(p.bullets_vi ?? nested?.vi ?? p.vi),
  };
}

/** The model sometimes hallucinates or truncates `item_id`s, which used to
 * make TL;DR bullets open the wrong story. Keep only ids that exactly match
 * an input item (or uniquely prefix-match one, expanded to the full id);
 * anything else is dropped from the bullet's id list. Also recover ids the
 * model stuffed into `[hex]` in the bullet text. */
export function sanitizeBulletIds(
  bullets: TldrBullet[],
  items: Pick<TldrItem, "id">[]
): TldrBullet[] {
  const ids = new Set(items.map((i) => i.id));
  const resolve = (id: string): string | null => {
    if (ids.has(id)) return id;
    const matches = items.filter((i) => i.id.startsWith(id));
    return matches.length === 1 ? matches[0].id : null;
  };
  return bullets.map((b) => {
    const merged = [...(b.item_ids ?? []), ...extractBracketItemIds(b.text)];
    const seen = new Set<string>();
    const item_ids: string[] = [];
    for (const raw of merged) {
      const id = resolve(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      item_ids.push(id);
    }
    return { ...b, text: stripBracketItemIds(b.text), item_ids };
  });
}

function tldrPrompt(items: TldrItem[], bilingual: boolean): string {
  const n = Math.min(16, Math.max(1, items.length));
  const langs = bilingual
    ? "in both English and Vietnamese"
    : "in English only";
  const shape = bilingual
    ? '{"bullets_en":[{"emoji":"🧠","text":"...","item_ids":["..."]}],"bullets_vi":[{"emoji":"🧠","text":"...","item_ids":["..."]}]}'
    : '{"bullets_en":[{"emoji":"🧠","text":"...","item_ids":["..."]}],"bullets_vi":[]}';
  const viNote = bilingual
    ? `
Each Vietnamese bullet states exactly the facts of the English bullet with the same item_ids: every name, number, date, and hedge, and nothing more. Do not drop a name (a co-investor, a source outlet), and do not add an intensifier or a detail the English bullet lacks ("mạnh mẽ", "vừa", "trực tiếp"). Write it the way a Vietnamese tech journalist would say it, following the house style above, never word by word.
`
    : "";
  return `Summarize the following ${items.length} AI/tech news items into at most ${n} TL;DR digest bullets (one per distinct story), ${langs}. Each bullet must reference the item_ids (an array) it was derived from: most bullets summarize a single story, so item_ids has one id; when several items report the same story or theme, write ONE synthesizing bullet citing ALL of their ids instead of separate bullets.

Each bullet is a short digest, not an article: about 2 sentences or 180–240 characters (English and Vietnamese). State the what and the why (or who/impact); the why must come from the cited items. Keep named entities (models, labs, products) in the text. Do not pad with filler, and do not write a paragraph. Put story ids only in the item_ids array — never as [id] in the bullet text.

Give each bullet an "emoji": ONE emoji that fits that specific story (e.g. 💰 a funding round, ⚖️ a court ruling or law, 🔌 chips, 🤖 an agent launch, 🧠 a new model, 🔓 an open-source release, 🛡️ security). Pick it per story, not one for the whole digest; the same story uses the same emoji in both languages. Never put the emoji in the text.
${viNote}
Items:
${JSON.stringify(items)}

Respond with strict JSON only: ${shape}`;
}

/** A bullet repair needs one short call; skip it rather than eat the
 * budget the EN-only retry and the snapshot write depend on. */
const TLDR_REPAIR_MIN_MS = 30_000;
const TLDR_REPAIR_MAX_MS = 45_000;

/** One repair call for Vietnamese bullets the draft check flags (calques,
 * wrong magnitudes). A fixed bullet replaces the original only when it has
 * fewer issues; any failure keeps the originals. */
async function repairTldrViBullets(
  env: Env,
  bullets: TldrBullet[],
  items: TldrItem[],
  rules: KnowledgeRule[],
  system: string,
  timeoutMs: number
): Promise<{ bullets: TldrBullet[]; tokens: number }> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sourceOf = (bullet: TldrBullet): string =>
    bullet.item_ids
      .map((id) => byId.get(id))
      .filter((item): item is TldrItem => Boolean(item))
      .map((item) => `${item.title}\n${item.summary ?? ""}`)
      .join("\n");
  const flagged = bullets
    .map((bullet, i) => ({
      i,
      text: bullet.text,
      fix: tldrBulletIssues(sourceOf(bullet), bullet.text, rules),
    }))
    .filter((entry) => entry.fix.length > 0);
  if (flagged.length === 0 || timeoutMs < TLDR_REPAIR_MIN_MS) {
    return { bullets, tokens: 0 };
  }
  try {
    const { content, tokens } = await callAnyrouter(
      env,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Fix these Vietnamese TL;DR bullets. Each "fix" list names the rules a bullet broke. Change only what the fix list requires; keep every fact and the bullet's length.

Bullets:
${JSON.stringify(flagged)}

Respond with strict JSON only: {"bullets":[{"i":0,"text":"..."}]}`,
        },
      ],
      {
        json: true,
        modelSpec: env.ANYROUTER_TRANSLATE_MODEL,
        task: "tldr",
        timeoutMs: Math.min(timeoutMs, TLDR_REPAIR_MAX_MS),
        maxSliceMs: TRANSLATE_SLICE_MAX_MS,
        maxTokens: TRANSLATE_MAX_TOKENS,
      }
    );
    const parsed = parseJson<{ bullets?: unknown }>(content).bullets;
    const out = [...bullets];
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      const e = entry as { i?: unknown; text?: unknown };
      const i = Number(e.i);
      const was = flagged.find((f) => f.i === i);
      if (!was || typeof e.text !== "string" || !e.text.trim()) continue;
      const text = e.text.trim();
      if (
        acceptsRepair(
          [was.text],
          [text],
          was.fix.length,
          tldrBulletIssues(sourceOf(bullets[i]), text, rules).length
        )
      ) {
        out[i] = { ...bullets[i], text };
      }
    }
    return { bullets: out, tokens };
  } catch (error) {
    console.error("generateTldr VI bullet repair failed:", error);
    return { bullets, tokens: 0 };
  }
}

export async function generateTldr(
  env: Env,
  items: TldrItem[]
): Promise<TldrResult> {
  const ATTEMPTS = 2;
  let totalTokens = 0;
  let lastError: string | undefined;
  const deadline = Date.now() + TLDR_TIMEOUT_MS;
  const viSystem = await viSystemPrompt(
    env,
    VI_STYLE,
    items.map((item) => `${item.title}\n${item.summary ?? ""}`).join("\n")
  );
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    // First attempt: bilingual journalist restatement. Second attempt
    // drops VI so a timeout/starved-content failure still yields EN
    // bullets the digest can send (it already falls back to EN).
    const bilingual = attempt === 1;
    const timeoutMs = tldrAttemptTimeoutMs(
      deadline - Date.now(),
      ATTEMPTS - attempt + 1
    );
    if (timeoutMs <= 0) {
      lastError = `attempt ${attempt}/${ATTEMPTS} skipped: tldr budget spent`;
      break;
    }
    try {
      const { content: raw, tokens } = await callAnyrouter(
        env,
        bilingual
          ? [
              { role: "system", content: viSystem },
              { role: "user", content: tldrPrompt(items, true) },
            ]
          : [{ role: "user", content: tldrPrompt(items, false) }],
        {
          json: true,
          modelSpec: env.ANYROUTER_TLDR_MODEL,
          task: "tldr",
          timeoutMs,
          maxSliceMs: TLDR_SLICE_MAX_MS,
          // Bilingual attempt: EN-only JSON is a miss so the next model
          // can still produce bullets_vi. EN-only is accepted on retry.
          accept: (content) => {
            try {
              const parsed = normalizeTldrResult(parseJson<unknown>(content));
              return bilingual
                ? parsed.bullets_vi.length > 0
                : parsed.bullets_en.length > 0;
            } catch {
              return false;
            }
          },
        }
      );
      totalTokens += tokens;
      const result = normalizeTldrResult(parseJson<unknown>(raw));
      if (result.bullets_en.length > 0 || result.bullets_vi.length > 0) {
        const repaired = await repairTldrViBullets(
          env,
          sanitizeBulletIds(result.bullets_vi, items),
          items,
          await loadActiveRules(env),
          viSystem,
          deadline - Date.now()
        );
        return {
          bullets_en: sanitizeBulletIds(result.bullets_en, items),
          bullets_vi: repaired.bullets,
          tokens: totalTokens + repaired.tokens,
        };
      }
      lastError = `attempt ${attempt}/${ATTEMPTS} returned no bullets`;
      console.error(`generateTldr ${lastError}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(
        `generateTldr attempt ${attempt}/${ATTEMPTS} failed:`,
        error
      );
    }
  }

  console.error(
    `generateTldr burned ${totalTokens} tokens with no result: ${lastError}`
  );
  return { ...EMPTY_TLDR, tokens: totalTokens, error: lastError };
}

export type { AnyrouterCallResult, ChatMessage };
export {
  callAnyrouter,
  extractLastJsonObject as _extractLastJsonObjectForTests,
  normalizeTldrResult as _normalizeTldrForTests,
  parseJson,
  parseJson as _parseJsonForTests,
  VI_STYLE,
};
