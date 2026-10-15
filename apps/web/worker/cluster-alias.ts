/**
 * How the cluster prompt names an existing row: `E`, its 1-based position
 * in the call padded to `ALIAS_POSITION_DIGITS`, and a Damm check digit
 * (row 17 → `E0174`). Without the check digit, a slip that spelled another
 * sent position (`E71` for `E17`) linked the wrong row (#817). With it,
 * every one-digit slip and every swap of two adjacent digits spells no
 * alias. The fixed width makes a dropped or added digit change the length,
 * so it spells no alias either (unpadded, `E174` minus its last digit is
 * `E17`, row 1's alias). The parser's exact lookup drops all of these and
 * counts them as near-misses. The lookup is the only decoder.
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

/** Covers MERGE_CANDIDATE_LIMIT and every unmerge chunk (300 rows each). */
export const ALIAS_POSITION_DIGITS = 3;

/** The alias of the existing row sent at position `k` (0-based). */
export function existingAlias(k: number): string {
  const position = String(k + 1).padStart(ALIAS_POSITION_DIGITS, "0");
  if (position.length > ALIAS_POSITION_DIGITS) {
    throw new RangeError(
      `cluster alias position ${k + 1} exceeds ${ALIAS_POSITION_DIGITS} digits`
    );
  }
  return `E${position}${dammCheckDigit(position)}`;
}
