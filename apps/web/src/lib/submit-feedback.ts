import type { Lang } from "./types";

/**
 * TanStack Start does not always reject a server function with an `Error`.
 * Depending on the response it rethrows the raw `error` string of a
 * `{error: "..."}` JSON body, a plain object for a `notFound()`/serialized
 * redirect, or an `Error` whose message is a whole server-rendered document.
 *
 * A single `err instanceof Error ? err.message : "..."` check therefore hides
 * the real reason behind one generic sentence. This module maps every throw
 * shape onto short, localized, non-secret copy.
 */

/** Anything document- or payload-shaped must never reach the form. */
const UNSAFE_DETAIL = /[<>]|\{\s*"|^\s*[[{]|^\s*(?:<!doctype|\{|\[)/i;

/** Long messages are stack traces or serialized internals, not user copy. */
const MAX_DETAIL_LENGTH = 160;

/**
 * Details that are Start/HTTP contract wording rather than something a reader
 * can act on verbatim. Transport rejections usually mean the page is running a
 * stale client bundle against a newer Worker; auth codes mean the session
 * expired while the form was open.
 */
const HINTS: Array<[RegExp, Record<Lang, string>]> = [
  [
    /only html requests are supported here|invariant failed|start context/i,
    {
      en: "The page is out of date. Reload and try again.",
      vi: "Trang đã cũ. Hãy tải lại rồi thử lại.",
    },
  ],
  [
    /failed to fetch|network ?error|load failed/i,
    {
      en: "Could not reach the server. Check your connection and try again.",
      vi: "Không kết nối được máy chủ. Hãy kiểm tra kết nối rồi thử lại.",
    },
  ],
  [
    /^unauthoriz|unauthorized|forbidden|sign ?in required|session expired/i,
    {
      en: "Sign in again to submit a story.",
      vi: "Hãy đăng nhập lại để gửi bài.",
    },
  ],
];

const GENERIC: Record<Lang, string> = {
  en: "Could not submit. Please try again.",
  vi: "Không gửi được. Vui lòng thử lại.",
};

function isSafeDetail(detail: string): boolean {
  const trimmed = detail.trim();
  if (!trimmed || trimmed.length > MAX_DETAIL_LENGTH) return false;
  if (UNSAFE_DETAIL.test(trimmed)) return false;
  return true;
}

/** Pull a short plain-text reason out of whatever Start threw or resolved. */
function detailOf(err: unknown): string | null {
  if (typeof err === "string") return isSafeDetail(err) ? err.trim() : null;
  if (err instanceof Error) {
    return isSafeDetail(err.message) ? err.message.trim() : null;
  }
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    // `{error}` is what the router path and the JSON locale gate return.
    // notFound()/serialized-redirect payloads carry no text, and their
    // `data`/`href` fields are internal routing detail, so they are ignored.
    for (const key of ["message", "error"] as const) {
      const value = record[key];
      if (typeof value === "string" && isSafeDetail(value)) {
        return value.trim();
      }
    }
  }
  return null;
}

function localized(copy: Record<Lang, string>, lang: Lang): string {
  return copy[lang] ?? copy.en;
}

/**
 * Never echoes a request header, cookie, or token: only the thrown value's own
 * short message, and only when it is plain text.
 */
export function submitErrorMessage(err: unknown, lang: Lang): string {
  const detail = detailOf(err);

  if (detail) {
    for (const [pattern, copy] of HINTS) {
      if (pattern.test(detail)) return localized(copy, lang);
    }
    return detail;
  }

  // Nothing worth showing. Classify on the raw shape so a notFound/redirect
  // payload that only carries a machine code still lands on useful copy.
  for (const [pattern, copy] of HINTS) {
    if (pattern.test(describe(err))) return localized(copy, lang);
  }
  return localized(GENERIC, lang);
}

/** A readable form of any throw shape, used only for classification. */
function describe(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    return [record.error, record.message, record.code]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }
  return String(err);
}

/**
 * The submit handler resolves `{ id }`. Start returns a deserialized body
 * as-is for unrecognized shapes, so a response that is not an id — including
 * the `{error: "..."}` the router path returns — must not be reported to the
 * reader as a successful submission.
 */
export function isSubmittedId(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.length > 0
  );
}
