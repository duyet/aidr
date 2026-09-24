import {
  boundedPublicManifest,
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  MAX_PUBLIC_MEDIA_URL_LENGTH,
  type MediaManifest,
  manifestWithoutArticleUrl,
  parseMediaManifest,
  primaryThumbnailUrl,
} from "../../worker/media.js";
import type { DbReader } from "./db";
import { parseStoredBullets } from "./tldr-bullets";
import { isThinDisplayTldr, synthesizeTldrFromItems } from "./tldr-fallback";
import {
  collectTldrItemIds,
  imageUrlByItemId,
  withTldrImages,
} from "./tldr-images";
import type { TldrBullet } from "./types";

/** Top stories on the public digest — keep the payload well under 50KB. */
export const PUBLIC_STORY_LIMIT = 8;
/** Snapshots store at most 16; cap again so a bloated row cannot balloon. */
export const PUBLIC_BULLET_CAP = 16;
/** Hard serialized-body budget for the unauthenticated public digest. */
export const PUBLIC_RESPONSE_MAX_BYTES = 50_000;
/** Above the ~180–240 digest target so `/api/public` can return longer bullets. */
const PUBLIC_BULLET_TEXT_MAX = 400;
const PUBLIC_ITEM_IDS_MAX = 8;
const PUBLIC_STORY_TEXT_MAX = 400;
const PUBLIC_STORY_URL_MAX_LENGTH = 1024;

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length <= max ? value : value.slice(0, max);
}

/** Never turn an overlong URL into a broken, truncated link. */
function boundedPublicUrl(value: unknown, max: number): string | null {
  const canonical = canonicalizeMediaUrl(value);
  return canonical && canonical.length <= max ? canonical : null;
}

function boundedPublicImageUrl(value: unknown, max: number): string | null {
  const canonical = canonicalizeMediaImageUrl(value);
  return canonical && canonical.length <= max ? canonical : null;
}

export interface PublicStory {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  category: string | null;
  image_url: string | null;
  /** Bounded additive field; legacy image_url remains the primary contract. */
  media_manifest?: MediaManifest;
  published_at: number;
}

export interface PublicDigest {
  tldr: {
    date: string;
    bullets_en: TldrBullet[];
    bullets_vi: TldrBullet[];
  } | null;
  stories: PublicStory[];
  updatedAt: number;
}

interface StoryRow {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  category: string | null;
  image_url?: string | null;
  media_manifest?: string | null;
  published_at: number;
}

const STORIES_SQL = `SELECT i.id, i.url, i.title, tr.title AS title_vi, i.category,
       i.image_url, i.media_manifest, i.published_at
FROM items i
LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
WHERE i.status = 'published'
ORDER BY i.rank_score DESC
LIMIT ?`;

const STORIES_SQL_NO_MEDIA = `SELECT i.id, i.url, i.title, tr.title AS title_vi, i.category,
       i.image_url, i.published_at
FROM items i
LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
WHERE i.status = 'published'
ORDER BY i.rank_score DESC
LIMIT ?`;

const STORIES_SQL_MEDIA_NO_IMAGE = `SELECT i.id, i.url, i.title, tr.title AS title_vi, i.category,
       i.media_manifest, i.published_at
FROM items i
LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
WHERE i.status = 'published'
ORDER BY i.rank_score DESC
LIMIT ?`;

const STORIES_SQL_LEGACY = `SELECT i.id, i.url, i.title, tr.title AS title_vi, i.category,
       i.published_at
FROM items i
LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
WHERE i.status = 'published'
ORDER BY i.rank_score DESC
LIMIT ?`;

const TLDR_SQL =
  "SELECT date, bullets_en, bullets_vi FROM tldr_snapshots ORDER BY date DESC LIMIT 1";

const IMAGES_SQL = `SELECT id, url, image_url, media_manifest FROM items
WHERE id IN ({placeholders})
  AND (image_url IS NOT NULL AND image_url != ''
       OR media_manifest IS NOT NULL AND media_manifest != '')`;

const IMAGES_SQL_MEDIA_NO_IMAGE = `SELECT id, url, media_manifest FROM items
WHERE id IN ({placeholders}) AND media_manifest IS NOT NULL AND media_manifest != ''`;

const IMAGES_SQL_LEGACY = `SELECT id, url, image_url FROM items
WHERE id IN ({placeholders}) AND image_url IS NOT NULL AND image_url != ''`;

function capBullets(raw: TldrBullet[]): TldrBullet[] {
  return raw.slice(0, PUBLIC_BULLET_CAP).map((b) => ({
    text: clip(
      typeof b.text === "string" ? b.text : "",
      PUBLIC_BULLET_TEXT_MAX
    ),
    item_ids: (Array.isArray(b.item_ids)
      ? b.item_ids
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.slice(0, 128))
      : []
    ).slice(0, PUBLIC_ITEM_IDS_MAX),
  }));
}

/** Older `tldr_snapshots` rows used a single `item_id` string per bullet.
 * Recovers ids the LLM stuffed into `[hex]` in the text before clipping. */
export function normalizeStoredBullets(raw: unknown): TldrBullet[] {
  return capBullets(parseStoredBullets(raw));
}

function parseTldrRow(
  row: {
    date: string;
    bullets_en: string;
    bullets_vi: string;
  } | null
): PublicDigest["tldr"] {
  if (!row) return null;
  try {
    return {
      date: row.date,
      bullets_en: normalizeStoredBullets(JSON.parse(row.bullets_en)),
      bullets_vi: normalizeStoredBullets(JSON.parse(row.bullets_vi)),
    };
  } catch {
    return null;
  }
}

function toPublicStory(row: StoryRow): PublicStory {
  const manifest = manifestWithoutArticleUrl(
    parseMediaManifest(row.media_manifest, row.image_url),
    row.url
  );
  const exposedManifest = boundedPublicManifest(manifest);
  return {
    id: clip(row.id, 128),
    // A URL is an atomic value: omit it rather than returning a prefix that
    // points somewhere else. The existing string field stays backward-safe.
    url: boundedPublicUrl(row.url, PUBLIC_STORY_URL_MAX_LENGTH) ?? "",
    title: clip(row.title, PUBLIC_STORY_TEXT_MAX),
    title_vi: row.title_vi ? clip(row.title_vi, PUBLIC_STORY_TEXT_MAX) : null,
    category: row.category ? clip(row.category, 64) : null,
    image_url: boundedPublicImageUrl(
      primaryThumbnailUrl(manifest, row.image_url, row.url),
      MAX_PUBLIC_MEDIA_URL_LENGTH
    ),
    ...(exposedManifest ? { media_manifest: exposedManifest } : {}),
    published_at: row.published_at,
  };
}

async function loadTopStories(db: DbReader): Promise<PublicStory[]> {
  try {
    const { results } = await db
      .prepare(STORIES_SQL)
      .bind(PUBLIC_STORY_LIMIT)
      .all<StoryRow>();
    return (results ?? []).map(toPublicStory);
  } catch {
    try {
      const { results } = await db
        .prepare(STORIES_SQL_NO_MEDIA)
        .bind(PUBLIC_STORY_LIMIT)
        .all<StoryRow>();
      return (results ?? []).map(toPublicStory);
    } catch {
      try {
        const { results } = await db
          .prepare(STORIES_SQL_MEDIA_NO_IMAGE)
          .bind(PUBLIC_STORY_LIMIT)
          .all<StoryRow>();
        return (results ?? []).map(toPublicStory);
      } catch {
        const { results } = await db
          .prepare(STORIES_SQL_LEGACY)
          .bind(PUBLIC_STORY_LIMIT)
          .all<StoryRow>();
        return (results ?? []).map(toPublicStory);
      }
    }
  }
}

function resolvePublicTldr(
  tldr: PublicDigest["tldr"],
  stories: PublicStory[]
): PublicDigest["tldr"] {
  if (!isThinDisplayTldr(tldr) && tldr) return tldr;
  if (stories.length < 2) return tldr;
  const fallback = synthesizeTldrFromItems(stories);
  if (fallback.bullets_en.length < 2) return tldr;
  return {
    date: tldr?.date ?? "",
    bullets_en: capBullets(fallback.bullets_en),
    bullets_vi: capBullets(fallback.bullets_vi),
  };
}

function responseBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function clonePublicDigest(digest: PublicDigest): PublicDigest {
  return {
    ...digest,
    tldr: digest.tldr
      ? {
          ...digest.tldr,
          bullets_en: digest.tldr.bullets_en.map((bullet) => ({ ...bullet })),
          bullets_vi: digest.tldr.bullets_vi.map((bullet) => ({ ...bullet })),
        }
      : null,
    stories: digest.stories.map((story) => ({ ...story })),
  };
}

/** Strip optional media first, then tail stories, while preserving a valid
 * JSON body even if every stored field is adversarially large. */
export function boundPublicDigest(digest: PublicDigest): PublicDigest {
  const bounded = clonePublicDigest(digest);
  for (const story of bounded.stories) {
    story.url = boundedPublicUrl(story.url, PUBLIC_STORY_URL_MAX_LENGTH) ?? "";
    story.image_url = boundedPublicImageUrl(
      story.image_url,
      MAX_PUBLIC_MEDIA_URL_LENGTH
    );
    if (story.media_manifest) {
      const manifest = boundedPublicManifest(
        manifestWithoutArticleUrl(story.media_manifest, story.url)
      );
      if (manifest) story.media_manifest = manifest;
      else delete story.media_manifest;
    }
  }
  for (const language of ["bullets_en", "bullets_vi"] as const) {
    for (const bullet of bounded.tldr?.[language] ?? []) {
      const imageUrl = boundedPublicImageUrl(
        bullet.image_url,
        MAX_PUBLIC_MEDIA_URL_LENGTH
      );
      if (imageUrl) bullet.image_url = imageUrl;
      else delete bullet.image_url;
    }
  }
  if (responseBytes(bounded) <= PUBLIC_RESPONSE_MAX_BYTES) return bounded;

  for (let i = bounded.stories.length - 1; i >= 0; i--) {
    delete bounded.stories[i]?.media_manifest;
    if (responseBytes(bounded) <= PUBLIC_RESPONSE_MAX_BYTES) return bounded;
  }
  for (const language of ["bullets_en", "bullets_vi"] as const) {
    for (let i = bounded.tldr?.[language].length ?? 0; i >= 0; i--) {
      if (bounded.tldr) delete bounded.tldr[language][i]?.image_url;
      if (responseBytes(bounded) <= PUBLIC_RESPONSE_MAX_BYTES) return bounded;
    }
  }
  for (let i = bounded.stories.length - 1; i >= 0; i--) {
    if (bounded.stories[i]) bounded.stories[i]!.image_url = null;
    if (responseBytes(bounded) <= PUBLIC_RESPONSE_MAX_BYTES) return bounded;
  }
  while (bounded.stories.length > 0) {
    bounded.stories.pop();
    if (responseBytes(bounded) <= PUBLIC_RESPONSE_MAX_BYTES) return bounded;
  }

  // Text and ids are already capped, so this is only a final fail-closed
  // guard for a future field added without a bound.
  return {
    tldr: null,
    stories: [],
    updatedAt: bounded.updatedAt,
  };
}

export async function getPublicDigest(db: DbReader): Promise<PublicDigest> {
  const [tldrRes, stories] = await Promise.all([
    db
      .prepare(TLDR_SQL)
      .all<{ date: string; bullets_en: string; bullets_vi: string }>(),
    loadTopStories(db),
  ]);

  const tldr = resolvePublicTldr(
    parseTldrRow(tldrRes.results?.[0] ?? null),
    stories
  );

  const images = imageUrlByItemId(stories);
  const missing = collectTldrItemIds(tldr).filter((id) => !images.has(id));
  if (missing.length > 0) {
    for (const [id, url] of await loadImagesForIds(db, missing)) {
      images.set(id, url);
    }
  }

  return boundPublicDigest({
    tldr: withTldrImages(tldr, images),
    stories,
    updatedAt: Date.now(),
  });
}

/** Look up og/thumbnails for TL;DR item ids that are not in the top-8
 * stories payload. Best-effort: a missing `image_url` column returns
 * an empty map so the digest still ships. */
async function loadImagesForIds(
  db: DbReader,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  try {
    const { results } = await db
      .prepare(IMAGES_SQL.replace("{placeholders}", placeholders))
      .bind(...ids)
      .all<{
        id: string;
        url?: string | null;
        image_url?: string | null;
        media_manifest?: string | null;
      }>();
    return imageUrlByItemId(
      (results ?? []).map((row) => {
        const manifest = manifestWithoutArticleUrl(
          parseMediaManifest(row.media_manifest, row.image_url),
          row.url
        );
        return {
          id: row.id,
          image_url: primaryThumbnailUrl(manifest, row.image_url, row.url),
        };
      })
    );
  } catch {
    try {
      const { results } = await db
        .prepare(IMAGES_SQL_LEGACY.replace("{placeholders}", placeholders))
        .bind(...ids)
        .all<{ id: string; url?: string | null; image_url: string }>();
      return imageUrlByItemId(
        (results ?? []).map((row) => {
          const imageUrl = canonicalizeMediaImageUrl(row.image_url);
          const articleUrl = canonicalizeMediaUrl(row.url);
          return {
            id: row.id,
            image_url: imageUrl && imageUrl !== articleUrl ? imageUrl : null,
          };
        })
      );
    } catch {
      try {
        const { results } = await db
          .prepare(
            IMAGES_SQL_MEDIA_NO_IMAGE.replace("{placeholders}", placeholders)
          )
          .bind(...ids)
          .all<{
            id: string;
            url?: string | null;
            media_manifest?: string | null;
          }>();
        return imageUrlByItemId(
          (results ?? []).map((row) => {
            const manifest = manifestWithoutArticleUrl(
              parseMediaManifest(row.media_manifest),
              row.url
            );
            return {
              id: row.id,
              image_url: primaryThumbnailUrl(manifest, undefined, row.url),
            };
          })
        );
      } catch {
        return new Map();
      }
    }
  }
}
