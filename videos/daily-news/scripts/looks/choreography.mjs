// How a story arrives (look axis "choreography"): the media reveal, the image drift (Ken Burns), the rank badge and
// the copy lines, all from S.start (the cut, under the stinger). The camera push, image crossfades, paper card,
// marker, stat and credit are shared (template/motion.js). Arrive fast, land soft, no overshoot.
// `rankAt` is how long after the cut the rank badge lands: build.mjs turns it into S.rankAt, which both the badge
// tween and the rankHit effect read.

export const CHOREOGRAPHIES = [
  {
    id: "rise",
    auto: true,
    rankAt: 0.2,
    // The media opens left to right while the images push in and out in turn; the badge turns in; the copy rises
    // line by line.
    motion: (tl, S, sc, h) => {
      const t = S.start;
      tl.fromTo(
        h.$(".media", sc),
        { clipPath: "inset(0% 100% 0% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power3.out" },
        t + 0.05
      );
      h.$$(".media img", sc).forEach((img, k) => {
        const from =
          k % 2 ? { scale: 1.02, xPercent: -2 } : { scale: 1.14, xPercent: 2 };
        const to =
          k % 2 ? { scale: 1.12, xPercent: 2 } : { scale: 1.02, xPercent: 0 };
        tl.fromTo(img, from, { ...to, duration: S.dur, ease: "none" }, t);
      });
      tl.fromTo(
        h.$(".rank", sc),
        { scale: 0.4, rotation: -10, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        S.rankAt
      );
      [".cat", ".kicker", ".head"].forEach((s, k) => {
        tl.fromTo(
          h.$(s, sc),
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: h.LAND },
          t + 0.3 + k * 3 * h.F
        );
      });
    },
  },
  {
    id: "slide",
    auto: true,
    rankAt: 0.15,
    // The media drops open from the top while the images pan down the frame; the badge and the copy slide in
    // from opposite edges.
    motion: (tl, S, sc, h) => {
      const t = S.start;
      tl.fromTo(
        h.$(".media", sc),
        { clipPath: "inset(0% 0% 100% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "expo.out" },
        t + 0.05
      );
      h.$$(".media img", sc).forEach((img, k) => {
        const from =
          k % 2 ? { scale: 1.1, yPercent: 3 } : { scale: 1.1, yPercent: -3 };
        const to =
          k % 2 ? { scale: 1.06, yPercent: -2 } : { scale: 1.06, yPercent: 2 };
        tl.fromTo(img, from, { ...to, duration: S.dur, ease: "none" }, t);
      });
      tl.fromTo(
        h.$(".rank", sc),
        { x: -60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" },
        S.rankAt
      );
      [".cat", ".kicker", ".head"].forEach((s, k) => {
        tl.fromTo(
          h.$(s, sc),
          { x: 70, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.6, ease: "power4.out" },
          t + 0.25 + k * 4 * h.F
        );
      });
    },
  },
  {
    id: "mask",
    auto: true,
    rankAt: 0.3,
    // The media opens from its centre and the images keep a slow push toward it; the badge settles from slightly
    // large; each copy line rises out of a mask.
    motion: (tl, S, sc, h) => {
      const t = S.start;
      tl.fromTo(
        h.$(".media", sc),
        { clipPath: "inset(50% 50% 50% 50%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "expo.out" },
        t
      );
      h.$$(".media img", sc).forEach((img) => {
        tl.fromTo(
          img,
          { scale: 1.0 },
          { scale: 1.12, duration: S.dur, ease: "sine.out" },
          t
        );
      });
      tl.fromTo(
        h.$(".rank", sc),
        { scale: 1.25, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, ease: "power2.out" },
        S.rankAt
      );
      [".cat", ".kicker", ".head"].forEach((s, k) => {
        tl.fromTo(
          h.$(s, sc),
          { clipPath: "inset(0% 0% 100% 0%)", y: 24 },
          {
            clipPath: "inset(-20% -5% -20% -5%)",
            y: 0,
            duration: 0.6,
            ease: "power3.out",
          },
          t + 0.35 + k * 5 * h.F
        );
      });
    },
  },
];
