import type { Lang } from "../../src/lib/types.js";
import type { Env } from "../types.js";

export interface TldrBulletLike {
  text: string;
  item_id?: string;
  item_ids?: string[];
  image_url?: string;
  emoji?: string;
}

/** Newer snapshots store `item_ids: string[]`; older rows used `item_id`. */
export function primaryItemId(bullet: TldrBulletLike): string | undefined {
  if (typeof bullet.item_id === "string" && bullet.item_id)
    return bullet.item_id;
  const ids = bullet.item_ids;
  if (Array.isArray(ids)) {
    const first = ids.find(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (first) return first;
  }
  return undefined;
}

/** Parses and caps a snapshot's bullets JSON column to the top N. */
export function topBullets(
  bulletsJson: string | null,
  max = 5
): TldrBulletLike[] {
  if (!bulletsJson) return [];
  try {
    const parsed = JSON.parse(bulletsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, max)
      .map((b: Record<string, unknown>) => {
        const itemIds = Array.isArray(b.item_ids)
          ? (b.item_ids as string[])
          : [];
        const item_id =
          typeof b.item_id === "string" && b.item_id ? b.item_id : itemIds[0];
        const image_url =
          typeof b.image_url === "string" && b.image_url
            ? b.image_url
            : undefined;
        const ids = itemIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );
        const emoji =
          typeof b.emoji === "string" && b.emoji ? b.emoji : undefined;
        return {
          text: String(b.text ?? "").trim(),
          item_id,
          ...(ids.length > 0 ? { item_ids: ids } : {}),
          ...(image_url ? { image_url } : {}),
          ...(emoji ? { emoji } : {}),
        };
      })
      .filter((bullet) => bullet.text.length > 0);
  } catch {
    return [];
  }
}

export interface EditionSnapshot {
  date: string;
  bullets_en: string | null;
  bullets_vi: string | null;
}

export interface Edition {
  lang: Lang;
  /** Calendar date of the snapshot row that supplied the bullets. */
  date: string;
  bullets: TldrBulletLike[];
}

/** One language column. An empty column is empty — the other language is not a substitute. */
export function editionBullets(
  snapshot: Pick<EditionSnapshot, "bullets_en" | "bullets_vi">,
  lang: Lang,
  max: number
): TldrBulletLike[] {
  const column = lang === "en" ? snapshot.bullets_en : snapshot.bullets_vi;
  return topBullets(column, max);
}

/**
 * The digest for `date` in one language.
 * Uses that calendar row, then the UTC-dated row only when the requested
 * row is missing and the UTC date is different. Returns null when the
 * chosen row has no bullets in `lang`.
 */
export async function loadEdition(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang,
  max: number,
  now: Date = new Date()
): Promise<Edition | null> {
  const sql =
    "SELECT date, bullets_en, bullets_vi FROM tldr_snapshots WHERE date = ?";
  let snapshot = await env.DB.prepare(sql).bind(date).first<EditionSnapshot>();
  if (!snapshot) {
    const utcDate = now.toISOString().slice(0, 10);
    if (utcDate !== date) {
      snapshot = await env.DB.prepare(sql)
        .bind(utcDate)
        .first<EditionSnapshot>();
    }
  }
  if (!snapshot) return null;
  const bullets = editionBullets(snapshot, lang, max);
  if (bullets.length === 0) return null;
  return { lang, date: snapshot.date, bullets };
}
