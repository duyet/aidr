/** Importance bands shared by every scoring path (Jev and the chat rubric),
 * so both put the same story on the same 1–10 scale. Without anchors Jev
 * clustered at 1–2 and 4 and the chat model at 6–8.
 *
 * Bands say what a story is, not which company published it: a lab list
 * would put any repo a listed lab pushes at 9-10. 9+ skips the normal daily
 * trending cap (up to the burst limits) and 8+ gets the breaking boost, so
 * 9-10 stays rare. */
export const IMPORTANCE_BANDS = [
  {
    range: "9-10",
    meaning:
      "rare, a few a month: a leading lab's new frontier flagship, open or closed (a new generation at the top of its line, not a point update, cheaper tier or variant), a major new model family, a law or government action that changes what AI labs may build or sell, or an event that moves the whole AI market (not one company's deal, funding, price or forecast)",
  },
  {
    range: "7-8",
    meaning:
      "notable company, product, or research news with broad impact: a new numbered version of a major model line (such as 4.6 to 4.7), a frontier-scale model that claims overall state of the art on a recognised benchmark (a small model's or a paper's state-of-the-art claim stays 4-6, whether it is for its size, for one language or a niche task, or made only by its publisher), frontier-scale open weights, a notable controversy, or a major regulatory action",
  },
  {
    range: "4-6",
    meaning:
      "an incremental update, or niche but solid news: a variant of an existing model, which stays here whoever ships it and whatever its version number (a Lite or Mini cut, a speed or pricing mode, a single small checkpoint), a routine model release from a smaller lab, reported results of an unreleased model, share-price moves and supplier earnings whose AI angle is incidental. Consumer gadgets and their sales, preorders or stock, including AI PCs and AI devices, are 4-6",
  },
  {
    range: "1-3",
    meaning:
      "minor, tangential, or promotional: tutorials and how-to guides, weekly roundups and newsletters, small library or tool releases, opinion essays, gossip, off-topic",
  },
] as const;

/** Story kinds the bands alone left ambiguous. */
export const IMPORTANCE_ANCHORS = [
  "Deals: a real price cut, free tier or big discount on a major model or API, announced by the provider itself, is 6-7. A cloud platform, app or reseller listing a model at the same price is not a deal and is 4-6, even on launch day. A reseller's promo, an affiliate deal or a free-credit offer is 1-3.",
  "Drama: a notable controversy is 7-8: a leadership fight at a leading lab, a lawsuit between major players, a safety incident, or a leak with real consequences (exposed data, a pulled model, a regulator stepping in). Gossip is 1-3: personal lives, unsourced rumours, social-media spats.",
] as const;

/** One-line rubric, highest band first, then the anchors. */
export const IMPORTANCE_RUBRIC = [
  ...IMPORTANCE_BANDS.map((band) => `${band.range}: ${band.meaning}.`),
  ...IMPORTANCE_ANCHORS,
].join(" ");
