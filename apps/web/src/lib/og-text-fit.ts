/**
 * Headline fitting for the OG cards. Satori clamps with an ellipsis wherever
 * the last line runs out, which cut words in half ("Economi…"). The card
 * sizes each headline here instead: the largest size whose wrapped text fits
 * the box, else the smallest size cut at a word boundary.
 *
 * Widths are Be Vietnam Pro advances (em) measured from
 * `public/fonts/be-vietnam-pro-{500,700}.ttf`, rounded up per class and
 * padded, so the estimate wraps no later than the renderer does.
 */

const NARROW = new Set("iljI.,:;'’‘!|·");
const SLIM = new Set('frt()[]1-/"“”');
const WIDE = new Set("mwMW%@");

function charEm(ch: string): number {
  if (ch === " ") return 0.23;
  if (NARROW.has(ch)) return 0.34;
  if (SLIM.has(ch)) return 0.61;
  if (WIDE.has(ch)) return 1.06;
  if (/\p{M}/u.test(ch)) return 0;
  if (/\p{Lu}/u.test(ch)) return 0.79;
  if (/\p{N}/u.test(ch)) return 0.7;
  return 0.64;
}

const SAFETY = 1.06;

export function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text.normalize("NFC")) em += charEm(ch);
  return em * SAFETY;
}

/** Greedy word wrap, as the renderer does; a word wider than the line
 *  takes a line of its own (and is broken there by `wordBreak`). */
export function wrapLines(words: readonly string[], maxEm: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let width = 0;
  for (const word of words) {
    const w = textWidthEm(word);
    const next = line.length === 0 ? w : width + textWidthEm(" ") + w;
    if (line.length > 0 && next > maxEm) {
      lines.push(line);
      line = [word];
      width = w;
    } else {
      line.push(word);
      width = next;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export const NBSP = " ";

/**
 * The wrapped rows of `text`, each with its words joined by a no-break space.
 * Satori draws a plain space after some words ("YouTube", "CoreWeave",
 * "Tencent") twice as wide, wherever the line breaks; a no-break space draws
 * at the normal width. Breaking the rows here, with the same wrap the fit
 * used, leaves the renderer nothing to wrap.
 */
export function headlineRows(text: string, maxEm: number): string[] {
  return wrapLines(text.split(" "), maxEm).map((row) => row.join(NBSP));
}

export interface FitBox {
  width: number;
  height: number;
  sizes: readonly number[];
  lineHeight: number;
  /** Never more lines than this, even when the box is taller. */
  maxLines?: number;
}

export interface FittedText {
  text: string;
  fontSize: number;
  lines: number;
}

function linesAt(box: FitBox, size: number): number {
  const byHeight = Math.floor(box.height / (size * box.lineHeight));
  return Math.max(1, Math.min(box.maxLines ?? byHeight, byHeight));
}

function clipWord(word: string, maxEm: number): string {
  const chars = [...word];
  while (chars.length > 1 && textWidthEm(`${chars.join("")}…`) > maxEm) {
    chars.pop();
  }
  return `${chars.join("")}…`;
}

/**
 * The largest size from `box.sizes` at which `text` wraps inside the box.
 * When none fits, the smallest size with the text cut after the last whole
 * word that fits, plus an ellipsis. A word wider than one row never fits:
 * the renderer would break it inside the row and nothing would mark the cut,
 * so it is clipped to the row with an ellipsis and nothing follows it.
 */
export function fitText(text: string, box: FitBox): FittedText {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  for (const size of box.sizes) {
    const max = linesAt(box, size);
    const wrapped = wrapLines(words, box.width / size);
    const rowEm = box.width / size;
    if (wrapped.length <= max && words.every((w) => textWidthEm(w) <= rowEm)) {
      return { text: clean, fontSize: size, lines: wrapped.length };
    }
  }
  const size = box.sizes[box.sizes.length - 1];
  const max = linesAt(box, size);
  const rowEm = box.width / size;
  const tooWide = words.findIndex((w) => textWidthEm(w) > rowEm);
  const kept = tooWide < 0 ? [...words] : words.slice(0, tooWide + 1);
  if (tooWide >= 0) {
    kept[tooWide] = clipWord(kept[tooWide], rowEm);
    if (wrapLines(kept, rowEm).length <= max) {
      return { text: kept.join(" "), fontSize: size, lines: max };
    }
    kept[tooWide] = words[tooWide];
  }
  while (kept.length > 1) {
    kept.pop();
    const candidate = `${kept.join(" ").replace(/[\s,;:.–—-]+$/u, "")}…`;
    if (wrapLines(candidate.split(" "), box.width / size).length <= max) {
      return { text: candidate, fontSize: size, lines: max };
    }
  }
  return { text: clipWord(words[0], rowEm), fontSize: size, lines: max };
}
