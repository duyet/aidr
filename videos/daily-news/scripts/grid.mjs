// The summary grid (theme.intro "grid"): one layout per format and story count, so frame 0, the
// thumbnail, has no empty cell. Tiles follow rank order and tile k takes area AREAS[k]. An odd count
// gives the lead story a hero cell. `type` scales every tile's text and badge (1 = the six-story grid),
// `hero` the lead tile's. build.mjs tags .tiles with data-n and emits gridCss(n).
export const AREAS = "abcdefgh";

export const GRID = {
  "16x9": {
    1: { areas: ["a"], type: 2.2 },
    2: { areas: ["a b"], type: 1.7 },
    3: { areas: ["a b", "a c"], cols: "3fr 2fr", type: 1.2, hero: 1.8 },
    4: { areas: ["a b", "c d"], type: 1.4 },
    5: { areas: ["a b c", "a d e"], cols: "3fr 2fr 2fr", type: 1, hero: 1.6 },
    6: { areas: ["a b c", "d e f"], type: 1 },
    7: {
      areas: ["a b c d", "a e f g"],
      cols: "3fr 2fr 2fr 2fr",
      type: 0.85,
      hero: 1.4,
    },
    8: { areas: ["a b c d", "e f g h"], type: 0.85 },
  },
  "9x16": {
    1: { areas: ["a"], type: 2 },
    2: { areas: ["a", "b"], type: 1.5 },
    3: { areas: ["a a", "b c"], rows: "3fr 2fr", type: 1.1, hero: 1.8 },
    4: { areas: ["a b", "c d"], type: 1.2 },
    5: {
      areas: ["a a", "b c", "d e"],
      rows: "4fr 3fr 3fr",
      type: 1,
      hero: 1.5,
    },
    6: { areas: ["a b", "c d", "e f"], type: 1 },
    7: {
      areas: ["a a", "b c", "d e", "f g"],
      rows: "4fr 3fr 3fr 3fr",
      type: 0.85,
      hero: 1.3,
    },
    8: { areas: ["a b", "c d", "e f", "g h"], type: 0.85 },
  },
};

export function gridCss(n) {
  const rules = Object.entries(GRID).map(([fmt, layouts]) => {
    const g = layouts[n];
    if (!g)
      throw new Error(
        `grid intro: no ${fmt} layout for ${n} stories (scripts/grid.mjs)`
      );
    const sel = `.f-${fmt} .tiles[data-n="${n}"]`;
    const cols = g.cols ?? `repeat(${g.areas[0].split(" ").length},1fr)`;
    const rows = g.rows ?? `repeat(${g.areas.length},1fr)`;
    const areas = g.areas.map((r) => `"${r}"`).join(" ");
    const hero = g.hero ? `${sel}>.tile:first-child{--type:${g.hero}}` : "";
    return `${sel}{grid-template-areas:${areas};grid-template-columns:${cols};grid-template-rows:${rows};--type:${g.type}}${hero}`;
  });
  const cells = [...AREAS].map(
    (a, k) => `.tiles>.tile:nth-child(${k + 1}){grid-area:${a}}`
  );
  return [...rules, ...cells].join("\n");
}
