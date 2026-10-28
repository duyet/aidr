import type { DbReader } from "./db";
import { storyOgHash, storyOgPublicUrl } from "./story-og";
import { mapStoryRow } from "./story-queries";
import type { FeedItem, Lang } from "./types";

/**
 * Story share cards are rendered off-Worker (GitHub Actions,
 * `scripts/render-og-cards.ts`) and served from R2 at og.aidr.today, so a
 * card fetch never runs the Worker. The Worker only hashes (cheap) and keeps
 * `story_og_cards`, the hash last rendered per story and language.
 */

export const OG_CARD_LANGS: readonly Lang[] = ["en", "vi"];

/** A card drawn without the photo its story names is retried after a week,
 *  the same rule the Worker route keeps for its R2 copy. */
export const PHOTOLESS_RETRY_MS = 7 * 86_400_000;

/** How far back the candidate list looks, and how many raw rows it returns.
 *  Older stories keep the Worker route. */
const CANDIDATE_WINDOW_SEC = 14 * 86_400;
export const MAX_CANDIDATE_ROWS = 200;
/** Ack batch cap. */
const MAX_ACKS = 100;

const HASH_RE = /^[0-9a-f]{64}$/;
const ITEM_ID_RE = /^[0-9a-f]{8,64}$/;

/** The columns `storyOgCopy` and `storyOgImageCandidates` read, mapped by
 *  the same `mapStoryRow` the story page uses, so both sides hash the same
 *  item. */
const CARD_ITEM_COLUMNS = `i.id, i.url, i.title, t.title AS title_vi,
  i.category, i.published_at, i.image_url, i.media_manifest`;

export interface RenderedCard {
  hash: string;
  photoless: boolean;
  renderedAt: number;
}

/** True when the page may link og.aidr.today for this card: the stored
 *  render is of the current hash and is final (a photoless card may be
 *  redrawn under the same key, so it never gets an immutable URL). */
export function isCardServable(
  rendered: RenderedCard | undefined,
  currentHash: string
): boolean {
  return !!rendered && rendered.hash === currentHash && !rendered.photoless;
}

/** True when the renderer should draw this card. */
export function isCardPending(
  rendered: RenderedCard | undefined,
  currentHash: string,
  now: number
): boolean {
  if (!rendered || rendered.hash !== currentHash) return true;
  return rendered.photoless && now - rendered.renderedAt >= PHOTOLESS_RETRY_MS;
}

function renderedFromRow(
  row: Record<string, unknown>,
  prefix: string
): RenderedCard | undefined {
  const hash = row[`${prefix}_hash`];
  if (typeof hash !== "string") return undefined;
  return {
    hash,
    photoless: Number(row[`${prefix}_photoless`]) === 1,
    renderedAt: Number(row[`${prefix}_at`]) || 0,
  };
}

/** og.aidr.today URL per language whose card is rendered and current. A
 *  language left out falls back to the Worker route. Best effort: a failed
 *  read (table not migrated yet) means no URLs, never a failed page. */
export async function renderedStoryCardUrls(
  db: DbReader,
  item: FeedItem
): Promise<Partial<Record<Lang, string>>> {
  try {
    const { results } = await db
      .prepare(
        "SELECT lang, hash, photoless, rendered_at FROM story_og_cards WHERE item_id = ?"
      )
      .bind(item.id)
      .all<{
        lang: string;
        hash: string;
        photoless: number;
        rendered_at: number;
      }>();
    const out: Partial<Record<Lang, string>> = {};
    for (const lang of OG_CARD_LANGS) {
      const row = results?.find((r) => r.lang === lang);
      if (!row) continue;
      const hash = await storyOgHash(item, lang);
      const rendered = {
        hash: row.hash,
        photoless: row.photoless === 1,
        renderedAt: row.rendered_at,
      };
      if (isCardServable(rendered, hash))
        out[lang] = storyOgPublicUrl(hash, lang);
    }
    return out;
  } catch {
    return {};
  }
}

export interface PendingCard {
  lang: Lang;
  hash: string;
}

export interface PendingStory {
  item: FeedItem;
  cards: PendingCard[];
}

/** Raw rows of recent published stories with their rendered card state,
 *  newest first. The Worker does no mapping or hashing here (Workers Free
 *  caps CPU at 10 ms; 200 rows mapped and hashed cost about 7 ms in Node).
 *  The off-Worker renderer runs `pendingFromRows` on them. */
export async function listOgCardCandidates(
  db: DbReader,
  options: { limit: number; now: number }
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit) || 1, 1),
    MAX_CANDIDATE_ROWS
  );
  const since = Math.floor(options.now / 1000) - CANDIDATE_WINDOW_SEC;
  const { results } = await db
    .prepare(
      `SELECT ${CARD_ITEM_COLUMNS},
              e.hash AS en_hash, e.photoless AS en_photoless, e.rendered_at AS en_at,
              v.hash AS vi_hash, v.photoless AS vi_photoless, v.rendered_at AS vi_at
         FROM items i
         LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
         LEFT JOIN story_og_cards e ON e.item_id = i.id AND e.lang = 'en'
         LEFT JOIN story_og_cards v ON v.item_id = i.id AND v.lang = 'vi'
        WHERE i.status = 'published' AND i.published_at >= ?
        ORDER BY i.published_at DESC
        LIMIT ${limit}`
    )
    .bind(since)
    .all<Record<string, unknown>>();
  return results ?? [];
}

/** Stories with at least one card to draw. Maps each row with the same
 *  `mapStoryRow` the story page uses, so both sides hash the same item. */
export async function pendingFromRows(
  rows: Record<string, unknown>[],
  now: number
): Promise<PendingStory[]> {
  const pending: PendingStory[] = [];
  for (const row of rows) {
    const item = mapStoryRow(row, []);
    if (!item) continue;
    const cards: PendingCard[] = [];
    for (const lang of OG_CARD_LANGS) {
      const hash = await storyOgHash(item, lang);
      if (isCardPending(renderedFromRow(row, lang), hash, now)) {
        cards.push({ lang, hash });
      }
    }
    if (cards.length > 0) pending.push({ item, cards });
  }
  return pending;
}

export interface CardAck {
  item_id: string;
  lang: Lang;
  hash: string;
  photoless: boolean;
}

/** Validates an ack body; null when malformed. */
export function parseCardAcks(body: unknown): CardAck[] | null {
  const cards = (body as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards) || cards.length > MAX_ACKS) {
    return null;
  }
  const out: CardAck[] = [];
  for (const card of cards) {
    const c = card as Record<string, unknown>;
    if (
      typeof c?.item_id !== "string" ||
      !ITEM_ID_RE.test(c.item_id) ||
      (c.lang !== "en" && c.lang !== "vi") ||
      typeof c.hash !== "string" ||
      !HASH_RE.test(c.hash) ||
      typeof c.photoless !== "boolean"
    ) {
      return null;
    }
    out.push({
      item_id: c.item_id,
      lang: c.lang,
      hash: c.hash,
      photoless: c.photoless,
    });
  }
  return out;
}

/** Records rendered hashes. Re-acking the same card is a no-op rewrite. */
export async function ackOgCards(
  db: D1Database,
  acks: CardAck[],
  now: number
): Promise<number> {
  if (acks.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO story_og_cards (item_id, lang, hash, photoless, rendered_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (item_id, lang) DO UPDATE SET
       hash = excluded.hash,
       photoless = excluded.photoless,
       rendered_at = excluded.rendered_at`
  );
  await db.batch(
    acks.map((a) =>
      stmt.bind(a.item_id, a.lang, a.hash, a.photoless ? 1 : 0, now)
    )
  );
  return acks.length;
}
