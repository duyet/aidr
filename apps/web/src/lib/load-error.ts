import type { Lang } from "./types";

/** A page whose loader read failed. Not a 404: the URL may still exist. */
export type LoadErrorSubject = "day" | "story" | "week" | "weeks";

interface LoadErrorCopy {
  title: string;
  body: string;
  retry: string;
}

const RETRY: Record<Lang, string> = { en: "Try again", vi: "Thử lại" };

const COPY: Record<LoadErrorSubject, Record<Lang, [string, string]>> = {
  day: {
    en: [
      "Day unavailable | AI;DR",
      "This day could not load. Please try again.",
    ],
    vi: [
      "Không tải được ngày này | AI;DR",
      "Không tải được tin của ngày này. Vui lòng thử lại.",
    ],
  },
  story: {
    en: [
      "Story unavailable | AI;DR",
      "This story could not load. Please try again.",
    ],
    vi: [
      "Không tải được tin | AI;DR",
      "Không tải được tin này. Vui lòng thử lại.",
    ],
  },
  week: {
    en: [
      "Weekly edition unavailable | AI;DR",
      "This weekly edition could not load. Please try again.",
    ],
    vi: [
      "Không tải được bản tin tuần | AI;DR",
      "Không tải được bản tin tuần này. Vui lòng thử lại.",
    ],
  },
  weeks: {
    en: [
      "Weekly archive unavailable | AI;DR",
      "The weekly archive could not load. Please try again.",
    ],
    vi: [
      "Không tải được kho bản tin tuần | AI;DR",
      "Không tải được kho lưu trữ bản tin tuần. Vui lòng thử lại.",
    ],
  },
};

export function loadErrorCopy(
  subject: LoadErrorSubject,
  lang: Lang
): LoadErrorCopy {
  const [title, body] = COPY[subject][lang];
  return { title, body, retry: RETRY[lang] };
}

/**
 * Route `headers` when the loader threw, so `loaderData` is undefined and
 * Start answers 500. Never cached, never marked not-found.
 */
export function loadErrorHeaders(lang: Lang): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "Content-Language": lang,
    Vary: "Cookie, Accept-Language",
  };
}

/** Route `head` for the same render. */
export function loadErrorHead(subject: LoadErrorSubject, lang: Lang) {
  return {
    meta: [
      { title: loadErrorCopy(subject, lang).title },
      { name: "robots", content: "noindex" },
    ],
  };
}
