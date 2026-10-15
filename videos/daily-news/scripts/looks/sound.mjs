// Sound effects (config.sfx.dir holds the files, manifest.json names them). `PEAK`: seconds from the start of each
// file to its hit, so the mix places that point on the visual hit (wipe, rank tile, stat). `CUES`: which effect
// plays on each cue.

export const PEAK = {
  whoosh: 0.164,
  "whoosh-short": 0.164,
  "impact-bass-1": 0.077,
  "impact-bass-2": 0.6,
  "click-soft": 0.053,
  pop: 0.122,
  ping: 0.03,
  chime: 0.05,
};

export const CUES = {
  open: "impact-bass-2",
  storyIn: "whoosh",
  rankHit: "impact-bass-1",
  statHit: "ping",
  tick: "click-soft",
  outro: "chime",
};
