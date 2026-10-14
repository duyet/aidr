/**
 * Sanitisation shared by telemetry writes and public read models.
 *
 * LLM/workflow diagnostics are useful when they are structured and short.
 * They must never become a transport for prompts, provider response bodies,
 * credentials, or arbitrary URLs, so all error-bearing values are reduced to
 * a safe code/message before they cross a D1 or API boundary.
 */

const MAX_TEXT_LENGTH = 240;
const SAFE_ERROR_CODES = new Set([
  "timeout",
  "rate_limited",
  "auth_error",
  "invalid_response",
  "bad_output",
  "not_configured",
  "provider_error",
  "unknown_error",
]);

const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "body",
  "content",
  "credential",
  "clientsecret",
  "headers",
  "href",
  "input",
  "messages",
  "password",
  "payload",
  "prompt",
  "raw",
  "request",
  "response",
  "secret",
  "token",
  "url",
]);

function boundedText(value: string, maxLength: number): string {
  const limit = Number.isFinite(maxLength)
    ? Math.max(1, Math.floor(maxLength))
    : MAX_TEXT_LENGTH;
  const bounded = value.length > limit * 4 ? value.slice(0, limit * 4) : value;
  const withoutControls = [...bounded]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
    .join("");
  return withoutControls.replace(/\s+/g, " ").trim();
}

/** Usage counters (`input_token: 512`) share the `token` suffix. */
const TOKEN_COUNT_KEY =
  /^(?:input|output|prompt|completion|total|max|cached|reasoning)[-_]token$/i;

function redactText(value: string): string {
  return (
    value
      .replace(/https?:\/\/[^\s<>"']+/gi, "[url redacted]")
      .replace(
        /-{5}BEGIN [A-Z ]*PRIVATE\sKEY-{5}[\s\S]*?(?:-{5}END [A-Z ]*PRIVATE\sKEY-{5}|$)/g,
        "[redacted]"
      )
      // Query credentials in a host/path with no scheme. The name is a
      // credential word or ends in one after `-`/`_`, so `monkey=` stays.
      .replace(
        /([?&](?:[\w-]*[-_])?(?:api[-_]?key|apikey|key|token|secret|sig|signature|password|passwd|session[-_]?id|credentials?|passphrase)=)[^&\s"'#]+/gi,
        "$1[redacted]"
      )
      .replace(/\bBearer\s+[^\s,;"'}]+/gi, "Bearer [redacted]")
      .replace(/\b(?:sk|pk|anyrouter)[-_][A-Za-z0-9._-]{8,}\b/gi, "[redacted]")
      .replace(/\bar-v\d+-[A-Za-z0-9._-]{10,}/gi, "[redacted]")
      // `OPENAI_API_KEY`, `stripeSecretKey`, `session_id`, `idToken`. A
      // scheme word (`Basic`, `Bearer`) goes with its credential.
      .replace(
        /\b((?:[a-z0-9]+[-_])*(?:[a-z0-9]*(?:api[-_ ]?key|apikey|(?:secret|private|access)[-_]?key)|authorization|client[-_ ]?secret|session[-_]?id|credentials?|passphrase|[a-z]*(?:token|secret|password|passwd)))\b(["']?)\s*(?:[:=]|%3D)\s*(?:(?:basic|bearer|digest|token)\s+)?("[^"]*"|'[^']*'|[^,;}\s&]+)/gi,
        (match, key: string, quote: string, value: string) =>
          TOKEN_COUNT_KEY.test(key) && /^\d{1,7}$/.test(value)
            ? match
            : `${key}${quote}: [redacted]`
      )
      // These values can echo the prompt, so everything after the key goes.
      // A quoted "message" is a provider error's own text, the part worth
      // keeping, so only the bare `message:` form matches.
      .replace(
        /\b(flagged_input|prompt|messages|message(?!["'])|content|input|body|response|request|payload|raw)\b(["']?)\s*[:=]\s*.+/gi,
        "$1$2: [redacted]"
      )
  );
}

function redactValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  const compactKey = normalizedKey.replace(/[-_]/g, "");
  if (SENSITIVE_KEYS.has(normalizedKey) || SENSITIVE_KEYS.has(compactKey)) {
    return normalizedKey === "url" || normalizedKey === "href"
      ? "[url redacted]"
      : "[redacted]";
  }
  if (typeof value === "string") {
    if (normalizedKey === "error" || normalizedKey.endsWith("_error")) {
      return sanitizeError(value)?.message ?? null;
    }
    return sanitizeText(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, child]) => [
          sanitizeText(childKey, 80) ?? "[redacted]",
          redactValue(child, childKey),
        ]
      )
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/** Larger JSON strings are not parsed; they are redacted outright. */
const MAX_JSON_INPUT = 64 * 1024;

const FIT_JSON_PASSES: ReadonlyArray<{ text: number; items: number }> = [
  // Cut long strings first, keeping every key; then drop items.
  { text: 120, items: 20 },
  { text: 60, items: 20 },
  { text: 24, items: 20 },
  { text: 12, items: 20 },
  { text: 12, items: 10 },
  { text: 12, items: 5 },
  { text: 8, items: 2 },
];

function shrinkJson(value: unknown, text: number, items: number): unknown {
  if (typeof value === "string") {
    return value.length > text ? `${value.slice(0, text)}…` : value;
  }
  if (Array.isArray(value)) {
    const kept = value
      .slice(0, items)
      .map((item) => shrinkJson(item, text, items));
    return value.length > items ? [...kept, "…"] : kept;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const kept: [string, unknown][] = entries
      .slice(0, items)
      .map(([key, child]) => [key, shrinkJson(child, text, items)]);
    if (entries.length > items) kept.push(["…", entries.length - items]);
    return Object.fromEntries(kept);
  }
  return value;
}

/**
 * Serialise within `maxLength` and stay valid JSON. Slicing the string
 * mid-token left text that the next sanitize pass (a stored step reason read
 * back through `sanitizeRunStatsJson`) could not parse, so it collapsed to
 * "[json redacted]". Shrink strings, arrays, and keys instead.
 */
function fitJson(value: unknown, maxLength: number): string {
  const full = JSON.stringify(value) ?? "null";
  if (full.length <= maxLength) return full;
  for (const pass of FIT_JSON_PASSES) {
    const shrunk = JSON.stringify(shrinkJson(value, pass.text, pass.items));
    if (shrunk.length <= maxLength) return shrunk;
  }
  const marker = Array.isArray(value) ? '["…"]' : '{"…":true}';
  return marker.length <= maxLength ? marker : "null";
}

/** Safe, bounded text for step reasons, notification metadata, and labels. */
export function sanitizeText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^[{[]/.test(trimmed)) {
    // Parse the whole value, not the pre-bounded prefix: a cut prefix is
    // never valid JSON and would always collapse to "[json redacted]".
    try {
      const parsed = JSON.parse(
        trimmed.length > MAX_JSON_INPUT ? "" : trimmed
      ) as unknown;
      return fitJson(redactValue(parsed), maxLength);
    } catch {
      return "[json redacted]";
    }
  }
  const normalized = boundedText(value, maxLength);
  if (!normalized) return null;
  const redacted = redactText(normalized);
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export interface SafeError {
  message: string;
  code: string;
  status: number | null;
}

function statusFromError(value: string): number | null {
  const match =
    /(?:^|\b)(?:status|code|http)\s*[:=]?\s*(\d{3})\b/i.exec(value) ??
    /\banyrouter request failed:\s*(\d{3})\b/i.exec(value) ??
    /\bprovider request failed\s*\((\d{3})\)/i.exec(value);
  if (!match) return null;
  const status = Number(match[1]);
  return status >= 100 && status <= 599 ? status : null;
}

/** Classify provider failures without returning the provider's raw message. */
export function sanitizeError(value: unknown): SafeError | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value : String(value);
  if (!raw.trim()) return null;
  const lower = raw.toLowerCase();
  const status = statusFromError(raw);
  let code: string;
  let message: string;
  if (/\b(?:timeout|timed out|deadline)\b/.test(lower)) {
    code = "timeout";
    message = "Provider request timed out";
  } else if (
    status === 429 ||
    /\b(?:rate.?limit|too many requests)\b/.test(lower)
  ) {
    code = "rate_limited";
    message = "Provider rate limit reached";
  } else if (
    status === 401 ||
    status === 403 ||
    /\b(?:unauthori[sz]ed|forbidden|invalid api key|authentication)\b/.test(
      lower
    )
  ) {
    code = "auth_error";
    message = "Provider authentication failed";
  } else if (/\bbad output\b/.test(lower)) {
    code = "bad_output";
    message = "Provider output was not usable";
  } else if (
    /\b(?:response missing|failed accept|invalid response|bad json|unusable)\b/.test(
      lower
    )
  ) {
    code = "invalid_response";
    message = "Provider returned an invalid response";
  } else if (
    /\b(?:not configured|no models|model .* not configured)\b/.test(lower)
  ) {
    code = "not_configured";
    message = "Provider is not configured";
  } else {
    code = "provider_error";
    message = status
      ? `Provider request failed (${status})`
      : "Provider request failed";
  }
  return { message, code, status };
}

export function safeErrorCode(
  value: unknown,
  fallback = "unknown_error"
): string {
  if (typeof value !== "string") return fallback;
  const code = value.toLowerCase();
  return SAFE_ERROR_CODES.has(code) ? code : fallback;
}

export function safeErrorStatus(value: unknown): number | null {
  let status: number;
  try {
    status = typeof value === "number" ? value : Number(value);
  } catch {
    return null;
  }
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

/** Convert an arbitrary stats object into a JSON-safe, redacted value. */
export function sanitizeRunStats(value: unknown): unknown {
  return redactValue(value);
}

export function sanitizeRunStatsJson(raw: string): string {
  try {
    return JSON.stringify(sanitizeRunStats(JSON.parse(raw)));
  } catch {
    return "{}";
  }
}

export function sanitizeRunError(value: unknown): string | null {
  return sanitizeError(value)?.message ?? null;
}

/*
 * `llm_calls.response_snippet` holds a JSON descriptor of a failed call,
 * never the provider body or the model's answer. A denylist cannot make
 * arbitrary text safe to store, so every field is allowlisted:
 *
 *   {"kind":"provider_error","status":401,"error":{"code":…,"message":…}}
 *   {"kind":"provider_error","status":502,"text":"502 Bad Gateway nginx"}
 *   {"kind":"provider_error","status":502,"body":"non-json error body (812 bytes)"}
 *   {"kind":"model_output","len":48,"startsWith":"object","jsonParse":"error at pos 48",…}
 *
 * `canonicalLlmSnippet` rebuilds a descriptor from those fields alone and
 * returns null for anything else, so a raw string never reaches D1 and a
 * second pass leaves a stored descriptor unchanged.
 */

const MESSAGE_MAX = 120;
const TEXT_MAX = 60;
const TOP_KEYS_MAX = 10;
const HIDDEN = "[redacted]";

/** `Bad`, `API`, `OpenRouter`, `rate-limit`, `max_tokens`, with light
 *  punctuation. Mixed-case runs, digits inside words and long tokens are
 *  how keys, ids and hosts look, so none of them match. */
const WORD =
  "(?:[A-Z]?[a-z]{1,23}|[A-Z]{1,12}|(?:[A-Z][a-z]{1,11}){2,3}[A-Z]{0,3})";
const PROSE_WORD = new RegExp(
  `^[([]?(?:${WORD}(?:['’-]${WORD}){0,3}|[a-z]{1,24}(?:_[a-z]{1,24}){1,4})[)\\].,:;!?…]*$`
);
const PROSE_NUMBER = /^\d{1,7}(?:\.\d{1,3})?[a-z]{0,2}[).,:;!?…]*$/;

/** Each token that is not a word, or a number standing alone, becomes `*`.
 *  Adjacent numbers go too: `0912 345 678` is a phone number. */
function proseOnly(text: string): string {
  const tokens = text.split(" ");
  const kinds = tokens.map((token) =>
    PROSE_WORD.test(token)
      ? "word"
      : PROSE_NUMBER.test(token)
        ? "number"
        : "other"
  );
  return tokens
    .map((token, i) => {
      if (kinds[i] === "word") return token;
      const alone = kinds[i - 1] !== "number" && kinds[i + 1] !== "number";
      return kinds[i] === "number" && alone ? token : "*";
    })
    .join(" ");
}

function safeMessage(value: unknown): string | undefined {
  // A JSON message is an echoed payload, not the provider's own words.
  if (typeof value !== "string" || /^\s*[[{]/.test(value)) return undefined;
  const redacted = sanitizeText(value, MESSAGE_MAX);
  return redacted ? proseOnly(redacted) : undefined;
}

/** A short non-JSON body is kept only when it is words and no more:
 *  `Service Unavailable`, or nginx's 502 page without its tags. */
function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<\/?[A-Za-z][A-Za-z0-9]*\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_MAX)
    .trim();
  if (!text || /[=:"'`@]|\d{4}/.test(text)) return undefined;
  if (sanitizeText(text, TEXT_MAX) !== text) return undefined;
  return proseOnly(text) === text ? text : undefined;
}

const ERROR_CODE = /^(?:[a-z][a-z_.-]{0,47}|[A-Z][A-Z_]{0,47})$/;
/** A request field name: `messages[0].content`, `max_tokens`. */
const PARAM_NAME = /^[A-Za-z_]+(?:\[\d{1,4}\]|\.[A-Za-z_]+)*$/;

function safeCode(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value < 10_000
      ? value
      : undefined;
  }
  return typeof value === "string" && ERROR_CODE.test(value)
    ? value
    : undefined;
}

interface ErrorFields {
  code?: string | number;
  type?: string;
  status?: string | number;
  param?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorFields(value: unknown): ErrorFields | undefined {
  const raw = typeof value === "string" ? { message: value } : value;
  if (!isRecord(raw)) return undefined;
  const type = safeCode(raw.type);
  const param =
    typeof raw.param === "string" &&
    raw.param.length <= 64 &&
    PARAM_NAME.test(raw.param)
      ? raw.param
      : undefined;
  const fields: ErrorFields = {
    code: safeCode(raw.code),
    type: typeof type === "string" ? type : undefined,
    status: safeCode(raw.status),
    param,
    message: safeMessage(raw.message),
  };
  const kept = Object.entries(fields).filter(([, v]) => v !== undefined);
  return kept.length > 0
    ? (Object.fromEntries(kept) as ErrorFields)
    : undefined;
}

const BODY_NOTE = /^(?:non-)?json error body \(\d{1,7} bytes\)$/;

function canonicalProviderError(raw: Record<string, unknown>) {
  const head = { kind: "provider_error", status: safeErrorStatus(raw.status) };
  const error = errorFields(raw.error);
  if (error) return { ...head, error };
  const text = safeText(raw.text);
  if (text) return { ...head, text };
  if (typeof raw.body === "string" && BODY_NOTE.test(raw.body)) {
    return { ...head, body: raw.body };
  }
  return head;
}

const STARTS_WITH = new Set([
  "object",
  "array",
  "fence",
  "quote",
  "markup",
  "letter",
  "digit",
  "other",
  "empty",
]);
const JSON_PARSE = /^(?:ok|not-json|error|error at pos \d{1,9})$/;
const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

function canonicalModelOutput(raw: Record<string, unknown>) {
  const len =
    typeof raw.len === "number" && Number.isInteger(raw.len) && raw.len >= 0
      ? raw.len
      : undefined;
  const topKeys = Array.isArray(raw.topKeys)
    ? raw.topKeys
        .slice(0, TOP_KEYS_MAX)
        .map((key) =>
          typeof key === "string" && KEY_NAME.test(key) ? key : HIDDEN
        )
    : undefined;
  const pick = <T>(value: T, ok: boolean) => (ok ? value : undefined);
  return {
    kind: "model_output",
    len,
    startsWith: pick(
      raw.startsWith,
      typeof raw.startsWith === "string" && STARTS_WITH.has(raw.startsWith)
    ),
    jsonParse: pick(
      raw.jsonParse,
      typeof raw.jsonParse === "string" && JSON_PARSE.test(raw.jsonParse)
    ),
    topKeys,
    fenced: pick(raw.fenced, typeof raw.fenced === "boolean"),
    truncatedAtMax: pick(
      raw.truncatedAtMax,
      typeof raw.truncatedAtMax === "boolean"
    ),
  };
}

/** The stored form of a snippet descriptor, or null when `value` is not
 *  one. Accepts the descriptor object or its JSON. */
export function canonicalLlmSnippet(value: unknown): string | null {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(raw)) return null;
  if (raw.kind === "provider_error") {
    return JSON.stringify(canonicalProviderError(raw));
  }
  if (raw.kind === "model_output") {
    return JSON.stringify(canonicalModelOutput(raw));
  }
  return null;
}

/** Snippet for a non-2xx provider answer: the HTTP status plus the
 *  allowlisted `error` fields of a JSON body, the words of a short text
 *  body, or the body's size. */
export function providerErrorSnippet(
  status: number,
  body: string
): string | null {
  const bytes = new TextEncoder().encode(body).length;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return canonicalLlmSnippet({
      kind: "provider_error",
      status,
      text: safeText(body),
      body: `non-json error body (${bytes} bytes)`,
    });
  }
  const error = isRecord(parsed) ? errorFields(parsed.error) : undefined;
  return canonicalLlmSnippet({
    kind: "provider_error",
    status,
    error,
    body: `json error body (${bytes} bytes)`,
  });
}

function startsWithClass(content: string): string {
  const first = content.trimStart()[0];
  if (first === undefined) return "empty";
  const fixed: Record<string, string> = {
    "{": "object",
    "[": "array",
    "`": "fence",
    '"': "quote",
    "<": "markup",
  };
  if (fixed[first]) return fixed[first];
  if (/\p{L}/u.test(first)) return "letter";
  return /\d/.test(first) ? "digit" : "other";
}

/** Snippet for an answer that failed `accept` or `validate`: its shape,
 *  read with the caller's own parser. The parse error's text quotes the
 *  input, so only its position is kept. */
export function modelOutputSnippet(
  content: string,
  opts: { parse: (raw: string) => unknown; truncatedAtMax: boolean }
): string | null {
  let jsonParse = "not-json";
  let topKeys: string[] | undefined;
  if (/[[{]/.test(content)) {
    try {
      const parsed = opts.parse(content);
      jsonParse = "ok";
      if (isRecord(parsed)) topKeys = Object.keys(parsed);
    } catch (error) {
      const at = /at position (\d+)/.exec(
        error instanceof Error ? error.message : ""
      );
      jsonParse = at ? `error at pos ${at[1]}` : "error";
    }
  }
  return canonicalLlmSnippet({
    kind: "model_output",
    len: content.length,
    startsWith: startsWithClass(content),
    jsonParse,
    topKeys,
    fenced: content.includes("```"),
    truncatedAtMax: opts.truncatedAtMax,
  });
}
