import type { TldrBullet } from "./types";

/** Hex ids the model sometimes pastes into bullet prose as `[sha256]`
 * instead of (or in addition to) the `item_ids` JSON field. 8–64 chars
 * covers a unique prefix and a full item id. */
const BRACKET_ID_RE = /\[([0-9a-f]{8,64})\]/gi;
const BRACKET_ID_TOKEN = /\s*\[[0-9a-f]{8,64}\]\s*/gi;
const HEX_ID_RE = /^[0-9a-f]{8,64}$/i;

function pushUnique(ids: string[], id: string): void {
  if (!id || ids.includes(id)) return;
  ids.push(id);
}

/** Hex ids wrapped in `[…]` in bullet text, in order of appearance. */
export function extractBracketItemIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(BRACKET_ID_RE)) {
    pushUnique(ids, match[1] ?? "");
  }
  return ids;
}

/** Drop trailing/inline `[hex]` citations so the digest does not paint
 * raw item ids. Empty result falls back to the original string. */
export function stripBracketItemIds(text: string): string {
  const stripped = text
    .replace(BRACKET_ID_TOKEN, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || text;
}

function idsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
  }
  if (typeof value === "string" && value) {
    const trimmed = value.trim();
    if (HEX_ID_RE.test(trimmed)) return [trimmed];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return idsFromUnknown(parsed);
    } catch {
      // not a JSON array
    }
  }
  return [];
}

/** Merge `item_ids` / legacy `item_id` / `id` with ids recovered from text. */
export function collectBulletItemIds(
  raw: Record<string, unknown>,
  text: string
): string[] {
  const ids: string[] = [];
  for (const id of idsFromUnknown(raw.item_ids ?? raw.itemIds)) {
    pushUnique(ids, id);
  }
  if (typeof raw.item_id === "string") pushUnique(ids, raw.item_id);
  if (typeof raw.id === "string" && HEX_ID_RE.test(raw.id)) {
    pushUnique(ids, raw.id);
  }
  for (const id of extractBracketItemIds(text)) pushUnique(ids, id);
  return ids;
}

export function parseStoredBullet(raw: unknown): TldrBullet | null {
  if (typeof raw === "string" && raw.trim()) {
    const text = raw.trim();
    return {
      text: stripBracketItemIds(text),
      item_ids: extractBracketItemIds(text),
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  if (!text) return null;
  return {
    text: stripBracketItemIds(text),
    item_ids: collectBulletItemIds(record, text),
  };
}

export function parseStoredBullets(raw: unknown): TldrBullet[] {
  if (!Array.isArray(raw)) return [];
  const out: TldrBullet[] = [];
  for (const entry of raw) {
    const bullet = parseStoredBullet(entry);
    if (bullet) out.push(bullet);
  }
  return out;
}
