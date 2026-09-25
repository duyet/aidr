import { readSession } from "./db";
import { absoluteSiteUrl } from "./locale-url";
import { getPublicDigest, type PublicDigest } from "./public-queries";
import { storyPath } from "./slug";
import type { Lang } from "./types";

export const PUBLIC_CACHE_CONTROL =
  "public, max-age=120, s-maxage=300, stale-while-revalidate=600";

const UNAVAILABLE = {
  error: "unavailable",
  message: "The digest is temporarily unavailable.",
  message_vi: "Bản tin tạm thời không khả dụng.",
} as const;

export function localizePublicDigest(body: PublicDigest, lang: Lang) {
  return {
    ...body,
    lang,
    available_langs: ["en", "vi"] as const,
    stories: body.stories.map((story) => ({
      ...story,
      permalink: absoluteSiteUrl(storyPath(story), lang),
    })),
  };
}

function unavailable(status: number): Response {
  return Response.json(UNAVAILABLE, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Language": "en, vi",
      Vary: "Cookie, Accept-Language",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * Unauthenticated public digest. Callers must not forward D1/admin error
 * text — only `{ error: "unavailable" }` leaves this function on failure.
 */
export async function servePublicApi(
  db: D1Database | undefined,
  lang: Lang = "vi"
): Promise<Response> {
  if (!db) return unavailable(503);
  try {
    const body = await getPublicDigest(readSession(db));
    return Response.json(localizePublicDigest(body, lang), {
      headers: {
        "Cache-Control": PUBLIC_CACHE_CONTROL,
        "Content-Language": "en, vi",
      },
    });
  } catch (error) {
    console.error("public api:", error);
    return unavailable(500);
  }
}
