/**
 * Authenticated-operator entry point for the Telegram IV field gate.
 *
 * Reads the same published story row the public page renders and returns the
 * small, redacted, structured verdict from `telegram-iv.ts`. This adds no
 * template, no `rhash`, no Bot API IV lifecycle call, and no message send: it
 * answers "can this story be an IV source?" without a browser and without
 * inventing anything the decision record still marks unresolved.
 */
import { readSession } from "../../src/lib/db.js";
import { isLang } from "../../src/lib/lang.js";
import { getStoryCandidates } from "../../src/lib/story-queries.js";
import type { FeedItem, Lang } from "../../src/lib/types.js";
import {
  type IvPreflightVerdict,
  isIvStoryId,
  ivPreflightMissing,
  ivPreflightVerdict,
  preflightIvRemoteMedia,
} from "../telegram-iv.js";
import type { Env } from "../types.js";

export interface IvOperatorOptions {
  /** Query `id`: the 8-hex story id the record allows. */
  id: string | null;
  /** Query `lang`: `vi` or `en`. Defaults to the product default (`vi`). */
  lang: string | null;
  /**
   * Optional NON-generated candidate to run the byte-bounded preflight over.
   * A query string is never accepted, and the verdict only reports the
   * redacted origin, so a signed CDN URL cannot leak through the API.
   */
  image: string | null;
}

function resolveLang(raw: string | null): Lang {
  return isLang(raw) ? raw : "vi";
}

/**
 * `GET /api/admin/notify/iv?id=<8hex>&lang=vi|en[&image=<https url>]`
 *
 * Bearer-gated by the admin route. `Cache-Control: no-store` is applied by the
 * route wrapper; nothing here is edge-cacheable.
 */
export async function ivFieldGateForOperator(
  env: Env,
  options: IvOperatorOptions
): Promise<IvPreflightVerdict> {
  const lang = resolveLang(options.lang);
  const id = (options.id ?? "").trim().toLowerCase();

  if (!isIvStoryId(id)) {
    return ivPreflightMissing(id, "invalid_id_prefix", lang);
  }

  let item: FeedItem | undefined;
  try {
    const candidates = await getStoryCandidates(readSession(env.DB), id, 2);
    if (candidates.length > 1) {
      return ivPreflightMissing(id, "ambiguous_id_prefix", lang);
    }
    item = candidates[0];
  } catch {
    return ivPreflightMissing(id, "story_not_found", lang);
  }
  if (!item) return ivPreflightMissing(id, "story_not_found", lang);

  const verdict = ivPreflightVerdict(item, lang);
  const candidate = (options.image ?? "").trim();
  if (candidate) {
    // A second verdict, never a replacement: the generated card stays the
    // recommended image and this only reports what an upstream candidate
    // would or would not survive.
    const media = await preflightIvRemoteMedia(candidate);
    return {
      ...verdict,
      remote_candidate: {
        ok: media.ok,
        reason: media.reason,
        redacted_url: media.redactedUrl,
        http_status: media.httpStatus,
        declared_bytes: media.declaredBytes,
        mime: media.mime,
        width: media.dimensions?.width ?? null,
        height: media.dimensions?.height ?? null,
        probe_bytes: media.probeBytes,
        max_bytes: verdict.limits.httpUrlPhotoBytes,
        note: "Bounded range probe; the Worker never downloads or proxies the file.",
      },
    };
  }
  return verdict;
}
