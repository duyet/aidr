/**
 * How the cluster prompt names an existing row: `E`, its 1-based position
 * in the call, and a Damm check digit (`E17` → `E174`). Without the check
 * digit, a slip that spelled another sent position (`E71` for `E17`) linked
 * the wrong row (#817). With it, every one-digit slip and every swap of two
 * adjacent digits spells no alias, so the parser's exact lookup drops it
 * and counts it as a near-miss. The lookup is the only decoder.
 */

/** Damm's quasigroup of order 10: weakly totally anti-symmetric, so it
 *  catches all single-digit errors and all adjacent transpositions. */
const DAMM: readonly (readonly number[])[] = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

function dammCheckDigit(digits: string): number {
  let interim = 0;
  for (const digit of digits) interim = DAMM[interim][Number(digit)];
  return interim;
}

/** The alias of the existing row sent at position `k` (0-based). */
export function existingAlias(k: number): string {
  const position = String(k + 1);
  return `E${position}${dammCheckDigit(position)}`;
}
