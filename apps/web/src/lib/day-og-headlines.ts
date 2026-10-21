import type { ReactNode } from "react";

export interface DrawnHeadline {
  id: string;
  /** The text the card draws, rows joined by a space. */
  text: string;
  /** Size at the card's own 1200 px width. */
  fontSize: number;
}

interface Element {
  props?: { style?: { fontSize?: string }; children?: ReactNode };
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as Element).props?.children);
  }
  return "";
}

/** Every element that sets a font size, with the text it draws. The card
 *  calls its parts as functions, so `dayOgCard` returns host elements only. */
function sizedTexts(node: ReactNode, out: { text: string; size: number }[]) {
  if (Array.isArray(node)) {
    for (const child of node) sizedTexts(child, out);
    return;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const props = (node as Element).props;
  const size = Number.parseFloat(props?.style?.fontSize ?? "");
  if (Number.isFinite(size)) {
    out.push({
      text: textOf(props?.children).replace(/\s+/g, " ").trim(),
      size,
    });
  }
  sizedTexts(props?.children, out);
}

/** The headline the card draws for each tile: the sized text that is the
 *  title, or a cut of it ending in "…". */
export function drawnHeadlines(
  tree: ReactNode,
  tiles: readonly { id: string; title: string }[]
): DrawnHeadline[] {
  const texts: { text: string; size: number }[] = [];
  sizedTexts(tree, texts);
  const out: DrawnHeadline[] = [];
  for (const tile of tiles) {
    const whole = texts.find((t) => t.text === tile.title);
    const cut = texts.find(
      (t) =>
        t.text.endsWith("…") &&
        t.text.length > 1 &&
        tile.title.startsWith(t.text.slice(0, -1).replace(/\s+$/, ""))
    );
    const hit = whole ?? cut;
    if (hit) out.push({ id: tile.id, text: hit.text, fontSize: hit.size });
  }
  return out;
}
