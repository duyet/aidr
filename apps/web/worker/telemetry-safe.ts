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

function redactText(value: string): string {
  return (
    value
      .replace(/https?:\/\/[^\s<>"']+/gi, "[url redacted]")
      .replace(
        /-{5}BEGIN [A-Z ]*PRIVATE\sKEY-{5}[\s\S]*?(?:-{5}END [A-Z ]*PRIVATE\sKEY-{5}|$)/g,
        "[redacted]"
      )
      // Query credentials in a host/path with no scheme.
      .replace(
        /([?&][\w-]*(?:key|token|secret|sig|signature|password)=)[^&\s"'#]+/gi,
        "$1[redacted]"
      )
      .replace(/\bBearer\s+[^\s,;"'}]+/gi, "Bearer [redacted]")
      .replace(/\b(?:sk|pk|anyrouter)[-_][A-Za-z0-9._-]{8,}\b/gi, "[redacted]")
      .replace(/\bar-v\d+-[A-Za-z0-9._-]{10,}/gi, "[redacted]")
      // `session_token`, `idToken`, `secretKey`, `private_key`. A scheme
      // word (`Basic`, `Bearer`) goes with its credential.
      .replace(
        /\b(authorization|x-api-key|api[-_ ]?key|apikey|(?:secret|private|access)[-_]?key|client[-_ ]?secret|(?:[a-z]+[-_]?)?(?:token|secret|password|passwd))\b(["']?)\s*(?:[:=]|%3D)\s*(?:(?:basic|bearer|digest|token)\s+)?(?:"[^"]*"|'[^']*'|[^,;}\s&]+)/gi,
        "$1$2: [redacted]"
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

const SNIPPET_HEAD = 160;
const SNIPPET_TAIL = 80;
const SNIPPET_GAP = " … ";
/** Redaction runs on a bounded window so a huge body costs nothing. */
const SNIPPET_WINDOW = 2000;

/** Two lowercase-to-uppercase steps: base64 and random ids, not words. */
const MIXED_CASE = /[a-z][A-Z].*[a-z][A-Z]/;

/** 15.000.000, 12 500 000: Vietnamese and SI thousands grouping. */
const THOUSANDS = /^[1-9]\d{0,2}(?:[ .]\d{3})*$/;
const YEAR = /^(?:19|20)\d\d$/;

/** arXiv ids (2410.12345) are YYMM.NNNNN, a shape no phone plan uses. */
const ARXIV_ID = /^\d{4}\.\d{4,5}$/;

function redactPhone(match: string): string {
  const groups = match.match(/\d+/g) ?? [];
  if (groups.join("").length < 7) return match;
  if (/[+(]/.test(match)) return "[phone redacted]";
  if (ARXIV_ID.test(match)) return match;
  // Amounts, amount or year ranges, and dates split on "-".
  const parts = match.split("-");
  if (parts.every((part) => THOUSANDS.test(part) || YEAR.test(part))) {
    return match;
  }
  // Two groups (555-0132), or two long groups; "2026-10-14 12" has one.
  const long = groups.filter((group) => group.length >= 3).length;
  return groups.length === 2 || long >= 2 ? "[phone redacted]" : match;
}

/** A dotted quad is an address unless it reads as a version: after
 *  `version`/`v`/`release`/`build`, or a `name/` product token
 *  (`nginx/1.25.3.1`). `host:port` always redacts. */
const VERSION_BEFORE =
  /(?:\b(?:version|ver|release|build|v)\s*[:=]?\s*|[A-Za-z][\w.-]*\/)$/i;

function redactIpv4(match: string, offset: number, whole: string): string {
  if (/^:\d/.test(whole.slice(offset + match.length))) return "[ip redacted]";
  const before = whole.slice(Math.max(0, offset - 40), offset);
  return VERSION_BEFORE.test(before) ? match : "[ip redacted]";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A git SHA-1. Other hex lengths (sha256, request hashes) still redact. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** A short, word-like part of a slug or model id: `DeepSeek`, `32B`. */
function wordish(segment: string): boolean {
  return segment.length <= 12 && !MIXED_CASE.test(segment);
}

function redactOpaque(match: string): string {
  if (UUID.test(match) || COMMIT_SHA.test(match)) return match;
  const segments = match.split(/[-_]+/);
  if (segments.length >= 3 && segments.every(wordish)) return match;
  return /\d/.test(match) || MIXED_CASE.test(match) ? "[redacted]" : match;
}

type SnippetReplacer = (match: string, offset: number, whole: string) => string;

/**
 * Snippet-only rules, on top of `redactText`. They stay out of
 * `sanitizeText`, whose step reasons carry dates, times and slugs that the
 * phone and token rules would eat. Order matters: base64 before opaque ids,
 * so `==` padding goes with its token.
 */
const SNIPPET_RULES: ReadonlyArray<
  readonly [RegExp, string | SnippetReplacer]
> = [
  [
    /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    "[email redacted]",
  ],
  [
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g,
    "[redacted]",
  ],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  [/\b(Set-Cookie|Cookie)\b(["']?)\s*[:=]\s*.+/gi, "$1$2: [redacted]"],
  [
    /\b(account[-_]?id|user[-_]?id|org(?:anization)?[-_]?id|request[-_]?id)\b(["']?)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,;}\s]+)/gi,
    "$1$2: [redacted]",
  ],
  [/\breq_[A-Za-z0-9]{8,}\b/g, "[redacted]"],
  [
    /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\w|\.\d)/g,
    redactIpv4,
  ],
  [
    /(?<![\w:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?)(?![\w:])/gi,
    (match) => (/\d/.test(match) ? "[ip redacted]" : match),
  ],
  [/\b[\w-]+(?:\.[\w-]+)*\.(?:local|internal)\b/gi, "[host redacted]"],
  [
    /(?<![\w+.,/-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{1,8}(?:[\s.-]\d{2,8}){1,4}(?!\w)/g,
    redactPhone,
  ],
  [
    /(?<![\w+/=-])[A-Za-z0-9+/]{32,}={0,2}(?![\w+/=-])/g,
    (match) =>
      MIXED_CASE.test(match) || /[+=]/.test(match) ? "[redacted]" : match,
  ],
  [/(?<![\w-])[A-Za-z0-9_-]{32,}(?![\w-])/g, redactOpaque],
];

/**
 * Short, sanitized excerpt of a failed model output or provider error body
 * for `llm_calls.response_snippet`: first 160 and last 80 characters after
 * secrets, tokens, ids, addresses and contact details are redacted.
 * The D1 sink runs it again on the stored excerpt. That pass leaves a
 * redacted excerpt as it is, except where the head/tail cut split a word
 * (`user_input:` cut to `input:`), and then it can only redact more.
 */
export function sanitizeLlmSnippet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const window =
    value.length > SNIPPET_WINDOW * 2
      ? `${value.slice(0, SNIPPET_WINDOW)} ${value.slice(-SNIPPET_WINDOW)}`
      : value;
  const text = SNIPPET_RULES.reduce(
    (out, [pattern, replacement]) =>
      typeof replacement === "string"
        ? out.replace(pattern, replacement)
        : out.replace(pattern, replacement),
    redactText(boundedText(window, window.length))
  );
  if (!text) return null;
  if (text.length <= SNIPPET_HEAD + SNIPPET_TAIL + SNIPPET_GAP.length) {
    return text;
  }
  return `${text.slice(0, SNIPPET_HEAD)}${SNIPPET_GAP}${text.slice(-SNIPPET_TAIL)}`;
}
