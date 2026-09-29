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
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|anyrouter)[-_][A-Za-z0-9._-]{8,}\b/gi, "[redacted]")
    .replace(
      /\b(authorization|api[-_ ]?key|apikey|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|token|secret|password)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,;}\s]+)/gi,
      "$1: [redacted]"
    )
    .replace(
      /\b(prompt|messages?|content|input|body|response|request|payload|raw)\b\s*[:=]\s*.+/gi,
      "$1: [redacted]"
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
