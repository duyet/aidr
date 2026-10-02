export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Above this many tokens per side the LCS table gets too big for a click
 *  handler; the diff collapses to "all removed, all added". */
const MAX_TOKENS = 600;

/** Each word keeps its trailing whitespace, so joining every part's text
 *  gives back the input exactly and a run of changed words stays one part. */
function tokens(text: string): string[] {
  return text.split(/(?<=\s)(?=\S)/).filter(Boolean);
}

/** Word-level diff (LCS) between what the reader wrote and what the reviewer
 *  published. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return merge([
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ]);
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      parts.push({ kind: "removed", text: a[i++] });
    } else {
      parts.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < a.length) parts.push({ kind: "removed", text: a[i++] });
  while (j < b.length) parts.push({ kind: "added", text: b[j++] });
  return merge(parts);
}

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && last.kind === part.kind) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
}
