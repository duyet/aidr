/** Importance bands shared by every scoring path (Jev and the chat rubric),
 * so both put the same story on the same 1–10 scale. Without anchors Jev
 * clustered at 1–2 and 4 and the chat model at 6–8. */
export const IMPORTANCE_BANDS = [
  {
    range: "9-10",
    meaning:
      "a frontier model launch, or a major policy or market-moving event",
  },
  {
    range: "7-8",
    meaning: "notable company, product, or research news with broad impact",
  },
  { range: "4-6", meaning: "an incremental update, or niche but solid news" },
  {
    range: "1-3",
    meaning:
      "minor, tangential, or promotional: tutorials and how-to guides, weekly roundups and newsletters, small library or tool releases, opinion essays, gossip, off-topic",
  },
] as const;

/** One-line rubric, highest band first. */
export const IMPORTANCE_RUBRIC = IMPORTANCE_BANDS.map(
  (band) => `${band.range}: ${band.meaning}.`
).join(" ");
