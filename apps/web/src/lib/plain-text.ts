/** Named entities feeds actually put in titles and summaries. Unknown names
 *  are left as written. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

const ENTITY_RE = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

function codePointText(cp: number, whole: string): string {
  // Surrogates and out-of-range values make fromCodePoint throw or emit a
  // lone surrogate; keep the source text instead of failing the item.
  if (!Number.isInteger(cp) || cp > 0x10ffff) return whole;
  if (cp >= 0xd800 && cp <= 0xdfff) return whole;
  return String.fromCodePoint(cp);
}

/**
 * Decodes HTML entities in one pass: `&amp;#039;` becomes `&#039;`, not
 * `'`, so text that meant to show an entity keeps it. The result is plain
 * text: `&lt;b&gt;` becomes the characters `<b>`, which every sink escapes.
 */
export function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(ENTITY_RE, (whole, body: string) => {
    if (body[0] !== "#") {
      return (
        NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole
      );
    }
    const hex = body[1] === "x" || body[1] === "X";
    const cp = hex
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    return codePointText(cp, whole);
  });
}

/** A leading wire marker ("UPDATE:", "BREAKING:", "Cập nhật:") that says
 *  nothing about the story. The colon is required so "Update to Gemini"
 *  stays as written. */
const TITLE_MARKER_RE =
  /^\s*(?:(?:update[ds]?|breaking(?:\s+news)?|cập\s+nhật|tin\s+nóng)\s*:\s*)+/iu;

/** Strips the wire marker from a headline. Never returns an empty title. */
export function stripTitleMarker(title: string): string {
  const stripped = title.replace(TITLE_MARKER_RE, "");
  return stripped.trim() ? stripped : title;
}

/** Ingest normalization for a source headline. */
export function cleanTitle(title: string): string {
  return stripTitleMarker(decodeHtmlEntitiesOnce(title)).trim();
}
